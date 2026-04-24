/**
 * MCP Tool Discovery Service
 * Discovers tools dynamically from running MCP servers using MCPClient
 */

import { ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import { MCPClient } from './client';
import { getToolRegistry } from '../tool-registry/registry';
import { getDisplayName } from '../utils/server-name';

export interface MCPTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, any>;
    required?: string[];
  };
  outputSchema?: {
    type: string;
    properties?: Record<string, any>;
  };
}

export interface ToolDiscoveryOptions {
  /** Timeout for tool discovery in milliseconds */
  timeout?: number;
  
  /** Whether to automatically register discovered tools */
  autoRegister?: boolean;
  
  /** Maximum retry attempts for tool discovery */
  maxRetries?: number;
  
  /** Initial retry delay in milliseconds */
  retryDelay?: number;
  
  /** Maximum retry delay in milliseconds */
  maxRetryDelay?: number;
}

export interface RetryOptions {
  maxAttempts: number;
  initialDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export class MCPToolDiscovery extends EventEmitter {
  private toolRegistry = getToolRegistry();
  private activeClients: Map<string, MCPClient> = new Map();
  
  /**
   * Discover tools from a running MCP server process
   * Uses MCPClient to communicate with the server via stdio
   */
  async discoverToolsFromProcess(
    serverName: string,
    process: ChildProcess,
    manifest: any,
    options: ToolDiscoveryOptions = {}
  ): Promise<MCPTool[]> {
    const {
      timeout = 30000,
      autoRegister = true,
      maxRetries = 3,
      retryDelay = 1000,
      maxRetryDelay = 10000
    } = options;
    
    const displayName = getDisplayName(serverName);
    
    console.log(`[ToolDiscovery] Starting tool discovery for ${displayName}`);
    
    try {
      // Create MCP client for the running process
      const client = await this.createMCPClient(serverName, manifest, process);
      
      // Discover tools with retry mechanism
      const discoveredTools = await this.withRetry(
        () => this.discoverToolsWithClient(client, timeout),
        {
          maxAttempts: maxRetries,
          initialDelay: retryDelay,
          maxDelay: maxRetryDelay,
          backoffFactor: 2
        }
      );
      
      console.log(`[ToolDiscovery] Discovered ${discoveredTools.length} tools from ${displayName}`);
      
      if (autoRegister && discoveredTools.length > 0) {
        await this.registerDiscoveredTools(serverName, discoveredTools);
      }
      
      // Clean up client
      await this.cleanupClient(serverName, client);
      
      return discoveredTools;
      
    } catch (error: any) {
      console.error(`[ToolDiscovery] Failed to discover tools from ${displayName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Create MCP client for a running process
   */
  private async createMCPClient(
    serverName: string,
    manifest: any,
    _process: ChildProcess
  ): Promise<MCPClient> {
    const displayName = getDisplayName(serverName);
    
    if (!manifest.runtime || !manifest.runtime.command) {
      throw new Error(`Invalid manifest for server ${displayName}: missing runtime configuration`);
    }
    
    // Check if we already have a client for this server
    if (this.activeClients.has(serverName)) {
      return this.activeClients.get(serverName)!;
    }
    
    console.log(`[ToolDiscovery] Creating MCP client for ${displayName}`);
    
    const client = new MCPClient({
      transport: {
        type: 'stdio',
        command: manifest.runtime.command,
        args: manifest.runtime.args || [],
        env: { ...process.env } as Record<string, string>
      }
    });
    
    try {
      await client.connect();
      this.activeClients.set(serverName, client);
      console.log(`[ToolDiscovery] MCP client connected for ${displayName}`);
      return client;
    } catch (error: any) {
      console.error(`[ToolDiscovery] Failed to connect MCP client for ${displayName}:`, error.message);
      throw error;
    }
  }
  
  /**
   * Discover tools using MCPClient
   */
  private async discoverToolsWithClient(
    client: MCPClient,
    timeout: number
  ): Promise<MCPTool[]> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error('Tool discovery timeout')), timeout);
    });
    
    const discoveryPromise = (async () => {
      try {
        // Get list of tools (already includes descriptions)
        const tools = await client.listTools();
        
        if (!tools || tools.length === 0) {
          console.log('[ToolDiscovery] No tools found on server');
          return [];
        }
        
        console.log(`[ToolDiscovery] Found ${tools.length} tools`);
        
        // Convert to MCPTool format
        return tools.map(tool => ({
          name: tool.name,
          description: tool.description || `Tool: ${tool.name}`,
          inputSchema: tool.inputSchema || {
            type: 'object',
            properties: {},
            required: []
          },
          // Preserve examples from tool metadata (provided in mcp.json by tool authors)
          examples: tool.examples || undefined,
        }));
        
      } catch (error: any) {
        console.error('[ToolDiscovery] Error during tool discovery:', error.message);
        throw error;
      }
    })();
    
    return Promise.race([discoveryPromise, timeoutPromise]);
  }
  
  /**
   * Register discovered tools to the tool registry
   */
  private async registerDiscoveredTools(
    serverName: string,
    tools: MCPTool[]
  ): Promise<void> {
    const displayName = getDisplayName(serverName);
    
    console.log(`[ToolDiscovery] Registering ${tools.length} tools for ${displayName}`);
    
    // Convert MCPTool format to tool registry format
    const toolsForRegistry = tools.map(tool => ({
      name: tool.name,
      description: tool.description || `Tool: ${tool.name}`,
      inputSchema: tool.inputSchema || {
        type: 'object',
        properties: {},
        required: []
      },
      isDynamic: true,
      discoveryTime: Date.now()
    }));
    
    // Register tools using the tool registry's dynamic registration method
    await this.toolRegistry.registerDynamicTools(serverName, toolsForRegistry);
    
    console.log(`[ToolDiscovery] Tool registration completed for ${displayName}`);
  }
  
  /**
   * Retry wrapper with exponential backoff
   */
  private async withRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions
  ): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= options.maxAttempts; attempt++) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error;
        
        if (attempt === options.maxAttempts) {
          console.log(`[ToolDiscovery] All ${options.maxAttempts} attempts failed`);
          break;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          options.initialDelay * Math.pow(options.backoffFactor, attempt - 1),
          options.maxDelay
        );
        
        console.log(`[ToolDiscovery] Attempt ${attempt} failed, retrying in ${delay}ms:`, error.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
    
    throw lastError!;
  }
  
  /**
   * Check if a server supports dynamic tool discovery
   * For now, assume all servers support it
   */
  async supportsDynamicDiscovery(_serverName: string): Promise<boolean> {
    // In a future implementation, we could check server capabilities
    // For now, assume all MCP servers support tool discovery
    return true;
  }
  
  /**
   * Clean up MCP client
   */
  private async cleanupClient(serverName: string, _client: MCPClient): Promise<void> {
    try {
      if (this.activeClients.has(serverName)) {
        this.activeClients.delete(serverName);
      }
      // Note: MCPClient might not have a disconnect method
      // We'll just remove it from our map
    } catch (error: any) {
      console.warn(`[ToolDiscovery] Error cleaning up client for ${serverName}:`, error.message);
    }
  }
  
  /**
   * Clear cached tools for a server
   */
  async clearCachedTools(_serverName: string): Promise<void> {
    console.log(`[ToolDiscovery] Clearing cached tools for ${getDisplayName(_serverName)}`);
    // This would clear tool cache in the registry
    // Implementation depends on tool registry capabilities
  }
}

// Singleton instance
let toolDiscoveryInstance: MCPToolDiscovery | null = null;

export function getMCPToolDiscovery(): MCPToolDiscovery {
  if (!toolDiscoveryInstance) {
    toolDiscoveryInstance = new MCPToolDiscovery();
  }
  return toolDiscoveryInstance;
}