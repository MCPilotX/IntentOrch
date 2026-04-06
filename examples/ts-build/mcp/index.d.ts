/**
 * MCP (Model Context Protocol) Module Entry
 * Provides complete MCP protocol support, focusing on MCP tool management
 */
export * from './types';
export * from './transport';
export * from './client';
export * from './tool-registry';
/**
 * Create MCP client configuration
 */
export declare function createMCPConfig(transportType: 'stdio' | 'http' | 'sse', options: {
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    autoConnect?: boolean;
    timeout?: number;
    maxRetries?: number;
}): {
    autoConnect?: boolean;
    timeout?: number;
    maxRetries?: number;
    transport: {
        url: string;
        headers: Record<string, string>;
        command: string;
        args: string[];
        type: "stdio" | "http" | "sse";
    };
};
/**
 * Tool category constants
 */
export declare const TOOL_CATEGORIES: {
    readonly FILESYSTEM: "filesystem";
    readonly NETWORK: "network";
    readonly DATABASE: "database";
    readonly AI: "ai";
    readonly UTILITY: "utility";
    readonly DEVELOPMENT: "development";
    readonly SYSTEM: "system";
};
/**
 * Predefined tool patterns (for tool discovery and classification)
 */
export declare const TOOL_PATTERNS: {
    readonly READ_FILE: {
        readonly name: "read_file";
        readonly description: "Read file content";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly path: {
                    readonly type: "string";
                    readonly description: "File path";
                };
                readonly encoding: {
                    readonly type: "string";
                    readonly description: "Encoding format";
                    readonly default: "utf-8";
                };
            };
            readonly required: readonly ["path"];
        };
    };
    readonly WRITE_FILE: {
        readonly name: "write_file";
        readonly description: "Write file content";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly path: {
                    readonly type: "string";
                    readonly description: "File path";
                };
                readonly content: {
                    readonly type: "string";
                    readonly description: "File content";
                };
                readonly encoding: {
                    readonly type: "string";
                    readonly description: "Encoding format";
                    readonly default: "utf-8";
                };
            };
            readonly required: readonly ["path", "content"];
        };
    };
    readonly HTTP_REQUEST: {
        readonly name: "http_request";
        readonly description: "Send HTTP request";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly url: {
                    readonly type: "string";
                    readonly description: "Request URL";
                };
                readonly method: {
                    readonly type: "string";
                    readonly description: "HTTP method";
                    readonly default: "GET";
                };
                readonly headers: {
                    readonly type: "object";
                    readonly description: "Request headers";
                };
                readonly body: {
                    readonly type: "string";
                    readonly description: "Request body";
                };
            };
            readonly required: readonly ["url"];
        };
    };
    readonly EXECUTE_COMMAND: {
        readonly name: "execute_command";
        readonly description: "Execute system command";
        readonly inputSchema: {
            readonly type: "object";
            readonly properties: {
                readonly command: {
                    readonly type: "string";
                    readonly description: "Command to execute";
                };
                readonly args: {
                    readonly type: "array";
                    readonly description: "Command arguments";
                    readonly items: {
                        readonly type: "string";
                    };
                };
                readonly cwd: {
                    readonly type: "string";
                    readonly description: "Working directory";
                };
            };
            readonly required: readonly ["command"];
        };
    };
};
/**
 * Discover local MCP servers
 * Returns predefined common MCP server configurations
 */
export declare function discoverLocalMCPServers(): Promise<Array<{
    name: string;
    transport: any;
}>>;
/**
 * Load MCP server configurations from environment variables
 */
export declare function loadMCPServersFromEnv(): Array<{
    name: string;
    transport: any;
}>;
/**
 * Default export MCPClient class
 */
export { MCPClient as default } from './client';
//# sourceMappingURL=index.d.ts.map