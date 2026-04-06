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
export declare class RetryManager {
    static executeWithRetry<T>(operation: () => Promise<T>, options?: RetryOptions): Promise<RetryResult<T>>;
    private static calculateDelay;
    private static isRetryableError;
    private static isNonRetryableError;
    private static isNetworkError;
    private static isTimeoutError;
    private static isConfigurationError;
    private static isAuthenticationError;
    private static delay;
    static executeBatchWithRetry<T>(operations: Array<() => Promise<T>>, options?: RetryOptions): Promise<Array<RetryResult<T>>>;
    static createCircuitBreaker(options?: {
        failureThreshold?: number;
        resetTimeout?: number;
        halfOpenMaxAttempts?: number;
    }): <T>(operation: () => Promise<T>, retryOptions?: RetryOptions) => Promise<RetryResult<T>>;
    static getStats(): {
        totalOperations: number;
        successfulOperations: number;
        failedOperations: number;
        averageRetries: number;
        averageTime: number;
    };
}
//# sourceMappingURL=retry-manager.d.ts.map