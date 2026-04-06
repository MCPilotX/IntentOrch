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
// ==================== Utility Functions ====================
/**
 * Create MCP client configuration
 */
export function createMCPConfig(transportType, options) {
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
};
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
};
// ==================== Tool Discovery Helper Functions ====================
/**
 * Discover local MCP servers
 * Returns predefined common MCP server configurations
 */
export async function discoverLocalMCPServers() {
    const servers = [];
    // Predefined common MCP servers
    const commonServers = [
        // Filesystem server
        {
            name: 'filesystem',
            command: 'npx',
            args: ['@modelcontextprotocol/server-filesystem'],
        },
        // Clock server
        {
            name: 'clock',
            command: 'npx',
            args: ['@modelcontextprotocol/server-clock'],
        },
        // GitHub server
        {
            name: 'github',
            command: 'npx',
            args: ['@modelcontextprotocol/server-github'],
        },
    ];
    for (const server of commonServers) {
        servers.push({
            name: server.name,
            transport: {
                type: 'stdio',
                command: server.command,
                args: server.args,
            },
        });
    }
    return servers;
}
/**
 * Load MCP server configurations from environment variables
 */
export function loadMCPServersFromEnv() {
    const servers = [];
    // Read MCP server configurations from environment variables
    // Format: MCP_SERVER_<NAME>_TYPE=stdio|http|sse
    //         MCP_SERVER_<NAME>_COMMAND=command (for stdio)
    //         MCP_SERVER_<NAME>_URL=url (for http/sse)
    const envPrefix = 'MCP_SERVER_';
    Object.keys(process.env).forEach(key => {
        if (key.startsWith(envPrefix) && key.endsWith('_TYPE')) {
            const serverName = key.slice(envPrefix.length, -5).toLowerCase();
            const transportType = process.env[key];
            const transport = { type: transportType };
            if (transportType === 'stdio') {
                const commandKey = `${envPrefix}${serverName.toUpperCase()}_COMMAND`;
                const argsKey = `${envPrefix}${serverName.toUpperCase()}_ARGS`;
                if (process.env[commandKey]) {
                    transport.command = process.env[commandKey];
                    if (process.env[argsKey]) {
                        try {
                            transport.args = JSON.parse(process.env[argsKey]);
                        }
                        catch {
                            transport.args = process.env[argsKey].split(' ');
                        }
                    }
                }
            }
            else if (transportType === 'http' || transportType === 'sse') {
                const urlKey = `${envPrefix}${serverName.toUpperCase()}_URL`;
                const headersKey = `${envPrefix}${serverName.toUpperCase()}_HEADERS`;
                if (process.env[urlKey]) {
                    transport.url = process.env[urlKey];
                    if (process.env[headersKey]) {
                        try {
                            transport.headers = JSON.parse(process.env[headersKey]);
                        }
                        catch {
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
//# sourceMappingURL=index.js.map