import { SDKOptions, MCPilotSDK, mcpilot } from './sdk';
/**
 * MCPilot SDK Core - Main Entry File
 * Exports all public APIs, designed for developers
 */

// Export core SDK class and types
export { MCPilotSDK, mcpilot } from './sdk';
export type {
  SDKOptions,
  ServiceStatus,
  AskOptions,
  AskResult,
} from './sdk';

// Export type definitions
export type {
  RuntimeType,
  ServiceConfig,
  Config,
  AIConfig,
  DetectionResult,
} from './core/types';

// Export runtime adapters
export type { RuntimeAdapter } from './runtime/adapter';
export { EnhancedRuntimeDetector } from './runtime/detector-advanced';

// Export configuration manager
export { ConfigManager } from './core/config-manager';

// Export AI functionality (optional)
export { SimpleAI } from './ai/ai';

// Export Cloud Intent Engine functionality
export {
  CloudIntentEngine,
  type CloudIntentEngineConfig,
  type AtomicIntent,
  type DependencyEdge,
  type IntentParseResult,
  type ToolSelectionResult,
  type ExecutionContext,
  type ExecutionResult,
  type EnhancedExecutionStep,
  type WorkflowPlan,
  type EnhancedExecutionResult,
} from './ai';

// Export MCP functionality
export {
  MCPClient,
  ToolRegistry,
  createMCPConfig,
  TOOL_CATEGORIES,
  TOOL_PATTERNS,
  discoverLocalMCPServers,
  loadMCPServersFromEnv,
} from './mcp';
export { BaseTransport, StdioTransport, HTTPTransport, SSETransport, TransportFactory } from './mcp/transport';
export { MCP_METHODS, MCP_ERROR_CODES } from './mcp/types';
export type {
  Tool,
  ToolCall,
  ToolResult,
  MCPClientConfig,
  TransportConfig,
  StdioLogFilterConfig,
  TransportType,
  MCPError,
  JSONRPCRequest,
  JSONRPCResponse,
  Resource,
  ResourceList,
  ResourceContents,
  Prompt,
  PromptList,
  MCPSession,
  MCPEvent,
  MCPEventType,
} from './mcp/types';

// Export utility functions
export { logger } from './core/logger';

// Export error handling
export {
  MCPilotError,
  ErrorCode,
  ErrorSeverity,
  ErrorFactory,
  ErrorHandler,
  ConsoleErrorHandler,
  RetryErrorHandler,
  createError,
  wrapError,
  isMCPilotError,
  shouldRetry,
} from './core/error-handler';

// Export performance monitoring
export { PerformanceMonitor, getPerformanceMonitor } from './core/performance-monitor';

/**
 * Quick start function - Create and return SDK instance
 */
export function createSDK(options?: SDKOptions): MCPilotSDK {
  return new MCPilotSDK(options);
}

/**
 * Default export - Singleton instance
 */
export default mcpilot;
