/**
 * Health Check Scheduler
 *
 * Asynchronous health monitoring system that periodically polls all connected
 * MCP servers to detect failures proactively. Runs at configurable intervals.
 *
 * Key capabilities:
 * 1. Periodic polling - Every 60s (configurable) checks all registered servers
 * 2. Graceful degradation - Marks servers as degraded on repeated failures
 * 3. Event emission - Fires events on health state changes for observability
 * 4. Non-blocking - Runs in background without blocking user requests
 */

import { EventEmitter } from 'events';
import { logger } from '../core/logger';
import { getKernelConfig } from './config';

// ==================== Type Definitions ====================

export interface HealthCheckResult {
  serverName: string;
  alive: boolean;
  latency: number;
  lastSuccess: number | null;
  lastFailure: number | null;
  consecutiveFailures: number;
  circuitState: string;
}

export interface HealthCheckConfig {
  /** Interval between health checks in ms (default: 60000) */
  interval: number;
  /** Number of consecutive failures before marking as degraded (default: 3) */
  failureThreshold: number;
  /** Whether to auto-recover servers after they come back (default: true) */
  autoRecover: boolean;
  /** Timeout for each health check ping in ms (default: 5000) */
  checkTimeout: number;
}

// ==================== Health Check Scheduler ====================

export class HealthCheckScheduler extends EventEmitter {
  private config: HealthCheckConfig;
  private timer: NodeJS.Timeout | null = null;
  private running: boolean = false;
  private serverCheckers: Map<string, ServerHealthChecker> = new Map();
  private lastResults: Map<string, HealthCheckResult> = new Map();

  constructor(config?: Partial<HealthCheckConfig>) {
    super();
    const kernelConfig = getKernelConfig();
    this.config = {
      interval: kernelConfig.healthCheck?.interval ?? 60000,
      failureThreshold: kernelConfig.healthCheck?.failureThreshold ?? 3,
      autoRecover: kernelConfig.healthCheck?.autoRecover ?? true,
      checkTimeout: kernelConfig.healthCheck?.checkTimeout ?? 5000,
      ...config,
    };
  }

  /**
   * Register a server for health monitoring
   */
  registerServer(
    serverName: string,
    healthCheckFn: () => Promise<boolean>,
  ): void {
    if (this.serverCheckers.has(serverName)) {
      logger.debug(`[HealthCheckScheduler] Server "${serverName}" already registered, updating check function`);
    }

    const checker = new ServerHealthChecker(
      serverName,
      healthCheckFn,
      this.config,
    );

    checker.on('stateChange', (result: HealthCheckResult) => {
      this.lastResults.set(serverName, result);
      this.emit('stateChange', result);
    });

    checker.on('degraded', (result: HealthCheckResult) => {
      logger.warn(`[HealthCheckScheduler] Server "${serverName}" marked as DEGRADED after ${result.consecutiveFailures} consecutive failures`);
      this.emit('degraded', result);
    });

    checker.on('recovered', (result: HealthCheckResult) => {
      logger.info(`[HealthCheckScheduler] Server "${serverName}" RECOVERED`);
      this.emit('recovered', result);
    });

    this.serverCheckers.set(serverName, checker);
    logger.debug(`[HealthCheckScheduler] Registered server: ${serverName}`);
  }

  /**
   * Unregister a server from health monitoring
   */
  unregisterServer(serverName: string): void {
    const checker = this.serverCheckers.get(serverName);
    if (checker) {
      checker.stop();
      this.serverCheckers.delete(serverName);
      this.lastResults.delete(serverName);
      logger.debug(`[HealthCheckScheduler] Unregistered server: ${serverName}`);
    }
  }

  /**
   * Start the health check scheduler
   */
  start(): void {
    if (this.running) {
      logger.debug('[HealthCheckScheduler] Already running');
      return;
    }

    this.running = true;
    logger.info(`[HealthCheckScheduler] Started with interval ${this.config.interval}ms`);

    // Run first check immediately
    this.runAllChecks();

    // Schedule periodic checks
    this.timer = setInterval(() => {
      this.runAllChecks();
    }, this.config.interval);

    // Allow the timer to not block process exit
    if (this.timer && typeof this.timer === 'object' && 'unref' in this.timer) {
      this.timer.unref();
    }
  }

  /**
   * Stop the health check scheduler
   */
  stop(): void {
    if (!this.running) return;

    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }

    // Stop all individual checkers
    for (const checker of this.serverCheckers.values()) {
      checker.stop();
    }

    logger.info('[HealthCheckScheduler] Stopped');
  }

  /**
   * Run health checks for all registered servers
   */
  async runAllChecks(): Promise<Map<string, HealthCheckResult>> {
    const results = new Map<string, HealthCheckResult>();
    const promises: Promise<void>[] = [];

    for (const [serverName, checker] of this.serverCheckers) {
      promises.push(
        checker.check().then(result => {
          results.set(serverName, result);
          this.lastResults.set(serverName, result);
        }).catch(error => {
          logger.error(`[HealthCheckScheduler] Error checking "${serverName}": ${error.message}`);
        }),
      );
    }

    await Promise.all(promises);
    return results;
  }

  /**
   * Run health check for a specific server
   */
  async checkServer(serverName: string): Promise<HealthCheckResult | null> {
    const checker = this.serverCheckers.get(serverName);
    if (!checker) {
      logger.warn(`[HealthCheckScheduler] No checker registered for "${serverName}"`);
      return null;
    }

    const result = await checker.check();
    this.lastResults.set(serverName, result);
    return result;
  }

  /**
   * Get the last health check result for a server
   */
  getLastResult(serverName: string): HealthCheckResult | undefined {
    return this.lastResults.get(serverName);
  }

  /**
   * Get all last health check results
   */
  getAllResults(): Map<string, HealthCheckResult> {
    return new Map(this.lastResults);
  }

  /**
   * Get list of degraded servers
   */
  getDegradedServers(): string[] {
    const degraded: string[] = [];
    for (const [serverName, result] of this.lastResults) {
      if (!result.alive) {
        degraded.push(serverName);
      }
    }
    return degraded;
  }

  /**
   * Get list of healthy servers
   */
  getHealthyServers(): string[] {
    const healthy: string[] = [];
    for (const [serverName, result] of this.lastResults) {
      if (result.alive) {
        healthy.push(serverName);
      }
    }
    return healthy;
  }

  /**
   * Check if scheduler is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Get registered server count
   */
  getRegisteredCount(): number {
    return this.serverCheckers.size;
  }

  /**
   * Update configuration at runtime
   */
  updateConfig(config: Partial<HealthCheckConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('[HealthCheckScheduler] Configuration updated');

    // Restart with new interval if running
    if (this.running) {
      this.stop();
      this.start();
    }
  }
}

// ==================== Server Health Checker ====================

class ServerHealthChecker extends EventEmitter {
  private serverName: string;
  private healthCheckFn: () => Promise<boolean>;
  private config: HealthCheckConfig;
  private consecutiveFailures: number = 0;
  private lastSuccess: number | null = null;
  private lastFailure: number | null = null;
  private isDegraded: boolean = false;

  constructor(
    serverName: string,
    healthCheckFn: () => Promise<boolean>,
    config: HealthCheckConfig,
  ) {
    super();
    this.serverName = serverName;
    this.healthCheckFn = healthCheckFn;
    this.config = config;
  }

  /**
   * Perform a single health check
   */
  async check(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    let alive = false;

    try {
      // Run the health check function with timeout
      alive = await this.executeWithTimeout(this.healthCheckFn(), this.config.checkTimeout);
    } catch (error) {
      alive = false;
    }

    const latency = Date.now() - startTime;

    if (alive) {
      this.consecutiveFailures = 0;
      this.lastSuccess = Date.now();

      // Auto-recover if was degraded
      if (this.isDegraded && this.config.autoRecover) {
        this.isDegraded = false;
        const result: HealthCheckResult = {
          serverName: this.serverName,
          alive: true,
          latency,
          lastSuccess: this.lastSuccess,
          lastFailure: this.lastFailure,
          consecutiveFailures: 0,
          circuitState: 'CLOSED',
        };
        this.emit('recovered', result);
        this.emit('stateChange', result);
        return result;
      }
    } else {
      this.consecutiveFailures++;
      this.lastFailure = Date.now();

      // Check if should be marked as degraded
      if (!this.isDegraded && this.consecutiveFailures >= this.config.failureThreshold) {
        this.isDegraded = true;
        const result: HealthCheckResult = {
          serverName: this.serverName,
          alive: false,
          latency,
          lastSuccess: this.lastSuccess,
          lastFailure: this.lastFailure,
          consecutiveFailures: this.consecutiveFailures,
          circuitState: 'OPEN',
        };
        this.emit('degraded', result);
        this.emit('stateChange', result);
        return result;
      }
    }

    const result: HealthCheckResult = {
      serverName: this.serverName,
      alive,
      latency,
      lastSuccess: this.lastSuccess,
      lastFailure: this.lastFailure,
      consecutiveFailures: this.consecutiveFailures,
      circuitState: alive ? 'CLOSED' : 'OPEN',
    };

    this.emit('stateChange', result);
    return result;
  }

  /**
   * Execute a promise with timeout
   */
  private async executeWithTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Health check timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Stop the checker (cleanup)
   */
  stop(): void {
    this.removeAllListeners();
  }
}

// Singleton instance
export const healthCheckScheduler = new HealthCheckScheduler();
