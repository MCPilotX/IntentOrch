/**
 * MCP Tool Registration and Management
 * Focuses on MCP tool management, providing tool registration, discovery, execution and other functions
 */

import { Tool, ToolCall, ToolResult } from './types';

export interface ToolExecutor {
  (args: Record<string, any>): Promise<ToolResult>;
}

export interface RegisteredTool {
  tool: Tool;
  executor: ToolExecutor;
  metadata: {
    serverId: string;           // MCP server identifier
    serverName?: string;        // Server name (optional)
    discoveredAt: number;       // Discovery timestamp
    lastUsed?: number;          // Last used time
    usageCount?: number;        // Usage count statistics
  };
}

/**
 * MCP Tool Registry
 * Focuses on managing tools discovered from MCP servers
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private serverTools: Map<string, Set<string>> = new Map(); // Server ID -> Tool name set

  // ==================== Tool Registration ====================

  /**
   * Register MCP tool
   */
  registerMCPTool(
    tool: Tool, 
    executor: ToolExecutor, 
    serverId: string,
    serverName?: string
  ): void {
    const registeredTool: RegisteredTool = {
      tool,
      executor,
      metadata: {
        serverId,
        serverName,
        discoveredAt: Date.now(),
        lastUsed: Date.now(),
        usageCount: 0,
      },
    };

    this.tools.set(tool.name, registeredTool);
    
    // Maintain server to tool mapping
    if (!this.serverTools.has(serverId)) {
      this.serverTools.set(serverId, new Set());
    }
    this.serverTools.get(serverId)!.add(tool.name);
    
    this.emitToolUpdate();
  }

  /**
   * Batch register MCP tools
   */
  registerMCPTools(
    tools: Tool[], 
    executorFactory: (toolName: string) => ToolExecutor,
    serverId: string,
    serverName?: string
  ): void {
    tools.forEach(tool => {
      this.registerMCPTool(tool, executorFactory(tool.name), serverId, serverName);
    });
  }

  /**
   * Unregister tool
   */
  unregisterTool(toolName: string): boolean {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return false;
    }

    // Remove from server mapping
    const serverId = tool.metadata.serverId;
    const serverToolSet = this.serverTools.get(serverId);
    if (serverToolSet) {
      serverToolSet.delete(toolName);
      if (serverToolSet.size === 0) {
        this.serverTools.delete(serverId);
      }
    }

    // Remove from tool mapping
    const removed = this.tools.delete(toolName);
    if (removed) {
      this.emitToolUpdate();
    }
    return removed;
  }

  /**
   * Unregister all tools for specified server
   */
  unregisterServerTools(serverId: string): boolean {
    const toolNames = this.serverTools.get(serverId);
    if (!toolNames || toolNames.size === 0) {
      return false;
    }

    let removedCount = 0;
    toolNames.forEach(toolName => {
      if (this.tools.delete(toolName)) {
        removedCount++;
      }
    });

    this.serverTools.delete(serverId);
    
    if (removedCount > 0) {
      this.emitToolUpdate();
      return true;
    }
    return false;
  }

  // ==================== Tool Execution ====================

  /**
   * Execute tool
   */
  async executeTool(toolCall: ToolCall): Promise<ToolResult> {
    const registeredTool = this.tools.get(toolCall.name);
    
    if (!registeredTool) {
      return {
        content: [{
          type: 'text',
          text: `Tool "${toolCall.name}" not found`,
        }],
        isError: true,
      };
    }

    try {
      // Validate parameters
      this.validateToolArguments(registeredTool.tool, toolCall.arguments);
      
      // Execute tool
      const result = await registeredTool.executor(toolCall.arguments);
      
      // Update usage statistics
      registeredTool.metadata.lastUsed = Date.now();
      registeredTool.metadata.usageCount = (registeredTool.metadata.usageCount || 0) + 1;
      
      return result;
    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
        }],
        isError: true,
      };
    }
  }

  // ==================== Tool Query ====================

  getTool(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  getAllTools(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  getToolsByServer(serverId: string): RegisteredTool[] {
    const toolNames = this.serverTools.get(serverId);
    if (!toolNames) {
      return [];
    }
    
    return Array.from(toolNames)
      .map(name => this.tools.get(name))
      .filter((tool): tool is RegisteredTool => tool !== undefined);
  }

  getServerIds(): string[] {
    return Array.from(this.serverTools.keys());
  }

  searchTools(query: string): RegisteredTool[] {
    const lowerQuery = query.toLowerCase();
    
    return this.getAllTools().filter(registeredTool => {
      const tool = registeredTool.tool;
      return (
        tool.name.toLowerCase().includes(lowerQuery) ||
        tool.description.toLowerCase().includes(lowerQuery)
      );
    });
  }

  // ==================== Tool Validation ====================

  private validateToolArguments(tool: Tool, args: Record<string, any>): void {
    const schema = tool.inputSchema;
    
    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in args)) {
          throw new Error(`Missing required parameter: ${requiredParam}`);
        }
      }
    }
    
    // Check parameter types (simplified validation)
    for (const [paramName, paramValue] of Object.entries(args)) {
      if (!schema.properties[paramName]) {
        if (schema.additionalProperties === false) {
          throw new Error(`Unknown parameter: ${paramName}`);
        }
      }
    }
  }

  // ==================== Tool Statistics ====================

  getToolStatistics() {
    const tools = this.getAllTools();
    
    return {
      totalTools: tools.length,
      byServer: Array.from(this.serverTools.entries()).reduce((acc, [serverId, toolNames]) => {
        acc[serverId] = toolNames.size;
        return acc;
      }, {} as Record<string, number>),
      mostUsed: tools
        .filter(tool => tool.metadata.usageCount && tool.metadata.usageCount > 0)
        .sort((a, b) => (b.metadata.usageCount || 0) - (a.metadata.usageCount || 0))
        .slice(0, 10)
        .map(tool => ({
          name: tool.tool.name,
          serverId: tool.metadata.serverId,
          serverName: tool.metadata.serverName,
          usageCount: tool.metadata.usageCount,
          lastUsed: tool.metadata.lastUsed,
        })),
    };
  }

  // ==================== Event Emission ====================

  private emitToolUpdate(): void {
    // Tool update event can be triggered here
    // Actual implementation can use EventEmitter
    // console.log('Tool registry updated');
  }

  // ==================== Cleanup ====================

  clear(): void {
    this.tools.clear();
    this.serverTools.clear();
    this.emitToolUpdate();
  }
}