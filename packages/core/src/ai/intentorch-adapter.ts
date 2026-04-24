/**
 * IntentOrch Adapter
 * Provides compatibility layer for @mcpilotx/core intentorch API
 * Allows existing code to work with local CloudIntentEngine implementation
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
    
    // Note: The AI class may need to be updated to accept config
    // For now, we'll store the config for later use
    
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
    const TOOL_LIST_TIMEOUT = 15000; // 15 seconds timeout per server
    
    for (const [name, server] of this.connectedServers) {
      try {
        // Add timeout to prevent one slow server from blocking all others
        const serverTools = await Promise.race([
          server.client.listTools(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 15000ms')), TOOL_LIST_TIMEOUT)
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
   * Parse and plan workflow (mimics intentorch.parseAndPlanWorkflow)
   */
  async parseAndPlanWorkflow(query: string): Promise<{
    success: boolean;
    plan?: any;
    error?: string;
  }> {
    logger.info(`[IntentorchAdapter] Parsing and planning workflow for query: "${query.substring(0, 100)}..."`);
    
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine must be initialized before parsing workflows');
    }

    try {
      // Get tools from connected servers and set them in the engine
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // Use parseAndPlan to perform both parsing and tool selection
      const plan = await this.cloudIntentEngine.parseAndPlan(query);

      return {
        success: true,
        plan
      };
    } catch (error: any) {
      logger.error('[IntentorchAdapter] Failed to parse and plan workflow:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute workflow with tracking (mimics intentorch.executeWorkflowWithTracking)
   */
  async executeWorkflowWithTracking(query: string): Promise<any> {
    logger.info(`[IntentorchAdapter] Executing workflow with tracking for query: "${query.substring(0, 100)}..."`);
    
    if (!this.cloudIntentEngine) {
      throw new Error('Cloud Intent Engine must be initialized before executing workflows');
    }

    try {
      // Get tools from connected servers and set them in the engine
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // First parse and plan to get tool selections
      const plan = await this.cloudIntentEngine.parseAndPlan(query);
      
      // Create a tool executor that uses connected servers
      const toolExecutor = async (toolName: string, params: Record<string, any>): Promise<any> => {
        // Find which server has this tool
        for (const [serverName, server] of this.connectedServers) {
          const serverTools = await server.client.listTools();
          const tool = serverTools.find((t: any) => t.name === toolName);
          if (tool) {
            logger.info(`[IntentorchAdapter] Calling tool ${toolName} on server ${serverName}`);
            return await server.client.callTool(toolName, params);
          }
        }
        throw new Error(`Tool ${toolName} not found in any connected server`);
      };

      // Execute the workflow using the plan
      const result = await this.cloudIntentEngine.executeWorkflowWithTracking(
        plan.parsedIntents,
        plan.toolSelections,
        plan.dependencies,
        toolExecutor
      );
      
      return {
        success: result.success,
        result: result.finalResult,
        executionSteps: result.executionSteps,
        summary: result.statistics,
        error: result.success ? undefined : result.finalResult
      };
    } catch (error: any) {
      logger.error('[IntentorchAdapter] Failed to execute workflow:', error.message);
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