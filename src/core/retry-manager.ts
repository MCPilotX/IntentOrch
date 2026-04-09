import { logger } from './logger';

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
}

export interface RetryResult<T> {
  success: boolean;
  result?: T;
  error?: Error;
  attempts: number;
  totalTime: number;
}

export class RetryManager {
  static async executeWithRetry<T>(
    operation: () => Promise<T>,
    options: RetryOptions = {},
  ): Promise<RetryResult<T>> {
    const {
      maxRetries = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      jitter = true,
      retryableErrors = [],
      nonRetryableErrors = [],
    } = options;

    let lastError: Error | undefined;
    const startTime = Date.now();
    let actualAttempts = 0;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      actualAttempts++;
      try {
        if (attempt > 0) {
          const delay = this.calculateDelay(attempt, initialDelay, maxDelay, backoffFactor, jitter);
          logger.info(`Retry attempt ${attempt}/${maxRetries} after ${delay}ms delay`);
          await this.delay(delay);
        }

        const result = await operation();

        if (attempt > 0) {
          logger.info(`Success on retry attempt ${attempt}`);
        }

        return {
          success: true,
          result,
          attempts: actualAttempts,
          totalTime: Date.now() - startTime,
        };

      } catch (error: any) {
        // Ensure error is an Error object
        const errorObj = error instanceof Error ? error : new Error(String(error));
        lastError = errorObj;

        // Check if it's a non-retryable error
        if (this.isNonRetryableError(errorObj, nonRetryableErrors)) {
          logger.warn(`Non-retryable error encountered: ${errorObj.message}`);
          break;
        }

        // Check if it's a retryable error
        const shouldRetry = attempt < maxRetries &&
          (retryableErrors.length === 0 || this.isRetryableError(errorObj, retryableErrors));

        logger.warn(`Attempt ${attempt + 1} failed: ${errorObj.message}`);

        if (shouldRetry) {
          const nextDelay = this.calculateDelay(attempt + 1, initialDelay, maxDelay, backoffFactor, jitter);
          logger.info(`Will retry in ${nextDelay}ms`);
        } else {
          break;
        }
      }
    }

    return {
      success: false,
      error: lastError || new Error('Operation failed'),
      attempts: actualAttempts,
      totalTime: Date.now() - startTime,
    };
  }

  private static calculateDelay(
    attempt: number,
    initialDelay: number,
    maxDelay: number,
    backoffFactor: number,
    jitter: boolean,
  ): number {
    // Exponential backoff
    let delay = initialDelay * Math.pow(backoffFactor, attempt - 1);

    // Add jitter (randomness)
    if (jitter) {
      const jitterAmount = delay * 0.1; // 10% jitter
      delay += Math.random() * jitterAmount * 2 - jitterAmount;
    }

    // Limit maximum delay
    return Math.min(delay, maxDelay);
  }

  private static isRetryableError(error: Error, retryableErrors: string[]): boolean {
    if (retryableErrors.length === 0) {
      // Default retry network errors and timeout errors
      return this.isNetworkError(error) || this.isTimeoutError(error);
    }

    const errorMessage = error.message.toLowerCase();
    return retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()));
  }

  private static isNonRetryableError(error: Error, nonRetryableErrors: string[]): boolean {
    if (nonRetryableErrors.length === 0) {
      // Default don't retry configuration errors and authentication errors
      return this.isConfigurationError(error) || this.isAuthenticationError(error);
    }

    const errorMessage = error.message.toLowerCase();
    return nonRetryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()));
  }

  private static isNetworkError(error: Error): boolean {
    const networkKeywords = [
      'network', 'connection', 'socket', 'timeout', 'econnrefused',
      'econnreset', 'eaddrinuse', 'eaddrinfo', 'enetunreach',
      'fetch failed', 'request failed', 'aborted',
    ];

    const errorMessage = error.message.toLowerCase();
    return networkKeywords.some(keyword => errorMessage.includes(keyword));
  }

  private static isTimeoutError(error: Error): boolean {
    const timeoutKeywords = ['timeout', 'timed out', 'aborted'];
    const errorMessage = error.message.toLowerCase();
    return timeoutKeywords.some(keyword => errorMessage.includes(keyword));
  }

  private static isConfigurationError(error: Error): boolean {
    const configKeywords = [
      'configuration', 'config', 'invalid', 'missing', 'required',
      'not found', 'undefined', 'null', 'api key', 'endpoint',
    ];

    const errorMessage = error.message.toLowerCase();
    return configKeywords.some(keyword => errorMessage.includes(keyword));
  }

  private static isAuthenticationError(error: Error): boolean {
    const authKeywords = [
      'authentication', 'authorization', 'unauthorized', 'forbidden',
      'invalid token', 'api key', 'credentials', '401', '403',
    ];

    const errorMessage = error.message.toLowerCase();
    return authKeywords.some(keyword => errorMessage.includes(keyword));
  }

  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Batch operation retry
  static async executeBatchWithRetry<T>(
    operations: Array<() => Promise<T>>,
    options: RetryOptions = {},
  ): Promise<Array<RetryResult<T>>> {
    const results: Array<RetryResult<T>> = [];

    for (let i = 0; i < operations.length; i++) {
      logger.debug(`Executing batch operation ${i + 1}/${operations.length}`);
      const result = await this.executeWithRetry(operations[i], options);
      results.push(result);

      // If operation fails, can choose to continue or stop
      if (!result.success && options.nonRetryableErrors?.some(pattern =>
        result.error?.message.toLowerCase().includes(pattern.toLowerCase()),
      )) {
        logger.warn(`Stopping batch execution due to non-retryable error in operation ${i + 1}`);
        break;
      }
    }

    return results;
  }

  // Retry with circuit breaker
  static createCircuitBreaker(options: {
    failureThreshold?: number;
    resetTimeout?: number;
    halfOpenMaxAttempts?: number;
  } = {}) {
    const {
      failureThreshold = 5,
      resetTimeout = 60000, // 60seconds
      halfOpenMaxAttempts = 3,
    } = options;

    let state: 'closed' | 'open' | 'half-open' = 'closed';
    let failureCount = 0;
    let lastFailureTime = 0;
    let halfOpenAttempts = 0;

    return async function withCircuitBreaker<T>(
      operation: () => Promise<T>,
      retryOptions?: RetryOptions,
    ): Promise<RetryResult<T>> {
      const now = Date.now();

      // Check circuit breaker state
      if (state === 'open') {
        if (now - lastFailureTime > resetTimeout) {
          // Enter half-open state
          state = 'half-open';
          halfOpenAttempts = 0;
          logger.info('Circuit breaker transitioning to half-open state');
        } else {
          throw new Error('Circuit breaker is open - service unavailable');
        }
      }

      if (state === 'half-open') {
        halfOpenAttempts++;
        if (halfOpenAttempts > halfOpenMaxAttempts) {
          // Too many attempts in half-open state, reopen
          state = 'open';
          lastFailureTime = now;
          throw new Error('Circuit breaker re-opened - service still unavailable');
        }
      }

      try {
        const result = await RetryManager.executeWithRetry(operation, retryOptions);

        if (result.success) {
          // Operation successful, reset circuit breaker
          if (state === 'half-open') {
            logger.info('Circuit breaker transitioning to closed state');
          }
          state = 'closed';
          failureCount = 0;
          halfOpenAttempts = 0;
        } else {
          // Operation failed
          failureCount++;

          if (state === 'half-open') {
            // Check if we've exceeded half-open max attempts
            if (halfOpenAttempts >= halfOpenMaxAttempts) {
              state = 'open';
              lastFailureTime = now;
              logger.error('Circuit breaker re-opened - service still unavailable');
              throw new Error('Circuit breaker re-opened - service still unavailable');
            }
          } else if (failureCount >= failureThreshold && state === 'closed') {
            // Only set lastFailureTime when circuit first opens
            state = 'open';
            lastFailureTime = now;
            logger.error(`Circuit breaker opened after ${failureCount} failures`);
          }
        }

        return result;
      } catch (error: any) {
        // Update failure count
        failureCount++;

        if (state === 'half-open') {
          // Check if we've exceeded half-open max attempts
          if (halfOpenAttempts >= halfOpenMaxAttempts) {
            state = 'open';
            lastFailureTime = now;
            logger.error('Circuit breaker re-opened - service still unavailable');
            throw new Error('Circuit breaker re-opened - service still unavailable');
          }
        } else if (failureCount >= failureThreshold && state === 'closed') {
          // Only set lastFailureTime when circuit first opens
          state = 'open';
          lastFailureTime = now;
          logger.error(`Circuit breaker opened after ${failureCount} failures`);
        }

        throw error;
      }
    };
  }

  // Monitoring and reporting
  static getStats(): {
    totalOperations: number;
    successfulOperations: number;
    failedOperations: number;
    averageRetries: number;
    averageTime: number;
    } {
    // Here you can add actual statistical tracking
    return {
      totalOperations: 0,
      successfulOperations: 0,
      failedOperations: 0,
      averageRetries: 0,
      averageTime: 0,
    };
  }
}
