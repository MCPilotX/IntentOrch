/**
 * Execute Service — Facade Pattern
 *
 * UNIFIED entry point for ALL execution flows.
 *
 * This is a Facade that delegates to focused sub-components:
 * - SessionOrchestrator: Interactive session lifecycle (create, feedback, etc.)
 * - ReActLoopEngine: Multi-turn LLM function calling loop
 * - WorkflowOrchestrator: Deterministic workflow execution
 * - PlanExecutor: Intent parsing and step execution
 * - DaemonDelegator: Daemon process delegation
 *
 * Architecture:
 * ExecuteService (Facade)
 *   ├── SessionOrchestrator (interactive session lifecycle)
 *   ├── ReActLoopEngine (ReAct multi-turn loop)
 *   ├── WorkflowOrchestrator (workflow execution)
 *   ├── PlanExecutor (intent parsing, step execution)
 *   └── DaemonDelegator (daemon delegation)
 *
 * All complex logic has been extracted into the dedicated components above.
 * This class only handles orchestration and delegation.
 */

import { CloudIntentEngine } from "./cloud-intent-engine.js";
import { getSessionManager } from "../execution/session-manager.js";
import { getSessionStore } from "../execution/session-store.js";
import { getToolExecutor } from "../execution/tool-executor/index.js";
import { getParameterNormalizer } from "../execution/parameter-normalizer/index.js";
import { getConfigService } from "../core/config-service.js";
import { createCloudIntentEngine } from "../utils/cloud-intent-engine-factory.js";
import { DatabaseManager } from "../utils/sqlite.js";
import { IntentOrchError, ErrorCode } from "../core/error-handler.js";
import { logger } from "../core/logger.js";

import type { AIConfig } from "../core/types.js";
import type { ToolExecutionPlan } from "./cloud-intent-engine.js";
import type {
  ExecutionSession,
  SessionType,
  ConversationMessage,
  StepResult,
  CreateSessionRequest,
  FeedbackRequest,
} from "../execution/types.js";

// Import focused sub-components
import {
  ReActLoopEngine,
  PlanExecutor,
  SessionOrchestrator,
  WorkflowOrchestrator,
  DaemonDelegator,
} from "./executor/index.js";

// ==================== Re-usable result types ====================

/** A single execution step record used for execution results */
export interface StepExecutionRecord {
  name?: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
}

/** A plan step with its parameters — used before execution */
export interface PlanStepRecord {
  id: string;
  type?: string;
  serverName?: string;
  serverId?: string;
  toolName: string;
  description?: string;
  parameters?: Record<string, unknown>;
  dependsOn?: string[];
}

/** Execution statistics */
export interface ExecutionStatistics {
  totalSteps: number;
  successfulSteps: number;
  failedSteps: number;
  totalDuration: number;
  averageStepDuration: number;
}

// Execution options
export interface UnifiedExecutionOptions {
  autoStart?: boolean;
  keepAlive?: boolean;
  silent?: boolean;
  simulate?: boolean;
  params?: Record<string, unknown>;
  /** Skip delegation to daemon process. Used internally to prevent infinite loops. */
  skipDaemonDelegation?: boolean;
  /**
   * Maximum number of ReAct turns for multi-turn LLM function calling.
   * Default: 10 (covers most complex scenarios)
   * Set to 0 to skip ReAct loop entirely (plan-only mode).
   */
  maxReActTurns?: number;
}

// Execution result
export interface UnifiedExecutionResult {
  success: boolean;
  result?: unknown;
  executionSteps?: StepExecutionRecord[];
  steps?: PlanStepRecord[];
  status?: string;
  confidence?: number;
  error?: string;
  statistics?: ExecutionStatistics;
}

// Workflow execution result
export interface WorkflowExecutionResult {
  success: boolean;
  results?: unknown;
  error?: string;
}

// Re-export sub-component types for convenience
export { ReActLoopEngine, PlanExecutor, SessionOrchestrator, WorkflowOrchestrator, DaemonDelegator };

/**
 * Execute Service — orchestrator for all execution flows.
 */
export class ExecuteService {
  // Sub-component instances (lazy-initialized)
  private cloudIntentEngine: CloudIntentEngine | null = null;
  private aiConfig: AIConfig | null = null;
  private initPromise: Promise<void> | null = null;
  private sessionManager = getSessionManager();
  private toolExecutor = getToolExecutor();
  private parameterNormalizer = getParameterNormalizer();

  // Focused sub-components
  private reactLoopEngine = new ReActLoopEngine();
  private planExecutor = new PlanExecutor();
  private sessionOrchestrator = new SessionOrchestrator();
  private workflowOrchestrator = new WorkflowOrchestrator();
  private daemonDelegator = new DaemonDelegator();

  constructor() {
    logger.debug("[ExecuteService] Creating service instance");
  }

  /**
   * Initialize the service with AI configuration.
   */
  async initialize(aiConfig?: AIConfig): Promise<void> {
    logger.debug("[ExecuteService] Initializing service");

    if (!this.initPromise) {
      this.initPromise = (async () => {
        await DatabaseManager.getInstance().initialize();

        this.aiConfig = aiConfig || (await getConfigService().getAIConfig());

        if (!this.aiConfig.provider) {
          throw new IntentOrchError(
            ErrorCode.AI_NOT_CONFIGURED,
            "AI configuration not set. Please configure AI provider.",
          );
        }

        if (this.aiConfig.provider !== "ollama" && !this.aiConfig.apiKey) {
          throw new IntentOrchError(
            ErrorCode.AI_NOT_CONFIGURED,
            `API key not set for provider: ${this.aiConfig.provider}. Please configure API key.`,
          );
        }

        this.cloudIntentEngine = await createCloudIntentEngine({
          aiConfig: this.aiConfig,
        });

        try {
          getSessionStore().startAutoCleanup();
          logger.debug("[ExecuteService] Session auto-cleanup started");
        } catch (cleanupError: unknown) {
          logger.warn(`[ExecuteService] Failed to start session auto-cleanup: ${cleanupError instanceof Error ? cleanupError.message : String(cleanupError)}`);
        }

        logger.debug("[ExecuteService] Service initialized successfully");
      })();
    }

    await this.initPromise;
  }

  // ==================== Session-Based Execution ====================

  async createSession(
    query: string,
    type: SessionType = "direct",
    metadata?: Record<string, unknown>,
  ): Promise<ExecutionSession> {
    logger.info(`[ExecuteService] Creating ${type} session for query: "${query.substring(0, 100)}..."`);

    const request: CreateSessionRequest = { query, type, metadata };
    return this.sessionManager.createSession(request);
  }

  async getSession(sessionId: string): Promise<ExecutionSession | null> {
    return this.sessionManager.getSession(sessionId);
  }

  async sendFeedback(
    sessionId: string,
    feedback: FeedbackRequest,
  ): Promise<ExecutionSession> {
    logger.info(`[ExecuteService] Sending feedback for session ${sessionId}: ${feedback.type}`);
    return this.sessionManager.handleFeedback(sessionId, feedback);
  }

  async executeSession(
    sessionId: string,
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing session: ${sessionId}`);

    try {
      await this.initialize();

      if (!this.cloudIntentEngine) {
        throw new IntentOrchError(ErrorCode.ENGINE_NOT_INITIALIZED, "CloudIntentEngine not initialized");
      }

      const session = await this.sessionManager.getSession(sessionId);
      if (!session) {
        return { success: false, error: `Session not found: ${sessionId}` };
      }

      // Clear cache at start of each session
      this.toolExecutor.clearToolResultCache();

      // Handle auto-start if requested
      if (options.autoStart) {
        await this.toolExecutor.handleAutoStart(session.query, options);
      }

      // Connect to running MCP servers
      if (!options.simulate) {
        await this.toolExecutor.connectToRunningServers(options);
      }

      // Get available tools
      const tools = await this.toolExecutor.getAvailableTools();

      if (tools.length === 0) {
        return {
          success: false,
          error: "No MCP tools available. Please start some MCP servers first.",
        };
      }

      this.cloudIntentEngine.setAvailableTools(tools);
      const toolExecutor = this.toolExecutor.createToolExecutor(tools);

      // ==================== Phase 1: Plan ====================
      let plan = session.plan;
      if (!plan && session.state === "planning") {
        try {
          plan = await this.cloudIntentEngine.planQuery(session.query);
        } catch (planError: unknown) {
          logger.warn(`[ExecuteService] planQuery failed: ${planError instanceof Error ? planError.message : String(planError)}. Falling back to direct ReAct execution.`);
          plan = {
            id: `plan_${Date.now()}`,
            query: session.query,
            steps: [],
            confirmed: false,
            createdAt: new Date(),
            summary: "Plan generation failed, using direct ReAct execution.",
          };
        }
        await this.sessionManager.storePlan(sessionId, plan);

        const updatedSession = await this.sessionManager.getSession(sessionId);
        if (updatedSession?.state === "reviewing") {
          return {
            success: true,
            result: plan,
            status: "planning",
            steps: plan!.steps.map((s): PlanStepRecord => ({
              id: s.id,
              toolName: s.toolName,
              description: s.description,
              parameters: s.arguments,
            })),
          };
        }
      }

      // ==================== Phase 2: Multi-turn ReAct Execution ====================
      const stepResults: StepResult[] = [];
      let allSuccess = true;
      let finalResult: unknown = undefined;
      let conversationHistory: Array<{ role: string; content: string }> = [];

      const systemPrompt = this.cloudIntentEngine["buildSystemPrompt"]();
      conversationHistory.push({ role: "system", content: systemPrompt });
      conversationHistory.push({ role: "user", content: session.query });

      if (plan && plan.steps.length > 0) {
        const planSummary = plan.summary || `I've analyzed the query and created a plan with ${plan.steps.length} steps.`;
        conversationHistory.push({ role: "assistant", content: `${planSummary}\n\nLet me start executing the plan.` });
      }

      // Execute initial plan steps
      if (plan && plan.steps.length > 0) {
        for (const step of plan.steps) {
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

            await this.sessionManager.recordStepResult(sessionId, stepResult);
            stepResults.push(stepResult);
            finalResult = result;

            logger.info(`[ExecuteService] Plan step ${step.id} (${step.toolName}) completed in ${duration}ms`);

            const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
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
              error: (error instanceof Error ? error.message : String(error)),
              duration,
              timestamp: new Date().toISOString(),
            };

            await this.sessionManager.recordStepResult(sessionId, stepResult);
            stepResults.push(stepResult);

            logger.error(`[ExecuteService] Plan step ${step.id} (${step.toolName}) failed: ${(error instanceof Error ? error.message : String(error))}`);

            conversationHistory.push({
              role: "user",
              content: `Error calling ${step.toolName}: ${(error instanceof Error ? error.message : String(error))}\n\nPlease try a different approach or inform the user.`,
            });
            break;
          }
        }
      }

      // Continue with multi-turn ReAct
      if (allSuccess) {
        const maxTurns = options.maxReActTurns !== undefined ? options.maxReActTurns : 10;
        let turnCount = 0;
        const reactStartTime = Date.now();

        while (turnCount < maxTurns) {
          turnCount++;

          if (Date.now() - reactStartTime > this.toolExecutor.MAX_REACT_EXECUTION_TIME_MS) {
            logger.warn(`[ExecuteService] ReAct loop exceeded max execution time (${this.toolExecutor.MAX_REACT_EXECUTION_TIME_MS}ms), terminating`);
            conversationHistory.push({
              role: "user",
              content: "The execution is taking too long. Please summarize what you've done so far and stop.",
            });
            break;
          }

          if (conversationHistory.length > this.toolExecutor.MAX_CONVERSATION_HISTORY_LENGTH) {
            const trimmedCount = conversationHistory.length - this.toolExecutor.MAX_CONVERSATION_HISTORY_LENGTH;
            logger.debug(`[ExecuteService] Trimming conversation history: ${conversationHistory.length} -> ${this.toolExecutor.MAX_CONVERSATION_HISTORY_LENGTH} messages`);
            const systemMsg = conversationHistory[0];
            const queryMsg = conversationHistory[1];
            const recentMessages = conversationHistory.slice(-(this.toolExecutor.MAX_CONVERSATION_HISTORY_LENGTH - 2));
            conversationHistory = [systemMsg, queryMsg, ...recentMessages];
            logger.debug(`[ExecuteService] Trimmed ${trimmedCount} messages from conversation history`);
          }

          const functionResult = await this.cloudIntentEngine.processQueryWithHistory(
            conversationHistory,
            { toolChoice: "auto" },
          );

          if (!functionResult.hasToolCall || functionResult.toolCalls.length === 0) {
            if (functionResult.text) {
              conversationHistory.push({ role: "assistant", content: functionResult.text });
            }
            break;
          }

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

              await this.sessionManager.recordStepResult(sessionId, stepResult);
              stepResults.push(stepResult);
              finalResult = result;

              logger.info(`[ExecuteService] ReAct turn ${turnCount}: ${toolCall.toolName} completed in ${duration}ms`);

              const resultStr = typeof result === 'object' ? JSON.stringify(result) : String(result);
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
                error: (error instanceof Error ? error.message : String(error)),
                duration,
                timestamp: new Date().toISOString(),
              };

              await this.sessionManager.recordStepResult(sessionId, stepResult);
              stepResults.push(stepResult);

              logger.error(`[ExecuteService] ReAct turn ${turnCount}: ${toolCall.toolName} failed: ${(error instanceof Error ? error.message : String(error))}`);

              conversationHistory.push({
                role: "user",
                content: `Error calling ${toolCall.toolName}: ${(error instanceof Error ? error.message : String(error))}\n\nPlease try a different approach or inform the user.`,
              });
              break;
            }
          }

          if (!allSuccess) break;
        }
      }

      // Finalize session
      if (allSuccess) {
        await this.sessionManager.completeSession(sessionId);
      } else {
        await this.sessionManager.failSession(sessionId);
      }

      // Daemon mode: keep MCP connections alive across requests for better performance
      // Local mode: clean up unless explicitly requested to keep alive
      const isDaemonProcess = process.env.INTORCH_DAEMON === "true";
      if (!options.keepAlive && !isDaemonProcess) {
        await this.toolExecutor.cleanupConnections();
      }

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
    } catch (error: unknown) {
      logger.error(`[ExecuteService] Failed to execute session: ${(error instanceof Error ? error.message : String(error))}`);
      return { success: false, error: (error instanceof Error ? error.message : String(error)) };
    }
  }

  async executeNaturalLanguage(
    query: string,
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing natural language query: "${query.substring(0, 100)}..."`);

    // Try daemon delegation first
    const daemonResult = await this.daemonDelegator.tryDelegate(query, options);
    if (daemonResult) {
      return daemonResult;
    }

    // Fall back to local execution with retries
    const MAX_RETRIES = 2;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        if (attempt > 0) {
          const backoffMs = 1000 * Math.pow(2, attempt - 1);
          logger.info(`[ExecuteService] Retry attempt ${attempt}/${MAX_RETRIES} after ${backoffMs}ms backoff`);
          await new Promise((resolve) => setTimeout(resolve, backoffMs));
        }

        const session = await this.createSession(query, "direct");
        return await this.executeSession(session.id, options);
      } catch (error: unknown) {
        lastError = error instanceof Error ? error : new Error(String(error));
        if (attempt < MAX_RETRIES) {
          logger.warn(`[ExecuteService] Attempt ${attempt + 1}/${MAX_RETRIES + 1} failed: ${(error instanceof Error ? error.message : String(error))}. Will retry.`);
        }
      }
    }

    logger.error(`[ExecuteService] Failed to execute natural language query after ${MAX_RETRIES + 1} attempts: ${lastError?.message}`);
    return { success: false, error: lastError?.message || "Execution failed after retries" };
  }

  // ==================== Interactive Session Methods ====================

  async startInteractiveSession(
    query: string,
    _userId?: string,
  ): Promise<{ sessionId: string; guidance: Record<string, unknown>; session: ExecutionSession | null }> {
    logger.info(`[ExecuteService] Starting interactive session for query: "${query.substring(0, 100)}..."`);

    try {
      await this.initialize();

      if (!this.cloudIntentEngine) {
        throw new IntentOrchError(ErrorCode.ENGINE_NOT_INITIALIZED, "CloudIntentEngine not initialized");
      }

      await this.toolExecutor.connectToRunningServers({});

      const tools = await this.toolExecutor.getAvailableTools();
      if (tools.length > 0) {
        this.cloudIntentEngine.setAvailableTools(tools);
      }

      const session = await this.createSession(query, "interactive");

      const plan = await this.cloudIntentEngine.planQuery(query);
      await this.sessionManager.storePlan(session.id, plan);

      const updatedSession = await this.sessionManager.getSession(session.id);

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
      logger.error(`[ExecuteService] Failed to start interactive session: ${(error instanceof Error ? error.message : String(error))}`);
      throw error;
    }
  }

  async processInteractiveFeedback(
    sessionId: string,
    response: { type?: 'confirm' | 'modify' | 'reject' | 'regenerate'; message?: string; modifiedPlan?: ToolExecutionPlan },
  ): Promise<{
    success: boolean;
    guidance?: Record<string, unknown>;
    session?: ExecutionSession;
    readyForExecution?: boolean;
  }> {
    logger.info(`[ExecuteService] Processing feedback for session: ${sessionId}`);

    try {
      const feedbackType = response.type || "confirm";
      const feedback: FeedbackRequest = {
        type: feedbackType,
        message: response.message || "",
        modifiedPlan: response.modifiedPlan,
      };

      const session = await this.sessionManager.handleFeedback(sessionId, feedback);
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
      logger.error(`[ExecuteService] Failed to process feedback: ${(error instanceof Error ? error.message : String(error))}`);
      return {
        success: false,
        guidance: { type: "error", message: (error instanceof Error ? error.message : String(error)), requiresResponse: false },
      };
    }
  }

  async executeInteractiveSession(
    sessionId: string,
    options: UnifiedExecutionOptions = {},
  ): Promise<{
    success: boolean;
    result?: unknown;
    executionSteps?: StepExecutionRecord[];
    statistics?: ExecutionStatistics;
    error?: string;
  }> {
    logger.info(`[ExecuteService] Executing interactive session: ${sessionId}`);
    const result = await this.executeSession(sessionId, options);

    return {
      success: result.success,
      result: result.result,
      executionSteps: result.executionSteps,
      statistics: result.statistics,
      error: result.error,
    };
  }

  async getActiveInteractiveSessions(): Promise<ExecutionSession[]> {
    return this.sessionManager.getActiveSessions();
  }

  async getInteractiveSession(sessionId: string): Promise<ExecutionSession | null> {
    return this.sessionManager.getSession(sessionId);
  }

  async cleanupInteractiveSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    return this.sessionManager.cleanupOldSessions(maxAgeMs);
  }

  // ==================== Workflow Methods ====================

  async executeWorkflowFromFile(
    filePath: string,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {},
  ): Promise<WorkflowExecutionResult> {
    return this.workflowOrchestrator.executeWorkflowFromFile(filePath, params, options, this.toolExecutor);
  }

  async executeNamedWorkflow(
    workflowName: string,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {},
  ): Promise<WorkflowExecutionResult> {
    return this.workflowOrchestrator.executeNamedWorkflow(workflowName, params, options, this.toolExecutor);
  }

  async executeWorkflow(
    workflow: any,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {},
  ): Promise<WorkflowExecutionResult> {
    return this.workflowOrchestrator.executeWorkflow(workflow, params, options, this.toolExecutor);
  }

  // ==================== Public API Methods ====================

  async parseIntent(
    intent: string,
    context?: Record<string, unknown>,
    options?: { mode?: 'plan_only' | 'plan_and_execute' },
  ): Promise<{
    steps: PlanStepRecord[];
    status: string;
    confidence: number;
    explanation: string;
    executionResult?: UnifiedExecutionResult;
  }> {
    logger.info(`[ExecuteService] Parsing intent: "${intent.substring(0, 100)}..." (mode: ${options?.mode || 'plan_only'})`);

    try {
      await this.initialize();

      if (!this.cloudIntentEngine) {
        throw new IntentOrchError(ErrorCode.ENGINE_NOT_INITIALIZED, "CloudIntentEngine not initialized");
      }

      return await this.planExecutor.parseIntent(
        intent,
        context,
        options,
        this.cloudIntentEngine,
        this.toolExecutor,
        this.parameterNormalizer,
      );
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[ExecuteService] Failed to parse intent: ${errMsg}`);
      return {
        steps: [],
        status: "capability_missing",
        confidence: 0,
        explanation: `Failed to parse intent: ${errMsg}`,
      };
    }
  }

  async executeSteps(
    steps: PlanStepRecord[],
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing ${steps.length} pre-parsed steps`);

    try {
      await this.initialize();

      if (!this.cloudIntentEngine) {
        throw new IntentOrchError(ErrorCode.ENGINE_NOT_INITIALIZED, "CloudIntentEngine not initialized");
      }

      return await this.planExecutor.executeSteps(steps, options, this.cloudIntentEngine, this.toolExecutor);
    } catch (error: unknown) {
      const errMsg = error instanceof Error ? error.message : String(error);
      logger.error(`[ExecuteService] Failed to execute steps: ${errMsg}`);
      return { success: false, error: errMsg };
    }
  }
}

// Singleton instance
let unifiedExecutionServiceInstance: ExecuteService | null = null;

export function getExecuteService(): ExecuteService {
  if (!unifiedExecutionServiceInstance) {
    unifiedExecutionServiceInstance = new ExecuteService();
  }
  return unifiedExecutionServiceInstance;
}

export function createExecuteService(): ExecuteService {
  return new ExecuteService();
}
