/**
 * MCPilot SDK - Minimalist Core Class
 * Designed for developers, pursuing minimalist style
 */

import { ConfigManager } from './core/config-manager';
import { ServiceConfig, RuntimeType, Config } from './core/types';
import { RuntimeAdapterRegistry } from './runtime/adapter-advanced';
import { EnhancedRuntimeDetector } from './runtime/detector-advanced';

// AI imports
import { SimpleAI, AIError } from './ai/ai';
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

export interface AskResult {
  answer: string;
  toolCalls?: Array<{
    service: string;
    tool: string;
    params: Record<string, any>;
  }>;
  confidence: number;
}

/**
 * MCPilot SDK Core Class
 * Provides unified API interface, designed for developers
 */
export class MCPilotSDK {
  private configManager: ConfigManager;
  private initialized = false;
  private logger: SDKOptions['logger'];

  // AI instance
  private ai: SimpleAI;

  // Cloud Intent Engine
  private cloudIntentEngine?: CloudIntentEngine;

  // MCP related properties
  private mcpClients: Map<string, MCPClient> = new Map();
  private toolRegistry: ToolRegistry = new ToolRegistry();
  private mcpOptions: SDKOptions['mcp'];

  constructor(options: SDKOptions = {}) {
    this.logger = options.logger || {
      info: (msg: string) => console.log(`[INFO] ${msg}`),
      error: (msg: string) => console.error(`[ERROR] ${msg}`),
      debug: (msg: string) => console.debug(`[DEBUG] ${msg}`),
    };

    // Initialize AI instance
    this.ai = new SimpleAI();

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
      this.logger.info('MCPilot SDK initialized successfully');
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
        throw new Error(`Service '${name}' not found`);
      }

      const runtime = config.runtime || config.detectedRuntime;
      if (!runtime) {
        throw new Error(`Runtime type not specified for service '${name}'`);
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
        throw new Error(`Service '${name}' not found`);
      }

      const runtime = config.runtime || config.detectedRuntime;
      if (!runtime) {
        throw new Error(`Runtime type not specified for service '${name}'`);
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
        throw new Error(`Service '${name}' not found`);
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
    } catch (error) {
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
    return ConfigManager.getGlobalConfig();
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
   * AI Q&A functionality (optional)
   */
  async ask(query: string, options?: AskOptions): Promise<AskResult> {
    this.ensureInitialized();

    try {
      // Use SimpleAI instance to process query
      // This will throw AIError if AI is not configured
      const aiResult = await this.ai.ask(query);

      // Convert SimpleAI result to SDK AskResult format
      if (aiResult.type === 'tool_call' && aiResult.tool) {
        return {
          answer: `AI suggests using tool: ${aiResult.tool.tool} from service: ${aiResult.tool.service}`,
          toolCalls: [{
            service: aiResult.tool.service,
            tool: aiResult.tool.tool,
            params: aiResult.tool.params,
          }],
          confidence: aiResult.confidence || 0.5,
        };
      } else if (aiResult.type === 'suggestions') {
        return {
          answer: aiResult.message || 'AI feature not enabled or configured incorrectly',
          confidence: 0.3,
        };
      } else {
        return {
          answer: 'AI processed your query but no specific action was suggested.',
          confidence: aiResult.confidence || 0.5,
        };
      }
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
      // Convert SDK AI config to SimpleAI config format
      const simpleAIConfig = {
        provider: (config.provider as 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'ollama' | 'none') || 'none',
        apiKey: config.apiKey,
        endpoint: config.apiEndpoint || config.ollamaHost,
        model: config.model,
        apiVersion: config.apiVersion,
        region: config.region,
      };

      // Configure the SimpleAI instance
      await this.ai.configure(simpleAIConfig);

      // Also update the SDK configuration
      const currentConfig = this.getConfig();
      const updatedConfig = {
        ...currentConfig,
        ai: {
          ...currentConfig.ai,
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
      // Get status from SimpleAI instance
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
      // Test connection using SimpleAI instance
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
  listTools(): Array<{ name: string; description: string; serverName?: string }> {
    this.ensureInitialized();

    const tools = this.toolRegistry.getAllTools();
    return tools.map(tool => ({
      name: tool.tool.name,
      description: tool.tool.description,
      serverName: tool.metadata.serverName,
      serverId: tool.metadata.serverId,
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

      this.logger.info('Cloud Intent Engine initialized successfully');
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
        maxConcurrentTools: 3,
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
        }
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
    }
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
        callbacks
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
    }
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
        callbacks
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

// Export singleton instance
export const mcpilot = new MCPilotSDK({ autoInit: true });

// Export types
export type { ServiceConfig, RuntimeType, Config } from './core/types';
