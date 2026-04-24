/**
 * Execution Feedback
 *
 * Analyzes execution errors and generates correction plans.
 * Provides feedback loop for intent parsing and tool execution.
 */

import { logger } from '../core/logger';

// ==================== Type Definitions ====================

export interface ErrorAnalysis {
  errorType: ErrorType;
  severity: 'critical' | 'error' | 'warning' | 'info';
  message: string;
  details: string;
  suggestedAction: string;
  recoverable: boolean;
}

export type ErrorType =
  | 'parameter_type_mismatch'
  | 'parameter_value_invalid'
  | 'parameter_missing'
  | 'tool_not_found'
  | 'tool_execution_failed'
  | 'authentication_error'
  | 'network_error'
  | 'timeout_error'
  | 'rate_limit_error'
  | 'permission_error'
  | 'unknown_error';

export interface CorrectionPlan {
  action: CorrectionAction;
  description: string;
  modifiedParams?: Record<string, any>;
  alternativeTool?: string;
  retryCount: number;
  maxRetries: number;
}

export type CorrectionAction =
  | 'retry_with_correction'
  | 'retry_same'
  | 'switch_tool'
  | 'ask_user'
  | 'abort';

export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: ErrorAnalysis;
  correctionPlan?: CorrectionPlan;
  executionTimeMs: number;
}

// ==================== Main Feedback Class ====================

export class ExecutionFeedback {
  private static readonly MAX_RETRIES = 3;
  private static retryCounters: Map<string, number> = new Map();

  /**
   * Analyze an execution error
   */
  static analyzeError(
    error: any,
    toolName: string,
    params: Record<string, any>,
    toolSchema?: any,
  ): ErrorAnalysis {
    const errorMessage = String(error?.message || error || 'Unknown error').toLowerCase();
    const errorStack = String(error?.stack || '');

    // Parameter type mismatch
    if (
      errorMessage.includes('type') &&
      (errorMessage.includes('expected') || errorMessage.includes('invalid type') || errorMessage.includes('type mismatch'))
    ) {
      return {
        errorType: 'parameter_type_mismatch',
        severity: 'error',
        message: `Parameter type mismatch for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Auto-convert parameter types and retry',
        recoverable: true,
      };
    }

    // Parameter value invalid
    if (
      errorMessage.includes('invalid') ||
      errorMessage.includes('not in') ||
      errorMessage.includes('enum') ||
      errorMessage.includes('out of range') ||
      errorMessage.includes('validation')
    ) {
      return {
        errorType: 'parameter_value_invalid',
        severity: 'error',
        message: `Invalid parameter value for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Correct parameter value and retry',
        recoverable: true,
      };
    }

    // Missing parameter
    if (
      errorMessage.includes('missing') ||
      errorMessage.includes('required') ||
      errorMessage.includes('not provided')
    ) {
      return {
        errorType: 'parameter_missing',
        severity: 'error',
        message: `Missing required parameter for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Provide missing parameter and retry',
        recoverable: true,
      };
    }

    // Tool not found
    if (
      errorMessage.includes('not found') ||
      errorMessage.includes('unknown tool') ||
      errorMessage.includes('no such tool')
    ) {
      return {
        errorType: 'tool_not_found',
        severity: 'critical',
        message: `Tool "${toolName}" not found`,
        details: errorMessage,
        suggestedAction: 'Select a different tool',
        recoverable: true,
      };
    }

    // Authentication error
    if (
      errorMessage.includes('auth') ||
      errorMessage.includes('unauthorized') ||
      errorMessage.includes('forbidden') ||
      errorMessage.includes('api key') ||
      errorMessage.includes('token')
    ) {
      return {
        errorType: 'authentication_error',
        severity: 'critical',
        message: `Authentication failed for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Check credentials and retry',
        recoverable: false,
      };
    }

    // Network error
    if (
      errorMessage.includes('network') ||
      errorMessage.includes('connection') ||
      errorMessage.includes('econnrefused') ||
      errorMessage.includes('enotfound') ||
      errorMessage.includes('socket')
    ) {
      return {
        errorType: 'network_error',
        severity: 'error',
        message: `Network error while calling tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Retry after checking network connectivity',
        recoverable: true,
      };
    }

    // Timeout error
    if (
      errorMessage.includes('timeout') ||
      errorMessage.includes('timed out') ||
      errorMessage.includes('time out')
    ) {
      return {
        errorType: 'timeout_error',
        severity: 'warning',
        message: `Tool "${toolName}" timed out`,
        details: errorMessage,
        suggestedAction: 'Retry with longer timeout',
        recoverable: true,
      };
    }

    // Rate limit error
    if (
      errorMessage.includes('rate limit') ||
      errorMessage.includes('too many requests') ||
      errorMessage.includes('throttl')
    ) {
      return {
        errorType: 'rate_limit_error',
        severity: 'warning',
        message: `Rate limit exceeded for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Wait and retry',
        recoverable: true,
      };
    }

    // Permission error
    if (
      errorMessage.includes('permission') ||
      errorMessage.includes('access denied') ||
      errorMessage.includes('not allowed')
    ) {
      return {
        errorType: 'permission_error',
        severity: 'critical',
        message: `Permission denied for tool "${toolName}"`,
        details: errorMessage,
        suggestedAction: 'Check permissions and retry',
        recoverable: false,
      };
    }

    // Default: unknown error
    return {
      errorType: 'unknown_error',
      severity: 'error',
      message: `Unknown error executing tool "${toolName}"`,
      details: errorMessage,
      suggestedAction: 'Check logs for details',
      recoverable: false,
    };
  }

  /**
   * Generate a correction plan based on error analysis
   */
  static generateCorrection(
    analysis: ErrorAnalysis,
    originalParams: Record<string, any>,
    toolName: string,
    toolSchema?: any,
  ): CorrectionPlan {
    const retryKey = `${toolName}_${Date.now()}`;
    const retryCount = ExecutionFeedback.retryCounters.get(retryKey) || 0;

    // Check max retries
    if (retryCount >= ExecutionFeedback.MAX_RETRIES) {
      return {
        action: 'ask_user',
        description: `Maximum retries (${ExecutionFeedback.MAX_RETRIES}) reached for tool "${toolName}"`,
        retryCount,
        maxRetries: ExecutionFeedback.MAX_RETRIES,
      };
    }

    switch (analysis.errorType) {
      case 'parameter_type_mismatch': {
        const corrected = ExecutionFeedback.correctParameterTypes(originalParams, toolSchema);
        return {
          action: 'retry_with_correction',
          description: `Correcting parameter types and retrying tool "${toolName}"`,
          modifiedParams: corrected,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };
      }

      case 'parameter_value_invalid': {
        const corrected = ExecutionFeedback.correctParameterValues(originalParams, toolSchema);
        return {
          action: 'retry_with_correction',
          description: `Correcting parameter values and retrying tool "${toolName}"`,
          modifiedParams: corrected,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };
      }

      case 'parameter_missing': {
        const corrected = ExecutionFeedback.fillMissingParameters(originalParams, toolSchema);
        return {
          action: 'retry_with_correction',
          description: `Filling missing parameters and retrying tool "${toolName}"`,
          modifiedParams: corrected,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };
      }

      case 'tool_not_found':
        return {
          action: 'switch_tool',
          description: `Tool "${toolName}" not found, attempting to find alternative`,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };

      case 'network_error':
      case 'timeout_error':
        return {
          action: 'retry_same',
          description: `Retrying tool "${toolName}" (attempt ${retryCount + 1}/${ExecutionFeedback.MAX_RETRIES})`,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };

      case 'rate_limit_error':
        return {
          action: 'retry_same',
          description: `Rate limited, retrying tool "${toolName}" with backoff`,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };

      default:
        return {
          action: 'ask_user',
          description: `Unrecoverable error for tool "${toolName}": ${analysis.message}`,
          retryCount,
          maxRetries: ExecutionFeedback.MAX_RETRIES,
        };
    }
  }

  /**
   * Execute a correction plan and return the result
   */
  static async executeCorrection(
    plan: CorrectionPlan,
    executeFn: (params: Record<string, any>) => Promise<any>,
  ): Promise<ExecutionResult> {
    const startTime = Date.now();

    // Increment retry counter
    const retryKey = `exec_${Date.now()}`;
    ExecutionFeedback.retryCounters.set(
      retryKey,
      (ExecutionFeedback.retryCounters.get(retryKey) || 0) + 1,
    );

    try {
      let result;

      switch (plan.action) {
        case 'retry_with_correction':
          if (!plan.modifiedParams) {
            throw new Error('No modified parameters provided for correction');
          }
          result = await executeFn(plan.modifiedParams);
          break;

        case 'retry_same':
          // Apply backoff for rate limit errors
          if (plan.description.includes('Rate limited')) {
            await new Promise(resolve => setTimeout(resolve, 1000 * Math.pow(2, plan.retryCount)));
          }
          result = await executeFn({}); // Will use original params from closure
          break;

        default:
          throw new Error(`Cannot auto-execute correction action: ${plan.action}`);
      }

      return {
        success: true,
        data: result,
        executionTimeMs: Date.now() - startTime,
      };
    } catch (error) {
      const analysis = ExecutionFeedback.analyzeError(error, '', {});
      return {
        success: false,
        error: analysis,
        executionTimeMs: Date.now() - startTime,
      };
    } finally {
      ExecutionFeedback.retryCounters.delete(retryKey);
    }
  }

  /**
   * Record successful execution for learning
   */
  static recordSuccess(
    toolName: string,
    params: Record<string, any>,
  ): void {
    logger.info(`[ExecutionFeedback] Successful execution of "${toolName}"`);
  }

  /**
   * Record failed execution for learning
   */
  static recordFailure(
    toolName: string,
    params: Record<string, any>,
    analysis: ErrorAnalysis,
  ): void {
    logger.warn(`[ExecutionFeedback] Failed execution of "${toolName}": ${analysis.message}`);
  }

  /**
   * Correct parameter types based on schema
   */
  private static correctParameterTypes(
    params: Record<string, any>,
    schema?: any,
  ): Record<string, any> {
    const corrected = { ...params };
    const properties = schema?.properties || {};

    for (const [paramName, value] of Object.entries(params)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) continue;

      const targetType = paramSchema.type;

      if (targetType === 'number' && typeof value === 'string') {
        const parsed = Number(value);
        if (!isNaN(parsed)) {
          corrected[paramName] = parsed;
        }
      } else if (targetType === 'boolean' && typeof value === 'string') {
        const lower = value.toLowerCase();
        if (['true', '1', 'yes'].includes(lower)) {
          corrected[paramName] = true;
        } else if (['false', '0', 'no'].includes(lower)) {
          corrected[paramName] = false;
        }
      } else if (targetType === 'string' && typeof value !== 'string') {
        corrected[paramName] = String(value);
      } else if (targetType === 'array' && !Array.isArray(value)) {
        corrected[paramName] = [value];
      }
    }

    return corrected;
  }

  /**
   * Correct parameter values based on schema constraints
   */
  private static correctParameterValues(
    params: Record<string, any>,
    schema?: any,
  ): Record<string, any> {
    const corrected = { ...params };
    const properties = schema?.properties || {};

    for (const [paramName, value] of Object.entries(params)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) continue;

      // Enum correction
      if (paramSchema.enum && Array.isArray(paramSchema.enum)) {
        if (!paramSchema.enum.includes(value)) {
          // Try case-insensitive match
          const match = paramSchema.enum.find(
            (v: any) => String(v).toLowerCase() === String(value).toLowerCase(),
          );
          if (match !== undefined) {
            corrected[paramName] = match;
          }
        }
      }

      // Number range clipping
      if (typeof value === 'number') {
        if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
          corrected[paramName] = paramSchema.minimum;
        }
        if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
          corrected[paramName] = paramSchema.maximum;
        }
      }

      // String length clipping
      if (typeof value === 'string') {
        if (paramSchema.maxLength !== undefined && value.length > paramSchema.maxLength) {
          corrected[paramName] = value.substring(0, paramSchema.maxLength);
        }
      }
    }

    return corrected;
  }

  /**
   * Fill missing parameters with defaults
   */
  private static fillMissingParameters(
    params: Record<string, any>,
    schema?: any,
  ): Record<string, any> {
    const filled = { ...params };
    const properties = schema?.properties || {};
    const required = schema?.required || [];

    for (const paramName of required) {
      if (filled[paramName] === undefined || filled[paramName] === null) {
        const paramSchema = properties[paramName];
        if (paramSchema?.default !== undefined) {
          filled[paramName] = paramSchema.default;
        }
      }
    }

    return filled;
  }
}
