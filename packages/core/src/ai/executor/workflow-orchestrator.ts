/**
 * Workflow Orchestrator
 *
 * Manages deterministic workflow execution (from file, by name, or directly).
 * Extracted from ExecuteService to isolate workflow orchestration logic.
 *
 * Responsibilities:
 * - Execute workflow from file
 * - Execute named/registered workflows
 * - Execute workflow objects directly
 */

import { logger } from "../../core/logger.js";
import { WorkflowEngine } from "../../workflow/engine.js";
import { getWorkflowManager } from "../../workflow/manager.js";
import { IntentOrchError, ErrorCode } from "../../core/error-handler.js";
import type { ToolExecutionEngine } from "../../execution/tool-executor/index.js";
import type { UnifiedExecutionOptions, WorkflowExecutionResult, StepExecutionRecord } from "../execute-service.js";
import type { Workflow } from "../../workflow/types.js";

export class WorkflowOrchestrator {
  /**
   * Execute a workflow from a JSON file.
   */
  async executeWorkflowFromFile(
    filePath: string,
    params: Record<string, unknown> = {},
    options: UnifiedExecutionOptions = {},
    toolExecutor: ToolExecutionEngine,
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[WorkflowOrchestrator] Executing workflow from file: ${filePath}`);

    try {
      const fs = await import("fs/promises");
      const data = await fs.readFile(filePath, "utf-8");
      const workflow = JSON.parse(data);
      return await this.executeWorkflow(workflow, params, options, toolExecutor);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorkflowOrchestrator] Failed to execute workflow from file: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Execute a named/registered workflow.
   */
  async executeNamedWorkflow(
    workflowName: string,
    params: Record<string, unknown> = {},
    options: UnifiedExecutionOptions = {},
    toolExecutor: ToolExecutionEngine,
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[WorkflowOrchestrator] Executing named workflow: \"${workflowName}\"`);

    try {
      const workflowManager = getWorkflowManager();

      if (!(await workflowManager.exists(workflowName))) {
        throw new IntentOrchError(ErrorCode.WORKFLOW_NOT_FOUND, `Workflow \"${workflowName}\" not found`);
      }

      const workflow = await workflowManager.load(workflowName);
      return await this.executeWorkflow(workflow, params, options, toolExecutor);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorkflowOrchestrator] Failed to execute named workflow: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Execute a workflow object directly.
   */
  async executeWorkflow(
    workflow: Workflow,
    params: Record<string, unknown> = {},
    options: UnifiedExecutionOptions = {},
    toolExecutor: ToolExecutionEngine,
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[WorkflowOrchestrator] Executing workflow: ${workflow.name || "unnamed"}`);

    try {
      const workflowEngine = new WorkflowEngine();

      if (options.autoStart) {
        await toolExecutor.ensureServersForWorkflow(workflow);
      }

      if (!options.simulate) {
        await toolExecutor.connectToRunningServers(options);
      }

      const results = await workflowEngine.execute(workflow, params);

      if (!options.keepAlive) {
        await toolExecutor.cleanupConnections();
      }

      return { success: true, results };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[WorkflowOrchestrator] Failed to execute workflow: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}
