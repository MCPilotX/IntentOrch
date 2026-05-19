/**
 * Session Orchestrator
 *
 * Manages the interactive session lifecycle.
 * Extracted from ExecuteService to isolate session orchestration logic.
 *
 * Responsibilities:
 * - Start interactive sessions (create + plan)
 * - Process user feedback on plans
 * - Execute confirmed interactive sessions
 * - Query active sessions
 */

import { logger } from "../../core/logger.js";
import { IntentOrchError, ErrorCode } from "../../core/error-handler.js";
import type { CloudIntentEngine } from "../cloud-intent-engine.js";
import type { SessionManager } from "../../execution/session-manager.js";
import type { ToolExecutionEngine } from "../../execution/tool-executor/index.js";
import type { ExecutionSession, FeedbackRequest } from "../../execution/types.js";
import type { UnifiedExecutionOptions, StepExecutionRecord, ExecutionStatistics, PlanStepRecord } from "../execute-service.js";
import type { ToolExecutionPlan } from "../cloud-intent-engine.js";

export class SessionOrchestrator {
  /**
   * Start an interactive session.
   * Creates a session and generates a plan for user review.
   */
  async startInteractiveSession(
    query: string,
    cloudIntentEngine: CloudIntentEngine,
    sessionManager: SessionManager,
    toolExecutor: ToolExecutionEngine,
  ): Promise<{ sessionId: string; guidance: Record<string, unknown>; session: ExecutionSession | null }> {
    logger.info(`[SessionOrchestrator] Starting interactive session for query: \"${query.substring(0, 100)}...\"`);

    try {
      if (!cloudIntentEngine) {
        throw new IntentOrchError(ErrorCode.ENGINE_NOT_INITIALIZED, "CloudIntentEngine not initialized");
      }

      await toolExecutor.connectToRunningServers({});

      const tools = await toolExecutor.getAvailableTools();
      if (tools.length > 0) {
        cloudIntentEngine.setAvailableTools(tools);
      }

      const session = await sessionManager.createSession({ query, type: "interactive" });

      const plan = await cloudIntentEngine.planQuery(query);
      await sessionManager.storePlan(session.id, plan);

      const updatedSession = await sessionManager.getSession(session.id);

      return {
        sessionId: session.id,
        guidance: {
          type: "plan",
          message: plan.summary || `Generated plan with ${plan.steps.length} steps`,
          steps: plan.steps,
          requiresResponse: true,
        },
        session: updatedSession,
      };
    } catch (error: unknown) {
      logger.error(`[SessionOrchestrator] Failed to start interactive session: ${error instanceof Error ? error.message : String(error)}`);
      throw error;
    }
  }

  /**
   * Process user feedback on an interactive session.
   */
  async processInteractiveFeedback(
    sessionId: string,
    response: { type?: 'confirm' | 'modify' | 'reject' | 'regenerate'; message?: string; modifiedPlan?: ToolExecutionPlan },
    sessionManager: SessionManager,
  ): Promise<{
    success: boolean;
    guidance?: Record<string, unknown>;
    session?: ExecutionSession;
    readyForExecution?: boolean;
  }> {
    logger.info(`[SessionOrchestrator] Processing feedback for session: ${sessionId}`);

    try {
      const feedbackType: 'confirm' | 'modify' | 'reject' | 'regenerate' = response.type || "confirm";
      const feedback: FeedbackRequest = {
        type: feedbackType,
        message: response.message || "",
        modifiedPlan: response.modifiedPlan,
      };

      const session = await sessionManager.handleFeedback(sessionId, feedback);
      const readyForExecution = session.state === "confirmed";

      return {
        success: true,
        guidance: {
          type: readyForExecution ? "confirmation" : "feedback",
          message: readyForExecution
            ? "Plan confirmed. Ready to execute."
            : `Feedback received. Session state: ${session.state}`,
          requiresResponse: !readyForExecution,
        },
        session,
        readyForExecution,
      };
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[SessionOrchestrator] Failed to process feedback: ${errMsg}`);
      return {
        success: false,
        guidance: { type: "error", message: errMsg, requiresResponse: false },
      };
    }
  }

  /**
   * Execute a confirmed interactive session.
   */
  async executeInteractiveSession(
    sessionId: string,
    options: UnifiedExecutionOptions,
    executeFn: (sessionId: string, options: UnifiedExecutionOptions) => Promise<{
      success: boolean;
      result?: unknown;
      executionSteps?: StepExecutionRecord[];
      statistics?: ExecutionStatistics;
      error?: string;
    }>,
  ): Promise<{
    success: boolean;
    result?: unknown;
    executionSteps?: StepExecutionRecord[];
    statistics?: ExecutionStatistics;
    error?: string;
  }> {
    logger.info(`[SessionOrchestrator] Executing interactive session: ${sessionId}`);
    const result = await executeFn(sessionId, options);

    return {
      success: result.success,
      result: result.result,
      executionSteps: result.executionSteps,
      statistics: result.statistics,
      error: result.error,
    };
  }

  /**
   * Get all active interactive sessions.
   */
  async getActiveInteractiveSessions(sessionManager: SessionManager): Promise<ExecutionSession[]> {
    return sessionManager.getActiveSessions();
  }

  /**
   * Get a specific interactive session.
   */
  async getInteractiveSession(sessionId: string, sessionManager: SessionManager): Promise<ExecutionSession | null> {
    return sessionManager.getSession(sessionId);
  }

  /**
   * Clean up old interactive sessions.
   */
  async cleanupInteractiveSessions(sessionManager: SessionManager, maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    return sessionManager.cleanupOldSessions(maxAgeMs);
  }
}
