/**
 * Enhanced Runtime Adapter Interface
 * Balances minimalist style with functional robustness
 */
/**
 * Unified Error Type
 */
export class RuntimeAdapterError extends Error {
    code;
    message;
    context;
    cause;
    constructor(code, message, context, cause) {
        super(message);
        this.code = code;
        this.message = message;
        this.context = context;
        this.cause = cause;
        this.name = 'RuntimeAdapterError';
    }
}
/**
 * Error Code Enumeration
 */
export var RuntimeErrorCode;
(function (RuntimeErrorCode) {
    // Configuration errors
    RuntimeErrorCode["CONFIG_INVALID"] = "CONFIG_INVALID";
    RuntimeErrorCode["CONFIG_MISSING"] = "CONFIG_MISSING";
    // Process errors
    RuntimeErrorCode["PROCESS_START_FAILED"] = "PROCESS_START_FAILED";
    RuntimeErrorCode["PROCESS_STOP_FAILED"] = "PROCESS_STOP_FAILED";
    RuntimeErrorCode["PROCESS_NOT_FOUND"] = "PROCESS_NOT_FOUND";
    // Runtime errors
    RuntimeErrorCode["RUNTIME_NOT_SUPPORTED"] = "RUNTIME_NOT_SUPPORTED";
    RuntimeErrorCode["RUNTIME_NOT_INSTALLED"] = "RUNTIME_NOT_INSTALLED";
    // Resource errors
    RuntimeErrorCode["RESOURCE_LIMIT_EXCEEDED"] = "RESOURCE_LIMIT_EXCEEDED";
    RuntimeErrorCode["PERMISSION_DENIED"] = "PERMISSION_DENIED";
    // Network errors
    RuntimeErrorCode["NETWORK_ERROR"] = "NETWORK_ERROR";
    RuntimeErrorCode["CONNECTION_REFUSED"] = "CONNECTION_REFUSED";
    // Timeout errors
    RuntimeErrorCode["TIMEOUT"] = "TIMEOUT";
    // Unknown errors
    RuntimeErrorCode["UNKNOWN"] = "UNKNOWN";
})(RuntimeErrorCode || (RuntimeErrorCode = {}));
/**
 * Adapter Registry
 */
export class RuntimeAdapterRegistry {
    static factories = new Map();
    /**
     * Register adapter factory
     */
    static register(runtimeType, factory) {
        this.factories.set(runtimeType, factory);
    }
    /**
     * Get adapter factory
     */
    static getFactory(runtimeType) {
        return this.factories.get(runtimeType);
    }
    /**
     * Create adapter instance
     */
    static createAdapter(runtimeType, config) {
        const factory = this.getFactory(runtimeType);
        if (!factory) {
            throw new RuntimeAdapterError(RuntimeErrorCode.RUNTIME_NOT_SUPPORTED, `Runtime type '${runtimeType}' is not supported`, { runtimeType, supportedRuntimes: Array.from(this.factories.keys()) });
        }
        return factory.create(config);
    }
    /**
     * Get all supported runtime types
     */
    static getSupportedRuntimes() {
        return Array.from(this.factories.keys());
    }
}
/**
 * Base Adapter Abstract Class
 * Provides default implementations and utility methods
 */
export class BaseRuntimeAdapter {
    processMap = new Map();
    // Default implementations for optional methods
    async healthCheck(config) {
        // Default health check: Check if process is running
        const processes = Array.from(this.processMap.values())
            .filter(p => p.config.name === config.name);
        if (processes.length === 0) {
            return {
                healthy: false,
                checks: [{
                        name: 'process-exists',
                        status: 'fail',
                        message: 'No running process found',
                    }],
                score: 0,
            };
        }
        const runningProcesses = processes.filter(p => p.status === 'running');
        return {
            healthy: runningProcesses.length > 0,
            checks: [{
                    name: 'process-running',
                    status: runningProcesses.length > 0 ? 'pass' : 'fail',
                    message: runningProcesses.length > 0
                        ? `${runningProcesses.length} process(es) running`
                        : 'No running processes',
                }],
            score: runningProcesses.length > 0 ? 100 : 0,
        };
    }
    async *logs(processId, options) {
        // Default implementation: Return empty log stream
        // Specific adapters should override this method
        yield `Logs not available for process ${processId}`;
    }
    async restart(processId) {
        // Default implementation: Stop then start
        const processInfo = this.processMap.get(processId);
        if (!processInfo) {
            throw new RuntimeAdapterError(RuntimeErrorCode.PROCESS_NOT_FOUND, `Process ${processId} not found`);
        }
        await this.stop(processId);
        return this.start(processInfo.config);
    }
    // Utility methods
    generateProcessId(config) {
        return `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    }
    validateConfig(config) {
        if (!config.name || !config.name.trim()) {
            throw new RuntimeAdapterError(RuntimeErrorCode.CONFIG_INVALID, 'Service name is required', { config });
        }
        if (!config.path || !config.path.trim()) {
            throw new RuntimeAdapterError(RuntimeErrorCode.CONFIG_INVALID, 'Service path is required', { config });
        }
    }
    // Default implementations for lifecycle hooks
    async onStart(config) {
        // Default no-op
    }
    async onStarted(processInfo) {
        // Default no-op
    }
    async onStop(processId) {
        // Default no-op
    }
    async onStopped(processId) {
        // Default no-op
    }
    async onError(error, context) {
        console.error('Runtime adapter error:', error, context);
    }
}
//# sourceMappingURL=adapter-advanced.js.map