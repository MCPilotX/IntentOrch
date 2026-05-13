/**
 * Plan Executor
 *
 * Handles intent parsing, plan step normalization, and step-by-step execution.
 * Extracted from ExecuteService to isolate the plan-related logic.
 *
 * Responsibilities:
 * - Parse intent into executable plan steps via CloudIntentEngine
 * - Normalize plan steps with parameter validation
 * - Execute pre-parsed steps sequentially
 */

import { logger } from "../../core/logger.js";
import type { CloudIntentEngine } from "../cloud-intent-engine.js";
import type { ToolExecutionEngine, ToolInfo } from "../../execution/tool-executor/index.js";
import type { ParameterNormalizer } from "../../execution/parameter-normalizer/index.js";
import type { UnifiedExecutionOptions, UnifiedExecutionResult, StepExecutionRecord, PlanStepRecord } from "../execute-service.js";

export class PlanExecutor {
  /**
   * Parse a natural language intent into executable steps.
   */
  async parseIntent(
    intent: string,
    context: Record<string, unknown> | undefined,
    options: { mode?: "plan_only" | "plan_and_execute" } | undefined,
    cloudIntentEngine: CloudIntentEngine,
    toolExecutor: ToolExecutionEngine,
    parameterNormalizer: ParameterNormalizer,
  ): Promise<{
    steps: PlanStepRecord[];
    status: string;
    confidence: number;
    explanation: string;
    executionResult?: UnifiedExecutionResult;
  }> {
    logger.info(`[PlanExecutor] Parsing intent: \"${intent.substring(0, 100)}...\" (mode: ${options?.mode || "plan_only"})`);

    try {
      await toolExecutor.connectToRunningServers({});

      const tools = await toolExecutor.getAvailableTools();

      if (tools.length === 0) {
        return {
          steps: [],
          status: "capability_missing",
          confidence: 0,
          explanation: "No MCP tools available. Please start some MCP servers first.",
        };
      }

      cloudIntentEngine.setAvailableTools(tools);

      const plan = await cloudIntentEngine.planQuery(intent);
      const steps = this.normalizePlanSteps(plan, tools, context, toolExecutor, parameterNormalizer);

      if (options?.mode === "plan_and_execute") {
        const executionResult = await this.executeSteps(steps, {}, cloudIntentEngine, toolExecutor);
        return {
          steps,
          status: executionResult.success ? "success" : "partial",
          confidence: steps.length > 0 ? 0.8 : 0,
          explanation: plan.summary || `Parsed ${steps.length} steps`,
          executionResult,
        };
      }

      return {
        steps,
        status: steps.length > 0 ? "success" : "partial",
        confidence: steps.length > 0 ? 0.8 : 0,
        explanation: plan.summary || `Parsed ${steps.length} steps`,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[PlanExecutor] Failed to parse intent: ${errMsg}`);
      return {
        steps: [],
        status: "capability_missing",
        confidence: 0,
        explanation: `Failed to parse intent: ${errMsg}`,
      };
    }
  }
  /**
   * Execute pre-parsed steps sequentially.
   */
  async executeSteps(
    steps: PlanStepRecord[],
    options: UnifiedExecutionOptions,
    cloudIntentEngine: CloudIntentEngine,
    toolExecutor: ToolExecutionEngine,
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[PlanExecutor] Executing ${steps.length} pre-parsed steps`);

    try {
      if (!options.simulate) {
        await toolExecutor.connectToRunningServers(options);
      }

      const tools = await toolExecutor.getAvailableTools();

      if (tools.length === 0) {
        return { success: false, error: "No MCP tools available. Please start some MCP servers first." };
      }

      cloudIntentEngine.setAvailableTools(tools);

      const executeToolFn = toolExecutor.createToolExecutor(tools);

      const stepResults: StepExecutionRecord[] = [];
      let allSuccess = true;

      for (const step of steps) {
        try {
          const result = await executeToolFn(step.toolName, step.parameters || {});
          stepResults.push({
            name: step.toolName,
            toolName: step.toolName,
            success: true,
            result,
            duration: 0,
          });
        } catch (error: unknown) {
          allSuccess = false;
          stepResults.push({
            name: step.toolName,
            toolName: step.toolName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration: 0,
          });
        }
      }

      if (!options.keepAlive) {
        await toolExecutor.cleanupConnections();
      }

      return {
        success: allSuccess,
        result: stepResults,
        executionSteps: stepResults,
        statistics: {
          totalSteps: stepResults.length,
          successfulSteps: stepResults.filter((sr) => sr.success).length,
          failedSteps: stepResults.filter((sr) => !sr.success).length,
          totalDuration: 0,
          averageStepDuration: 0,
        },
        error: allSuccess ? undefined : "Some steps failed",
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[PlanExecutor] Failed to execute steps: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }

  /**
   * Normalize plan steps from CloudIntentEngine into a consistent format.
   */
  normalizePlanSteps(
    plan: { steps?: Array<{ id?: string; toolName: string; serverName?: string; description?: string; arguments?: Record<string, unknown>; dependsOn?: string[] }>; summary?: string },
    tools: ToolInfo[],
    context: Record<string, unknown> | undefined,
    toolExecutor: ToolExecutionEngine,
    parameterNormalizer: ParameterNormalizer,
  ): PlanStepRecord[] {
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return [];
    }

    const toolMap = new Map<string, ToolInfo>();
    for (const tool of tools) {
      toolMap.set(tool.name, tool);
    }

    return plan.steps!.map((step) => {
      const toolMetadata = toolMap.get(step.toolName);
      const serverName = step.serverName
        || toolMetadata?.serverName
        || toolExecutor.resolveServerName(step.toolName, context as unknown as { availableServers?: string[] })
        || "generic-service";

      const parameters = parameterNormalizer.normalize(
        step.arguments || {},
        toolMetadata?.inputSchema as Record<string, unknown> | undefined,
      );

      return {
        id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        type: "tool" as const,
        serverName,
        serverId: serverName,
        toolName: step.toolName,
        description: step.description || `Execute ${step.toolName}`,
        parameters,
        dependsOn: step.dependsOn || [],
      };
    });
  }
}

