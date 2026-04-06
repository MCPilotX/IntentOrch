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
   * Register tool
   */
  registerTool(
    tool: Tool,
    executor: ToolExecutor,
    serverId: string,
    serverName?: string,
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
   * Batch register tools
   */
  registerTools(
    tools: Tool[],
    executorFactory: (toolName: string) => ToolExecutor,
    serverId: string,
    serverName?: string,
  ): void {
    tools.forEach(tool => {
      this.registerTool(tool, executorFactory(tool.name), serverId, serverName);
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
      // Get list of connected servers and available tools for better error messages
      const connectedServers = this.getConnectedServers();
      const availableTools = this.getAllTools();

      let errorMessage = `Tool "${toolCall.name}" not found.`;

      // Add helpful suggestions
      if (connectedServers.length > 0) {
        errorMessage += `\n\nConnected servers: ${connectedServers.join(', ')}`;

        // Suggest similar tool names
        const similarTools = availableTools
          .filter(tool => tool.tool.name.toLowerCase().includes(toolCall.name.toLowerCase()) ||
                         toolCall.name.toLowerCase().includes(tool.tool.name.toLowerCase()))
          .slice(0, 3);

        if (similarTools.length > 0) {
          errorMessage += '\n\nDid you mean one of these tools?';
          similarTools.forEach(tool => {
            errorMessage += `\n  - ${tool.tool.name} (from server: ${tool.metadata.serverName})`;
          });
        }

        // List all available tools if there aren't too many
        if (availableTools.length <= 10) {
          errorMessage += '\n\nAvailable tools:';
          availableTools.forEach(tool => {
            errorMessage += `\n  - ${tool.tool.name} (${tool.metadata.serverName})`;
          });
        } else {
          errorMessage += `\n\nThere are ${availableTools.length} tools available from ${connectedServers.length} servers.`;
          errorMessage += '\nUse listTools() or searchTools() to find the right tool.';
        }
      } else {
        errorMessage += '\n\nNo MCP servers are currently connected.';
        errorMessage += '\nConnect a server first using connectMCPServer() or connectAllFromConfig().';
        errorMessage += '\n\nPopular MCP servers you can connect:';
        errorMessage += '\n  - @modelcontextprotocol/server-filesystem (file operations)';
        errorMessage += '\n  - @modelcontextprotocol/server-weather (weather data)';
        errorMessage += '\n  - @modelcontextprotocol/server-github (GitHub operations)';
      }

      return {
        content: [{
          type: 'text',
          text: errorMessage,
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

  /**
   * Get connected servers with their names
   */
  getConnectedServers(): string[] {
    const servers: string[] = [];

    for (const registeredTool of this.tools.values()) {
      const serverName = registeredTool.metadata.serverName || registeredTool.metadata.serverId;
      if (!servers.includes(serverName)) {
        servers.push(serverName);
      }
    }

    return servers;
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
    const toolName = tool.name;
    const errors: string[] = [];

    // Check required parameters
    if (schema.required) {
      for (const requiredParam of schema.required) {
        if (!(requiredParam in args)) {
          errors.push(`Missing required parameter: "${requiredParam}"`);
        }
      }
    }

    // Check parameter types and unknown parameters
    for (const [paramName, paramValue] of Object.entries(args)) {
      const paramSchema = schema.properties[paramName];
      
      if (!paramSchema) {
        if (schema.additionalProperties === false) {
          errors.push(`Unknown parameter: "${paramName}". Tool "${toolName}" does not accept this parameter.`);
        }
        // If additionalProperties is true or not specified, allow unknown parameters
        continue;
      }

      // Basic type validation
      if (paramSchema.type) {
        const expectedType = paramSchema.type;
        const actualType = typeof paramValue;
        
        // Handle array type specially
        if (expectedType === 'array' && !Array.isArray(paramValue)) {
          errors.push(`Parameter "${paramName}" should be an array, but got ${actualType}`);
        }
        // Handle other type mismatches (simplified)
        else if (expectedType !== 'array' && expectedType !== actualType) {
          // Allow some flexibility: number can accept string that can be parsed as number
          if (expectedType === 'number' && typeof paramValue === 'string') {
            if (isNaN(Number(paramValue))) {
              errors.push(`Parameter "${paramName}" should be a number, but got string that cannot be parsed as number: "${paramValue}"`);
            }
          } else if (expectedType === 'string' && typeof paramValue !== 'string') {
            errors.push(`Parameter "${paramName}" should be a string, but got ${actualType}`);
          } else if (expectedType === 'boolean' && typeof paramValue !== 'boolean') {
            errors.push(`Parameter "${paramName}" should be a boolean, but got ${actualType}`);
          } else if (expectedType === 'object' && (typeof paramValue !== 'object' || paramValue === null || Array.isArray(paramValue))) {
            errors.push(`Parameter "${paramName}" should be an object, but got ${actualType}`);
          }
        }
      }

      // Check enum values if specified
      if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
        errors.push(`Parameter "${paramName}" value "${paramValue}" is not valid. Allowed values: ${paramSchema.enum.join(', ')}`);
      }
    }

    // If there are errors, throw a comprehensive error message
    if (errors.length > 0) {
      const errorMessage = [
        `Tool "${toolName}" parameter validation failed:`,
        ...errors.map(error => `  - ${error}`),
        '',
        `Tool schema:`,
        `  Required parameters: ${schema.required ? schema.required.join(', ') : 'none'}`,
        `  Available parameters: ${Object.keys(schema.properties).join(', ')}`,
        '',
        `Provided parameters:`,
        ...Object.entries(args).map(([key, value]) => `  - ${key}: ${typeof value} = ${JSON.stringify(value)}`),
      ].join('\n');
      
      throw new Error(errorMessage);
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
