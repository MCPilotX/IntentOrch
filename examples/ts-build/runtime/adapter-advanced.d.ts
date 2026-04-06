/**
 * Enhanced Runtime Adapter Interface
 * Balances minimalist style with functional robustness
 */
import { ServiceConfig } from '../core/types';
/**
 * Process Information
 */
export interface ProcessInfo {
    id: string;
    pid?: number;
    status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error';
    startedAt?: Date;
    config: ServiceConfig;
}
/**
 * Process Status
 */
export interface ProcessStatus {
    running: boolean;
    pid?: number;
    uptime?: number;
    memory?: number;
    cpu?: number;
    exitCode?: number;
    error?: string;
}
/**
 * Health Status
 */
export interface HealthStatus {
    healthy: boolean;
    checks: Array<{
        name: string;
        status: 'pass' | 'fail' | 'warn';
        message?: string;
        duration?: number;
    }>;
    score: number;
}
/**
 * Log Options
 */
export interface LogOptions {
    follow?: boolean;
    tail?: number;
    since?: Date;
    until?: Date;
    filter?: (line: string) => boolean;
}
/**
 * Enhanced Runtime Adapter Interface
 * Core functionality remains simple, optional features provided through extended interface
 */
export interface EnhancedRuntimeAdapter {
    /**
     * Start service
     */
    start(config: ServiceConfig): Promise<ProcessInfo>;
    /**
     * Stop service
     */
    stop(processId: string): Promise<void>;
    /**
     * Get service status
     */
    status(processId: string): Promise<ProcessStatus>;
    /**
     * Health check (optional)
     */
    healthCheck?(config: ServiceConfig): Promise<HealthStatus>;
    /**
     * Get logs (optional)
     */
    logs?(processId: string, options?: LogOptions): AsyncIterable<string>;
    /**
     * Restart service (optional)
     */
    restart?(processId: string): Promise<ProcessInfo>;
    /**
     * Pre-start hook
     */
    onStart?(config: ServiceConfig): Promise<void>;
    /**
     * Post-start hook
     */
    onStarted?(processInfo: ProcessInfo): Promise<void>;
    /**
     * Pre-stop hook
     */
    onStop?(processId: string): Promise<void>;
    /**
     * Post-stop hook
     */
    onStopped?(processId: string): Promise<void>;
    /**
     * Error handling hook
     */
    onError?(error: Error, context: any): Promise<void>;
}
/**
 * Adapter Factory Interface
 */
export interface RuntimeAdapterFactory {
    /**
     * Create adapter instance
     */
    create(config: ServiceConfig): EnhancedRuntimeAdapter;
    /**
     * Check if runtime type is supported
     */
    supports(runtimeType: string): boolean;
}
/**
 * Unified Error Type
 */
export declare class RuntimeAdapterError extends Error {
    code: string;
    message: string;
    context?: Record<string, any>;
    cause?: Error;
    constructor(code: string, message: string, context?: Record<string, any>, cause?: Error);
}
/**
 * Error Code Enumeration
 */
export declare enum RuntimeErrorCode {
    CONFIG_INVALID = "CONFIG_INVALID",
    CONFIG_MISSING = "CONFIG_MISSING",
    PROCESS_START_FAILED = "PROCESS_START_FAILED",
    PROCESS_STOP_FAILED = "PROCESS_STOP_FAILED",
    PROCESS_NOT_FOUND = "PROCESS_NOT_FOUND",
    RUNTIME_NOT_SUPPORTED = "RUNTIME_NOT_SUPPORTED",
    RUNTIME_NOT_INSTALLED = "RUNTIME_NOT_INSTALLED",
    RESOURCE_LIMIT_EXCEEDED = "RESOURCE_LIMIT_EXCEEDED",
    PERMISSION_DENIED = "PERMISSION_DENIED",
    NETWORK_ERROR = "NETWORK_ERROR",
    CONNECTION_REFUSED = "CONNECTION_REFUSED",
    TIMEOUT = "TIMEOUT",
    UNKNOWN = "UNKNOWN"
}
/**
 * Adapter Registry
 */
export declare class RuntimeAdapterRegistry {
    private static factories;
    /**
     * Register adapter factory
     */
    static register(runtimeType: string, factory: RuntimeAdapterFactory): void;
    /**
     * Get adapter factory
     */
    static getFactory(runtimeType: string): RuntimeAdapterFactory | undefined;
    /**
     * Create adapter instance
     */
    static createAdapter(runtimeType: string, config: ServiceConfig): EnhancedRuntimeAdapter;
    /**
     * Get all supported runtime types
     */
    static getSupportedRuntimes(): string[];
}
/**
 * Base Adapter Abstract Class
 * Provides default implementations and utility methods
 */
export declare abstract class BaseRuntimeAdapter implements EnhancedRuntimeAdapter {
    protected processMap: Map<string, ProcessInfo>;
    abstract start(config: ServiceConfig): Promise<ProcessInfo>;
    abstract stop(processId: string): Promise<void>;
    abstract status(processId: string): Promise<ProcessStatus>;
    healthCheck(config: ServiceConfig): Promise<HealthStatus>;
    logs(processId: string, options?: LogOptions): AsyncIterable<string>;
    restart(processId: string): Promise<ProcessInfo>;
    protected generateProcessId(config: ServiceConfig): string;
    protected validateConfig(config: ServiceConfig): void;
    onStart(config: ServiceConfig): Promise<void>;
    onStarted(processInfo: ProcessInfo): Promise<void>;
    onStop(processId: string): Promise<void>;
    onStopped(processId: string): Promise<void>;
    onError(error: Error, context: any): Promise<void>;
}
//# sourceMappingURL=adapter-advanced.d.ts.map