/**
 * MCP (Model Context Protocol) Type Definitions
 * Based on MCP protocol specification: https://spec.modelcontextprotocol.io/
 */
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
};
export const MCP_ERROR_CODES = {
    PARSE_ERROR: -32700,
    INVALID_REQUEST: -32600,
    METHOD_NOT_FOUND: -32601,
    INVALID_PARAMS: -32602,
    INTERNAL_ERROR: -32603,
    SERVER_ERROR: -32000,
};
