/**
 * MCP (Model Context Protocol) Type Definitions
 * Based on MCP protocol specification: https://spec.modelcontextprotocol.io/
 */
export interface MCPError {
    code: number;
    message: string;
    data?: any;
}
export interface JSONRPCRequest {
    jsonrpc: '2.0';
    id: string | number | null;
    method: string;
    params?: any;
}
export interface JSONRPCResponse {
    jsonrpc: '2.0';
    id: string | number | null;
    result?: any;
    error?: MCPError;
}
export interface Tool {
    name: string;
    description: string;
    inputSchema: {
        type: 'object';
        properties: Record<string, any>;
        required?: string[];
        additionalProperties?: boolean;
    };
}
export interface ToolList {
    tools: Tool[];
}
export interface ToolCall {
    name: string;
    arguments: Record<string, any>;
}
export interface ToolResult {
    content: Array<{
        type: 'text' | 'image' | 'resource';
        text?: string;
        data?: any;
    }>;
    isError?: boolean;
}
export interface Resource {
    uri: string;
    name: string;
    description?: string;
    mimeType?: string;
}
export interface ResourceList {
    resources: Resource[];
}
export interface ResourceContents {
    contents: Array<{
        uri: string;
        mimeType: string;
        text?: string;
        blob?: string;
    }>;
}
export interface Prompt {
    name: string;
    description?: string;
    arguments?: Array<{
        name: string;
        description?: string;
        required?: boolean;
    }>;
}
export interface PromptList {
    prompts: Prompt[];
}
export type TransportType = 'stdio' | 'http' | 'sse';
export interface StdioLogFilterConfig {
    ignorePatterns?: string[];
    keepPatterns?: string[];
    verbose?: boolean;
    bufferSize?: number;
    timeout?: number;
}
export interface TransportConfig {
    type: TransportType;
    command?: string;
    args?: string[];
    url?: string;
    headers?: Record<string, string>;
    logFilter?: StdioLogFilterConfig;
}
export interface MCPClientConfig {
    transport: TransportConfig;
    autoConnect?: boolean;
    timeout?: number;
    maxRetries?: number;
}
export type MCPEventType = 'connected' | 'disconnected' | 'error' | 'tools_updated' | 'resources_updated' | 'prompts_updated';
export interface MCPEvent {
    type: MCPEventType;
    data?: any;
    timestamp: number;
}
export interface MCPSession {
    id: string;
    clientId: string;
    serverId: string;
    tools: Tool[];
    resources: Resource[];
    prompts: Prompt[];
    createdAt: number;
    lastActivity: number;
}
export declare const MCP_METHODS: {
    readonly TOOLS_LIST: "tools/list";
    readonly TOOLS_CALL: "tools/call";
    readonly RESOURCES_LIST: "resources/list";
    readonly RESOURCES_READ: "resources/read";
    readonly RESOURCES_SUBSCRIBE: "resources/subscribe";
    readonly RESOURCES_UNSUBSCRIBE: "resources/unsubscribe";
    readonly PROMPTS_LIST: "prompts/list";
    readonly PROMPTS_GET: "prompts/get";
    readonly LOGGING_SET_LEVEL: "logging/setLevel";
    readonly NOTIFICATIONS_LIST: "notifications/list";
};
export declare const MCP_ERROR_CODES: {
    readonly PARSE_ERROR: -32700;
    readonly INVALID_REQUEST: -32600;
    readonly METHOD_NOT_FOUND: -32601;
    readonly INVALID_PARAMS: -32602;
    readonly INTERNAL_ERROR: -32603;
    readonly SERVER_ERROR: -32000;
};
//# sourceMappingURL=types.d.ts.map