/**
 * ReAct Loop Engine
 *
 * Multi-turn ReAct (Reasoning + Acting) execution loop for LLM function calling.
 * Extracted from ExecuteService to isolate the complex loop logic.
 *
 * Responsibilities:
 * - Manage conversation history with trimming/threshold logic
 * - Execute multi-turn tool calling loop with timeout protection
 * - Record step results via SessionManager
 * - Build UnifiedExecutionResult from step results
 */

import { logger } from "../../core/logger.js";
import type { CloudIntentEngine } from "../cloud-intent-engine.js";
import type { SessionManager } from "../../execution/session-manager.js";
import type { UnifiedExecutionOptions, UnifiedExecutionResult, StepExecutionRecord } from "../execute-service.js";
import type { StepResult } from "../../execution/types.js";

/**
 * Maximum execution time for a ReAct loop (2 minutes).
 */
const MAX_REACT_EXECUTION_TIME_MS = 120_000;

/**
 * Maximum number of messages in conversation history before summarization.
 */
const MAX_CONVERSATION_HISTORY_LENGTH = 20;

/**
 * Default maximum number of ReAct turns.
 */
const DEFAULT_MAX_REACT_TURNS = 10;

export class ReActLoopEngine {
  /**
   * Get the max conversation history length constant.
   */
  get maxConversationHistoryLength(): number {
    return MAX_CONVERSATION_HISTORY_LENGTH;
  }

  /**
   * Get the max react execution time constant.
   */
  get maxReActExecutionTimeMs(): number {
    return MAX_REACT_EXECUTION_TIME_MS;
  }

  /**
   * Execute the full plan + ReAct loop for a session.
   *
   * Phase 1: Execute pre-planned steps (if plan exists)
   * Phase 2: Multi-turn ReAct loop for adaptive tool calling
   */
  async execute(
    sessionId: string,
    query: string,
    plan: { steps: Array<{ id: string; toolName: string; arguments: Record<string, unknown> }>; summary?: string },
    sessionManager: SessionManager,
    cloudIntentEngine: CloudIntentEngine,
    toolExecutor: (toolName: string, params: Record<string, unknown>) => Promise<unknown>,
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult> {
    const stepResults: StepResult[] = [];
    let allSuccess = true;
    let finalResult: unknown = undefined;
    const conversationHistory: Array<{ role: string; content: string }> = [];

    // Build system prompt for conversation
    const systemPrompt = cloudIntentEngine["buildSystemPrompt"]();
    conversationHistory.push({ role: "system", content: systemPrompt });
    conversationHistory.push({ role: "user", content: query });

    if (plan && plan.steps.length > 0) {
      const planSummary = plan.summary || `I've analyzed the query and created a plan with ${plan.steps.length} steps.`;
      conversationHistory.push({ role: "assistant", content: `${planSummary}\n\nLet me start executing the plan.` });
    }

    // Phase 1: Execute initial plan steps
    if (plan && plan.steps.length > 0) {
      const phase1Result = await this.executePlanSteps(
        sessionId,
        plan.steps,
        sessionManager,
        conversationHistory,
        toolExecutor,
      );
      stepResults.push(...phase1Result.stepResults);
      allSuccess = phase1Result.allSuccess;
      finalResult = phase1Result.finalResult;

      if (!allSuccess) {
        return this.buildResult(stepResults, allSuccess, finalResult);
      }
    }

    // Phase 2: Multi-turn ReAct loop
    if (allSuccess) {
      const reactResult = await this.executeReActLoop(
        sessionId,
        sessionManager,
        cloudIntentEngine,
        conversationHistory,
        toolExecutor,
        options,
      );
      stepResults.push(...reactResult.stepResults);
      allSuccess = reactResult.allSuccess;
      if (reactResult.finalResult !== undefined) {
        finalResult = reactResult.finalResult;
      }
    }

    return this.buildResult(stepResults, allSuccess, finalResult);
  }

  /**
   * Phase 1: Execute pre-generated plan steps sequentially.
   */
  private async executePlanSteps(
    sessionId: string,
    steps: Array<{ id: string; toolName: string; arguments: Record<string, unknown> }>,
    sessionManager: SessionManager,
    conversationHistory: Array<{ role: string; content: string }>,
    toolExecutor: (toolName: string, params: Record<string, unknown>) => Promise<unknown>,
  ): Promise<{
    stepResults: StepResult[];
    allSuccess: boolean;
    finalResult: unknown;
  }> {
    const stepResults: StepResult[] = [];
    let allSuccess = true;
    let finalResult: unknown = undefined;

    for (const step of steps) {
      const stepStartTime = Date.now();
      try {
        const result = await toolExecutor(step.toolName, step.arguments);
        const duration = Date.now() - stepStartTime;

        const stepResult: StepResult = {
          stepId: step.id,
          toolName: step.toolName,
          success: true,
          result,
          duration,
          timestamp: new Date().toISOString(),
        };

        await sessionManager.recordStepResult(sessionId, stepResult);
        stepResults.push(stepResult);
        finalResult = result;

        logger.info(`[ReActLoop] Plan step ${step.id} (${step.toolName}) completed in ${duration}ms`);

        const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
        conversationHistory.push({
          role: "user",
          content: `Result of ${step.toolName}: ${resultStr}\n\nBased on this result, what should I do next? If the task is complete, respond with a summary. Otherwise, call the next tool.`,
        });
      } catch (error: unknown) {
        const duration = Date.now() - stepStartTime;
        allSuccess = false;

        const stepResult: StepResult = {
          stepId: step.id,
          toolName: step.toolName,
          success: false,
          error: error instanceof Error ? error.message : String(error),
          duration,
          timestamp: new Date().toISOString(),
        };

        await sessionManager.recordStepResult(sessionId, stepResult);
        stepResults.push(stepResult);

        logger.error(`[ReActLoop] Plan step ${step.id} (${step.toolName}) failed: ${error instanceof Error ? error.message : String(error)}`);

        conversationHistory.push({
          role: "user",
          content: `Error calling ${step.toolName}: ${error instanceof Error ? error.message : String(error)}\n\nPlease try a different approach or inform the user.`,
        });
        break;
      }
    }

    return { stepResults, allSuccess, finalResult };
  }

  /**
   * Phase 2: Multi-turn ReAct loop for adaptive tool calling.
   */
  private async executeReActLoop(
    sessionId: string,
    sessionManager: SessionManager,
    cloudIntentEngine: CloudIntentEngine,
    conversationHistory: Array<{ role: string; content: string }>,
    toolExecutor: (toolName: string, params: Record<string, unknown>) => Promise<unknown>,
    options: UnifiedExecutionOptions = {},
  ): Promise<{
    stepResults: StepResult[];
    allSuccess: boolean;
    finalResult: unknown;
  }> {
    const stepResults: StepResult[] = [];
    let allSuccess = true;
    let finalResult: unknown = undefined;

    const maxTurns = options.maxReActTurns !== undefined ? options.maxReActTurns : DEFAULT_MAX_REACT_TURNS;
    let turnCount = 0;
    const reactStartTime = Date.now();

    while (turnCount < maxTurns) {
      turnCount++;

      // Check total execution time limit
      if (Date.now() - reactStartTime > MAX_REACT_EXECUTION_TIME_MS) {
        logger.warn(`[ReActLoop] ReAct loop exceeded max execution time (${MAX_REACT_EXECUTION_TIME_MS}ms), terminating`);
        conversationHistory.push({ role: "user", content: "The execution is taking too long. Please summarize what you've done so far and stop." });
        break;
      }

      // Trim conversation history if it gets too long
      this.trimConversationHistory(conversationHistory);

      // Ask LLM for next action
      const functionResult = await cloudIntentEngine.processQueryWithHistory(
        conversationHistory,
        { toolChoice: "auto" },
      );

      // No tool call -> LLM wants to respond with text (task complete or needs more info)
      if (!functionResult.hasToolCall || functionResult.toolCalls.length === 0) {
        if (functionResult.text) {
          conversationHistory.push({ role: "assistant", content: functionResult.text });
        }
        break;
      }

      // Execute each tool call from the LLM
      for (const toolCall of functionResult.toolCalls) {
        const stepStartTime = Date.now();

        try {
          const result = await toolExecutor(toolCall.toolName, toolCall.arguments);
          const duration = Date.now() - stepStartTime;

          const stepResult: StepResult = {
            stepId: `turn_${turnCount}_${toolCall.toolName}`,
            toolName: toolCall.toolName,
            success: true,
            result,
            duration,
            timestamp: new Date().toISOString(),
          };

          await sessionManager.recordStepResult(sessionId, stepResult);
          stepResults.push(stepResult);
          finalResult = result;

          logger.info(`[ReActLoop] ReAct turn ${turnCount}: ${toolCall.toolName} completed in ${duration}ms`);

          const resultStr = typeof result === "object" ? JSON.stringify(result) : String(result);
          conversationHistory.push({
            role: "user",
            content: `Result of ${toolCall.toolName}: ${resultStr}\n\nBased on this result, what should I do next? If the task is complete, respond with a summary. Otherwise, call the next tool.`,
          });
        } catch (error: unknown) {
          const duration = Date.now() - stepStartTime;
          allSuccess = false;

          const stepResult: StepResult = {
            stepId: `turn_${turnCount}_${toolCall.toolName}`,
            toolName: toolCall.toolName,
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration,
            timestamp: new Date().toISOString(),
          };

          await sessionManager.recordStepResult(sessionId, stepResult);
          stepResults.push(stepResult);

          const errMsg = error instanceof Error ? error.message : String(error);
          logger.error(`[ReActLoop] ReAct turn ${turnCount}: ${toolCall.toolName} failed: ${errMsg}`);
          conversationHistory.push({
            role: "user",
            content: `Error calling ${toolCall.toolName}: ${errMsg}\n\nPlease try a different approach or inform the user.`,
          });
          break;
        }
      }

      if (!allSuccess) break;
    }

    return { stepResults, allSuccess, finalResult };
  }

  /**
   * Trim conversation history when it exceeds the maximum length.
   * Preserves system message and original query, trims middle messages.
   */
  private trimConversationHistory(history: Array<{ role: string; content: string }>): void {
    if (history.length <= MAX_CONVERSATION_HISTORY_LENGTH) return;

    const trimmedCount = history.length - MAX_CONVERSATION_HISTORY_LENGTH;
    logger.debug(`[ReActLoop] Trimming conversation history: ${history.length} -> ${MAX_CONVERSATION_HISTORY_LENGTH} messages`);

    const systemMsg = history[0];
    const queryMsg = history[1];
    const recentMessages = history.slice(-(MAX_CONVERSATION_HISTORY_LENGTH - 2));

    history.length = 0;
    history.push(systemMsg, queryMsg, ...recentMessages);

    logger.debug(`[ReActLoop] Trimmed ${trimmedCount} messages from conversation history`);
  }

  /**
   * Build a standardized UnifiedExecutionResult from step results.
   */
  buildResult(
    stepResults: StepResult[],
    allSuccess: boolean,
    finalResult: unknown,
  ): UnifiedExecutionResult {
    const totalDuration = stepResults.reduce((sum, sr) => sum + (sr.duration || 0), 0);

    return {
      success: allSuccess,
      result: finalResult,
      executionSteps: stepResults.map((sr) => ({
        name: sr.toolName,
        toolName: sr.toolName,
        success: sr.success,
        result: sr.result,
        error: sr.error,
        duration: sr.duration,
      })),
      statistics: {
        totalSteps: stepResults.length,
        successfulSteps: stepResults.filter((sr) => sr.success).length,
        failedSteps: stepResults.filter((sr) => !sr.success).length,
        totalDuration,
        averageStepDuration: totalDuration / Math.max(stepResults.length, 1),
      },
      error: allSuccess ? undefined : stepResults.find((sr) => !sr.success)?.error || "Execution failed",
    };
  }
}
