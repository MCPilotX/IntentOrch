/**
 * Core Module Exports
 * Provides unified interface for core functionality
 */

// Export configuration management
export { ConfigService, getConfigService, getAIConfig } from "./config-service.js";

// Export types
export type {
  RuntimeType,
  ServiceConfig,
  Config,
  AIConfig,
  DetectionResult,
  DockerConnectionConfig,
  RuntimeSpecificConfig,
} from "./types.js";

// Export constants
export {
  INTORCH_HOME,
  CONFIG_PATH,
  LOGS_DIR,
  VENVS_DIR,
  AIProviders,
  RegistrySources,
  RuntimeTypes,
  ConfigDefaults,
  ErrorMessages,
  DEFAULT_CONFIG,
} from "./constants.js";

// Export error handling
export {
  MCPilotError,
  IntentOrchError,
  ErrorCode,
  ErrorSeverity,
  ErrorFactory,
  ErrorHandler,
  ConsoleErrorHandler,
  RetryErrorHandler,
  createError,
  wrapError,
  isMCPilotError,
  isIntentOrchError,
  shouldRetry,
} from "./error-handler.js";

// Export logger
export { logger } from "./logger.js";

// Export trace context
export {
  TraceContextManager,
  SpanStatus,
} from "./trace-context.js";
export type {
  TraceSpan,
  TraceContextData,
  TraceMetadata,
} from "./trace-context.js";

// Export interceptors
export { InterceptorChain } from "./interceptor.js";
export type {
  Interceptor,
  InterceptorContext,
} from "./interceptor.js";
