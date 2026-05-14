/**
 * Utilities Module Exports
 */

export { AutoStartManager } from "./auto-start-manager.js";
export { CloudIntentEngineFactory } from "./cloud-intent-engine-factory.js";
export {
  ConfigManager,
  getConfigManager,
  getAIConfig,
  getRegistryConfig,
} from "./config.js";
export {
  getProcessesPath,
  getConfigPath,
  getLogsDir,
  getLogPath,
  getInTorchDir,
  ensureInTorchDir,
} from "./paths.js";
export { normalizeServerName, getDisplayName } from "./server-name.js";
export {
  isProcessRunning,
  isProcessRunningWithRetry,
  isWindows,
} from "./system.js";
export { OwnerProjectFormat } from "./owner-project-format.js";
export {
  DatabaseManager,
  getSqliteDb,
  closeSqliteDb,
  // The following Repository factory functions are unused internally and have
  // never been invoked by any code path. They were scaffolded for a future
  // Repository-pattern migration that never materialized. They are exported
  // here for backward compatibility — consumers should use the Manager classes
  // (e.g. SessionManager, ProcessManager, ConfigService) directly instead.
  /** @deprecated Unused. Manage config via ConfigService instead. */
  getConfigRepository,
  /** @deprecated Unused. Manage secrets via SecretManager instead. */
  getSecretRepository,
  /** @deprecated Unused. Manage processes via ProcessManager instead. */
  getProcessRepository,
  /** @deprecated Unused. Manage tools via ToolRegistry instead. */
  getToolRepository,
  /** @deprecated Unused. Cache is managed by RegistryClient. */
  getManifestCacheRepository,
  /** @deprecated Unused. Manage workflows via WorkflowManager instead. */
  getWorkflowRepository,
  /** @deprecated Unused. Execution recording uses WorkflowEngine directly. */
  getWorkflowExecutionRepository,
} from "./sqlite.js";
export type {
  IConfigRepository,
  ISecretRepository,
  IProcessRepository,
  IToolRepository,
  IManifestCacheRepository,
  IWorkflowRepository,
  IWorkflowExecutionRepository,
} from "./sqlite.js";
