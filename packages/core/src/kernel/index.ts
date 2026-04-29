/**
 * Kernel-X Module
 *
 * IntentOrch Kernel-X: Async Autonomous Kernel
 * Core design philosophy: Evolve from "sync forwarding" to "async autonomous kernel"
 *
 * Remaining active modules:
 * 1. KernelConfig - Kernel configuration
 * 2. HealthCheckScheduler - MCP server health monitoring
 * 3. ErrorBoundary - Error boundary for MCP client calls
 */

export {
  KernelConfig,
  getKernelConfig,
  setKernelConfig,
  isKernelEnabled,
} from "./config.js";
export type { KernelConfig as KernelConfigType } from "./config.js";

export {
  HealthCheckScheduler,
  healthCheckScheduler,
} from "./health-check-scheduler.js";
export type {
  HealthCheckResult,
  HealthCheckConfig,
} from "./health-check-scheduler.js";

export { ErrorBoundary, globalErrorBoundary } from "./error-boundary.js";
export type {
  ErrorCategory,
  RecoveryStrategy,
  ErrorClassification,
  ErrorBoundaryConfig,
  ErrorBoundaryResult,
} from "./error-boundary.js";
