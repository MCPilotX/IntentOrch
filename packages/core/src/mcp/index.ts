/**
 * MCP (Model Context Protocol) Module Entry
 * Provides complete MCP protocol support, focusing on MCP tool management
 */

// Export type definitions
export * from './types';

// Export transport layer
export * from './transport';

// Export client
export * from './client';

// Export tool registry
export * from './tool-registry';

// Export enhanced service discovery
export * from './service-discovery';

// Export tool metadata standardization
export * from './tool-metadata';

// ==================== Utility Functions ====================

/**
 * Create MCP client configuration
 */
export function createMCPConfig(
  transportType: 'stdio' | 'http' | 'sse',
  options: {
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    autoConnect?: boolean;
    timeout?: number;
    maxRetries?: number;
  },
) {
  const { command, args, url, headers, ...clientOptions } = options;

  return {
    transport: {
      type: transportType,
      ...(transportType === 'stdio' && command && { command, args }),
      ...(transportType === 'http' && url && { url, headers }),
      ...(transportType === 'sse' && url && { url, headers }),
    },
    ...clientOptions,
  };
}

/**
 * Tool category constants
 */
export const TOOL_CATEGORIES = {
  FILESYSTEM: 'filesystem',
  NETWORK: 'network',
  DATABASE: 'database',
  AI: 'ai',
  UTILITY: 'utility',
  DEVELOPMENT: 'development',
  SYSTEM: 'system',
} as const;

/**
 * Predefined tool patterns (for tool discovery and classification)
 */
export const TOOL_PATTERNS = {
  // Filesystem tools
  READ_FILE: {
    name: 'read_file',
    description: 'Read file content',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        encoding: { type: 'string', description: 'Encoding format', default: 'utf-8' },
      },
      required: ['path'],
    },
  },

  WRITE_FILE: {
    name: 'write_file',
    description: 'Write file content',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'File content' },
        encoding: { type: 'string', description: 'Encoding format', default: 'utf-8' },
      },
      required: ['path', 'content'],
    },
  },

  // Network tools
  HTTP_REQUEST: {
    name: 'http_request',
    description: 'Send HTTP request',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Request URL' },
        method: { type: 'string', description: 'HTTP method', default: 'GET' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body' },
      },
      required: ['url'],
    },
  },

  // System tools
  EXECUTE_COMMAND: {
    name: 'execute_command',
    description: 'Execute system command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        args: { type: 'array', description: 'Command arguments', items: { type: 'string' } },
        cwd: { type: 'string', description: 'Working directory' },
      },
      required: ['command'],
    },
  },
} as const;

// ==================== Tool Discovery Helper Functions ====================

/**
 * Discover local MCP servers
 * Generic approach: discovers servers from configuration and environment
 * No hardcoded service names - works for ANY MCP service
 */
export async function discoverLocalMCPServers(): Promise<Array<{
  name: string;
  transport: any;
}>> {
  const servers: Array<{ name: string; transport: any }> = [];

  // 1. Discover from MCP configuration file
  try {
    const configPaths = [
      process.env.MCP_CONFIG_PATH,
      './mcp-config.json',
      './.mcp/config.json',
      './mcp.json',
      process.env.HOME + '/.mcp/config.json',
    ];

    for (const configPath of configPaths) {
      if (!configPath) continue;
      
      try {
        const fs = require('fs');
        if (fs.existsSync(configPath)) {
          const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
          
          if (config.servers && Array.isArray(config.servers)) {
            for (const server of config.servers) {
              servers.push({
                name: server.name || server.id,
                transport: server.transport || {
                  type: 'stdio',
                  command: server.command || 'npx',
                  args: server.args || [],
                },
              });
            }
          }
        }
      } catch (e) {
        // Ignore individual config file errors
      }
    }
  } catch (error) {
    console.warn('Failed to discover servers from config:', error);
  }

  // 2. Discover from environment variables
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('MCP_SERVER_') && key.endsWith('_COMMAND')) {
      const name = key.replace('MCP_SERVER_', '').replace('_COMMAND', '').toLowerCase();
      const argsKey = `MCP_SERVER_${name.toUpperCase()}_ARGS`;
      const argsStr = process.env[argsKey] || '';
      
      servers.push({
        name,
        transport: {
          type: 'stdio',
          command: value,
          args: argsStr ? argsStr.split(' ').filter(Boolean) : [],
        },
      });
    }
  }

  return servers;
}

/**
 * Load MCP server configurations from environment variables
 */
export function loadMCPServersFromEnv(): Array<{
  name: string;
  transport: any;
}> {
  const servers: Array<{ name: string; transport: any }> = [];

  // Read MCP server configurations from environment variables
  // Format: MCP_SERVER_<NAME>_TYPE=stdio|http|sse
  //         MCP_SERVER_<NAME>_COMMAND=command (for stdio)
  //         MCP_SERVER_<NAME>_URL=url (for http/sse)

  const envPrefix = 'MCP_SERVER_';

  Object.keys(process.env).forEach(key => {
    if (key.startsWith(envPrefix) && key.endsWith('_TYPE')) {
      const serverName = key.slice(envPrefix.length, -5).toLowerCase();
      const transportType = process.env[key] as 'stdio' | 'http' | 'sse';

      const transport: any = { type: transportType };

      if (transportType === 'stdio') {
        const commandKey = `${envPrefix}${serverName.toUpperCase()}_COMMAND`;
        const argsKey = `${envPrefix}${serverName.toUpperCase()}_ARGS`;

        if (process.env[commandKey]) {
          transport.command = process.env[commandKey];

          if (process.env[argsKey]) {
            try {
              transport.args = JSON.parse(process.env[argsKey]!);
            } catch {
              transport.args = process.env[argsKey]!.split(' ');
            }
          }
        }
      } else if (transportType === 'http' || transportType === 'sse') {
        const urlKey = `${envPrefix}${serverName.toUpperCase()}_URL`;
        const headersKey = `${envPrefix}${serverName.toUpperCase()}_HEADERS`;

        if (process.env[urlKey]) {
          transport.url = process.env[urlKey];

          if (process.env[headersKey]) {
            try {
              transport.headers = JSON.parse(process.env[headersKey]!);
            } catch {
              // Ignore parsing errors
            }
          }
        }
      }

      servers.push({
        name: serverName,
        transport,
      });
    }
  });

  return servers;
}

// ==================== Default Export ====================

/**
 * Default export MCPClient class
 */
export { MCPClient as default } from './client';
