/**
 * Global Error Boundary
 *
 * Provides a unified error handling layer for all MCP operations.
 * Features:
 * 1. Automatic error classification and categorization
 * 2. Graceful degradation with fallback strategies
 * 3. Circuit breaker integration for fault isolation
 * 4. Comprehensive error logging and diagnostics
 * 5. Recovery strategies for retryable errors
 */

import { logger } from '../core/logger';
import type { Tool } from '../mcp/types';

// ==================== Type Definitions ====================

export type ErrorCategory =
  | 'connection'
  | 'timeout'
  | 'authentication'
  | 'authorization'
  | 'rate_limited'
  | 'invalid_parameters'
  | 'resource_not_found'
  | 'server_error'
  | 'network_error'
  | 'protocol_error'
  | 'unknown';

export type RecoveryStrategy =
  | 'retry'
  | 'retry_with_backoff'
  | 'use_alternative_tool'
  | 'skip_and_continue'
  | 'report_to_user'
  | 'reconnect'
  | 'abort';

export interface ErrorClassification {
  category: ErrorCategory;
  isRetryable: boolean;
  recoveryStrategy: RecoveryStrategy;
  confidence: number;
  details: string;
  suggestedAction?: string;
}

export interface ErrorBoundaryConfig {
  /** Maximum retry attempts for retryable errors (default: 3) */
  maxRetries: number;
  /** Base delay for exponential backoff in ms (default: 1000) */
  backoffBaseDelay: number;
  /** Maximum backoff delay in ms (default: 30000) */
  backoffMaxDelay: number;
  /** Whether to enable circuit breaker integration (default: true) */
  enableCircuitBreaker: boolean;
  /** Whether to log all errors in detail (default: true) */
  verboseLogging: boolean;
  /** Whether to attempt automatic recovery (default: true) */
  enableAutoRecovery: boolean;
}

export interface ErrorBoundaryResult<T = any> {
  success: boolean;
  result?: T;
  error?: Error;
  classification: ErrorClassification;
  retryCount: number;
  recoveryAttempted: boolean;
  recoverySuccessful?: boolean;
  duration: number;
}

// ==================== Error Classification Patterns ====================

const ERROR_PATTERNS: Array<{
  patterns: RegExp[];
  category: ErrorCategory;
  isRetryable: boolean;
  recoveryStrategy: RecoveryStrategy;
}> = [
  {
    patterns: [
      /not connected/i,
      /connection refused/i,
      /ECONNREFUSED/i,
      /ECONNRESET/i,
      /ENOTFOUND/i,
      /disconnected/i,
      /transport closed/i,
      /pipe closed/i,
      /broken pipe/i,
    ],
    category: 'connection',
    isRetryable: true,
    recoveryStrategy: 'reconnect',
  },
  {
    patterns: [
      /timeout/i,
      /timed out/i,
      /ETIMEDOUT/i,
      /request timeout/i,
      /execution timeout/i,
    ],
    category: 'timeout',
    isRetryable: true,
    recoveryStrategy: 'retry_with_backoff',
  },
  {
    patterns: [
      /authentication/i,
      /unauthorized/i,
      /invalid api key/i,
      /invalid token/i,
      /auth failed/i,
      /not authenticated/i,
    ],
    category: 'authentication',
    isRetryable: false,
    recoveryStrategy: 'report_to_user',
  },
  {
    patterns: [
      /forbidden/i,
      /not authorized/i,
      /permission denied/i,
      /access denied/i,
      /insufficient permissions/i,
    ],
    category: 'authorization',
    isRetryable: false,
    recoveryStrategy: 'report_to_user',
  },
  {
    patterns: [
      /rate limit/i,
      /too many requests/i,
      /429/i,
      /throttled/i,
      /quota exceeded/i,
    ],
    category: 'rate_limited',
    isRetryable: true,
    recoveryStrategy: 'retry_with_backoff',
  },
  {
    patterns: [
      /missing required/i,
      /invalid parameter/i,
      /invalid argument/i,
      /validation error/i,
      /must be provided/i,
      /required parameter/i,
    ],
    category: 'invalid_parameters',
    isRetryable: false,
    recoveryStrategy: 'report_to_user',
  },
  {
    patterns: [
      /not found/i,
      /does not exist/i,
      /no such/i,
      /cannot find/i,
      /unable to find/i,
      /resource not found/i,
    ],
    category: 'resource_not_found',
    isRetryable: false,
    recoveryStrategy: 'use_alternative_tool',
  },
  {
    patterns: [
      /internal error/i,
      /server error/i,
      /5\d{2}/i,
      /unexpected error/i,
      /something went wrong/i,
      /internal server error/i,
    ],
    category: 'server_error',
    isRetryable: true,
    recoveryStrategy: 'retry_with_backoff',
  },
  {
    patterns: [
      /network/i,
      /ENETUNREACH/i,
      /EAI_AGAIN/i,
      /socket/i,
      /fetch failed/i,
      /request failed/i,
    ],
    category: 'network_error',
    isRetryable: true,
    recoveryStrategy: 'retry_with_backoff',
  },
  {
    patterns: [
      /parse error/i,
      /invalid json/i,
      /jsonrpc/i,
      /invalid request/i,
      /method not found/i,
      /invalid params/i,
    ],
    category: 'protocol_error',
    isRetryable: false,
    recoveryStrategy: 'report_to_user',
  },
];

// ==================== Default Config ====================

const DEFAULT_CONFIG: ErrorBoundaryConfig = {
  maxRetries: 3,
  backoffBaseDelay: 1000,
  backoffMaxDelay: 30000,
  enableCircuitBreaker: true,
  verboseLogging: true,
  enableAutoRecovery: true,
};

// ==================== Error Boundary Implementation ====================

export class ErrorBoundary {
  private config: ErrorBoundaryConfig;

  constructor(config?: Partial<ErrorBoundaryConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Execute an operation with full error boundary protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    context: {
      serverName?: string;
      toolName?: string;
      operationName: string;
      alternativeTools?: Tool[];
    },
  ): Promise<ErrorBoundaryResult<T>> {
    const startTime = Date.now();
    let lastError: Error | undefined;
    let retryCount = 0;
    let recoveryAttempted = false;
    let recoverySuccessful: boolean | undefined;

    for (let attempt = 1; attempt <= this.config.maxRetries + 1; attempt++) {
      try {
        const result = await operation();

        // Circuit breaker integration is handled by MCPClient.sendRequest
        // which wraps calls through circuitBreaker.call()

        const duration = Date.now() - startTime;
        return {
          success: true,
          result,
          classification: {
            category: 'unknown',
            isRetryable: false,
            recoveryStrategy: 'retry',
            confidence: 1,
            details: 'Operation completed successfully',
          },
          retryCount,
          recoveryAttempted,
          recoverySuccessful,
          duration,
        };
      } catch (error: any) {
        lastError = error;
        const classification = this.classifyError(error);

        if (this.config.verboseLogging) {
          logger.warn(
            `[ErrorBoundary] Attempt ${attempt}/${this.config.maxRetries + 1} failed for ${context.operationName}`,
            {
              error: error.message,
              category: classification.category,
              isRetryable: classification.isRetryable,
              serverName: context.serverName,
              toolName: context.toolName,
            },
          );
        }

        // Circuit breaker integration is handled by MCPClient.sendRequest
        // which wraps calls through circuitBreaker.call()

        // Check if we should retry
        if (classification.isRetryable && attempt <= this.config.maxRetries) {
          retryCount++;
          const delay = this.calculateBackoff(attempt);
          if (this.config.verboseLogging) {
            logger.info(
              `[ErrorBoundary] Retrying ${context.operationName} in ${delay}ms (attempt ${attempt}/${this.config.maxRetries})`,
            );
          }
          await this.sleep(delay);
          continue;
        }

        // Attempt recovery for non-retryable errors
        if (this.config.enableAutoRecovery && classification.recoveryStrategy !== 'retry' && classification.recoveryStrategy !== 'retry_with_backoff') {
          recoveryAttempted = true;
          try {
            recoverySuccessful = await this.attemptRecovery(classification, context);
          } catch (recoveryError: any) {
            if (this.config.verboseLogging) {
              logger.warn(
                `[ErrorBoundary] Recovery failed for ${context.operationName}: ${recoveryError.message}`,
              );
            }
            recoverySuccessful = false;
          }
        }

        const duration = Date.now() - startTime;
        return {
          success: false,
          error: lastError,
          classification,
          retryCount,
          recoveryAttempted,
          recoverySuccessful,
          duration,
        };
      }
    }

    // Should never reach here
    const duration = Date.now() - startTime;
    return {
      success: false,
      error: lastError || new Error('Unknown error'),
      classification: {
        category: 'unknown',
        isRetryable: false,
        recoveryStrategy: 'report_to_user',
        confidence: 0,
        details: 'Unknown error after all retries',
      },
      retryCount,
      recoveryAttempted,
      recoverySuccessful,
      duration,
    };
  }

  /**
   * Classify an error into a category
   */
  classifyError(error: Error): ErrorClassification {
    const message = error.message || String(error);

    for (const pattern of ERROR_PATTERNS) {
      for (const regex of pattern.patterns) {
        if (regex.test(message)) {
          return {
            category: pattern.category,
            isRetryable: pattern.isRetryable,
            recoveryStrategy: pattern.recoveryStrategy,
            confidence: 0.9,
            details: message,
            suggestedAction: this.getSuggestedAction(pattern.category),
          };
        }
      }
    }

    // Default: unknown error
    return {
      category: 'unknown',
      isRetryable: false,
      recoveryStrategy: 'report_to_user',
      confidence: 0.3,
      details: message,
      suggestedAction: 'Please check the error details and try again.',
    };
  }

  /**
   * Attempt recovery based on error classification
   */
  private async attemptRecovery(
    classification: ErrorClassification,
    context: {
      serverName?: string;
      toolName?: string;
      operationName: string;
      alternativeTools?: Tool[];
    },
  ): Promise<boolean> {
    switch (classification.recoveryStrategy) {
      case 'reconnect':
        return this.attemptReconnect(context);
      case 'use_alternative_tool':
        return this.attemptAlternativeTool(context);
      case 'skip_and_continue':
        return true; // Skip is always successful
      case 'report_to_user':
        return false; // Cannot auto-recover, needs user intervention
      default:
        return false;
    }
  }

  /**
   * Attempt to reconnect to a server
   */
  private async attemptReconnect(context: {
    serverName?: string;
    operationName: string;
  }): Promise<boolean> {
    if (this.config.verboseLogging) {
      logger.info(`[ErrorBoundary] Attempting reconnect for ${context.operationName}`);
    }
    // Reconnect is handled by the caller (MCPClient)
    // Here we just log and return false to let the caller handle it
    return false;
  }

  /**
   * Attempt to use an alternative tool
   */
  private async attemptAlternativeTool(context: {
    toolName?: string;
    alternativeTools?: Tool[];
  }): Promise<boolean> {
    if (!context.alternativeTools || context.alternativeTools.length === 0) {
      if (this.config.verboseLogging) {
        logger.info(
          `[ErrorBoundary] No alternative tools available for ${context.toolName}`,
        );
      }
      return false;
    }

    if (this.config.verboseLogging) {
      logger.info(
        `[ErrorBoundary] Found ${context.alternativeTools.length} alternative tools for ${context.toolName}`,
      );
    }
    return true; // Alternative tools are available
  }

  /**
   * Calculate exponential backoff delay
   */
  private calculateBackoff(attempt: number): number {
    const delay = this.config.backoffBaseDelay * Math.pow(2, attempt - 1);
    return Math.min(delay, this.config.backoffMaxDelay);
  }

  /**
   * Get suggested action for an error category
   */
  private getSuggestedAction(category: ErrorCategory): string {
    switch (category) {
      case 'connection':
        return 'Check if the MCP server is running and accessible. Try restarting the server.';
      case 'timeout':
        return 'The operation took too long. The server may be overloaded. Try again later.';
      case 'authentication':
        return 'Check your API key or authentication credentials. Update them in the configuration.';
      case 'authorization':
        return 'You do not have permission to perform this operation. Contact your administrator.';
      case 'rate_limited':
        return 'Too many requests. Wait a moment and try again.';
      case 'invalid_parameters':
        return 'The parameters provided are invalid. Check the tool documentation for correct parameter format.';
      case 'resource_not_found':
        return 'The requested resource was not found. Try using a different tool or check the resource path.';
      case 'server_error':
        return 'The server encountered an internal error. Try again later or contact the server administrator.';
      case 'network_error':
        return 'A network error occurred. Check your internet connection and try again.';
      case 'protocol_error':
        return 'A protocol error occurred. The server may be incompatible with the current MCP version.';
      default:
        return 'An unknown error occurred. Please check the error details and try again.';
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== Singleton ====================

export const globalErrorBoundary = new ErrorBoundary();
