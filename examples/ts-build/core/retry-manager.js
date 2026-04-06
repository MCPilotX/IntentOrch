import { logger } from './logger';
export class RetryManager {
    static async executeWithRetry(operation, options = {}) {
        const { maxRetries = 3, initialDelay = 1000, maxDelay = 30000, backoffFactor = 2, jitter = true, retryableErrors = [], nonRetryableErrors = [], } = options;
        let lastError;
        const startTime = Date.now();
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
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
                    attempts: attempt + 1,
                    totalTime: Date.now() - startTime,
                };
            }
            catch (error) {
                lastError = error;
                // Check if it's a non-retryable error
                if (this.isNonRetryableError(error, nonRetryableErrors)) {
                    logger.warn(`Non-retryable error encountered: ${error.message}`);
                    break;
                }
                // Check if it's a retryable error
                const shouldRetry = attempt < maxRetries &&
                    (retryableErrors.length === 0 || this.isRetryableError(error, retryableErrors));
                logger.warn(`Attempt ${attempt + 1} failed: ${error.message}`);
                if (shouldRetry) {
                    const nextDelay = this.calculateDelay(attempt + 1, initialDelay, maxDelay, backoffFactor, jitter);
                    logger.info(`Will retry in ${nextDelay}ms`);
                }
                else {
                    break;
                }
            }
        }
        return {
            success: false,
            error: lastError || new Error('Operation failed'),
            attempts: maxRetries + 1,
            totalTime: Date.now() - startTime,
        };
    }
    static calculateDelay(attempt, initialDelay, maxDelay, backoffFactor, jitter) {
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
    static isRetryableError(error, retryableErrors) {
        if (retryableErrors.length === 0) {
            // Default retry network errors and timeout errors
            return this.isNetworkError(error) || this.isTimeoutError(error);
        }
        const errorMessage = error.message.toLowerCase();
        return retryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()));
    }
    static isNonRetryableError(error, nonRetryableErrors) {
        if (nonRetryableErrors.length === 0) {
            // Default don't retry configuration errors and authentication errors
            return this.isConfigurationError(error) || this.isAuthenticationError(error);
        }
        const errorMessage = error.message.toLowerCase();
        return nonRetryableErrors.some(pattern => errorMessage.includes(pattern.toLowerCase()));
    }
    static isNetworkError(error) {
        const networkKeywords = [
            'network', 'connection', 'socket', 'timeout', 'econnrefused',
            'econnreset', 'eaddrinuse', 'eaddrinfo', 'enetunreach',
            'fetch failed', 'request failed', 'aborted',
        ];
        const errorMessage = error.message.toLowerCase();
        return networkKeywords.some(keyword => errorMessage.includes(keyword));
    }
    static isTimeoutError(error) {
        const timeoutKeywords = ['timeout', 'timed out', 'aborted'];
        const errorMessage = error.message.toLowerCase();
        return timeoutKeywords.some(keyword => errorMessage.includes(keyword));
    }
    static isConfigurationError(error) {
        const configKeywords = [
            'configuration', 'config', 'invalid', 'missing', 'required',
            'not found', 'undefined', 'null', 'api key', 'endpoint',
        ];
        const errorMessage = error.message.toLowerCase();
        return configKeywords.some(keyword => errorMessage.includes(keyword));
    }
    static isAuthenticationError(error) {
        const authKeywords = [
            'authentication', 'authorization', 'unauthorized', 'forbidden',
            'invalid token', 'api key', 'credentials', '401', '403',
        ];
        const errorMessage = error.message.toLowerCase();
        return authKeywords.some(keyword => errorMessage.includes(keyword));
    }
    static delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    // Batch operation retry
    static async executeBatchWithRetry(operations, options = {}) {
        const results = [];
        for (let i = 0; i < operations.length; i++) {
            logger.debug(`Executing batch operation ${i + 1}/${operations.length}`);
            const result = await this.executeWithRetry(operations[i], options);
            results.push(result);
            // If operation fails, can choose to continue or stop
            if (!result.success && options.nonRetryableErrors?.some(pattern => result.error?.message.toLowerCase().includes(pattern.toLowerCase()))) {
                logger.warn(`Stopping batch execution due to non-retryable error in operation ${i + 1}`);
                break;
            }
        }
        return results;
    }
    // Retry with circuit breaker
    static createCircuitBreaker(options = {}) {
        const { failureThreshold = 5, resetTimeout = 60000, // 60seconds
        halfOpenMaxAttempts = 3, } = options;
        let state = 'closed';
        let failureCount = 0;
        let lastFailureTime = 0;
        let halfOpenAttempts = 0;
        return async function withCircuitBreaker(operation, retryOptions) {
            const now = Date.now();
            // Check circuit breaker state
            if (state === 'open') {
                if (now - lastFailureTime > resetTimeout) {
                    // Enter half-open state
                    state = 'half-open';
                    halfOpenAttempts = 0;
                    logger.info('Circuit breaker transitioning to half-open state');
                }
                else {
                    throw new Error('Circuit breaker is open - service unavailable');
                }
            }
            if (state === 'half-open') {
                if (halfOpenAttempts >= halfOpenMaxAttempts) {
                    // Too many attempts in half-open state, reopen
                    state = 'open';
                    lastFailureTime = now;
                    throw new Error('Circuit breaker re-opened - service still unavailable');
                }
                halfOpenAttempts++;
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
                }
                else {
                    // Operation failed, update failure count
                    failureCount++;
                    lastFailureTime = now;
                    if (failureCount >= failureThreshold) {
                        state = 'open';
                        logger.error(`Circuit breaker opened after ${failureCount} failures`);
                    }
                }
                return result;
            }
            catch (error) {
                // Update failure count
                failureCount++;
                lastFailureTime = now;
                if (failureCount >= failureThreshold) {
                    state = 'open';
                    logger.error(`Circuit breaker opened after ${failureCount} failures`);
                }
                throw error;
            }
        };
    }
    // Monitoring and reporting
    static getStats() {
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
//# sourceMappingURL=retry-manager.js.map