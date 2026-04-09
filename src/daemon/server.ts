import { SOCKET_PATH } from '../core/constants';
import { logger } from '../core/logger';
import * as fs from 'fs';
import * as path from 'path';
import { ProcessManager } from './pm';
import { Orchestrator } from './orchestrator';
import { ConfigValidator } from '../core/config-validator';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

export class DaemonServer {
  private server: any;
  private pm: ProcessManager;
  private orchestrator: Orchestrator;
  private app: Hono;

  constructor() {
    this.pm = new ProcessManager();
    this.orchestrator = new Orchestrator(this.pm);
    this.app = new Hono();
    this.setupRoutes();
  }

  private setupRoutes() {
    const pm = this.pm;
    const orchestrator = this.orchestrator;

    this.app.post('/', async (c) => {
      try {
        const body = await c.req.json() as { command: string; data?: any };
        const { command, data } = body;

        logger.logRequest(command, data);

        switch (command) {
          case 'ping':
            return c.json({ status: 'ok', message: 'pong' });

          case 'status':
            return c.json({
              status: 'ok',
              data: {
                uptime: process.uptime(),
                pid: process.pid,
                services: pm.getStatuses(),
              },
            });

          case 'start-service':
            await pm.startService(data.name);
            logger.logServiceEvent(data.name, 'started');
            return c.json({ status: 'ok', message: `Service ${data.name} started.` });

          case 'stop-service':
            pm.stopService(data.name);
            logger.logServiceEvent(data.name, 'stopped');
            return c.json({ status: 'ok', message: `Service ${data.name} stopped.` });

          case 'ai-query':
            const result = await orchestrator.executeQuery(data.query);
            logger.logAIQuery(data.query, result);
            return c.json({ status: 'ok', data: result });

          case 'get-config':
            const config = orchestrator.getConfig();
            return c.json({ status: 'ok', data: config });

          case 'get-ai-config':
            const aiConfig = orchestrator.getConfig().ai;
            return c.json({ status: 'ok', data: aiConfig });

          case 'update-ai-config':
            const updateResult = orchestrator.updateAIConfig(data.config);
            if (updateResult.success) {
              logger.logConfigUpdate('ai', data.config);
              return c.json({ status: 'ok', data: updateResult });
            } else {
              return c.json({ status: 'error', message: updateResult.error }, 400);
            }

          case 'test-ai-connection':
            const testResult = await DaemonServer.testAIConnection(orchestrator);
            return c.json(testResult);

          case 'reset-ai-config':
            const defaultConfig = ConfigValidator.getDefaultConfig();
            const resetResult = orchestrator.updateAIConfig(defaultConfig.ai);
            if (resetResult.success) {
              logger.logConfigUpdate('ai', defaultConfig.ai);
              return c.json({ status: 'ok', data: resetResult });
            } else {
              return c.json({ status: 'error', message: resetResult.error }, 400);
            }

          default:
            logger.warn(`Unknown command received: ${command}`);
            return c.json({ status: 'error', message: `Unknown command: ${command}` }, 404);
        }
      } catch (err: any) {
        logger.error(`Error processing request: ${err.message}`, { stack: err.stack });
        return c.json({ status: 'error', message: err.message }, 500);
      }
    });
  }

  async start() {
    const PORT = 8082;
    logger.info(`Starting MCPilot Daemon on http://localhost:${PORT}...`);

    this.server = serve({
      fetch: this.app.fetch,
      port: PORT,
    });

    logger.info('Daemon is now running.');
  }

  // Test AI connection
  static async testAIConnection(orchestrator: Orchestrator): Promise<any> {
    try {
      // Check if orchestrator exists and has getConfig method
      if (!orchestrator || typeof orchestrator.getConfig !== 'function') {
        return {
          success: false,
          error: 'AI configuration not set. Use "mcp ai use <provider>" to configure AI.',
          data: null,
        };
      }

      const config = orchestrator.getConfig();
      const aiConfig = config.ai;

      if (!aiConfig || !aiConfig.provider) {
        return {
          success: false,
          error: 'AI configuration not set. Use "mcp ai use <provider>" to configure AI.',
          data: null,
        };
      }

      logger.info(`[AI] Testing connection to provider: ${aiConfig.provider}`);

      // Test based on different providers
      switch (aiConfig.provider) {
        case 'openai':
        case 'deepseek':
        case 'anthropic':
        case 'cohere':
          // These providers require API key
          if (!aiConfig.apiKey || aiConfig.apiKey.trim() === '') {
            return {
              success: false,
              error: `Missing API key for ${aiConfig.provider}. Get an API key from the provider's website and use "mcp cfg set ai.apiKey=your-api-key" to set it.`,
              data: {
                provider: aiConfig.provider,
                suggestion: `Get API key from: ${
                  aiConfig.provider === 'deepseek' ? 'https://platform.deepseek.com/api_keys' :
                    aiConfig.provider === 'openai' ? 'https://platform.openai.com/api-keys' :
                      aiConfig.provider === 'anthropic' ? 'https://console.anthropic.com/account/keys' :
                        'https://dashboard.cohere.com/api-keys'
                }`,
              },
            };
          }

          // Direct API test for cloud providers
          try {
            const testResult = await DaemonServer.testCloudProvider(
              aiConfig.provider,
              aiConfig.apiKey,
              aiConfig.model || this.getDefaultModel(aiConfig.provider),
            );

            if (testResult.success) {
              return {
                success: true,
                data: {
                  provider: aiConfig.provider,
                  model: aiConfig.model,
                  status: 'connected',
                  testResult: 'API connection successful',
                },
              };
            } else {
              return {
                success: false,
                error: `API connection failed: ${testResult.error}`,
                data: {
                  provider: aiConfig.provider,
                  details: testResult.data,
                },
              };
            }
          } catch (error: any) {
            return {
              success: false,
              error: `Connection test failed: ${error.message}`,
              data: { provider: aiConfig.provider },
            };
          }

        case 'ollama':
          // Check if Ollama service is available
          const host = aiConfig.ollamaHost || 'http://localhost:11434';
          try {
            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(`${host}/api/tags`, {
              method: 'GET',
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok) {
              const data = await response.json() as any;
              return {
                success: true,
                data: {
                  provider: aiConfig.provider,
                  host: host,
                  status: 'connected',
                  models: (data as any).models || [],
                },
              };
            } else {
              return {
                success: false,
                error: `Ollama service response error: ${response.status}`,
                data: { host: host },
              };
            }
          } catch (error: any) {
            return {
              success: false,
              error: `Cannot connect to Ollama service: ${error.message}`,
              data: { host: host },
            };
          }

        case 'local':
        case 'custom':
          // For local and custom providers, try to connect
          const endpoint = aiConfig.apiEndpoint || 'http://localhost:8080/v1/chat/completions';
          try {
            // Use AbortController for timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 10000);

            const response = await fetch(endpoint, {
              method: 'GET',
              signal: controller.signal,
            });

            clearTimeout(timeoutId);

            if (response.ok || response.status === 404 || response.status === 405) {
              // 404/405 may indicate endpoint exists but doesn't support GET, which is acceptable
              return {
                success: true,
                data: {
                  provider: aiConfig.provider,
                  endpoint: endpoint,
                  status: 'reachable',
                },
              };
            } else {
              return {
                success: false,
                error: `Endpoint response error: ${response.status}`,
                data: { endpoint: endpoint },
              };
            }
          } catch (error: any) {
            return {
              success: false,
              error: `Cannot connect to endpoint: ${error.message}`,
              data: { endpoint: endpoint },
            };
          }

        default:
          return {
            success: false,
            error: `Unsupported provider: ${aiConfig.provider}`,
            data: { provider: aiConfig.provider },
          };
      }
    } catch (error: any) {
      logger.error(`AI connection test failed: ${error.message}`);
      return {
        success: false,
        error: `Error during testing: ${error.message}`,
        data: null,
      };
    }
  }

  // Test cloud provider API connection
  private static async testCloudProvider(
    provider: string,
    apiKey: string,
    model?: string,
  ): Promise<{ success: boolean; error?: string; data?: any }> {
    try {
      // Get endpoint and headers based on provider
      const { endpoint, headers } = this.getProviderConfig(provider, apiKey, model);

      // Create a simple test request
      const testBody = this.createTestRequest(provider, model);

      // Use AbortController for timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      logger.info(`[AI] Testing ${provider} API at ${endpoint}`);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(testBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.ok) {
        const data = await response.json() as any;
        return {
          success: true,
          data: {
            provider: provider,
            model: model,
            responseTime: 'ok',
            details: 'API responded successfully',
          },
        };
      } else {
        let errorMessage = `API returned ${response.status}`;
        let errorText = '';

        try {
          // Try to get error text if response.text exists
          if (typeof response.text === 'function') {
            errorText = await response.text();
          } else if (response.statusText) {
            errorText = response.statusText;
          }
        } catch (textError) {
          // Ignore text extraction errors
        }

        // Parse error message if possible
        if (errorText) {
          try {
            const errorData = JSON.parse(errorText);
            if (errorData.error?.message) {
              errorMessage = errorData.error.message;
            } else if (errorData.message) {
              errorMessage = errorData.message;
            }
          } catch {
            // If not JSON, use raw text
            if (errorText && errorText.length < 200) {
              errorMessage = `${errorMessage}: ${errorText}`;
            }
          }
        }

        return {
          success: false,
          error: errorMessage,
          data: {
            status: response.status,
            provider: provider,
          },
        };
      }
    } catch (error: any) {
      logger.error(`[AI] ${provider} API test failed: ${error.message}`);

      let errorMessage = error.message;
      if (error.name === 'AbortError') {
        errorMessage = 'Request timeout (15 seconds)';
      } else if (error.message.includes('fetch failed')) {
        errorMessage = 'Network error - check internet connection';
      }

      return {
        success: false,
        error: errorMessage,
        data: {
          provider: provider,
          errorType: error.name,
        },
      };
    }
  }

  // Get provider-specific configuration
  private static getProviderConfig(
    provider: string,
    apiKey: string,
    model?: string,
  ): { endpoint: string; headers: Record<string, string> } {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    let endpoint = '';

    switch (provider) {
      case 'openai':
        endpoint = 'https://api.openai.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;

      case 'deepseek':
        endpoint = 'https://api.deepseek.com/v1/chat/completions';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;

      case 'anthropic':
        endpoint = 'https://api.anthropic.com/v1/messages';
        headers['x-api-key'] = apiKey;
        headers['anthropic-version'] = '2023-06-01';
        break;

      case 'cohere':
        endpoint = 'https://api.cohere.ai/v1/generate';
        headers['Authorization'] = `Bearer ${apiKey}`;
        break;

      default:
        throw new Error(`Unsupported provider for direct API test: ${provider}`);
    }

    return { endpoint, headers };
  }

  // Create test request for different providers
  private static createTestRequest(provider: string, model?: string): any {
    const defaultModel = this.getDefaultModel(provider);
    const testModel = model || defaultModel;

    switch (provider) {
      case 'openai':
      case 'deepseek':
        return {
          model: testModel,
          messages: [
            {
              role: 'system',
              content: 'You are a helpful assistant. Respond with "OK" to confirm the connection.',
            },
            {
              role: 'user',
              content: 'Test connection - please respond with "OK"',
            },
          ],
          max_tokens: 10,
          temperature: 0.1,
        };

      case 'anthropic':
        return {
          model: testModel,
          max_tokens: 10,
          messages: [
            {
              role: 'user',
              content: 'Test connection - please respond with "OK"',
            },
          ],
        };

      case 'cohere':
        return {
          model: testModel,
          prompt: 'Test connection - please respond with "OK"',
          max_tokens: 10,
          temperature: 0.1,
        };

      default:
        throw new Error(`Unsupported provider for test request: ${provider}`);
    }
  }

  // Get default model for provider
  private static getDefaultModel(provider: string): string {
    switch (provider) {
      case 'openai':
        return 'gpt-3.5-turbo';
      case 'deepseek':
        return 'deepseek-chat';
      case 'anthropic':
        return 'claude-3-haiku-20240307';
      case 'cohere':
        return 'command';
      default:
        return 'default';
    }
  }

  stop() {
    if (this.server) {
      this.server.stop();
      logger.info('Daemon stopped.');
    }
  }
}

if (process.argv.includes('--daemon')) {
  const server = new DaemonServer();
  server.start();
}
