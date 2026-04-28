import { logger } from "./core/logger";
/**
 * IntentOrch - Docker for MCP Ecosystem
 * 
 * Allows developers to manage MCP Servers like containers
 * 
 * Main features:
 * 1. MCP Server lifecycle management
 * 2. Natural language intent parsing and execution
 * 3. Workflow orchestration and tracking
 * 4. Runtime adaptation and detection
 * 
 * @package @mcpilotx/intentorch
 * @version 0.1.0
 */

// ==================== Core Modules ====================
export { ConfigService, getConfigService } from './core';
export type { RuntimeType, ServiceConfig, Config, AIConfig, DetectionResult } from './core';

// ==================== AI Modules ====================
export { CloudIntentEngine, LLMClient, getLLMClient } from './ai';
export type { CloudIntentEngineConfig } from './ai';

// ==================== Execute Service ====================
export { ExecuteService, getExecuteService, createExecuteService } from './ai/execute-service';
export type { UnifiedExecutionOptions, UnifiedExecutionResult, WorkflowExecutionResult } from './ai/execute-service';

// ==================== MCP Modules ====================
export { MCPClient, ToolRegistry } from './mcp';
export type { Tool, ToolCall, ToolMetadata } from './mcp';

// ==================== Runtime Modules ====================
export { RuntimeDetector, RuntimeAdapter } from './runtime';

// ==================== Tool Registry ====================
export { ToolRegistry as ToolRegistryModule } from './tool-registry';

// ==================== Process Management ====================
export { ProcessManager, ProcessStore } from './process-manager';
export type { ProcessInfo } from './process-manager/types';

// ==================== Secret Management ====================
export { SecretManager } from './secret';

// ==================== Workflow Modules ====================
export * from './workflow';
export type { Workflow, WorkflowStep, WorkflowInput } from './workflow/types';

// ==================== Utility Functions ====================
export * from './utils';
export { getSqliteDb, closeSqliteDb } from './utils/sqlite';

// ==================== Type Definitions ====================
export * from './types';
export type { DaemonResponse } from './core/types';

// ==================== CLI Tools ====================
// Note: CLI modules are not directly exported, used via bin/intorch.js

/**
 * Get IntentOrch version info
 */
export function getVersion(): string {
  return '0.1.0';
}

/**
 * Get system status
 */
export async function getSystemStatus() {
  return {
    version: getVersion(),
    timestamp: new Date().toISOString(),
    modules: {
      core: 'available',
      ai: 'available',
      mcp: 'available',
      runtime: 'available',
      workflow: 'available',
    },
    capabilities: {
      intentParsing: true,
      workflowOrchestration: true,
      mcpServerManagement: true,
      runtimeDetection: true,
    },
  };
}

/**
 * Initialize IntentOrch system
 */
export async function initialize(_config?: Record<string, unknown>) {
  logger.info(`[IntentOrch] Initializing version ${getVersion()}`);
  
  // Add initialization logic here
  // For example: load configuration, initialize services, etc.
  
  return {
    success: true,
    version: getVersion(),
    message: 'IntentOrch initialized successfully',
  };
}

// ==================== Utility Function Exports ====================
export { getProcessManager } from './process-manager/manager';
export { getRegistryClient } from './registry/client';
export { getWorkflowManager } from './workflow/manager';
export { getToolRegistry } from './tool-registry/registry';
export { getIntentService } from './ai/intent-service';
export { getAIConfig, getConfigManager } from './utils/config';
export { AutoStartManager } from './utils/auto-start-manager';
export { printError } from './utils/cli-error';
export { PROGRAM_NAME, PROGRAM_DESCRIPTION, PROGRAM_VERSION } from './utils/constants';
export { AIProviders, AIProvider, RegistrySources, RegistrySource } from './core/constants';
export { getSecretManager } from './secret/manager';
export { toLightweightManifest, supportsDynamicDiscovery } from './types/lightweight-manifest';
export { getDisplayName } from './utils/server-name';
export { DaemonClient } from './daemon/client';
export { DaemonServer } from './daemon/server';
export { ensureInTorchDir, getDaemonPidPath, getDaemonLogPath, getLogPath } from './utils/paths';
export { healthCheckScheduler } from './kernel/health-check-scheduler';
export type { DaemonConfig } from './daemon/types';

// ==================== Default Export ====================
import { intentorch as adapter } from './ai/intentorch-adapter';

const intentorch = {
  getVersion,
  getSystemStatus,
  initialize,
  // Add adapter methods
  configureAI: adapter.configureAI.bind(adapter),
  initCloudIntentEngine: adapter.initCloudIntentEngine.bind(adapter),
  connectMCPServer: adapter.connectMCPServer.bind(adapter),
  processQuery: adapter.processQuery.bind(adapter),
  parseAndPlanWorkflow: adapter.parseAndPlanWorkflow.bind(adapter),
  getConnectedServers: adapter.getConnectedServers.bind(adapter),
  disconnectMCPServer: adapter.disconnectMCPServer.bind(adapter),
  cleanup: adapter.cleanup.bind(adapter),
};

export default intentorch;
