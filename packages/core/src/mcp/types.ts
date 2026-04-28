/**
 * MCP (Model Context Protocol) Type Definitions
 * Based on MCP protocol specification: https://spec.modelcontextprotocol.io/
 */

// ==================== Basic Types ====================

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

// ==================== Tool Related Types ====================

/**
 * Tool usage example, typically provided in mcp.json by tool authors
 * These examples help LLMs understand how to use the tool correctly
 */
export interface ToolExample {
  /** Natural language description of what this example does */
  description: string;
  /** Example input parameters */
  input: Record<string, any>;
  /** Example output (optional, for reference) */
  output?: any;
}

/**
 * JSON Schema property definition for tool input schemas
 */
export interface JSONSchemaProperty {
  type?: string;
  description?: string;
  properties?: Record<string, JSONSchemaProperty>;
  items?: JSONSchemaProperty;
  required?: string[];
  enum?: string[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  [key: string]: unknown;
}

export interface Tool {
  name: string;
  description: string;
  inputSchema: {
    type: 'object';
    properties: Record<string, JSONSchemaProperty>;
    required?: string[];
    additionalProperties?: boolean;
  };
  /** Usage examples provided by tool author in mcp.json */
  examples?: ToolExample[];
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

// ==================== Resource Related Types ====================

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
    blob?: string; // base64 encoded
  }>;
}

// ==================== Prompt Related Types ====================

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

// ==================== Transport Layer Types ====================

export type TransportType = 'stdio' | 'http' | 'sse';

export interface StdioLogFilterConfig {
  // Log patterns to ignore (regex strings)
  ignorePatterns?: string[];
  // Log patterns to keep (even if they match ignore patterns)
  keepPatterns?: string[];
  // Whether to enable verbose logging
  verbose?: boolean;
  // Buffer size in bytes
  bufferSize?: number;
  // Message timeout in milliseconds
  timeout?: number;
}

export interface TransportConfig {
  type: TransportType;
  command?: string; // For stdio
  args?: string[]; // For stdio
  url?: string; // For http/sse
  headers?: Record<string, string>; // For http/sse
  // Log filter configuration specific to stdio transport
  logFilter?: StdioLogFilterConfig;
  // Additional spawn options for stdio transport
  env?: Record<string, string>;
  cwd?: string;
  // Optional existing child process to connect to (for dynamic tool discovery)
  // When provided, the transport will use this process instead of spawning a new one
  existingProcess?: import('child_process').ChildProcess;
}

// ==================== Client Configuration ====================

export interface MCPClientConfig {
  transport: TransportConfig;
  autoConnect?: boolean;
  timeout?: number;
  maxRetries?: number;
  /** Optional server name for circuit breaker identification */
  serverName?: string;
}


// ==================== Event Types ====================

export type MCPEventType =
  | 'connected'
  | 'disconnected'
  | 'error'
  | 'tools_updated'
  | 'resources_updated'
  | 'prompts_updated';

export interface MCPEvent {
  type: MCPEventType;
  data?: any;
  timestamp: number;
}

// ==================== Session Types ====================

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

// ==================== Constants ====================

export const MCP_METHODS = {
  // Tool related
  TOOLS_LIST: 'tools/list',
  TOOLS_CALL: 'tools/call',

  // Resource related
  RESOURCES_LIST: 'resources/list',
  RESOURCES_READ: 'resources/read',
  RESOURCES_SUBSCRIBE: 'resources/subscribe',
  RESOURCES_UNSUBSCRIBE: 'resources/unsubscribe',

  // Prompt related
  PROMPTS_LIST: 'prompts/list',
  PROMPTS_GET: 'prompts/get',

  // Logging related
  LOGGING_SET_LEVEL: 'logging/setLevel',

  // Notifications
  NOTIFICATIONS_LIST: 'notifications/list',
} as const;

export const MCP_ERROR_CODES = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603,
  SERVER_ERROR: -32000,
} as const;
