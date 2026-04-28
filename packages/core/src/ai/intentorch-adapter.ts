/**
 * IntentOrch Adapter
 * Provides compatibility layer for @mcpilotx/core intentorch API
 * Allows existing code to work with local CloudIntentEngine implementation
 *
 * Uses the new Plan → Confirm → Execute pipeline (replaces old parseAndPlan + executeWorkflowWithTracking).
 */

import { CloudIntentEngine, type CloudIntentEngineConfig } from './cloud-intent-engine';
import type { AIConfig } from '../core/types';
import { MCPClient } from '../mcp/client';
import { logger } from '../core/logger';

// Server connection info
interface ConnectedServer {
  name: string;
  client: MCPClient;
}

/**
 * IntentOrch Adapter - mimics @mcpilotx/core intentorch API
 */
export class IntentorchAdapter {
  private cloudIntentEngine: CloudIntentEngine | null = null;
  private connectedServers: Map<string, ConnectedServer> = new Map();
  private aiConfig: AIConfig | null = null;

  constructor() {
    logger.debug('[IntentorchAdapter] Creating adapter instance');
  }

  /**
   * Configure AI settings (mimics intentorch.configureAI)
   */
  async configureAI(config: AIConfig): Promise<void> {
    logger.info(`[IntentorchAdapter] Configuring AI with provider: ${config.provider || 'openai'}`);
    this.aiConfig = config;
    logger.debug('[IntentorchAdapter] AI configured successfully');
  }

  /**
   * Initialize Cloud Intent Engine (mimics intentorch.initCloudIntentEngine)
   */
  async initCloudIntentEngine(): Promise<void> {
    logger.info('[IntentorchAdapter] Initializing Cloud Intent Engine');

    if (!this.aiConfig) {
      throw new Error('AI must be configured before initializing Cloud Intent Engine');
    }

    // Create CloudIntentEngine with default config
    const config: CloudIntentEngineConfig = {
      llm: {
        provider: this.aiConfig.provider || 'openai',
        apiKey: this.aiConfig.apiKey,
        model: this.aiConfig.model || 'gpt-4o-mini',
        temperature: 0.3,
        maxTokens: 1000,
        timeout: 30000,
        maxRetries: 3
      },
      execution: {
        maxConcurrentTools: 3,
        timeout: 60000,
        retryAttempts: 2,
        retryDelay: 1000
      },
      fallback: {
        enableKeywordMatching: true,
        askUserOnFailure: false,
        defaultTools: {}
      },
      parameterMapping: {
        validationLevel: 'warning' as any,
        enableCompatibilityMappings: true,
        logWarnings: true,
        enforceRequired: false
      }
    };

    this.cloudIntentEngine = new CloudIntentEngine(config);

    logger.debug('[IntentorchAdapter] Cloud Intent Engine initialized successfully');
  }

  /**
   * Connect to MCP server (mimics intentorch.connectMCPServer)
   */
  async connectMCPServer(options: {
    name: string;
    transport: {
      type: string;
      command: string;
      args?: string[];
    };
  }): Promise<void> {
    logger.info(`[IntentorchAdapter] Connecting to MCP server: ${options.name}`);

    try {
      const client = new MCPClient({
        transport: {
          type: 'stdio' as const,
          command: options.transport.command,
          args: options.transport.args || [],
          env: { ...process.env } as Record<string, string>
        }
      });

      // Handle transport errors to prevent process crash
      client.on('error', (error) => {
        logger.warn(`[IntentorchAdapter] MCP Client error for ${options.name}: ${error.message || error}`);
      });

      await client.connect();

      this.connectedServers.set(options.name, {
        name: options.name,
        client
      });

      logger.debug(`[IntentorchAdapter] Successfully connected to server: ${options.name}`);
    } catch (error: any) {
      logger.error(`[IntentorchAdapter] Failed to connect to server ${options.name}:`, error.message);
      throw error;
    }
  }

  /**
   * Get all tools from connected servers
   * Uses timeout to prevent one slow server from blocking all others
   */
  private async getAvailableTools(): Promise<any[]> {
    const tools: any[] = [];
    const TOOL_LIST_TIMEOUT = 60000; // 60 seconds timeout per server

    for (const [name, server] of this.connectedServers) {
      try {
        // Add timeout to prevent one slow server from blocking all others
        const serverTools = await Promise.race([
          server.client.listTools(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Request timeout after 60000ms')), TOOL_LIST_TIMEOUT)
          )
        ]);
        tools.push(...serverTools.map((tool: any) => ({
          ...tool,
          serverName: name
        })));
      } catch (error: any) {
        logger.warn(`[IntentorchAdapter] Failed to list tools for server ${name}: ${error.message}`);
        // Continue with other servers - don't let one slow server block everything
      }
    }
    return tools;
  }

  /**
   * Process a user query using LLM function calling.
   *
   * This is the recommended entry point. It uses LLM's native function calling API
   * to directly select the appropriate tool and extract parameters in a single call.
   *
   * Compared to the old parseAndPlan + selectTools pipeline:
   * - Old: 2 LLM calls (parseIntent + selectToolForIntent) + 5-layer fallback
   * - New: 1 LLM call (function calling) directly returns tool + params
   */
  async processQuery(query: string): Promise<{
    success: boolean;
    toolCalls?: Array<{ toolName: string; arguments: Record<string, any> }>;
    textResponse?: string;
    error?: string;
  }> {
    logger.info(`[IntentorchAdapter] processQuery called: "${query.substring(0, 100)}..."`);

    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine must be initialized before processing queries');
    }

    try {
      // Get tools from connected servers and set them in the engine
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // Use processQueryWithHistory for LLM function calling
      const result = await this.cloudIntentEngine.processQueryWithHistory([
        { role: 'user', content: query },
      ]);

      if (result.hasToolCall && result.toolCalls.length > 0) {
        return {
          success: true,
          toolCalls: result.toolCalls.map(tc => ({
            toolName: tc.toolName,
            arguments: tc.arguments,
          })),
        };
      }

      return {
        success: false,
        error: 'No tool was selected for the query',
      };
    } catch (error: any) {
      logger.error('[IntentorchAdapter] Failed to process query:', error.message);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Parse a natural language query and generate a workflow plan.
   * Backward compatibility method for CLI.
   */
  async parseAndPlanWorkflow(query: string): Promise<{
    success: boolean;
    plan?: {
      toolSelections: Array<{
        intentId: string;
        toolName: string;
        serverName?: string;
        parameters: Record<string, any>;
      }>;
    };
    error?: string;
  }> {
    logger.info(`[IntentorchAdapter] parseAndPlanWorkflow called: "${query.substring(0, 100)}..."`);

    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine must be initialized before planning');
    }

    try {
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // Map to the new planQuery method of CloudIntentEngine
      const plan = await this.cloudIntentEngine.planQuery(query);

      if (plan && plan.steps) {
        return {
          success: true,
          plan: {
            toolSelections: plan.steps.map((step: any, idx: number) => ({
              intentId: step.id || `step-${idx}`,
              toolName: step.toolName,
              serverName: (step as any).serverName, // Some steps might have serverName
              parameters: step.arguments
            }))
          }
        };
      }

      return {
        success: false,
        error: 'Failed to generate plan'
      };
    } catch (error: any) {
      logger.error('[IntentorchAdapter] parseAndPlanWorkflow failed:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get connected servers (mimics intentorch.getConnectedServers)
   */
  getConnectedServers(): Array<{ name: string }> {
    const servers: Array<{ name: string }> = [];
    for (const [name] of this.connectedServers) {
      servers.push({ name });
    }
    return servers;
  }

  /**
   * Disconnect from MCP server (mimics intentorch.disconnectMCPServer)
   */
  async disconnectMCPServer(serverName: string): Promise<void> {
    logger.info(`[IntentorchAdapter] Disconnecting from MCP server: ${serverName}`);

    const server = this.connectedServers.get(serverName);
    if (server) {
      try {
        await server.client.disconnect();
        this.connectedServers.delete(serverName);
        logger.debug(`[IntentorchAdapter] Successfully disconnected from server: ${serverName}`);
      } catch (error: any) {
        logger.error(`[IntentorchAdapter] Failed to disconnect from server ${serverName}:`, error.message);
      }
    }
  }

  /**
   * Cleanup all connections
   */
  async cleanup(): Promise<void> {
    logger.info('[IntentorchAdapter] Cleaning up all connections');

    const disconnectPromises: Promise<void>[] = [];
    for (const [name] of this.connectedServers) {
      disconnectPromises.push(this.disconnectMCPServer(name));
    }

    await Promise.allSettled(disconnectPromises);
    this.connectedServers.clear();

    logger.debug('[IntentorchAdapter] Cleanup completed');
  }
}

// Singleton instance for backward compatibility
export const intentorch = new IntentorchAdapter();
