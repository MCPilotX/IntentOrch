import { logger } from "./logger";
/**
 * IntentOrch SDK Unified Error Handling System
 * Balances minimalist style with functional robustness
 * Formerly known as MCPilot SDK
 */

/**
 * Error Code Enumeration
 * Clear categorization for easy identification and handling
 * 
 * NOTE: This is a const object (not enum) to support both enum values and string literals.
 * The ErrorCode type is a union of all possible error code strings.
 */
export const ErrorCode = {
  // ==================== Configuration Errors (1xx) ====================
  CONFIG_INVALID: 'CONFIG_001',
  CONFIG_MISSING: 'CONFIG_002',
  CONFIG_VALIDATION_FAILED: 'CONFIG_003',
  CONFIG_MIGRATION_FAILED: 'CONFIG_004',

  // ==================== Service Errors (2xx) ====================
  SERVICE_NOT_FOUND: 'SERVICE_001',
  SERVICE_ALREADY_EXISTS: 'SERVICE_002',
  SERVICE_START_FAILED: 'SERVICE_003',
  SERVICE_STOP_FAILED: 'SERVICE_004',
  SERVICE_HEALTH_CHECK_FAILED: 'SERVICE_005',

  // ==================== Runtime Errors (3xx) ====================
  RUNTIME_DETECTION_FAILED: 'RUNTIME_001',
  RUNTIME_NOT_SUPPORTED: 'RUNTIME_002',
  RUNTIME_NOT_INSTALLED: 'RUNTIME_003',
  RUNTIME_ADAPTER_ERROR: 'RUNTIME_004',

  // ==================== Process Errors (4xx) ====================
  PROCESS_NOT_FOUND: 'PROCESS_001',
  PROCESS_START_FAILED: 'PROCESS_002',
  PROCESS_STOP_FAILED: 'PROCESS_003',
  PROCESS_TIMEOUT: 'PROCESS_004',

  // ==================== Resource Errors (5xx) ====================
  RESOURCE_LIMIT_EXCEEDED: 'RESOURCE_001',
  MEMORY_LIMIT_EXCEEDED: 'RESOURCE_002',
  CPU_LIMIT_EXCEEDED: 'RESOURCE_003',
  DISK_SPACE_INSUFFICIENT: 'RESOURCE_004',

  // ==================== Permission Errors (6xx) ====================
  PERMISSION_DENIED: 'PERMISSION_001',
  FILE_PERMISSION_ERROR: 'PERMISSION_002',
  NETWORK_PERMISSION_ERROR: 'PERMISSION_003',

  // ==================== Network Errors (7xx) ====================
  NETWORK_ERROR: 'NETWORK_001',
  CONNECTION_REFUSED: 'NETWORK_002',
  CONNECTION_TIMEOUT: 'NETWORK_003',
  DNS_RESOLUTION_FAILED: 'NETWORK_004',

  // ==================== AI Errors (8xx) ====================
  AI_CONFIG_INVALID: 'AI_001',
  AI_PROVIDER_NOT_AVAILABLE: 'AI_002',
  AI_QUERY_FAILED: 'AI_003',
  AI_MODEL_NOT_FOUND: 'AI_004',

  // ==================== System Errors (9xx) ====================
  SYSTEM_ERROR: 'SYSTEM_001',
  UNEXPECTED_ERROR: 'SYSTEM_002',
  NOT_IMPLEMENTED: 'SYSTEM_003',

  // ==================== Validation Errors (10xx) ====================
  VALIDATION_FAILED: 'VALIDATION_001',
  REQUIRED_FIELD_MISSING: 'VALIDATION_002',
  INVALID_FORMAT: 'VALIDATION_003',
  OUT_OF_RANGE: 'VALIDATION_004',

  // ==================== Engine Errors (11xx) ====================
  ENGINE_NOT_INITIALIZED: 'ENGINE_001',
  TOOL_NOT_FOUND: 'ENGINE_002',
  SERVER_DISCONNECTED: 'ENGINE_003',
  WORKFLOW_NOT_FOUND: 'ENGINE_004',
  AI_NOT_CONFIGURED: 'ENGINE_005',
  SERVER_START_FAILED: 'ENGINE_006',
} as const;

/**
 * Type representing all possible error code values
 */
export type ErrorCode = typeof ErrorCode[keyof typeof ErrorCode];

/**
 * Error Severity Levels
 */
export enum ErrorSeverity {
  LOW = 'low',        // Ignorable errors, don't affect core functionality
  MEDIUM = 'medium',  // Errors that need attention, may affect some functionality
  HIGH = 'high',      // Serious errors, affect core functionality
  CRITICAL = 'critical', // Fatal errors, system cannot continue running
}

/**
 * Error Context Information
 */
export interface ErrorContext {
  [key: string]: any;
  timestamp?: Date;
  userId?: string;
  requestId?: string;
  serviceName?: string;
  runtimeType?: string;
  configPath?: string;
  environment?: string;
}

/**
 * Error Fix Suggestions
 */
export interface ErrorSuggestion {
  title: string;
  description: string;
  steps: string[];
  codeExample?: string;
  documentationUrl?: string;
}

/**
 * IntentOrch Unified Error Class
 */
export class IntentOrchError extends Error {
  constructor(
    public code: ErrorCode,
    override message: string,
    public severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    public context: ErrorContext = {},
    public suggestions: ErrorSuggestion[] = [],
    public override cause?: Error,
  ) {
    super(message);
    this.name = 'IntentOrchError';

    // Ensure stack trace includes original error
    if (cause && cause.stack) {
      this.stack = `${this.stack}\nCaused by: ${cause.stack}`;
    }

    // Automatically add timestamp
    if (!context.timestamp) {
      context.timestamp = new Date();
    }
  }

  /**
   * Convert to JSON format for easy logging and transmission
   */
  toJSON(): object {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      severity: this.severity,
      context: this.context,
      suggestions: this.suggestions,
      stack: this.stack,
      cause: this.cause ? (this.cause instanceof IntentOrchError ? this.cause.toJSON() : {
        name: this.cause.name,
        message: this.cause.message,
        stack: this.cause.stack,
      }) : undefined,
    };
  }

  /**
   * Get error summary for display
   */
  getSummary(): string {
    return `[${this.code}] ${this.message}`;
  }

  /**
   * Get detailed error information
   */
  getDetails(): string {
    const details = [
      `Error: ${this.name}`,
      `Code: ${this.code}`,
      `Message: ${this.message}`,
      `Severity: ${this.severity}`,
    ];

    if (Object.keys(this.context).length > 0) {
      details.push(`Context: ${JSON.stringify(this.context, null, 2)}`);
    }

    if (this.suggestions.length > 0) {
      details.push('Suggestions:');
      this.suggestions.forEach((suggestion, index) => {
        details.push(`  ${index + 1}. ${suggestion.title}: ${suggestion.description}`);
      });
    }

    if (this.stack) {
      details.push(`Stack: ${this.stack}`);
    }

    return details.join('\n');
  }
}

/**
 * MCPilot Unified Error Class (for backward compatibility)
 * @deprecated Use IntentOrchError instead
 */
export class MCPilotError extends IntentOrchError {
  constructor(
    code: ErrorCode,
    message: string,
    severity: ErrorSeverity = ErrorSeverity.MEDIUM,
    context: ErrorContext = {},
    suggestions: ErrorSuggestion[] = [],
    cause?: Error,
  ) {
    super(code, message, severity, context, suggestions, cause);
    this.name = 'MCPilotError';
  }
}

/**
 * Error Factory - Create standardized error instances
 */
export class ErrorFactory {
  /**
   * Configuration error
   */
  static configInvalid(message: string, context: ErrorContext = {}, cause?: Error): MCPilotError {
    return new MCPilotError(
      ErrorCode.CONFIG_INVALID,
      message,
      ErrorSeverity.HIGH,
      context,
      [
        {
          title: 'Check configuration file',
          description: 'Please check if the configuration file format and content are correct',
          steps: [
            'Verify configuration file path is correct',
            'Check if JSON format is correct',
            'Confirm all required fields are filled',
            'Refer to configuration examples in documentation',
          ],
          documentationUrl: 'https://github.com/MCPilotX/IntentOrch/docs/configuration',
        },
      ],
      cause,
    );
  }

  /**
   * Service not found error
   */
  static serviceNotFound(serviceName: string, context: ErrorContext = {}): MCPilotError {
    return new MCPilotError(
      ErrorCode.SERVICE_NOT_FOUND,
      `Service '${serviceName}' not found`,
      ErrorSeverity.MEDIUM,
      { ...context, serviceName },
      [
        {
          title: 'Check service name',
          description: 'Please confirm if the service name is correct',
          steps: [
            'Use \'mcp ls\' command to view all services',
            'Confirm service name spelling is correct',
            'Check if service has been deleted',
            'If needed, re-add service: mcp add <path>',
          ],
        },
      ],
    );
  }

  /**
   * Runtime detection failed error
   */
  static runtimeDetectionFailed(path: string, context: ErrorContext = {}, cause?: Error): MCPilotError {
    return new MCPilotError(
      ErrorCode.RUNTIME_DETECTION_FAILED,
      `Failed to detect runtime for path: ${path}`,
      ErrorSeverity.MEDIUM,
      { ...context, path },
      [
        {
          title: 'Manually specify runtime type',
          description: 'Auto-detection failed, please manually specify runtime type',
          steps: [
            'Use --type parameter to specify runtime: mcp add <path> --type <runtime>',
            'Supported runtime types: node, python, docker, go, rust, binary',
            'Check if project directory contains correct configuration files',
            'Confirm project structure meets expectations',
          ],
          codeExample: 'mcp add ./my-service --type node',
        },
      ],
      cause,
    );
  }

  /**
   * Process start failed error
   */
  static processStartFailed(serviceName: string, context: ErrorContext = {}, cause?: Error): MCPilotError {
    return new MCPilotError(
      ErrorCode.PROCESS_START_FAILED,
      `Failed to start process for service '${serviceName}'`,
      ErrorSeverity.HIGH,
      { ...context, serviceName },
      [
        {
          title: 'Check service configuration',
          description: 'Service startup failed, please check configuration and dependencies',
          steps: [
            'Check if service path is correct',
            'Confirm runtime environment is installed',
            `View service logs: mcp logs ${serviceName}`,
            'Check if port is occupied',
            'Verify dependencies are installed',
          ],
        },
      ],
      cause,
    );
  }

  /**
   * Permission denied error
   */
  static permissionDenied(operation: string, resource: string, context: ErrorContext = {}): MCPilotError {
    return new MCPilotError(
      ErrorCode.PERMISSION_DENIED,
      `Permission denied for ${operation} on ${resource}`,
      ErrorSeverity.HIGH,
      { ...context, operation, resource },
      [
        {
          title: 'Check file permissions',
          description: 'Insufficient permissions to perform operation',
          steps: [
            `Check file/directory permissions: ls -la ${resource}`,
            'Use sudo to run command (if applicable)',
            `Modify file permissions: chmod +x ${resource}`,
            `Change file owner: chown $(whoami) ${resource}`,
          ],
        },
      ],
    );
  }

  /**
   * Network error
   */
  static networkError(operation: string, url: string, context: ErrorContext = {}, cause?: Error): MCPilotError {
    return new MCPilotError(
      ErrorCode.NETWORK_ERROR,
      `Network error during ${operation} to ${url}`,
      ErrorSeverity.MEDIUM,
      { ...context, operation, url },
      [
        {
          title: 'Check network connection',
          description: 'Network connection failed, please check network settings',
          steps: [
            'Check if network connection is normal',
            'Verify URL is correct',
            'Check firewall settings',
            'Try using proxy (if configured)',
            'Wait and retry after some time',
          ],
        },
      ],
      cause,
    );
  }

  /**
   * Not implemented error
   */
  static notImplemented(feature: string, context: ErrorContext = {}): MCPilotError {
    return new MCPilotError(
      ErrorCode.NOT_IMPLEMENTED,
      `Feature '${feature}' is not implemented yet`,
      ErrorSeverity.LOW,
      { ...context, feature },
      [
        {
          title: 'Feature under development',
          description: 'This feature is under development and will be available in future versions',
          steps: [
            'View project roadmap',
            'Follow GitHub release page',
            'Consider using alternative solutions',
            'Submit feature request (if urgently needed)',
          ],
          documentationUrl: 'https://github.com/MCPilotX/IntentOrch/issues',
        },
      ],
    );
  }

  /**
   * Validation error
   */
  static validationFailed(field: string, reason: string, context: ErrorContext = {}): MCPilotError {
    return new MCPilotError(
      ErrorCode.VALIDATION_FAILED,
      `Validation failed for field '${field}': ${reason}`,
      ErrorSeverity.MEDIUM,
      { ...context, field, reason },
      [
        {
          title: 'Fix validation error',
          description: 'Input data validation failed',
          steps: [
            `Check value of ${field} field`,
            `Ensure value meets requirements: ${reason}`,
            'Refer to field description in documentation',
            'Use valid example values',
          ],
        },
      ],
    );
  }
}

/**
 * Error Handler - Handle, log and recover from errors
 */
export class ErrorHandler {
  private static instance: ErrorHandler;
  private handlers: Array<(error: MCPilotError) => Promise<void>> = [];

  private constructor() {}

  static getInstance(): ErrorHandler {
    if (!ErrorHandler.instance) {
      ErrorHandler.instance = new ErrorHandler();
    }
    return ErrorHandler.instance;
  }

  /**
   * Register error handler
   */
  registerHandler(handler: (error: MCPilotError) => Promise<void>): void {
    this.handlers.push(handler);
  }

  /**
   * Handle error
   */
  async handle(error: Error | MCPilotError): Promise<void> {
    // Convert to MCPilotError (if not already)
    const mcError = error instanceof MCPilotError
      ? error
      : new MCPilotError(
        ErrorCode.UNEXPECTED_ERROR,
        error.message,
        ErrorSeverity.HIGH,
        {},
        [],
        error,
      );

    // Log error
    logger.error(`[IntentOrch Error] ${mcError.getSummary()}`);

    // Execute all registered handlers
    for (const handler of this.handlers) {
      try {
        await handler(mcError);
      } catch (handlerError) {
        logger.error('Error handler failed:', handlerError);
      }
    }
  }

  /**
   * Safely execute function, automatically handle errors
   */
  async execute<T>(
    operation: string,
    fn: () => Promise<T>,
    context: ErrorContext = {},
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const mcError = error instanceof MCPilotError
        ? error
        : new MCPilotError(
          ErrorCode.UNEXPECTED_ERROR,
          `Operation '${operation}' failed: ${error instanceof Error ? error.message : String(error)}`,
          ErrorSeverity.HIGH,
          { ...context, operation },
          [],
          error instanceof Error ? error : undefined,
        );

      await this.handle(mcError);
      throw mcError;
    }
  }
}

/**
 * Default Error Handler - Console Output
 */
export class ConsoleErrorHandler {
  static async handle(error: MCPilotError): Promise<void> {
    const colors = {
      low: '\x1b[36m',     // cyan
      medium: '\x1b[33m',  // yellow
      high: '\x1b[31m',    // red
      critical: '\x1b[41m\x1b[37m', // red background, white text
    };

    const color = colors[error.severity] || '\x1b[0m';
    const reset = '\x1b[0m';

    logger.error(`\n${color}╔══════════════════════════════════════════════════════════════╗${reset}`);
    logger.error(`${color}║ IntentOrch Error: ${error.getSummary().padEnd(48)} ║${reset}`);
    logger.error(`${color}╚══════════════════════════════════════════════════════════════╝${reset}`);

    logger.error(`\n${color}Details:${reset}`);
    logger.error(error.getDetails());

    if (error.suggestions.length > 0) {
      logger.error(`\n${color}Suggestions:${reset}`);
      error.suggestions.forEach((suggestion, index) => {
        logger.error(`  ${index + 1}. ${suggestion.title}`);
        logger.error(`     ${suggestion.description}`);
        if (suggestion.steps.length > 0) {
          logger.error('     Steps:');
          suggestion.steps.forEach(step => {
            logger.error(`       • ${step}`);
          });
        }
      });
    }

    logger.error(`\n${color}Need more help?${reset}`);
    logger.error('  • Check documentation: https://github.com/MCPilotX/IntentOrch/docs');
    logger.error('  • Report issue: https://github.com/MCPilotX/IntentOrch/issues');
    logger.error('  • Ask community: https://github.com/MCPilotX/IntentOrch/discussions\n');
  }
}

/**
 * Error Recovery Strategy
 */
export interface RetryStrategy {
  maxAttempts: number;
  backoff: 'linear' | 'exponential' | 'fixed';
  baseDelay: number; // milliseconds
  maxDelay?: number; // milliseconds
}

/**
 * Error Handler with Retry
 */
export class RetryErrorHandler {
  static async withRetry<T>(
    operation: string,
    fn: () => Promise<T>,
    strategy: RetryStrategy = {
      maxAttempts: 3,
      backoff: 'exponential',
      baseDelay: 1000,
      maxDelay: 10000,
    },
  ): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // If this is the last attempt, throw error directly
        if (attempt === strategy.maxAttempts) {
          throw error;
        }

        // Calculate delay time
        let delay = strategy.baseDelay;
        if (strategy.backoff === 'exponential') {
          delay = strategy.baseDelay * Math.pow(2, attempt - 1);
        } else if (strategy.backoff === 'linear') {
          delay = strategy.baseDelay * attempt;
        }

        // Apply maximum delay limit
        if (strategy.maxDelay && delay > strategy.maxDelay) {
          delay = strategy.maxDelay;
        }

        logger.warn(`[Retry] Attempt ${attempt}/${strategy.maxAttempts} failed for '${operation}'. Retrying in ${delay}ms...`);

        // Wait for delay
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }

    // Theoretically won't reach here because error will be thrown in loop
    throw lastError || new Error(`Operation '${operation}' failed after ${strategy.maxAttempts} attempts`);
  }
}

// Initialize default error handler
const errorHandler = ErrorHandler.getInstance();
errorHandler.registerHandler(ConsoleErrorHandler.handle);

// Export common functions
export function createError(code: ErrorCode, message: string, severity?: ErrorSeverity, context?: ErrorContext): MCPilotError {
  return new MCPilotError(code, message, severity, context);
}

export function wrapError(error: Error, code: ErrorCode = ErrorCode.UNEXPECTED_ERROR, context?: ErrorContext): MCPilotError {
  return new MCPilotError(code, error.message, ErrorSeverity.HIGH, context, [], error);
}

export function isMCPilotError(error: any): error is MCPilotError {
  return error instanceof MCPilotError;
}

export function shouldRetry(error: Error): boolean {
  if (!isMCPilotError(error)) {
    return false;
  }

  // These error types can usually be resolved by retrying
  const retryableCodes: ErrorCode[] = [
    ErrorCode.NETWORK_ERROR,
    ErrorCode.CONNECTION_TIMEOUT,
    ErrorCode.CONNECTION_REFUSED,
    ErrorCode.PROCESS_START_FAILED,
    ErrorCode.SERVICE_START_FAILED,
  ];

  return (retryableCodes as readonly ErrorCode[]).includes(error.code);
}
