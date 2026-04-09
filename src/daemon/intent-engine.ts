/**
 * Simple Intent Engine for testing purposes
 * This is a mock implementation for testing
 */

export interface Tool {
  name: string;
  description: string;
  capabilities: string[];
}

export interface IntentResult {
  tool: string;
  action: string;
  params: Record<string, any>;
}

export class IntentEngine {
  private availableTools: Tool[];

  constructor() {
    this.availableTools = [
      {
        name: 'filesystem',
        description: 'Read and list files in a directory',
        capabilities: ['list_directory', 'read_file'],
      },
      {
        name: 'calculator',
        description: 'Perform mathematical calculations',
        capabilities: ['add', 'subtract', 'multiply', 'divide'],
      },
    ];
  }

  async parse(query: string): Promise<IntentResult> {
    const lowerQuery = query.toLowerCase();
    
    // Check for filesystem queries
    if (lowerQuery.includes('list') && lowerQuery.includes('file')) {
      return {
        tool: 'filesystem',
        action: 'list_directory',
        params: { path: '.' },
      };
    }
    
    // Check for calculator queries
    if (lowerQuery.includes('calculate') || 
        lowerQuery.includes('add') || 
        lowerQuery.includes('subtract') ||
        lowerQuery.includes('math')) {
      return {
        tool: 'calculator',
        action: 'calculate',
        params: { expression: query },
      };
    }
    
    // Default fallback
    return {
      tool: 'filesystem',
      action: 'list_directory',
      params: { path: '.' },
    };
  }

  addTool(tool: Tool): void {
    this.availableTools.push(tool);
  }

  getTools(): Tool[] {
    return [...this.availableTools];
  }
}