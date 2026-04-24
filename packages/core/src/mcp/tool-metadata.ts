/**
 * MCP Tool Metadata Standardization
 * Standardized tool metadata for better integration with MCP service management tools
 */

import { Tool } from './types';

export interface ToolCategory {
  id: string;
  name: string;
  description: string;
  icon?: string;
  parentCategory?: string;
}

export interface ToolCapability {
  id: string;
  name: string;
  description: string;
  parameters?: string[];
}

export interface ToolMetadata {
  // Basic identification
  toolName: string;
  displayName?: string;
  description: string;

  // Categorization
  category: string;
  subcategories?: string[];
  tags: string[];

  // Capabilities
  capabilities: ToolCapability[];

  // Input/output specifications
  inputSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
    additionalProperties?: boolean;
  };

  outputSchema?: {
    type: string;
    properties?: Record<string, any>;
  };

  // Execution characteristics
  execution: {
    timeout?: number;
    retryable?: boolean;
    idempotent?: boolean;
    sideEffects?: string[];
    requiresResources?: string[];
  };

  // Security and permissions
  security: {
    authenticationRequired?: boolean;
    requiredPermissions?: string[];
    scopes?: string[];
    rateLimit?: {
      requests: number;
      period: number; // milliseconds
    };
  };

  // Versioning
  version: string;
  deprecated?: boolean;
  deprecatedMessage?: string;
  replacementTool?: string;

  // Metadata
  provider: string;
  providerUrl?: string;
  documentationUrl?: string;
  examples?: Array<{
    description: string;
    input: Record<string, any>;
    output: any;
  }>;

  // Performance metrics
  performance?: {
    averageLatency?: number;
    successRate?: number;
    lastUpdated?: number;
  };

  // Integration metadata
  integration: {
    serviceId: string;
    serviceName: string;
    discoveryTime: number;
    lastUsed?: number;
    usageCount?: number;
  };
}

export interface ToolMetadataRegistry {
  register(metadata: ToolMetadata): Promise<void>;
  update(metadata: Partial<ToolMetadata> & { toolName: string }): Promise<void>;
  get(toolName: string): Promise<ToolMetadata | null>;
  getAll(filter?: ToolFilter): Promise<ToolMetadata[]>;
  search(query: string): Promise<ToolMetadata[]>;
  categorize(category: ToolCategory): Promise<void>;
  getCategories(): Promise<ToolCategory[]>;
}

export interface ToolFilter {
  category?: string;
  tags?: string[];
  capabilities?: string[];
  provider?: string;
  serviceId?: string;
  deprecated?: boolean;
}

/**
 * Standardized Tool Metadata Manager
 */
export class ToolMetadataManager {
  private metadata: Map<string, ToolMetadata> = new Map();
  private categories: Map<string, ToolCategory> = new Map();

  // Predefined standard categories
  private readonly standardCategories: ToolCategory[] = [
    {
      id: 'filesystem',
      name: 'Filesystem',
      description: 'Tools for file and directory operations',
      icon: '📁',
    },
    {
      id: 'network',
      name: 'Network',
      description: 'Tools for network communication and APIs',
      icon: '🌐',
    },
    {
      id: 'database',
      name: 'Database',
      description: 'Tools for database operations',
      icon: '🗄️',
    },
    {
      id: 'ai',
      name: 'Artificial Intelligence',
      description: 'AI and machine learning tools',
      icon: '🤖',
    },
    {
      id: 'development',
      name: 'Development',
      description: 'Software development tools',
      icon: '💻',
    },
    {
      id: 'system',
      name: 'System',
      description: 'System-level operations and utilities',
      icon: '⚙️',
    },
    {
      id: 'communication',
      name: 'Communication',
      description: 'Messaging and communication tools',
      icon: '💬',
    },
    {
      id: 'security',
      name: 'Security',
      description: 'Security and authentication tools',
      icon: '🔒',
    },
    {
      id: 'monitoring',
      name: 'Monitoring',
      description: 'Monitoring and observability tools',
      icon: '📊',
    },
  ];

  constructor() {
    // Initialize with standard categories
    this.standardCategories.forEach(category => {
      this.categories.set(category.id, category);
    });
  }

  /**
   * Convert basic MCP Tool to standardized ToolMetadata
   */
  convertToMetadata(
    tool: Tool,
    serviceId: string,
    serviceName: string,
    additionalInfo?: Partial<ToolMetadata>,
  ): ToolMetadata {
    // Auto-categorize based on tool name and description
    const category = this.autoCategorizeTool(tool);

    // Extract capabilities from description
    const capabilities = this.extractCapabilities(tool);

    // Generate tags
    const tags = this.generateTags(tool, category);

    const metadata: ToolMetadata = {
      toolName: tool.name,
      displayName: this.generateDisplayName(tool.name),
      description: tool.description,
      category: category.id,
      tags,
      capabilities,
      inputSchema: tool.inputSchema,
      version: '1.0.0',
      provider: serviceName,
      security: {
        authenticationRequired: false,
      },
      execution: {
        timeout: 30000,
        retryable: true,
        idempotent: false,
      },
      integration: {
        serviceId,
        serviceName,
        discoveryTime: Date.now(),
        usageCount: 0,
      },
      ...additionalInfo,
    };

    return metadata;
  }

  /**
   * Auto-categorize tool based on name and description
   */
  private autoCategorizeTool(tool: Tool): ToolCategory {
    const toolName = tool.name.toLowerCase();
    const description = tool.description.toLowerCase();

    // Check for category keywords
    const categoryKeywords: Record<string, string[]> = {
      filesystem: ['file', 'directory', 'folder', 'path', 'read', 'write', 'delete'],
      network: ['http', 'api', 'request', 'url', 'network', 'web', 'fetch'],
      database: ['database', 'db', 'query', 'sql', 'collection', 'document'],
      ai: ['ai', 'llm', 'model', 'generate', 'embedding', 'vector', 'chat'],
      development: ['git', 'github', 'pr', 'commit', 'code', 'build', 'test'],
      system: ['command', 'execute', 'process', 'system', 'shell', 'terminal'],
      communication: ['slack', 'email', 'message', 'notification', 'chat', 'send'],
      security: ['auth', 'login', 'password', 'token', 'permission', 'access'],
      monitoring: ['log', 'monitor', 'metric', 'alert', 'status', 'health'],
    };

    // Find the best matching category
    let bestMatch = this.categories.get('system')!; // Default to system
    let bestScore = 0;

    for (const [categoryId, keywords] of Object.entries(categoryKeywords)) {
      const category = this.categories.get(categoryId);
      if (!category) {continue;}

      let score = 0;

      // Check tool name
      keywords.forEach(keyword => {
        if (toolName.includes(keyword)) {score += 2;}
      });

      // Check description
      keywords.forEach(keyword => {
        if (description.includes(keyword)) {score += 1;}
      });

      if (score > bestScore) {
        bestScore = score;
        bestMatch = category;
      }
    }

    return bestMatch;
  }

  /**
   * Extract capabilities from tool description
   */
  private extractCapabilities(tool: Tool): ToolCapability[] {
    const capabilities: ToolCapability[] = [];
    const description = tool.description.toLowerCase();

    // Common capability patterns
    const capabilityPatterns = [
      { id: 'read', name: 'Read', keywords: ['read', 'get', 'fetch', 'retrieve'] },
      { id: 'write', name: 'Write', keywords: ['write', 'create', 'add', 'insert'] },
      { id: 'update', name: 'Update', keywords: ['update', 'modify', 'edit', 'change'] },
      { id: 'delete', name: 'Delete', keywords: ['delete', 'remove', 'erase'] },
      { id: 'list', name: 'List', keywords: ['list', 'enumerate', 'show'] },
      { id: 'search', name: 'Search', keywords: ['search', 'find', 'lookup'] },
      { id: 'execute', name: 'Execute', keywords: ['execute', 'run', 'call', 'invoke'] },
      { id: 'send', name: 'Send', keywords: ['send', 'post', 'publish', 'notify'] },
      { id: 'receive', name: 'Receive', keywords: ['receive', 'get', 'obtain'] },
      { id: 'analyze', name: 'Analyze', keywords: ['analyze', 'process', 'parse'] },
    ];

    for (const pattern of capabilityPatterns) {
      for (const keyword of pattern.keywords) {
        if (description.includes(keyword)) {
          capabilities.push({
            id: pattern.id,
            name: pattern.name,
            description: `${pattern.name} operations`,
          });
          break;
        }
      }
    }

    // If no capabilities detected, add a generic one
    if (capabilities.length === 0) {
      capabilities.push({
        id: 'execute',
        name: 'Execute',
        description: 'Execute the tool',
      });
    }

    return capabilities;
  }

  /**
   * Generate tags for tool
   */
  private generateTags(tool: Tool, category: ToolCategory): string[] {
    const tags: string[] = [category.id];

    // Add tags based on tool name patterns
    const toolName = tool.name.toLowerCase();

    if (toolName.includes('_')) {
      tags.push(...toolName.split('_').filter(part => part.length > 2));
    }

    // Add generic tags based on tool name patterns
    // No service-specific logic - works for ANY MCP service
    if (toolName.includes('file')) {tags.push('file');}
    if (toolName.includes('http')) {tags.push('http');}
    if (toolName.includes('search')) {tags.push('search');}
    if (toolName.includes('list')) {tags.push('list');}
    if (toolName.includes('get')) {tags.push('get');}
    if (toolName.includes('create')) {tags.push('create');}
    if (toolName.includes('update')) {tags.push('update');}
    if (toolName.includes('delete')) {tags.push('delete');}

    // Remove duplicates
    return Array.from(new Set(tags));
  }

  /**
   * Generate display name from tool name
   */
  private generateDisplayName(toolName: string): string {
    // Convert snake_case or kebab-case to Title Case
    return toolName
      .replace(/[_-]/g, ' ')
      .replace(/\b\w/g, char => char.toUpperCase())
      .trim();
  }

  /**
   * Register tool metadata
   */
  async register(metadata: ToolMetadata): Promise<void> {
    this.metadata.set(metadata.toolName, metadata);
  }

  /**
   * Update existing tool metadata
   */
  async update(updates: Partial<ToolMetadata> & { toolName: string }): Promise<void> {
    const existing = this.metadata.get(updates.toolName);
    if (!existing) {
      throw new Error(`Tool metadata not found: ${updates.toolName}`);
    }

    const updated = { ...existing, ...updates };
    this.metadata.set(updates.toolName, updated);
  }

  /**
   * Get tool metadata by name
   */
  async get(toolName: string): Promise<ToolMetadata | null> {
    return this.metadata.get(toolName) || null;
  }

  /**
   * Get all tool metadata with optional filtering
   */
  async getAll(filter?: ToolFilter): Promise<ToolMetadata[]> {
    let tools = Array.from(this.metadata.values());

    if (filter) {
      if (filter.category) {
        tools = tools.filter(t => t.category === filter.category);
      }
      if (filter.tags && filter.tags.length > 0) {
        tools = tools.filter(t =>
          filter.tags!.some(tag => t.tags.includes(tag)),
        );
      }
      if (filter.capabilities && filter.capabilities.length > 0) {
        tools = tools.filter(t =>
          filter.capabilities!.some(cap =>
            t.capabilities.some(c => c.id === cap),
          ),
        );
      }
      if (filter.provider) {
        tools = tools.filter(t => t.provider === filter.provider);
      }
      if (filter.serviceId) {
        tools = tools.filter(t => t.integration.serviceId === filter.serviceId);
      }
      if (filter.deprecated !== undefined) {
        tools = tools.filter(t => t.deprecated === filter.deprecated);
      }
    }

    return tools;
  }

  /**
   * Search tools by query
   */
  async search(query: string): Promise<ToolMetadata[]> {
    const searchTerms = query.toLowerCase().split(/\s+/).filter(term => term.length > 0);

    return Array.from(this.metadata.values()).filter(tool => {
      const searchableText = [
        tool.toolName,
        tool.displayName,
        tool.description,
        tool.category,
        ...tool.tags,
        ...tool.capabilities.map(c => c.name),
        tool.provider,
      ].join(' ').toLowerCase();

      return searchTerms.every(term => searchableText.includes(term));
    });
  }

  /**
   * Add or update a category
   */
  async categorize(category: ToolCategory): Promise<void> {
    this.categories.set(category.id, category);
  }

  /**
   * Get all categories
   */
  async getCategories(): Promise<ToolCategory[]> {
    return Array.from(this.categories.values());
  }

  /**
   * Get tools by category
   */
  async getToolsByCategory(categoryId: string): Promise<ToolMetadata[]> {
    return Array.from(this.metadata.values()).filter(tool => tool.category === categoryId);
  }

  /**
   * Update tool usage statistics
   */
  async recordToolUsage(toolName: string): Promise<void> {
    const metadata = this.metadata.get(toolName);
    if (metadata) {
      metadata.integration.lastUsed = Date.now();
      metadata.integration.usageCount = (metadata.integration.usageCount || 0) + 1;
    }
  }

  /**
   * Get most used tools
   */
  async getMostUsedTools(limit: number = 10): Promise<ToolMetadata[]> {
    return Array.from(this.metadata.values())
      .filter(tool => tool.integration.usageCount && tool.integration.usageCount > 0)
      .sort((a, b) => (b.integration.usageCount || 0) - (a.integration.usageCount || 0))
      .slice(0, limit);
  }

  /**
   * Get recently used tools
   */
  async getRecentlyUsedTools(limit: number = 10): Promise<ToolMetadata[]> {
    return Array.from(this.metadata.values())
      .filter(tool => tool.integration.lastUsed)
      .sort((a, b) => (b.integration.lastUsed || 0) - (a.integration.lastUsed || 0))
      .slice(0, limit);
  }
}

/**
 * Factory function to create tool metadata manager
 */
export function createToolMetadataManager(): ToolMetadataManager {
  return new ToolMetadataManager();
}
