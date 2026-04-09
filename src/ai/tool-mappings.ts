/**
 * Tool Identifier Mappings
 * Maps intent actions to actual MCP tool names with fallback options
 */

export interface ToolMapping {
  intentAction: string;
  intentTarget: string;
  primaryTool: string;
  alternativeTools: string[];
  description: string;
  parameterMappings: Record<string, string>;
}

/**
 * Default tool mappings for common intents
 */
export const DEFAULT_TOOL_MAPPINGS: ToolMapping[] = [
  // File system operations
  {
    intentAction: 'list',
    intentTarget: 'files',
    primaryTool: 'filesystem.list_directory',
    alternativeTools: ['filesystem.list_files', 'filesystem.read_directory', 'filesystem.get_files'],
    description: 'List files in a directory',
    parameterMappings: {
      path: 'path',
      recursive: 'recursive',
      showHidden: 'show_hidden',
    },
  },
  {
    intentAction: 'read',
    intentTarget: 'file',
    primaryTool: 'filesystem.read_file',
    alternativeTools: ['filesystem.get_file', 'filesystem.read_content', 'filesystem.open_file'],
    description: 'Read content from a file',
    parameterMappings: {
      path: 'path',
      encoding: 'encoding',
    },
  },
  {
    intentAction: 'write',
    intentTarget: 'file',
    primaryTool: 'filesystem.write_file',
    alternativeTools: ['filesystem.create_file', 'filesystem.save_file', 'filesystem.update_file'],
    description: 'Write content to a file',
    parameterMappings: {
      path: 'path',
      content: 'content',
      encoding: 'encoding',
      append: 'append',
    },
  },
  {
    intentAction: 'create',
    intentTarget: 'file',
    primaryTool: 'filesystem.create_file',
    alternativeTools: ['filesystem.write_file', 'filesystem.make_file'],
    description: 'Create a new file',
    parameterMappings: {
      path: 'path',
      content: 'content',
    },
  },
  {
    intentAction: 'delete',
    intentTarget: 'file',
    primaryTool: 'filesystem.delete_file',
    alternativeTools: ['filesystem.remove_file', 'filesystem.unlink'],
    description: 'Delete a file',
    parameterMappings: {
      path: 'path',
    },
  },

  // Network operations
  {
    intentAction: 'ping',
    intentTarget: 'network',
    primaryTool: 'network.ping_host',
    alternativeTools: ['network.check_host', 'network.test_connection', 'tools.ping'],
    description: 'Ping a network host',
    parameterMappings: {
      host: 'host',
      count: 'count',
      timeout: 'timeout',
    },
  },
  {
    intentAction: 'fetch',
    intentTarget: 'network',
    primaryTool: 'http.get',
    alternativeTools: ['network.fetch_url', 'tools.fetch', 'web.get'],
    description: 'Fetch URL content',
    parameterMappings: {
      url: 'url',
      method: 'method',
      headers: 'headers',
    },
  },

  // Process operations
  {
    intentAction: 'start',
    intentTarget: 'process',
    primaryTool: 'service_manager.start_service',
    alternativeTools: ['process.start', 'system.start_service', 'tools.start_process'],
    description: 'Start a service or process',
    parameterMappings: {
      name: 'name',
      wait: 'wait',
      timeout: 'timeout',
    },
  },
  {
    intentAction: 'stop',
    intentTarget: 'process',
    primaryTool: 'service_manager.stop_service',
    alternativeTools: ['process.stop', 'system.stop_service', 'tools.stop_process'],
    description: 'Stop a service or process',
    parameterMappings: {
      name: 'name',
      force: 'force',
      timeout: 'timeout',
    },
  },
  {
    intentAction: 'status',
    intentTarget: 'process',
    primaryTool: 'service_manager.get_status',
    alternativeTools: ['process.status', 'system.get_status', 'tools.check_status'],
    description: 'Get service or process status',
    parameterMappings: {
      name: 'name',
      detailed: 'detailed',
    },
  },

  // System operations
  {
    intentAction: 'execute',
    intentTarget: 'command',
    primaryTool: 'system.execute_command',
    alternativeTools: ['tools.run_command', 'shell.execute', 'process.run'],
    description: 'Execute a system command',
    parameterMappings: {
      command: 'command',
      args: 'args',
      cwd: 'cwd',
    },
  },
  {
    intentAction: 'info',
    intentTarget: 'system',
    primaryTool: 'system.get_info',
    alternativeTools: ['tools.system_info', 'platform.info'],
    description: 'Get system information',
    parameterMappings: {},
  },

  // AI operations
  {
    intentAction: 'analyze',
    intentTarget: 'query',
    primaryTool: 'ai.analyze_query',
    alternativeTools: ['tools.analyze', 'llm.process'],
    description: 'Analyze query with AI',
    parameterMappings: {
      query: 'query',
      context: 'context',
    },
  },
  {
    intentAction: 'help',
    intentTarget: 'system',
    primaryTool: 'system.show_help',
    alternativeTools: ['tools.help', 'help.show'],
    description: 'Show help information',
    parameterMappings: {
      topic: 'topic',
      detailed: 'detailed',
    },
  },
];

/**
 * Tool Mapping Manager
 */
export class ToolMappingManager {
  private mappings: ToolMapping[] = DEFAULT_TOOL_MAPPINGS;
  private customMappings: ToolMapping[] = [];

  /**
   * Find mapping for intent action and target with fuzzy matching
   */
  findMapping(action: string, target: string): ToolMapping | undefined {
    // Normalize inputs
    const normalizedAction = action.toLowerCase().trim();
    const normalizedTarget = target.toLowerCase().trim();
    
    // First check exact match in custom mappings
    for (const mapping of this.customMappings) {
      if (mapping.intentAction === normalizedAction && mapping.intentTarget === normalizedTarget) {
        return mapping;
      }
    }

    // Then check exact match in default mappings
    for (const mapping of this.mappings) {
      if (mapping.intentAction === normalizedAction && mapping.intentTarget === normalizedTarget) {
        return mapping;
      }
    }

    // Try fuzzy matching for action
    for (const mapping of this.customMappings) {
      if (mapping.intentAction.includes(normalizedAction) || normalizedAction.includes(mapping.intentAction)) {
        if (mapping.intentTarget.includes(normalizedTarget) || normalizedTarget.includes(mapping.intentTarget)) {
          return mapping;
        }
      }
    }

    // Try fuzzy matching in default mappings
    for (const mapping of this.mappings) {
      if (mapping.intentAction.includes(normalizedAction) || normalizedAction.includes(mapping.intentAction)) {
        if (mapping.intentTarget.includes(normalizedTarget) || normalizedTarget.includes(mapping.intentTarget)) {
          return mapping;
        }
      }
    }

    // Try to find by partial target match
    for (const mapping of this.customMappings) {
      if (mapping.intentTarget.includes(normalizedTarget) || normalizedTarget.includes(mapping.intentTarget)) {
        return mapping;
      }
    }

    for (const mapping of this.mappings) {
      if (mapping.intentTarget.includes(normalizedTarget) || normalizedTarget.includes(mapping.intentTarget)) {
        return mapping;
      }
    }

    return undefined;
  }

  /**
   * Find alternative tool when primary tool is not available
   */
  findAlternativeTool(
    action: string,
    target: string,
    availableTools: string[]
  ): { toolName: string; mapping: ToolMapping } | undefined {
    const mapping = this.findMapping(action, target);
    if (!mapping) {
      return undefined;
    }

    // Check if primary tool is available
    if (availableTools.includes(mapping.primaryTool)) {
      return { toolName: mapping.primaryTool, mapping };
    }

    // Check alternative tools
    for (const alternativeTool of mapping.alternativeTools) {
      if (availableTools.includes(alternativeTool)) {
        return { toolName: alternativeTool, mapping };
      }
    }

    return undefined;
  }

  /**
   * Map intent parameters to tool parameters
   */
  mapParameters(
    mapping: ToolMapping,
    intentParams: Record<string, any>
  ): Record<string, any> {
    const toolParams: Record<string, any> = {};

    for (const [intentParam, value] of Object.entries(intentParams)) {
      const toolParam = mapping.parameterMappings[intentParam];
      if (toolParam) {
        toolParams[toolParam] = value;
      } else {
        // If no explicit mapping, use the intent parameter name
        toolParams[intentParam] = value;
      }
    }

    return toolParams;
  }

  /**
   * Add custom tool mapping
   */
  addCustomMapping(mapping: ToolMapping): void {
    this.customMappings.push(mapping);
  }

  /**
   * Remove custom tool mapping
   */
  removeCustomMapping(action: string, target: string): boolean {
    const index = this.customMappings.findIndex(
      m => m.intentAction === action && m.intentTarget === target
    );
    if (index !== -1) {
      this.customMappings.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Get all mappings
   */
  getAllMappings(): ToolMapping[] {
    return [...this.mappings, ...this.customMappings];
  }

  /**
   * Clear all custom mappings
   */
  clearCustomMappings(): void {
    this.customMappings = [];
  }
}

// Singleton instance
export const toolMappingManager = new ToolMappingManager();