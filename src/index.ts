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

// Export MCP functionality
export { MCPClient, ToolRegistry, createMCPConfig } from './mcp';
export type {
  Tool,
  ToolCall,
  ToolResult,
  MCPClientConfig,
  TransportConfig,
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