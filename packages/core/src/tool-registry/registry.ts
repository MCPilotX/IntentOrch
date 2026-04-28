import { logger } from "../core/logger";
import fs from 'fs/promises';
import path from 'path';
import { getInTorchDir } from '../utils/paths';
import { normalizeServerName, getDisplayName } from '../utils/server-name';

export interface ToolMetadata {
  name: string;
  description: string;
  serverName: string;        // Source identifier, e.g., "gitee:12306"
  actualServerName?: string; // Actual service name for execution, e.g., "12306-mcp"
  parameters?: Record<string, ParameterSchema>;
  categories?: string[];
  keywords?: string[];
  requiresPreprocessing?: boolean; // Whether this tool requires parameter preprocessing
  isDynamic?: boolean;       // Whether this tool was discovered dynamically
  discoveryTime?: string;    // When the tool was discovered (for dynamic tools)
}

export interface ParameterSchema {
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description?: string;
  required?: boolean;
  default?: any;
}

export interface ExtendedManifest {
  name: string;
  version: string;
  description?: string;
  runtime: {
    type: string;
    command: string;
    args?: string[];
    env?: string[];
  };
  tools?: ToolMetadata[];
}

export class ToolRegistry {
  private tools: Map<string, ToolMetadata> = new Map();
  private registryPath: string;

  constructor() {
    this.registryPath = path.join(getInTorchDir(), 'tool-registry.json');
  }

  async load(): Promise<void> {
    try {
      const data = await fs.readFile(this.registryPath, 'utf-8');
      const registry = JSON.parse(data);
      
      this.tools.clear();

      for (const tool of registry.tools || []) {
        // Skip tools with invalid serverName (e.g., "github:/" from old buggy URL parsing)
        if (tool.serverName && (tool.serverName.endsWith(':/') || tool.serverName.endsWith('://'))) {
          logger.warn(`[ToolRegistry] Skipping tool "${tool.name}" with invalid serverName: "${tool.serverName}"`);
          continue;
        }
        // Skip tools where owner or project is empty (e.g., serverName is just "/")
        if (tool.serverName && tool.serverName.split(':').pop() === '/') {
          logger.warn(`[ToolRegistry] Skipping tool "${tool.name}" with empty owner/project: "${tool.serverName}"`);
          continue;
        }
        
        const key = this.getToolKey(tool.serverName, tool.name);
        this.tools.set(key, tool);
      }
    } catch (error) {
      // File does not exist or format error, use empty registry
      this.tools.clear();
    }
  }

  async save(): Promise<void> {
    const registry = {
      version: '1.0.0',
      updatedAt: new Date().toISOString(),
      tools: Array.from(this.tools.values())
    };
    
    await fs.mkdir(path.dirname(this.registryPath), { recursive: true });
    await fs.writeFile(this.registryPath, JSON.stringify(registry, null, 2), 'utf-8');
  }

  async registerToolsFromManifest(serverName: string, manifest: any): Promise<void> {
    // Normalize server name for uniqueness
    const normalizedServerName = normalizeServerName(serverName);
    const displayName = getDisplayName(serverName);
    
    // Support both manifest.tools and manifest.capabilities.tools
    let tools = manifest.tools || [];
    
    // Check for capabilities.tools (MCP standard format)
    if (manifest.capabilities && manifest.capabilities.tools) {
      tools = manifest.capabilities.tools;
    }
    
    if (!tools || tools.length === 0) {
      logger.warn(`No tools declared in manifest for ${displayName}`);
      return;
    }

    for (const tool of tools) {
      // Check if this tool requires parameter preprocessing
      const requiresPreprocessing = this.doesToolRequirePreprocessing(tool);
      
      // Ensure tool includes normalized server name
      const toolWithServer = {
        ...tool,
        serverName: normalizedServerName,
        actualServerName: displayName,  // Store display name for execution
        requiresPreprocessing
      };
      
      const key = this.getToolKey(normalizedServerName, tool.name);
      this.tools.set(key, toolWithServer);
      
      logger.info(`Registered tool: ${tool.name} from ${displayName} (${normalizedServerName})${requiresPreprocessing ? ' [requires preprocessing]' : ''}`);
    }
    
    await this.save();
  }

  /**
   * Register tools discovered dynamically from a running MCP server
   */
  async registerDynamicTools(serverName: string, tools: any[]): Promise<void> {
    if (!tools || tools.length === 0) {
      logger.info(`No tools to register for ${serverName}`);
      return;
    }
    
    // Normalize server name for uniqueness
    const normalizedServerName = normalizeServerName(serverName);
    const displayName = getDisplayName(serverName);
    
    logger.info(`[ToolRegistry] Registering ${tools.length} dynamic tools for ${displayName}`);
    
    for (const tool of tools) {
      try {
        // Convert MCP tool format to ToolMetadata format
        const toolMetadata: ToolMetadata = {
          name: tool.name,
          description: tool.description || `Tool: ${tool.name}`,
          parameters: tool.inputSchema?.properties || {},
          serverName: normalizedServerName,
          actualServerName: displayName,
          keywords: ['dynamic', 'discovered'],
          requiresPreprocessing: false,
          isDynamic: true, // Mark as dynamically discovered
          discoveryTime: new Date().toISOString()
        };
        
        // Check if this tool requires parameter preprocessing
        toolMetadata.requiresPreprocessing = this.doesToolRequirePreprocessing(toolMetadata);
        
        const key = this.getToolKey(normalizedServerName, tool.name);
        
        // Check if tool already exists
        const existingTool = this.tools.get(key);
        if (existingTool) {
          // Update existing tool if it's not dynamic or if dynamic version is newer
          const existingTime = existingTool.discoveryTime || '1970-01-01T00:00:00.000Z';
          const newTime = toolMetadata.discoveryTime || '1970-01-01T00:00:00.000Z';
          
          if (!existingTool.isDynamic || existingTime < newTime) {
            this.tools.set(key, toolMetadata);
            logger.info(`[ToolRegistry] Updated dynamic tool: ${tool.name} from ${displayName}`);
          } else {
            logger.info(`[ToolRegistry] Skipping existing dynamic tool: ${tool.name}`);
          }
        } else {
          // Register new tool
          this.tools.set(key, toolMetadata);
          logger.info(`[ToolRegistry] Registered dynamic tool: ${tool.name} from ${displayName}`);
        }
      } catch (error) {
        logger.error(`[ToolRegistry] Failed to register dynamic tool ${tool.name}:`, error);
      }
    }
    
    await this.save();
    logger.info(`[ToolRegistry] ✓ Dynamic tool registration completed for ${displayName}`);
  }

  async findToolsByKeyword(keyword: string): Promise<ToolMetadata[]> {
    const results: ToolMetadata[] = [];
    
    for (const tool of this.tools.values()) {
      // Check tool name, description, and keywords for matches
      const nameMatch = tool.name.toLowerCase().includes(keyword.toLowerCase());
      const descMatch = tool.description?.toLowerCase().includes(keyword.toLowerCase());
      const keywordMatch = tool.keywords?.some(k => k.toLowerCase().includes(keyword.toLowerCase()));
      
      if (nameMatch || descMatch || keywordMatch) {
        results.push(tool);
      }
    }
    
    return results;
  }

  async findToolsByServer(serverName: string): Promise<ToolMetadata[]> {
    const normalizedServerName = normalizeServerName(serverName);
    const results: ToolMetadata[] = [];
    
    for (const tool of this.tools.values()) {
      if (tool.serverName === normalizedServerName) {
        results.push(tool);
      }
    }
    
    return results;
  }

  async getTool(serverName: string, toolName: string): Promise<ToolMetadata | undefined> {
    const normalizedServerName = normalizeServerName(serverName);
    return this.tools.get(this.getToolKey(normalizedServerName, toolName));
  }

  async getAllTools(): Promise<ToolMetadata[]> {
    return Array.from(this.tools.values());
  }

  async removeToolsByServer(serverName: string): Promise<void> {
    const normalizedServerName = normalizeServerName(serverName);
    const keysToDelete: string[] = [];
    
    for (const [key, tool] of this.tools.entries()) {
      if (tool.serverName === normalizedServerName) {
        keysToDelete.push(key);
      }
    }
    
    for (const key of keysToDelete) {
      this.tools.delete(key);
    }
    
    await this.save();
  }

  private getToolKey(serverName: string, toolName: string): string {
    return `${serverName}::${toolName}`;
  }

  /**
   * Check if a tool requires parameter preprocessing
   * This is a generic method that can be extended for specific preprocessing needs
   */
  private doesToolRequirePreprocessing(_tool: any): boolean {
    // By default, no preprocessing is required
    // This can be extended based on tool metadata or configuration
    return false;
  }
}

// Singleton instance
let toolRegistry: ToolRegistry | null = null;

export function getToolRegistry(): ToolRegistry {
  if (!toolRegistry) {
    toolRegistry = new ToolRegistry();
    // Async load, but don't wait
    toolRegistry.load().catch(err => {
      logger.warn('Failed to load tool registry:', err.message);
    });
  }
  return toolRegistry;
}
