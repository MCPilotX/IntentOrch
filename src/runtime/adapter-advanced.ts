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
  uptime?: number; // milliseconds
  memory?: number; // bytes
  cpu?: number; // percentage
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
  score: number; // 0-100
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
  // ==================== Core Functionality (Must Implement) ====================
  
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
  
  // ==================== Optional Functionality (Implement as Needed) ====================
  
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
  
  // ==================== Lifecycle Hooks (Optional) ====================
  
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
export class RuntimeAdapterError extends Error {
  constructor(
    public code: string,
    override message: string,
    public context?: Record<string, any>,
    public override cause?: Error
  ) {
    super(message);
    this.name = 'RuntimeAdapterError';
  }
}

/**
 * Error Code Enumeration
 */
export enum RuntimeErrorCode {
  // Configuration errors
  CONFIG_INVALID = 'CONFIG_INVALID',
  CONFIG_MISSING = 'CONFIG_MISSING',
  
  // Process errors
  PROCESS_START_FAILED = 'PROCESS_START_FAILED',
  PROCESS_STOP_FAILED = 'PROCESS_STOP_FAILED',
  PROCESS_NOT_FOUND = 'PROCESS_NOT_FOUND',
  
  // Runtime errors
  RUNTIME_NOT_SUPPORTED = 'RUNTIME_NOT_SUPPORTED',
  RUNTIME_NOT_INSTALLED = 'RUNTIME_NOT_INSTALLED',
  
  // Resource errors
  RESOURCE_LIMIT_EXCEEDED = 'RESOURCE_LIMIT_EXCEEDED',
  PERMISSION_DENIED = 'PERMISSION_DENIED',
  
  // Network errors
  NETWORK_ERROR = 'NETWORK_ERROR',
  CONNECTION_REFUSED = 'CONNECTION_REFUSED',
  
  // Timeout errors
  TIMEOUT = 'TIMEOUT',
  
  // Unknown errors
  UNKNOWN = 'UNKNOWN',
}

/**
 * Adapter Registry
 */
export class RuntimeAdapterRegistry {
  private static factories = new Map<string, RuntimeAdapterFactory>();
  
  /**
   * Register adapter factory
   */
  static register(runtimeType: string, factory: RuntimeAdapterFactory): void {
    this.factories.set(runtimeType, factory);
  }
  
  /**
   * Get adapter factory
   */
  static getFactory(runtimeType: string): RuntimeAdapterFactory | undefined {
    return this.factories.get(runtimeType);
  }
  
  /**
   * Create adapter instance
   */
  static createAdapter(runtimeType: string, config: ServiceConfig): EnhancedRuntimeAdapter {
    const factory = this.getFactory(runtimeType);
    if (!factory) {
      throw new RuntimeAdapterError(
        RuntimeErrorCode.RUNTIME_NOT_SUPPORTED,
        `Runtime type '${runtimeType}' is not supported`,
        { runtimeType, supportedRuntimes: Array.from(this.factories.keys()) }
      );
    }
    
    return factory.create(config);
  }
  
  /**
   * Get all supported runtime types
   */
  static getSupportedRuntimes(): string[] {
    return Array.from(this.factories.keys());
  }
}

/**
 * Base Adapter Abstract Class
 * Provides default implementations and utility methods
 */
export abstract class BaseRuntimeAdapter implements EnhancedRuntimeAdapter {
  protected processMap = new Map<string, ProcessInfo>();
  
  // Core methods that must be implemented
  abstract start(config: ServiceConfig): Promise<ProcessInfo>;
  abstract stop(processId: string): Promise<void>;
  abstract status(processId: string): Promise<ProcessStatus>;
  
  // Default implementations for optional methods
  async healthCheck(config: ServiceConfig): Promise<HealthStatus> {
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
  
  async *logs(processId: string, options?: LogOptions): AsyncIterable<string> {
    // Default implementation: Return empty log stream
    // Specific adapters should override this method
    yield `Logs not available for process ${processId}`;
  }
  
  async restart(processId: string): Promise<ProcessInfo> {
    // Default implementation: Stop then start
    const processInfo = this.processMap.get(processId);
    if (!processInfo) {
      throw new RuntimeAdapterError(
        RuntimeErrorCode.PROCESS_NOT_FOUND,
        `Process ${processId} not found`
      );
    }
    
    await this.stop(processId);
    return this.start(processInfo.config);
  }
  
  // Utility methods
  protected generateProcessId(config: ServiceConfig): string {
    return `${config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
  
  protected validateConfig(config: ServiceConfig): void {
    if (!config.name || !config.name.trim()) {
      throw new RuntimeAdapterError(
        RuntimeErrorCode.CONFIG_INVALID,
        'Service name is required',
        { config }
      );
    }
    
    if (!config.path || !config.path.trim()) {
      throw new RuntimeAdapterError(
        RuntimeErrorCode.CONFIG_INVALID,
        'Service path is required',
        { config }
      );
    }
  }
  
  // Default implementations for lifecycle hooks
  async onStart(config: ServiceConfig): Promise<void> {
    // Default no-op
  }
  
  async onStarted(processInfo: ProcessInfo): Promise<void> {
    // Default no-op
  }
  
  async onStop(processId: string): Promise<void> {
    // Default no-op
  }
  
  async onStopped(processId: string): Promise<void> {
    // Default no-op
  }
  
  async onError(error: Error, context: any): Promise<void> {
    console.error(`Runtime adapter error:`, error, context);
  }
}