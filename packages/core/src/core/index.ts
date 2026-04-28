/**
 * Core Module Exports
 * Provides unified interface for core functionality
 */

// Export configuration management
export { ConfigService, getConfigService } from './config-service';

// Export types
export type {
  RuntimeType,
  ServiceConfig,
  Config,
  AIConfig,
  DetectionResult,
  DockerConnectionConfig,
  RuntimeSpecificConfig,
} from './types';

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
} from './constants';

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
} from './error-handler';

// Export logger
export { logger } from './logger';
