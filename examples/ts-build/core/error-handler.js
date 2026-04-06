/**
 * MCPilot SDK Unified Error Handling System
 * Balances minimalist style with functional robustness
 */
/**
 * Error Code Enumeration
 * Clear categorization for easy identification and handling
 */
export var ErrorCode;
(function (ErrorCode) {
    // ==================== Configuration Errors (1xx) ====================
    ErrorCode["CONFIG_INVALID"] = "CONFIG_001";
    ErrorCode["CONFIG_MISSING"] = "CONFIG_002";
    ErrorCode["CONFIG_VALIDATION_FAILED"] = "CONFIG_003";
    ErrorCode["CONFIG_MIGRATION_FAILED"] = "CONFIG_004";
    // ==================== Service Errors (2xx) ====================
    ErrorCode["SERVICE_NOT_FOUND"] = "SERVICE_001";
    ErrorCode["SERVICE_ALREADY_EXISTS"] = "SERVICE_002";
    ErrorCode["SERVICE_START_FAILED"] = "SERVICE_003";
    ErrorCode["SERVICE_STOP_FAILED"] = "SERVICE_004";
    ErrorCode["SERVICE_HEALTH_CHECK_FAILED"] = "SERVICE_005";
    // ==================== Runtime Errors (3xx) ====================
    ErrorCode["RUNTIME_DETECTION_FAILED"] = "RUNTIME_001";
    ErrorCode["RUNTIME_NOT_SUPPORTED"] = "RUNTIME_002";
    ErrorCode["RUNTIME_NOT_INSTALLED"] = "RUNTIME_003";
    ErrorCode["RUNTIME_ADAPTER_ERROR"] = "RUNTIME_004";
    // ==================== Process Errors (4xx) ====================
    ErrorCode["PROCESS_NOT_FOUND"] = "PROCESS_001";
    ErrorCode["PROCESS_START_FAILED"] = "PROCESS_002";
    ErrorCode["PROCESS_STOP_FAILED"] = "PROCESS_003";
    ErrorCode["PROCESS_TIMEOUT"] = "PROCESS_004";
    // ==================== Resource Errors (5xx) ====================
    ErrorCode["RESOURCE_LIMIT_EXCEEDED"] = "RESOURCE_001";
    ErrorCode["MEMORY_LIMIT_EXCEEDED"] = "RESOURCE_002";
    ErrorCode["CPU_LIMIT_EXCEEDED"] = "RESOURCE_003";
    ErrorCode["DISK_SPACE_INSUFFICIENT"] = "RESOURCE_004";
    // ==================== Permission Errors (6xx) ====================
    ErrorCode["PERMISSION_DENIED"] = "PERMISSION_001";
    ErrorCode["FILE_PERMISSION_ERROR"] = "PERMISSION_002";
    ErrorCode["NETWORK_PERMISSION_ERROR"] = "PERMISSION_003";
    // ==================== Network Errors (7xx) ====================
    ErrorCode["NETWORK_ERROR"] = "NETWORK_001";
    ErrorCode["CONNECTION_REFUSED"] = "NETWORK_002";
    ErrorCode["CONNECTION_TIMEOUT"] = "NETWORK_003";
    ErrorCode["DNS_RESOLUTION_FAILED"] = "NETWORK_004";
    // ==================== AI Errors (8xx) ====================
    ErrorCode["AI_CONFIG_INVALID"] = "AI_001";
    ErrorCode["AI_PROVIDER_NOT_AVAILABLE"] = "AI_002";
    ErrorCode["AI_QUERY_FAILED"] = "AI_003";
    ErrorCode["AI_MODEL_NOT_FOUND"] = "AI_004";
    // ==================== System Errors (9xx) ====================
    ErrorCode["SYSTEM_ERROR"] = "SYSTEM_001";
    ErrorCode["UNEXPECTED_ERROR"] = "SYSTEM_002";
    ErrorCode["NOT_IMPLEMENTED"] = "SYSTEM_003";
    // ==================== Validation Errors (10xx) ====================
    ErrorCode["VALIDATION_FAILED"] = "VALIDATION_001";
    ErrorCode["REQUIRED_FIELD_MISSING"] = "VALIDATION_002";
    ErrorCode["INVALID_FORMAT"] = "VALIDATION_003";
    ErrorCode["OUT_OF_RANGE"] = "VALIDATION_004";
})(ErrorCode || (ErrorCode = {}));
/**
 * Error Severity Levels
 */
export var ErrorSeverity;
(function (ErrorSeverity) {
    ErrorSeverity["LOW"] = "low";
    ErrorSeverity["MEDIUM"] = "medium";
    ErrorSeverity["HIGH"] = "high";
    ErrorSeverity["CRITICAL"] = "critical";
})(ErrorSeverity || (ErrorSeverity = {}));
/**
 * MCPilot Unified Error Class
 */
export class MCPilotError extends Error {
    code;
    message;
    severity;
    context;
    suggestions;
    cause;
    constructor(code, message, severity = ErrorSeverity.MEDIUM, context = {}, suggestions = [], cause) {
        super(message);
        this.code = code;
        this.message = message;
        this.severity = severity;
        this.context = context;
        this.suggestions = suggestions;
        this.cause = cause;
        this.name = 'MCPilotError';
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
    toJSON() {
        return {
            name: this.name,
            code: this.code,
            message: this.message,
            severity: this.severity,
            context: this.context,
            suggestions: this.suggestions,
            stack: this.stack,
            cause: this.cause ? (this.cause instanceof MCPilotError ? this.cause.toJSON() : {
                name: this.cause.name,
                message: this.cause.message,
                stack: this.cause.stack,
            }) : undefined,
        };
    }
    /**
     * Get error summary for display
     */
    getSummary() {
        return `[${this.code}] ${this.message}`;
    }
    /**
     * Get detailed error information
     */
    getDetails() {
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
 * Error Factory - Create standardized error instances
 */
export class ErrorFactory {
    /**
     * Configuration error
     */
    static configInvalid(message, context = {}, cause) {
        return new MCPilotError(ErrorCode.CONFIG_INVALID, message, ErrorSeverity.HIGH, context, [
            {
                title: 'Check configuration file',
                description: 'Please check if the configuration file format and content are correct',
                steps: [
                    'Verify configuration file path is correct',
                    'Check if JSON format is correct',
                    'Confirm all required fields are filled',
                    'Refer to configuration examples in documentation',
                ],
                documentationUrl: 'https://github.com/MCPilotX/mcpilot/docs/configuration',
            },
        ], cause);
    }
    /**
     * Service not found error
     */
    static serviceNotFound(serviceName, context = {}) {
        return new MCPilotError(ErrorCode.SERVICE_NOT_FOUND, `Service '${serviceName}' not found`, ErrorSeverity.MEDIUM, { ...context, serviceName }, [
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
        ]);
    }
    /**
     * Runtime detection failed error
     */
    static runtimeDetectionFailed(path, context = {}, cause) {
        return new MCPilotError(ErrorCode.RUNTIME_DETECTION_FAILED, `Failed to detect runtime for path: ${path}`, ErrorSeverity.MEDIUM, { ...context, path }, [
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
        ], cause);
    }
    /**
     * Process start failed error
     */
    static processStartFailed(serviceName, context = {}, cause) {
        return new MCPilotError(ErrorCode.PROCESS_START_FAILED, `Failed to start process for service '${serviceName}'`, ErrorSeverity.HIGH, { ...context, serviceName }, [
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
        ], cause);
    }
    /**
     * Permission denied error
     */
    static permissionDenied(operation, resource, context = {}) {
        return new MCPilotError(ErrorCode.PERMISSION_DENIED, `Permission denied for ${operation} on ${resource}`, ErrorSeverity.HIGH, { ...context, operation, resource }, [
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
        ]);
    }
    /**
     * Network error
     */
    static networkError(operation, url, context = {}, cause) {
        return new MCPilotError(ErrorCode.NETWORK_ERROR, `Network error during ${operation} to ${url}`, ErrorSeverity.MEDIUM, { ...context, operation, url }, [
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
        ], cause);
    }
    /**
     * Not implemented error
     */
    static notImplemented(feature, context = {}) {
        return new MCPilotError(ErrorCode.NOT_IMPLEMENTED, `Feature '${feature}' is not implemented yet`, ErrorSeverity.LOW, { ...context, feature }, [
            {
                title: 'Feature under development',
                description: 'This feature is under development and will be available in future versions',
                steps: [
                    'View project roadmap',
                    'Follow GitHub release page',
                    'Consider using alternative solutions',
                    'Submit feature request (if urgently needed)',
                ],
                documentationUrl: 'https://github.com/MCPilotX/mcpilot/issues',
            },
        ]);
    }
    /**
     * Validation error
     */
    static validationFailed(field, reason, context = {}) {
        return new MCPilotError(ErrorCode.VALIDATION_FAILED, `Validation failed for field '${field}': ${reason}`, ErrorSeverity.MEDIUM, { ...context, field, reason }, [
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
        ]);
    }
}
/**
 * Error Handler - Handle, log and recover from errors
 */
export class ErrorHandler {
    static instance;
    handlers = [];
    constructor() { }
    static getInstance() {
        if (!ErrorHandler.instance) {
            ErrorHandler.instance = new ErrorHandler();
        }
        return ErrorHandler.instance;
    }
    /**
     * Register error handler
     */
    registerHandler(handler) {
        this.handlers.push(handler);
    }
    /**
     * Handle error
     */
    async handle(error) {
        // Convert to MCPilotError (if not already)
        const mcError = error instanceof MCPilotError
            ? error
            : new MCPilotError(ErrorCode.UNEXPECTED_ERROR, error.message, ErrorSeverity.HIGH, {}, [], error);
        // Log error
        console.error(`[MCPilot Error] ${mcError.getSummary()}`);
        // Execute all registered handlers
        for (const handler of this.handlers) {
            try {
                await handler(mcError);
            }
            catch (handlerError) {
                console.error('Error handler failed:', handlerError);
            }
        }
    }
    /**
     * Safely execute function, automatically handle errors
     */
    async execute(operation, fn, context = {}) {
        try {
            return await fn();
        }
        catch (error) {
            const mcError = error instanceof MCPilotError
                ? error
                : new MCPilotError(ErrorCode.UNEXPECTED_ERROR, `Operation '${operation}' failed: ${error instanceof Error ? error.message : String(error)}`, ErrorSeverity.HIGH, { ...context, operation }, [], error instanceof Error ? error : undefined);
            await this.handle(mcError);
            throw mcError;
        }
    }
}
/**
 * Default Error Handler - Console Output
 */
export class ConsoleErrorHandler {
    static async handle(error) {
        const colors = {
            low: '\x1b[36m', // cyan
            medium: '\x1b[33m', // yellow
            high: '\x1b[31m', // red
            critical: '\x1b[41m\x1b[37m', // red background, white text
        };
        const color = colors[error.severity] || '\x1b[0m';
        const reset = '\x1b[0m';
        console.error(`\n${color}╔══════════════════════════════════════════════════════════════╗${reset}`);
        console.error(`${color}║ MCPilot Error: ${error.getSummary().padEnd(50)} ║${reset}`);
        console.error(`${color}╚══════════════════════════════════════════════════════════════╝${reset}`);
        console.error(`\n${color}Details:${reset}`);
        console.error(error.getDetails());
        if (error.suggestions.length > 0) {
            console.error(`\n${color}Suggestions:${reset}`);
            error.suggestions.forEach((suggestion, index) => {
                console.error(`  ${index + 1}. ${suggestion.title}`);
                console.error(`     ${suggestion.description}`);
                if (suggestion.steps.length > 0) {
                    console.error('     Steps:');
                    suggestion.steps.forEach(step => {
                        console.error(`       • ${step}`);
                    });
                }
            });
        }
        console.error(`\n${color}Need more help?${reset}`);
        console.error('  • Check documentation: https://github.com/MCPilotX/mcpilot/docs');
        console.error('  • Report issue: https://github.com/MCPilotX/mcpilot/issues');
        console.error('  • Ask community: https://github.com/MCPilotX/mcpilot/discussions\n');
    }
}
/**
 * Error Handler with Retry
 */
export class RetryErrorHandler {
    static async withRetry(operation, fn, strategy = {
        maxAttempts: 3,
        backoff: 'exponential',
        baseDelay: 1000,
        maxDelay: 10000,
    }, context = {}) {
        let lastError;
        for (let attempt = 1; attempt <= strategy.maxAttempts; attempt++) {
            try {
                return await fn();
            }
            catch (error) {
                lastError = error instanceof Error ? error : new Error(String(error));
                // If this is the last attempt, throw error directly
                if (attempt === strategy.maxAttempts) {
                    throw error;
                }
                // Calculate delay time
                let delay = strategy.baseDelay;
                if (strategy.backoff === 'exponential') {
                    delay = strategy.baseDelay * Math.pow(2, attempt - 1);
                }
                else if (strategy.backoff === 'linear') {
                    delay = strategy.baseDelay * attempt;
                }
                // Apply maximum delay limit
                if (strategy.maxDelay && delay > strategy.maxDelay) {
                    delay = strategy.maxDelay;
                }
                console.warn(`[Retry] Attempt ${attempt}/${strategy.maxAttempts} failed for '${operation}'. Retrying in ${delay}ms...`);
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
export function createError(code, message, severity, context) {
    return new MCPilotError(code, message, severity, context);
}
export function wrapError(error, code = ErrorCode.UNEXPECTED_ERROR, context) {
    return new MCPilotError(code, error.message, ErrorSeverity.HIGH, context, [], error);
}
export function isMCPilotError(error) {
    return error instanceof MCPilotError;
}
export function shouldRetry(error) {
    if (!isMCPilotError(error)) {
        return false;
    }
    // These error types can usually be resolved by retrying
    const retryableCodes = [
        ErrorCode.NETWORK_ERROR,
        ErrorCode.CONNECTION_TIMEOUT,
        ErrorCode.CONNECTION_REFUSED,
        ErrorCode.PROCESS_START_FAILED,
        ErrorCode.SERVICE_START_FAILED,
    ];
    return retryableCodes.includes(error.code);
}
//# sourceMappingURL=error-handler.js.map