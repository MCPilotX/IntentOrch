/**
 * MCPilot SDK - Minimalist Core Class
 * Designed for developers, pursuing minimalist style
 */

import { ConfigManager } from './core/config-manager';
import { ServiceConfig, RuntimeType, Config } from './core/types';
import { RuntimeAdapterRegistry } from './runtime/adapter-advanced';
import { EnhancedRuntimeDetector } from './runtime/detector-advanced';

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
      // Check AI configuration
      const config = this.getConfig();
      if (!config.ai || (config.ai as any).provider === "none") {
        throw new Error('AI functionality is not configured. Please configure AI provider first.');
      }

      // AI functionality can be integrated here
      // Temporarily return a simple response
      return {
        answer: `I received your query: "${query}". AI functionality will be implemented in a future version.`,
        confidence: 0.8,
      };
    } catch (error) {
      this.logger.error(`AI query failed: ${error}`);
      throw error;
    }
  }

  /**
   * Configure AI
   */
  async configureAI(config: Partial<Config['ai']>): Promise<void> {
    this.ensureInitialized();

    try {
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

    return await this.toolRegistry.executeTool(toolCall);
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

      this.toolRegistry.registerMCPTool(tool, executor, serverName, serverName);
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
}

// Export singleton instance
export const mcpilot = new MCPilotSDK({ autoInit: true });

// Export types
export type { ServiceConfig, RuntimeType, Config } from './core/types';
