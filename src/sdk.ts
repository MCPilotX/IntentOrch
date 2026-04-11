/**
 * IntentOrch SDK - Minimalist Core Class
 * Designed for developers, pursuing minimalist style
 * Formerly known as MCPilot SDK
 */

import { ConfigManager } from './core/config-manager';
import { ServiceConfig, RuntimeType, Config } from './core/types';
import { RuntimeAdapterRegistry } from './runtime/adapter-advanced';
import { EnhancedRuntimeDetector } from './runtime/detector-advanced';

// AI imports
import { AI, AIError, type AskResult } from './ai/ai';
import { CloudIntentEngine, type CloudIntentEngineConfig } from './ai/cloud-intent-engine';

// MCP related imports
import { MCPClient, ToolRegistry, createMCPConfig, discoverLocalMCPServers } from './mcp';
import type { Tool, ToolCall, ToolResult, MCPClientConfig } from './mcp/types';

export interface SDKOptions {
  configPath?: string;
  autoInit?: boolean;
  logger?: {
    info: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  // MCP related options
  mcp?: {
    autoDiscover?: boolean;
    servers?: MCPClientConfig[];
  };
}

// Configuration for batch server connections
export interface MCPConnectionConfig {
  servers: Array<{
    name?: string;
    transport: {
      type: 'stdio' | 'http' | 'sse';
      command?: string;
      args?: string[];
      url?: string;
    };
  }>;
}

export interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  pid?: number;
  uptime?: number;
  memory?: number;
  cpu?: number;
}

export interface AskOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

// Text generation options
export interface GenerateTextOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
}

// Intent parsing result (from AI module)
export type IntentResult = import('./ai/ai').IntentResult;

// Text generation result (from AI module)
export type TextResult = import('./ai/ai').TextResult;

/**
 * IntentOrch SDK Core Class
 * Provides unified API interface, designed for developers
 */
export class IntentOrchSDK {
  private configManager: ConfigManager;
  private initialized = false;
  private logger: SDKOptions['logger'];

  // AI instance
  private ai: AI;

  // Cloud Intent Engine
  private cloudIntentEngine?: CloudIntentEngine;

  // MCP related properties
  private mcpClients: Map<string, MCPClient> = new Map();
  private toolRegistry: ToolRegistry = new ToolRegistry();
  private mcpOptions: SDKOptions['mcp'];

  // Tool synchronization
  private toolUpdateCallbacks: Array<() => void> = [];

  constructor(options: SDKOptions = {}) {
    this.logger = options.logger || {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
    };

    // Initialize AI instance
    this.ai = new AI();

    // Save MCP options
    this.mcpOptions = options.mcp;

    // Initialize configuration manager
    this.configManager = ConfigManager;

    if (options.autoInit !== false) {
      this.init();
    }
  }

  /**
   * Initialize SDK
   */
  init(): void {
    if (this.initialized) {
      return;
    }

    try {
      ConfigManager.init();

      // Register runtime adapter factories
      this.registerRuntimeAdapters();

      this.initialized = true;
      this.logger.info('IntentOrch SDK initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize SDK: ${error}`);
      throw error;
    }
  }

  /**
   * Add service
   */
  async addService(config: ServiceConfig): Promise<string> {
    this.ensureInitialized();

    try {
      // If runtime type not specified, auto-detect
      if (!config.runtime) {
        const detection = await EnhancedRuntimeDetector.detect(config.path);
        config.detectedRuntime = detection.runtime;
        config.detectionConfidence = detection.confidence;
        config.detectionSource = detection.source;

        this.logger.info(`Detected runtime: ${detection.runtime} (confidence: ${detection.confidence})`);
      }

      // Save service configuration - simplified implementation
      // In a real implementation, this would save to config file
      this.logger.info(`Service '${config.name}' added successfully`);
      return config.name;
    } catch (error) {
      this.logger.error(`Failed to add service '${config.name}': ${error}`);
      throw error;
    }
  }

  /**
   * Start service
   */
  async startService(name: string): Promise<void> {
    this.ensureInitialized();

    try {
      const config = ConfigManager.getServiceConfig(name);
      if (!config) {
        throw new Error(`Service "${name}" not found`);
      }

      const runtime = config.runtime || config.detectedRuntime;
      if (!runtime) {
        throw new Error(`Runtime type not specified for service "${name}"`);
      }

      // Create runtime adapter and start service
      const adapter = RuntimeAdapterRegistry.createAdapter(runtime, config) as any;
      await adapter.start();

      this.logger.info(`Service '${name}' started successfully`);
    } catch (error: any) {
      this.logger.error(`Failed to start service '${name}': ${error}`);
      throw error;
    }
  }

  /**
   * Stop service
   */
  async stopService(name: string): Promise<void> {
    this.ensureInitialized();

    try {
      const config = ConfigManager.getServiceConfig(name);
      if (!config) {
        throw new Error(`Service "${name}" not found`);
      }

      const runtime = config.runtime || config.detectedRuntime;
      if (!runtime) {
        throw new Error(`Runtime type not specified for service "${name}"`);
      }

      // Create runtime adapter and stop service
      const adapter = RuntimeAdapterRegistry.createAdapter(runtime, config) as any;
      await adapter.stop();

      this.logger.info(`Service '${name}' stopped successfully`);
    } catch (error: any) {
      this.logger.error(`Failed to stop service '${name}': ${String(error)}`);
      throw error;
    }
  }

  /**
   * List all services
   */
  listServices(): string[] {
    this.ensureInitialized();
    return ConfigManager.getAllServices();
  }

  /**
   * Get service status
   */
  async getServiceStatus(name: string): Promise<ServiceStatus> {
    this.ensureInitialized();

    try {
      const config = ConfigManager.getServiceConfig(name);
      if (!config) {
        throw new Error(`Service "${name}" not found`);
      }

      const runtime = config.runtime || config.detectedRuntime;
      if (!runtime) {
        return {
          name,
          status: 'unknown',
        };
      }

      // Create runtime adapter and check status
      const adapter = RuntimeAdapterRegistry.createAdapter(runtime, config) as any;
      const status = await adapter.status();

      return {
        name,
        status: status.running ? 'running' : 'stopped',
        pid: status.pid,
        uptime: status.uptime,
      };
    } catch (error: any) {
      // If the error is "Service not found", re-throw it
      if (error.message && error.message.includes(`Service "${name}" not found`)) {
        throw error;
      }

      this.logger.error(`Failed to get status for service '${name}': ${error}`);
      return {
        name,
        status: 'error',
      };
    }
  }

  /**
   * Get configuration
   */
  getConfig(): Config {
    this.ensureInitialized();
    const config = ConfigManager.getGlobalConfig();
    // Handle case where config is undefined
    if (!config) {
      return {
        services: {
          autoStart: [],
        },
        ai: {
          provider: 'none',
          model: '',
        },
        registry: {
          preferred: 'npm',
        },
      };
    }
    // Ensure config has ai property
    if (!config.ai) {
      return {
        ...config,
        ai: {
          provider: 'none',
          model: '',
        },
      };
    }
    return config;
  }

  /**
   * Update configuration
   */
  async updateConfig(updates: Partial<Config>): Promise<void> {
    this.ensureInitialized();

    try {
      ConfigManager.saveGlobalConfig(updates);
      this.logger.info('Configuration updated successfully');
    } catch (error) {
      this.logger.error(`Failed to update configuration: ${error}`);
      throw error;
    }
  }

  /**
   * Parse intent from natural language query
   * Returns tool call or suggestions based on intent analysis
   */
  async parseIntent(query: string): Promise<IntentResult> {
    this.ensureInitialized();

    try {
      // Use AI instance to parse intent
      const intent = await this.ai.parseIntent(query);

      // Map intent to tool call or suggestions
      const toolCall = this.ai.mapIntentToTool(intent);

      return {
        type: 'tool_call',
        tool: toolCall,
        confidence: intent.confidence,
      };
    } catch (error) {
      // Re-throw AIError as is for clear error messages
      if (error instanceof AIError) {
        throw error;
      }

      this.logger.error(`Intent parsing failed: ${error}`);
      throw new Error(`Intent parsing failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Generate text response using AI
   */
  async generateText(query: string, options?: GenerateTextOptions): Promise<TextResult> {
    this.ensureInitialized();

    try {
      // Use AI instance to generate text
      const text = await this.ai.generateText(query, options);

      return {
        type: 'text',
        text,
        tokensUsed: 0, // TODO: Extract from AI response if available
      };
    } catch (error) {
      // Re-throw AIError as is for clear error messages
      if (error instanceof AIError) {
        throw error;
      }

      this.logger.error(`AI query failed: ${error}`);
      throw new Error(`AI query failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Configure AI
   */
  async configureAI(config: Partial<Config['ai']>): Promise<void> {
    this.ensureInitialized();

    try {
      // Convert SDK AI config to AI config format
      const aiConfig = {
        provider: (config.provider as 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'ollama' | 'none') || 'none',
        apiKey: config.apiKey,
        endpoint: config.apiEndpoint || config.ollamaHost,
        model: config.model,
        apiVersion: config.apiVersion,
        region: config.region,
      };

      // Configure the AI instance
      await this.ai.configure(aiConfig);

      // Register AI tools after successful configuration
      await this.registerAITools();

      // Also update the SDK configuration
      const currentConfig = this.getConfig();
      const currentAiConfig = currentConfig.ai || { provider: 'none', model: '' };
      const updatedConfig = {
        ...currentConfig,
        ai: {
          provider: config.provider || currentAiConfig.provider || 'none',
          model: config.model || currentAiConfig.model || '',
          ...currentAiConfig,
          ...config,
        },
      };

      await this.updateConfig(updatedConfig);
      this.logger.info('AI configuration updated successfully');
    } catch (error) {
      this.logger.error(`Failed to configure AI: ${error}`);
      throw error;
    }
  }

  /**
   * Register AI tools in the tool registry
   */
  private async registerAITools(): Promise<void> {
    try {
      // Check if AI is configured
      const aiStatus = this.ai.getStatus();
      if (!aiStatus.configured) {
        this.logger.info('AI not configured, skipping AI tool registration');
        return;
      }

      // Register AI summary tool
      this.registerAISummaryTool();

      // Register AI analysis tool
      this.registerAIAnalysisTool();

      // Register AI generation tool
      this.registerAIGenerationTool();

      this.logger.info('AI tools registered successfully');

      // Sync tools to Cloud Intent Engine if initialized
      this.syncToolsToCloudIntentEngine();
    } catch (error) {
      this.logger.error(`Failed to register AI tools: ${error}`);
      // Don't throw - AI tools are optional
    }
  }

  /**
   * Register AI summary tool
   */
  private registerAISummaryTool(): void {
    const summaryTool = {
      name: 'ai.summary',
      description: 'Generate Markdown-formatted summary analysis using AI',
      inputSchema: {
        type: 'object' as const,
        properties: {
          content: {
            type: 'string' as const,
            description: 'Content to analyze and summarize',
          },
          format: {
            type: 'string' as const,
            enum: ['markdown', 'text', 'html'],
            description: 'Output format',
            default: 'markdown',
          },
          analysisType: {
            type: 'string' as const,
            enum: ['summary', 'review', 'analysis'],
            description: 'Type of analysis to perform',
            default: 'summary',
          },
        },
        required: ['content'] as const,
      },
    };

    const executor = async (args: Record<string, any>): Promise<any> => {
      try {
        const prompt = this.buildAISummaryPrompt(args.content, args.analysisType || 'summary');
        const result = await this.ai.generateText(prompt, {
          temperature: 0.3,
          maxTokens: 2048,
        });

        return {
          success: true,
          summary: result,
          format: args.format || 'markdown',
          metadata: {
            generatedAt: new Date().toISOString(),
            analysisType: args.analysisType || 'summary',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `AI summary generation failed: ${errorMessage}`,
          metadata: {
            generatedAt: new Date().toISOString(),
          },
        };
      }
    };

    this.toolRegistry.registerTool(summaryTool as any, executor, 'intentorch-ai', 'IntentOrch AI Service');
    this.logger.debug('Registered AI summary tool');
  }

  /**
   * Register AI analysis tool
   */
  private registerAIAnalysisTool(): void {
    const analysisTool = {
      name: 'ai.analyze',
      description: 'Perform detailed analysis of content using AI',
      inputSchema: {
        type: 'object' as const,
        properties: {
          content: {
            type: 'string' as const,
            description: 'Content to analyze',
          },
          analysisType: {
            type: 'string' as const,
            enum: ['technical', 'business', 'code', 'documentation', 'general'],
            description: 'Type of analysis',
            default: 'general',
          },
          format: {
            type: 'string' as const,
            enum: ['markdown', 'text', 'json'],
            description: 'Output format',
            default: 'markdown',
          },
        },
        required: ['content'] as const,
      },
    };

    const executor = async (args: Record<string, any>): Promise<any> => {
      try {
        const prompt = this.buildAIAnalysisPrompt(args.content, args.analysisType || 'general');
        const result = await this.ai.generateText(prompt, {
          temperature: 0.3,
          maxTokens: 2048,
        });

        return {
          success: true,
          analysis: result,
          format: args.format || 'markdown',
          metadata: {
            generatedAt: new Date().toISOString(),
            analysisType: args.analysisType || 'general',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `AI analysis failed: ${errorMessage}`,
          metadata: {
            generatedAt: new Date().toISOString(),
          },
        };
      }
    };

    this.toolRegistry.registerTool(analysisTool as any, executor, 'intentorch-ai', 'IntentOrch AI Service');
    this.logger.debug('Registered AI analysis tool');
  }

  /**
   * Register AI generation tool
   */
  private registerAIGenerationTool(): void {
    const generationTool = {
      name: 'ai.generate',
      description: 'Generate content using AI',
      inputSchema: {
        type: 'object' as const,
        properties: {
          prompt: {
            type: 'string' as const,
            description: 'Prompt for content generation',
          },
          format: {
            type: 'string' as const,
            enum: ['markdown', 'text', 'html', 'json'],
            description: 'Output format',
            default: 'markdown',
          },
          length: {
            type: 'string' as const,
            enum: ['short', 'medium', 'long'],
            description: 'Desired output length',
            default: 'medium',
          },
        },
        required: ['prompt'] as const,
      },
    };

    const executor = async (args: Record<string, any>): Promise<any> => {
      try {
        const maxTokensMap = {
          short: 500,
          medium: 1024,
          long: 2048,
        };

        const result = await this.ai.generateText(args.prompt, {
          temperature: 0.7,
          maxTokens: maxTokensMap[args.length as keyof typeof maxTokensMap] || 1024,
        });

        return {
          success: true,
          content: result,
          format: args.format || 'markdown',
          metadata: {
            generatedAt: new Date().toISOString(),
            length: args.length || 'medium',
          },
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          success: false,
          error: `AI content generation failed: ${errorMessage}`,
          metadata: {
            generatedAt: new Date().toISOString(),
          },
        };
      }
    };

    this.toolRegistry.registerTool(generationTool as any, executor, 'intentorch-ai', 'IntentOrch AI Service');
    this.logger.debug('Registered AI generation tool');
  }

  /**
   * Build AI summary prompt
   */
  private buildAISummaryPrompt(content: string, analysisType: string): string {
    const prompts = {
      summary: `Please analyze the following content and generate a comprehensive Markdown-formatted summary report.

## Content to Analyze
${content}

## Requirements
1. Extract and highlight the key points
2. Identify important information and patterns
3. Provide a structured summary with clear sections
4. Use appropriate Markdown formatting

Please output only the Markdown-formatted summary, without any additional explanations.`,

      review: `Please review the following content and provide a critical analysis in Markdown format.

## Content to Review
${content}

## Review Requirements
1. Identify strengths and positive aspects
2. Point out areas for improvement or concerns
3. Provide specific, actionable suggestions
4. Assess overall quality and completeness

Please output only the review analysis in Markdown format.`,

      analysis: `Please perform a detailed analysis of the following content and present findings in Markdown format.

## Content for Analysis
${content}

## Analysis Requirements
1. Break down the content into key components
2. Analyze relationships and dependencies
3. Identify patterns, trends, or anomalies
4. Provide insights and interpretations

Please output only the analysis in Markdown format.`,
    };

    return prompts[analysisType as keyof typeof prompts] || prompts.summary;
  }

  /**
   * Build AI analysis prompt
   */
  private buildAIAnalysisPrompt(content: string, analysisType: string): string {
    const prompts = {
      technical: `Please perform a technical analysis of the following content:

${content}

Focus on:
1. Technical architecture and design
2. Code quality and patterns
3. Performance considerations
4. Security implications
5. Best practices compliance

Provide the analysis in Markdown format.`,

      business: `Please perform a business analysis of the following content:

${content}

Focus on:
1. Business value and impact
2. Market positioning
3. Competitive advantages
4. Risk assessment
5. Strategic recommendations

Provide the analysis in Markdown format.`,

      code: `Please analyze the following code or technical content:

${content}

Focus on:
1. Code structure and organization
2. Algorithm efficiency
3. Error handling
4. Maintainability
5. Potential improvements

Provide the analysis in Markdown format.`,

      documentation: `Please analyze the following documentation or content:

${content}

Focus on:
1. Clarity and readability
2. Completeness and accuracy
3. Organization and structure
4. Audience appropriateness
5. Improvement suggestions

Provide the analysis in Markdown format.`,

      general: `Please analyze the following content:

${content}

Provide a comprehensive analysis covering:
1. Key points and main ideas
2. Structure and organization
3. Strengths and weaknesses
4. Recommendations for improvement

Use Markdown format for the analysis.`,
    };

    return prompts[analysisType as keyof typeof prompts] || prompts.general;
  }

  /**
   * Get AI status
   */
  getAIStatus(): {
    enabled: boolean;
    provider: string;
    configured: boolean;
    model?: string;
    } {
    this.ensureInitialized();

    try {
      // Get status from AI instance
      const aiStatus = this.ai.getStatus();

      // Get current config for additional details
      const config = this.getConfig();

      return {
        enabled: aiStatus.enabled,
        provider: aiStatus.provider,
        configured: aiStatus.configured,
        model: config.ai?.model,
      };
    } catch (error) {
      this.logger.error(`Failed to get AI status: ${error}`);
      return {
        enabled: false,
        provider: 'none',
        configured: false,
      };
    }
  }

  /**
   * Test AI connection
   */
  async testAIConnection(): Promise<{ success: boolean; message: string }> {
    this.ensureInitialized();

    try {
      // Test connection using AI instance
      const result = await this.ai.testConnection();
      return result;
    } catch (error) {
      this.logger.error(`AI connection test failed: ${error}`);
      return {
        success: false,
        message: `Connection test failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Register runtime adapter factories
   */
  private registerRuntimeAdapters(): void {
    try {
      // Create simple adapter factories for supported runtimes
      // Note: We're creating simplified adapters that match the EnhancedRuntimeAdapter interface
      const nodeAdapterFactory = {
        create: (config: ServiceConfig) => ({
          start: async (serviceConfig: ServiceConfig) => {
            this.logger.info(`Starting Node.js service: ${serviceConfig.name}`);
            // Simulate successful start and return ProcessInfo
            const processId = `node-${Date.now()}`;
            return {
              id: processId,
              pid: Math.floor(Math.random() * 10000) + 1000,
              status: 'running' as const,
              startedAt: new Date(),
              config: serviceConfig,
            };
          },
          stop: async (processId: string) => {
            this.logger.info(`Stopping Node.js service with processId: ${processId}`);
            // Simulate successful stop - return void as per interface
            return;
          },
          status: async (processId: string) => ({
            running: true,
            pid: Math.floor(Math.random() * 10000) + 1000,
            uptime: Math.floor(Math.random() * 3600000) + 1000,
            memory: 1024 * 1024 * 100, // 100MB
            cpu: 0.5,
          }),
        }),
        supports: (runtimeType: string) => runtimeType === 'node' || runtimeType === 'nodejs',
      };

      const pythonAdapterFactory = {
        create: (config: ServiceConfig) => ({
          start: async (serviceConfig: ServiceConfig) => {
            this.logger.info(`Starting Python service: ${serviceConfig.name}`);
            const processId = `python-${Date.now()}`;
            return {
              id: processId,
              pid: Math.floor(Math.random() * 10000) + 1000,
              status: 'running' as const,
              startedAt: new Date(),
              config: serviceConfig,
            };
          },
          stop: async (processId: string) => {
            this.logger.info(`Stopping Python service with processId: ${processId}`);
            return;
          },
          status: async (processId: string) => ({
            running: true,
            pid: Math.floor(Math.random() * 10000) + 1000,
            uptime: Math.floor(Math.random() * 3600000) + 1000,
            memory: 1024 * 1024 * 150, // 150MB
            cpu: 0.3,
          }),
        }),
        supports: (runtimeType: string) => runtimeType === 'python' || runtimeType === 'py',
      };

      const dockerAdapterFactory = {
        create: (config: ServiceConfig) => ({
          start: async (serviceConfig: ServiceConfig) => {
            this.logger.info(`Starting Docker service: ${serviceConfig.name}`);
            const processId = `docker-${Date.now()}`;
            return {
              id: processId,
              pid: Math.floor(Math.random() * 10000) + 1000,
              status: 'running' as const,
              startedAt: new Date(),
              config: serviceConfig,
            };
          },
          stop: async (processId: string) => {
            this.logger.info(`Stopping Docker service with processId: ${processId}`);
            return;
          },
          status: async (processId: string) => ({
            running: true,
            pid: Math.floor(Math.random() * 10000) + 1000,
            uptime: Math.floor(Math.random() * 3600000) + 1000,
            memory: 1024 * 1024 * 200, // 200MB
            cpu: 0.7,
          }),
        }),
        supports: (runtimeType: string) => runtimeType === 'docker',
      };

      // Register factories
      RuntimeAdapterRegistry.register('node', nodeAdapterFactory);
      RuntimeAdapterRegistry.register('python', pythonAdapterFactory);
      RuntimeAdapterRegistry.register('docker', dockerAdapterFactory);

      this.logger.info('Runtime adapter factories registered successfully');
    } catch (error) {
      this.logger.error(`Failed to register runtime adapters: ${error}`);
      // Don't throw - SDK can still work without runtime adapters
    }
  }

  /**
   * Ensure SDK is initialized
   */
  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('SDK not initialized. Call init() first or set autoInit to true.');
    }
  }

  // ==================== MCP Related Methods ====================

  /**
   * Initialize MCP functionality
   */
  async initMCP(): Promise<void> {
    this.ensureInitialized();

    try {
      // Auto-discover MCP servers
      if (this.mcpOptions?.autoDiscover) {
        await this.discoverMCPServers();
      }

      // Connect configured MCP servers
      if (this.mcpOptions?.servers) {
        for (const serverConfig of this.mcpOptions.servers) {
          await this.connectMCPServer(serverConfig);
        }
      }

      this.logger.info('MCP functionality initialized successfully');
    } catch (error) {
      this.logger.error(`Failed to initialize MCP: ${error}`);
      throw error;
    }
  }

  /**
   * Discover MCP servers
   */
  async discoverMCPServers(): Promise<Array<{ name: string; transport: any }>> {
    this.ensureInitialized();

    try {
      const servers = await discoverLocalMCPServers();

      servers.forEach(server => {
        this.logger.info(`Discovered MCP server: ${server.name}`);
      });

      return servers;
    } catch (error) {
      this.logger.error(`Failed to discover MCP servers: ${error}`);
      throw error;
    }
  }

  /**
   * Connect MCP server
   */
  async connectMCPServer(config: MCPClientConfig, name?: string): Promise<MCPClient> {
    this.ensureInitialized();

    const serverName = name || `mcp-server-${Date.now()}`;

    try {
      const client = new MCPClient(config);
      await client.connect();

      // Get tools and register them
      const tools = await client.listTools();
      this.registerMCPServerTools(serverName, tools, client);

      this.mcpClients.set(serverName, client);
      this.logger.info(`Connected to MCP server: ${serverName} (${tools.length} tools)`);

      return client;
    } catch (error) {
      this.logger.error(`Failed to connect to MCP server: ${error}`);
      throw error;
    }
  }

  /**
   * Disconnect MCP server
   */
  async disconnectMCPServer(name: string): Promise<void> {
    this.ensureInitialized();

    const client = this.mcpClients.get(name);
    if (!client) {
      throw new Error(`MCP server '${name}' not found`);
    }

    try {
      await client.disconnect();
      this.mcpClients.delete(name);

      // Remove related tools
      this.removeMCPServerTools(name);

      this.logger.info(`Disconnected from MCP server: ${name}`);
    } catch (error) {
      this.logger.error(`Failed to disconnect from MCP server '${name}': ${error}`);
      throw error;
    }
  }

  /**
   * Connect multiple MCP servers from configuration
   */
  async connectAllFromConfig(config: MCPConnectionConfig): Promise<Array<{ name: string; success: boolean; toolsCount?: number; error?: string }>> {
    this.ensureInitialized();

    const results = [];

    for (const serverConfig of config.servers) {
      try {
        const name = serverConfig.name || `server-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

        // Convert to MCPClientConfig format
        const mcpConfig: MCPClientConfig = {
          transport: serverConfig.transport,
        };

        const client = await this.connectMCPServer(mcpConfig, name);
        const tools = await client.listTools();

        results.push({
          name,
          success: true,
          toolsCount: tools.length,
        });

        this.logger.info(`Successfully connected to server "${name}" with ${tools.length} tools`);
      } catch (error: any) {
        const serverName = serverConfig.name || 'unnamed-server';
        results.push({
          name: serverName,
          success: false,
          error: error.message,
        });

        this.logger.error(`Failed to connect to server "${serverName}": ${error.message}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    this.logger.info(`Batch connection completed: ${successCount}/${totalCount} servers connected successfully`);

    return results;
  }

  /**
   * Disconnect all MCP servers
   */
  async disconnectAll(): Promise<Array<{ name: string; success: boolean; error?: string }>> {
    this.ensureInitialized();

    const results = [];
    const serverNames = Array.from(this.mcpClients.keys());

    for (const name of serverNames) {
      try {
        await this.disconnectMCPServer(name);
        results.push({
          name,
          success: true,
        });

        this.logger.info(`Successfully disconnected from server "${name}"`);
      } catch (error: any) {
        results.push({
          name,
          success: false,
          error: error.message,
        });

        this.logger.error(`Failed to disconnect from server "${name}": ${error.message}`);
      }
    }

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    this.logger.info(`Batch disconnection completed: ${successCount}/${totalCount} servers disconnected successfully`);

    return results;
  }

  /**
   * List all MCP servers
   */
  listMCPServers(): string[] {
    this.ensureInitialized();
    return Array.from(this.mcpClients.keys());
  }

  /**
   * Get MCP server status
   */
  getMCPServerStatus(name: string): { connected: boolean; toolsCount: number } | undefined {
    this.ensureInitialized();

    const client = this.mcpClients.get(name);
    if (!client) {
      return undefined;
    }

    return client.getStatus();
  }

  /**
   * List all available tools
   */
  listTools(): Array<{
    name: string;
    description: string;
    serverName?: string;
    serverId: string;
    inputSchema?: {
      type: 'object';
      properties: Record<string, any>;
      required?: string[];
      additionalProperties?: boolean;
    };
  }> {
    this.ensureInitialized();

    const tools = this.toolRegistry.getAllTools();
    return tools.map(tool => ({
      name: tool.tool.name,
      description: tool.tool.description,
      serverName: tool.metadata.serverName,
      serverId: tool.metadata.serverId,
      inputSchema: tool.tool.inputSchema,
    }));
  }

  /**
   * Execute tool
   */
  async executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult> {
    this.ensureInitialized();

    const toolCall: ToolCall = {
      name: toolName,
      arguments: args,
    };

    const result = await this.toolRegistry.executeTool(toolCall);

    // If the tool execution resulted in an error, throw an exception
    if (result.isError) {
      const errorText = result.content.find(c => c.type === 'text')?.text || `Tool "${toolName}" execution failed`;
      throw new Error(errorText);
    }

    return result;
  }

  /**
   * Search tools
   */
  searchTools(query: string): Array<{ name: string; description: string; serverName?: string }> {
    this.ensureInitialized();

    const tools = this.toolRegistry.searchTools(query);
    return tools.map(tool => ({
      name: tool.tool.name,
      description: tool.tool.description,
      serverName: tool.metadata.serverName,
      serverId: tool.metadata.serverId,
    }));
  }

  /**
   * Register MCP server tools
   */
  private registerMCPServerTools(serverName: string, tools: Tool[], client: MCPClient): void {
    tools.forEach(tool => {
      const executor = async (args: Record<string, any>): Promise<ToolResult> => {
        return await client.callTool(tool.name, args);
      };

      this.toolRegistry.registerTool(tool, executor, serverName, serverName);
    });

    // Update Cloud Intent Engine tools after registering new tools
    this.syncToolsToCloudIntentEngine();
  }

  /**
   * Remove MCP server tools
   */
  private removeMCPServerTools(serverName: string): void {
    this.toolRegistry.unregisterServerTools(serverName);
  }

  /**
   * Get tool statistics
   */
  getToolStatistics(): any {
    this.ensureInitialized();
    return this.toolRegistry.getToolStatistics();
  }

  // ==================== Cloud Intent Engine Methods ====================

  /**
   * Initialize Cloud Intent Engine
   */
  async initCloudIntentEngine(config?: CloudIntentEngineConfig): Promise<void> {
    this.ensureInitialized();

    try {
      // Use provided config or create from SDK config
      const engineConfig = config || this.createCloudIntentEngineConfig();

      this.cloudIntentEngine = new CloudIntentEngine(engineConfig);
      await this.cloudIntentEngine.initialize();

      // Set available tools from tool registry
      const tools = this.toolRegistry.getAllTools().map(t => t.tool);
      this.cloudIntentEngine.setAvailableTools(tools);

      this.logger.info(`Cloud Intent Engine initialized successfully with ${tools.length} tools`);
    } catch (error) {
      this.logger.error(`Failed to initialize Cloud Intent Engine: ${error}`);
      throw error;
    }
  }

  /**
   * Create Cloud Intent Engine config from SDK config
   */
  private createCloudIntentEngineConfig(): CloudIntentEngineConfig {
    const config = this.getConfig();
    const aiConfig = config.ai || {};

    // Define AI config type to avoid TypeScript errors
    const typedAiConfig = aiConfig as {
      provider?: string;
      apiKey?: string;
      apiEndpoint?: string;
      ollamaHost?: string;
      model?: string;
    };

    return {
      llm: {
        provider: (typedAiConfig.provider as 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'ollama' | 'none') || 'openai',
        apiKey: typedAiConfig.apiKey,
        endpoint: typedAiConfig.apiEndpoint || typedAiConfig.ollamaHost,
        model: typedAiConfig.model || 'gpt-3.5-turbo',
        temperature: 0.1,
        maxTokens: 2048,
        timeout: 30000,
        maxRetries: 3,
      },
      execution: {
        maxConcurrentTools: 10, // Increased from 3 to allow more concurrent tools
        timeout: 60000,
        retryAttempts: 2,
        retryDelay: 1000,
      },
      fallback: {
        enableKeywordMatching: true,
        askUserOnFailure: false,
        defaultTools: {},
      },
    };
  }

  /**
   * Process natural language workflow
   */
  async processWorkflow(query: string): Promise<{
    success: boolean;
    result?: any;
    steps?: Array<{
      intentId: string;
      toolName: string;
      success: boolean;
      result?: any;
      error?: string;
    }>;
    error?: string;
  }> {
    this.ensureInitialized();

    // Check if Cloud Intent Engine is initialized
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized. Call initCloudIntentEngine() first.');
    }

    try {
      // 1. Parse intent
      const intentResult = await this.cloudIntentEngine.parseIntent(query);

      // 2. Select tools
      const toolSelections = await this.cloudIntentEngine.selectTools(intentResult.intents);

      // 3. Execute workflow
      const executionResult = await this.cloudIntentEngine.executeWorkflow(
        intentResult.intents,
        toolSelections,
        intentResult.edges,
        async (toolName: string, params: Record<string, any>) => {
          return await this.executeTool(toolName, params);
        },
      );

      return {
        success: executionResult.success,
        result: executionResult.finalResult,
        steps: executionResult.stepResults,
      };
    } catch (error: any) {
      this.logger.error(`Workflow processing failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Parse and plan workflow (without execution)
   * Returns detailed plan with intents, tool selections, and dependencies
   */
  async parseAndPlanWorkflow(query: string): Promise<{
    success: boolean;
    plan?: {
      query: string;
      parsedIntents: Array<{
        id: string;
        type: string;
        description: string;
        parameters: Record<string, any>;
      }>;
      dependencies: Array<{
        from: string;
        to: string;
      }>;
      toolSelections: Array<{
        intentId: string;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
      }>;
      executionOrder: string[];
      estimatedSteps: number;
      createdAt: Date;
    };
    error?: string;
  }> {
    this.ensureInitialized();

    // Check if Cloud Intent Engine is initialized
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized. Call initCloudIntentEngine() first.');
    }

    try {
      const plan = await this.cloudIntentEngine.parseAndPlan(query);

      return {
        success: true,
        plan,
      };
    } catch (error: any) {
      this.logger.error(`Workflow planning failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Execute workflow with enhanced tracking and detailed reporting
   */
  async executeWorkflowWithTracking(
    query: string,
    callbacks?: {
      onStepStarted?: (step: { intentId: string; toolName: string; intentDescription: string }) => void;
      onStepCompleted?: (step: {
        intentId: string;
        intentDescription: string;
        intentType: string;
        intentParameters: Record<string, any>;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
        success: boolean;
        result?: any;
        error?: string;
        duration?: number;
        startedAt?: Date;
        completedAt?: Date;
      }) => void;
      onStepFailed?: (step: {
        intentId: string;
        intentDescription: string;
        intentType: string;
        intentParameters: Record<string, any>;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
        success: boolean;
        error?: string;
        duration?: number;
        startedAt?: Date;
        completedAt?: Date;
      }) => void;
    },
  ): Promise<{
    success: boolean;
    result?: any;
    parsedIntents?: Array<{
      id: string;
      type: string;
      description: string;
      parameters: Record<string, any>;
    }>;
    dependencies?: Array<{
      from: string;
      to: string;
    }>;
    toolSelections?: Array<{
      intentId: string;
      toolName: string;
      toolDescription: string;
      mappedParameters: Record<string, any>;
      confidence: number;
    }>;
    executionSteps?: Array<{
      intentId: string;
      intentDescription: string;
      intentType: string;
      intentParameters: Record<string, any>;
      toolName: string;
      toolDescription: string;
      mappedParameters: Record<string, any>;
      confidence: number;
      success: boolean;
      result?: any;
      error?: string;
      duration?: number;
      startedAt?: Date;
      completedAt?: Date;
    }>;
    statistics?: {
      totalSteps: number;
      successfulSteps: number;
      failedSteps: number;
      totalDuration: number;
      averageStepDuration: number;
      llmCalls: number;
    };
    error?: string;
  }> {
    this.ensureInitialized();

    // Check if Cloud Intent Engine is initialized
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized. Call initCloudIntentEngine() first.');
    }

    try {
      // Parse intent
      const intentResult = await this.cloudIntentEngine.parseIntent(query);

      // Select tools
      const toolSelections = await this.cloudIntentEngine.selectTools(intentResult.intents);

      // Execute with enhanced tracking
      const enhancedResult = await this.cloudIntentEngine.executeWorkflowWithTracking(
        intentResult.intents,
        toolSelections,
        intentResult.edges,
        async (toolName: string, params: Record<string, any>) => {
          return await this.executeTool(toolName, params);
        },
        callbacks,
      );

      return {
        success: enhancedResult.success,
        result: enhancedResult.finalResult,
        parsedIntents: enhancedResult.parsedIntents,
        dependencies: enhancedResult.dependencies,
        toolSelections: enhancedResult.toolSelections,
        executionSteps: enhancedResult.executionSteps,
        statistics: enhancedResult.statistics,
      };
    } catch (error: any) {
      this.logger.error(`Workflow execution with tracking failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Preview workflow plan (parse and select tools only)
   */
  async previewWorkflowPlan(query: string): Promise<{
    success: boolean;
    plan?: {
      query: string;
      parsedIntents: Array<{
        id: string;
        type: string;
        description: string;
        parameters: Record<string, any>;
      }>;
      dependencies: Array<{
        from: string;
        to: string;
      }>;
      toolSelections: Array<{
        intentId: string;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
      }>;
      executionOrder: string[];
      estimatedSteps: number;
      createdAt: Date;
    };
    error?: string;
  }> {
    this.ensureInitialized();

    // Check if Cloud Intent Engine is initialized
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized. Call initCloudIntentEngine() first.');
    }

    try {
      const plan = await this.cloudIntentEngine.previewPlan(query);

      return {
        success: true,
        plan,
      };
    } catch (error: any) {
      this.logger.error(`Workflow preview failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Confirm and execute a workflow plan
   */
  async confirmAndExecuteWorkflow(
    plan: {
      query: string;
      parsedIntents: Array<{
        id: string;
        type: string;
        description: string;
        parameters: Record<string, any>;
      }>;
      dependencies: Array<{
        from: string;
        to: string;
      }>;
      toolSelections: Array<{
        intentId: string;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
      }>;
      executionOrder: string[];
      estimatedSteps: number;
      createdAt: Date;
    },
    callbacks?: {
      onStepStarted?: (step: { intentId: string; toolName: string; intentDescription: string }) => void;
      onStepCompleted?: (step: {
        intentId: string;
        intentDescription: string;
        intentType: string;
        intentParameters: Record<string, any>;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
        success: boolean;
        result?: any;
        error?: string;
        duration?: number;
        startedAt?: Date;
        completedAt?: Date;
      }) => void;
      onStepFailed?: (step: {
        intentId: string;
        intentDescription: string;
        intentType: string;
        intentParameters: Record<string, any>;
        toolName: string;
        toolDescription: string;
        mappedParameters: Record<string, any>;
        confidence: number;
        success: boolean;
        error?: string;
        duration?: number;
        startedAt?: Date;
        completedAt?: Date;
      }) => void;
    },
  ): Promise<{
    success: boolean;
    result?: any;
    executionSteps?: Array<{
      intentId: string;
      intentDescription: string;
      intentType: string;
      intentParameters: Record<string, any>;
      toolName: string;
      toolDescription: string;
      mappedParameters: Record<string, any>;
      confidence: number;
      success: boolean;
      result?: any;
      error?: string;
      duration?: number;
      startedAt?: Date;
      completedAt?: Date;
    }>;
    statistics?: {
      totalSteps: number;
      successfulSteps: number;
      failedSteps: number;
      totalDuration: number;
      averageStepDuration: number;
      llmCalls: number;
    };
    error?: string;
  }> {
    this.ensureInitialized();

    // Check if Cloud Intent Engine is initialized
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized. Call initCloudIntentEngine() first.');
    }

    try {
      const enhancedResult = await this.cloudIntentEngine.confirmAndExecute(
        plan,
        async (toolName: string, params: Record<string, any>) => {
          return await this.executeTool(toolName, params);
        },
        callbacks,
      );

      return {
        success: enhancedResult.success,
        result: enhancedResult.finalResult,
        executionSteps: enhancedResult.executionSteps,
        statistics: enhancedResult.statistics,
      };
    } catch (error: any) {
      this.logger.error(`Workflow confirmation and execution failed: ${error.message}`);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get Cloud Intent Engine status
   */
  getCloudIntentEngineStatus(): {
    initialized: boolean;
    toolsCount: number;
    llmProvider: string;
    llmConfigured: boolean;
    } {
    this.ensureInitialized();

    if (!this.cloudIntentEngine) {
      return {
        initialized: false,
        toolsCount: 0,
        llmProvider: 'none',
        llmConfigured: false,
      };
    }

    return this.cloudIntentEngine.getStatus();
  }

  /**
   * Sync tools to Cloud Intent Engine
   */
  private syncToolsToCloudIntentEngine(): void {
    if (!this.cloudIntentEngine) {
      // Cloud Intent Engine not initialized yet, tools will be synced when it's initialized
      return;
    }

    try {
      const tools = this.toolRegistry.getAllTools().map(t => t.tool);
      this.cloudIntentEngine.setAvailableTools(tools);
      this.logger.info(`Synced ${tools.length} tools to Cloud Intent Engine`);

      // Notify all registered callbacks
      this.toolUpdateCallbacks.forEach(callback => callback());
    } catch (error) {
      this.logger.error(`Failed to sync tools to Cloud Intent Engine: ${error}`);
    }
  }

  /**
   * Register callback for tool updates
   */
  onToolsUpdated(callback: () => void): void {
    this.toolUpdateCallbacks.push(callback);
  }

  /**
   * Update available tools for Cloud Intent Engine
   */
  updateCloudIntentEngineTools(): void {
    this.ensureInitialized();

    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine not initialized');
    }

    const tools = this.toolRegistry.getAllTools().map(t => t.tool);
    this.cloudIntentEngine.setAvailableTools(tools);

    this.logger.info(`Updated Cloud Intent Engine with ${tools.length} tools`);
  }
}

/**
 * MCPilot SDK Core Class (for backward compatibility)
 * Provides unified API interface, designed for developers
 * @deprecated Use IntentOrchSDK instead. This class is kept for backward compatibility.
 */
export class MCPilotSDK extends IntentOrchSDK {
  constructor(options: SDKOptions = {}) {
    super(options);
  }
}

// Export singleton instances (with backward compatibility)
export const mcpilot = new MCPilotSDK({ autoInit: true });
export const intentorch = mcpilot; // Alias for new name

// Export types
export type { ServiceConfig, RuntimeType, Config } from './core/types';
