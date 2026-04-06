/**
 * MCPilot SDK Unified Error Handling System
 * Balances minimalist style with functional robustness
 */
/**
 * Error Code Enumeration
 * Clear categorization for easy identification and handling
 */
export declare enum ErrorCode {
    CONFIG_INVALID = "CONFIG_001",
    CONFIG_MISSING = "CONFIG_002",
    CONFIG_VALIDATION_FAILED = "CONFIG_003",
    CONFIG_MIGRATION_FAILED = "CONFIG_004",
    SERVICE_NOT_FOUND = "SERVICE_001",
    SERVICE_ALREADY_EXISTS = "SERVICE_002",
    SERVICE_START_FAILED = "SERVICE_003",
    SERVICE_STOP_FAILED = "SERVICE_004",
    SERVICE_HEALTH_CHECK_FAILED = "SERVICE_005",
    RUNTIME_DETECTION_FAILED = "RUNTIME_001",
    RUNTIME_NOT_SUPPORTED = "RUNTIME_002",
    RUNTIME_NOT_INSTALLED = "RUNTIME_003",
    RUNTIME_ADAPTER_ERROR = "RUNTIME_004",
    PROCESS_NOT_FOUND = "PROCESS_001",
    PROCESS_START_FAILED = "PROCESS_002",
    PROCESS_STOP_FAILED = "PROCESS_003",
    PROCESS_TIMEOUT = "PROCESS_004",
    RESOURCE_LIMIT_EXCEEDED = "RESOURCE_001",
    MEMORY_LIMIT_EXCEEDED = "RESOURCE_002",
    CPU_LIMIT_EXCEEDED = "RESOURCE_003",
    DISK_SPACE_INSUFFICIENT = "RESOURCE_004",
    PERMISSION_DENIED = "PERMISSION_001",
    FILE_PERMISSION_ERROR = "PERMISSION_002",
    NETWORK_PERMISSION_ERROR = "PERMISSION_003",
    NETWORK_ERROR = "NETWORK_001",
    CONNECTION_REFUSED = "NETWORK_002",
    CONNECTION_TIMEOUT = "NETWORK_003",
    DNS_RESOLUTION_FAILED = "NETWORK_004",
    AI_CONFIG_INVALID = "AI_001",
    AI_PROVIDER_NOT_AVAILABLE = "AI_002",
    AI_QUERY_FAILED = "AI_003",
    AI_MODEL_NOT_FOUND = "AI_004",
    SYSTEM_ERROR = "SYSTEM_001",
    UNEXPECTED_ERROR = "SYSTEM_002",
    NOT_IMPLEMENTED = "SYSTEM_003",
    VALIDATION_FAILED = "VALIDATION_001",
    REQUIRED_FIELD_MISSING = "VALIDATION_002",
    INVALID_FORMAT = "VALIDATION_003",
    OUT_OF_RANGE = "VALIDATION_004"
}
/**
 * Error Severity Levels
 */
export declare enum ErrorSeverity {
    LOW = "low",// Ignorable errors, don't affect core functionality
    MEDIUM = "medium",// Errors that need attention, may affect some functionality
    HIGH = "high",// Serious errors, affect core functionality
    CRITICAL = "critical"
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
 * MCPilot Unified Error Class
 */
export declare class MCPilotError extends Error {
    code: ErrorCode;
    message: string;
    severity: ErrorSeverity;
    context: ErrorContext;
    suggestions: ErrorSuggestion[];
    cause?: Error;
    constructor(code: ErrorCode, message: string, severity?: ErrorSeverity, context?: ErrorContext, suggestions?: ErrorSuggestion[], cause?: Error);
    /**
     * Convert to JSON format for easy logging and transmission
     */
    toJSON(): object;
    /**
     * Get error summary for display
     */
    getSummary(): string;
    /**
     * Get detailed error information
     */
    getDetails(): string;
}
/**
 * Error Factory - Create standardized error instances
 */
export declare class ErrorFactory {
    /**
     * Configuration error
     */
    static configInvalid(message: string, context?: ErrorContext, cause?: Error): MCPilotError;
    /**
     * Service not found error
     */
    static serviceNotFound(serviceName: string, context?: ErrorContext): MCPilotError;
    /**
     * Runtime detection failed error
     */
    static runtimeDetectionFailed(path: string, context?: ErrorContext, cause?: Error): MCPilotError;
    /**
     * Process start failed error
     */
    static processStartFailed(serviceName: string, context?: ErrorContext, cause?: Error): MCPilotError;
    /**
     * Permission denied error
     */
    static permissionDenied(operation: string, resource: string, context?: ErrorContext): MCPilotError;
    /**
     * Network error
     */
    static networkError(operation: string, url: string, context?: ErrorContext, cause?: Error): MCPilotError;
    /**
     * Not implemented error
     */
    static notImplemented(feature: string, context?: ErrorContext): MCPilotError;
    /**
     * Validation error
     */
    static validationFailed(field: string, reason: string, context?: ErrorContext): MCPilotError;
}
/**
 * Error Handler - Handle, log and recover from errors
 */
export declare class ErrorHandler {
    private static instance;
    private handlers;
    private constructor();
    static getInstance(): ErrorHandler;
    /**
     * Register error handler
     */
    registerHandler(handler: (error: MCPilotError) => Promise<void>): void;
    /**
     * Handle error
     */
    handle(error: Error | MCPilotError): Promise<void>;
    /**
     * Safely execute function, automatically handle errors
     */
    execute<T>(operation: string, fn: () => Promise<T>, context?: ErrorContext): Promise<T>;
}
/**
 * Default Error Handler - Console Output
 */
export declare class ConsoleErrorHandler {
    static handle(error: MCPilotError): Promise<void>;
}
/**
 * Error Recovery Strategy
 */
export interface RetryStrategy {
    maxAttempts: number;
    backoff: 'linear' | 'exponential' | 'fixed';
    baseDelay: number;
    maxDelay?: number;
}
/**
 * Error Handler with Retry
 */
export declare class RetryErrorHandler {
    static withRetry<T>(operation: string, fn: () => Promise<T>, strategy?: RetryStrategy, context?: ErrorContext): Promise<T>;
}
export declare function createError(code: ErrorCode, message: string, severity?: ErrorSeverity, context?: ErrorContext): MCPilotError;
export declare function wrapError(error: Error, code?: ErrorCode, context?: ErrorContext): MCPilotError;
export declare function isMCPilotError(error: any): error is MCPilotError;
export declare function shouldRetry(error: Error): boolean;
//# sourceMappingURL=error-handler.d.ts.map