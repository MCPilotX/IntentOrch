/**
 * MCP Tool Registration and Management
 * Focuses on MCP tool management, providing tool registration, discovery, execution and other functions
 */

import { Tool, ToolCall, ToolResult } from './types';
import { ParameterMapper } from './parameter-mapper';
import { PreExecutionValidator } from './pre-execution-validator';
import { defaultFallbackManager } from './fallback-manager';
import { Index } from 'flexsearch';

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
  private searchIndex: Index;

  constructor() {
    // Initialize FlexSearch Index for fast full-text search
    this.searchIndex = new Index({
      tokenize: 'full', // Support full text search including CJK characters
      cache: true,
    } as any);
  }

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

    // Universal Indexing: Extract ALL descriptive text from the tool and its schema
    const schemaDescriptions = Object.values(tool.inputSchema.properties || {})
      .map((prop: any) => prop.description || '')
      .join(' ');

    const indexContent = [
      tool.name,
      tool.description || '',
      schemaDescriptions,
      ...(tool.examples?.map(ex => ex.description) || []),
      ...(tool.examples?.map(ex => JSON.stringify(ex.input)) || []),
    ].join(' ');
    
    this.searchIndex.add(tool.name, indexContent);

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

    // Remove from search index
    this.searchIndex.remove(toolName);

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
   * Execute tool with fallback mechanisms
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
        errorMessage += '\n\nYou can connect any MCP server that provides tools.';
        errorMessage += '\nUse listTools() or searchTools() to find the right tool.';
      }

      return {
        content: [{
          type: 'text',
          text: errorMessage,
        }],
        isError: true,
      };
    }

    // Get available tool names for fallback manager
    const availableToolNames = this.getAllTools().map(t => t.tool.name);

    // Define execution function for fallback manager
    const executeFn = async (tc: ToolCall): Promise<ToolResult> => {
      const tool = this.tools.get(tc.name);
      if (!tool) {
        return {
          content: [{
            type: 'text',
            text: `Tool "${tc.name}" not found during fallback execution`,
          }],
          isError: true,
        };
      }

      try {
        // Validate parameters
        this.validateToolArguments(tool.tool, tc.arguments);

        // Execute tool
        const result = await tool.executor(tc.arguments);

        // Update usage statistics
        tool.metadata.lastUsed = Date.now();
        tool.metadata.usageCount = (tool.metadata.usageCount || 0) + 1;

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
    };

    // Use fallback manager for execution
    return await defaultFallbackManager.executeWithFallback(
      toolCall,
      executeFn,
      availableToolNames,
    );
  }

  /**
   * Execute tool directly without fallback mechanisms (for internal use)
   */
  async executeToolDirect(toolCall: ToolCall): Promise<ToolResult> {
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
    // For better Chinese text search, split query into individual terms
    // FlexSearch's 'full' tokenize mode works on character level for CJK,
    // but whole sentence search may not match well. We split the query
    // into terms and search each one, then merge results.
    const terms = this.splitQueryTerms(query);
    
    // Try full query first
    let results = this.searchIndex.search(query, {
      limit: 20,
      suggest: true,
    }) as string[];

    // If no results, try individual terms
    if (results.length === 0 && terms.length > 1) {
      const resultSet = new Set<string>();
      for (const term of terms) {
        if (term.length < 2) continue;
        const termResults = this.searchIndex.search(term, {
          limit: 10,
          suggest: true,
        }) as string[];
        termResults.forEach(id => resultSet.add(id));
      }
      results = Array.from(resultSet);
    }

    // Map search result IDs (tool names) back to RegisteredTool objects
    return results
      .map(name => this.tools.get(name))
      .filter((tool): tool is RegisteredTool => tool !== undefined);
  }

  /**
   * Split query into search terms, handling both English and Chinese text
   * For Chinese text, uses a sliding window approach to extract meaningful segments
   */
  private splitQueryTerms(query: string): string[] {
    const terms: string[] = [];
    const seen = new Set<string>();
    
    const addTerm = (term: string) => {
      const t = term.trim().toLowerCase();
      if (t.length >= 2 && !seen.has(t)) {
        seen.add(t);
        terms.push(t);
      }
    };
    
    // Split by whitespace and punctuation
    const parts = query.split(/[\s,，。！？、；：""''（）()【】《》\/\-_]+/);
    
    for (const part of parts) {
      if (!part) continue;
      
      if (/[\u4e00-\u9fff]/.test(part)) {
        // For Chinese text, use sliding window of 2-4 characters
        const chars = part.split('');
        const chineseChars = chars.filter(c => /[\u4e00-\u9fff]/.test(c));
        
        if (chineseChars.length <= 4) {
          // Short text: use as-is
          addTerm(chineseChars.join(''));
        } else {
          // Long text: extract 2-char and 3-char sliding windows
          for (let winSize of [2, 3]) {
            for (let i = 0; i <= chineseChars.length - winSize; i++) {
              addTerm(chineseChars.slice(i, i + winSize).join(''));
            }
          }
        }
        
        // Also add any non-Chinese tokens (English, numbers)
        const nonChinese = part.replace(/[\u4e00-\u9fff]/g, ' ').trim();
        if (nonChinese) {
          nonChinese.split(/\s+/).forEach(t => {
            if (t.length >= 2) addTerm(t);
          });
        }
      } else {
        // English text - add as-is if meaningful
        if (part.length >= 2) addTerm(part);
      }
    }
    
    return terms;
  }

  // ==================== Tool Validation ====================

  private validateToolArguments(tool: Tool, args: Record<string, any>): void {
    const schema = tool.inputSchema;
    const toolName = tool.name;

    try {
      // Use PreExecutionValidator for comprehensive validation
      const validator = new PreExecutionValidator({
        validationLevel: ParameterMapper.getConfig().validationLevel,
        enforceRequired: ParameterMapper.getConfig().enforceRequired,
        logWarnings: ParameterMapper.getConfig().logWarnings,
      });

      const validationResult = validator.validate(toolName, schema, args);

      // Update the arguments with normalized parameters
      Object.keys(args).forEach(key => delete args[key]);
      Object.assign(args, validationResult.normalizedArgs);

      // Log warnings if any
      if (validationResult.warnings.length > 0) {
        console.warn(`Parameter warnings for tool "${toolName}":`, validationResult.warnings);
      }

      // Log suggestions if any
      if (validationResult.suggestions.length > 0) {
        console.info(`Parameter suggestions for tool "${toolName}":`, validationResult.suggestions);
      }

      // If validation failed, throw error with detailed information
      if (!validationResult.success) {
        const errorMessage = [
          `Tool "${toolName}" parameter validation failed:`,
          ...validationResult.errors,
          '',
          'Tool schema:',
          `  Required parameters: ${schema.required ? schema.required.join(', ') : 'none'}`,
          `  Available parameters: ${Object.keys(schema.properties).join(', ')}`,
          '',
          'Provided parameters:',
          ...Object.entries(args).map(([key, value]) => `  - ${key}: ${typeof value} = ${JSON.stringify(value)}`),
          '',
          'Validation warnings:',
          ...validationResult.warnings.map(w => `  - ${w}`),
          '',
          'Suggestions:',
          ...validationResult.suggestions.map(s => `  - ${s}`),
        ].join('\n');

        throw new Error(errorMessage);
      }

    } catch (error) {
      // If validation throws an error, provide detailed error message
      const errorMessage = [
        `Tool "${toolName}" parameter validation failed:`,
        error instanceof Error ? error.message : String(error),
        '',
        'Tool schema:',
        `  Required parameters: ${schema.required ? schema.required.join(', ') : 'none'}`,
        `  Available parameters: ${Object.keys(schema.properties).join(', ')}`,
        '',
        'Provided parameters:',
        ...Object.entries(args).map(([key, value]) => `  - ${key}: ${typeof value} = ${JSON.stringify(value)}`),
        '',
        'Parameter mapping suggestions:',
        ...ParameterMapper.getMappingSuggestions(toolName, schema).map(m =>
          `  - Use "${m.sourceName}" for "${m.targetName}"`,
        ),
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
    
    // Re-initialize index to clear all data
    this.searchIndex = new Index({
      tokenize: 'full',
      cache: true,
    } as any);
    
    this.emitToolUpdate();
  }
}
