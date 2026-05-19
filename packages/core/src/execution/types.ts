/**
 * Execution Session Types
 *
 * Unified session model for both direct execution and interactive sessions.
 * This replaces the separate handling of execution state and interactive sessions
 * with a single, persistent model backed by SQLite.
 */

import type { PlanStep, ToolExecutionPlan } from "../ai/cloud-intent-engine.js";

// ==================== Session Type & State ====================

/**
 * Session type distinguishes between direct execution (no user interaction)
 * and interactive sessions (user reviews and confirms the plan).
 */
export type SessionType = "direct" | "interactive";

/**
 * Session state machine:
 *
 * direct sessions:    planning -> executing -> completed | failed
 * interactive sessions: planning -> reviewing -> confirmed -> executing -> completed | failed
 *                      planning -> reviewing -> cancelled
 *                      planning -> reviewing -> planning (regenerate)
 */
export type SessionState =
  | "planning"
  | "reviewing"
  | "confirmed"
  | "executing"
  | "completed"
  | "failed"
  | "cancelled";

// ==================== Core Data Types ====================

export interface ConversationMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface StepResult {
  stepId: string;
  toolName: string;
  success: boolean;
  result?: unknown;
  error?: string;
  duration: number;
  timestamp: string;
}

export interface UserFeedback {
  type: "confirm" | "modify" | "reject" | "regenerate";
  message?: string;
  modifiedPlan?: ToolExecutionPlan;
  timestamp: string;
}

// ==================== Session Model ====================

export interface ExecutionSession {
  /** Unique session identifier (UUID) */
  id: string;
  /** Session type: direct execution or interactive */
  type: SessionType;
  /** Current state in the state machine */
  state: SessionState;
  /** Original user query */
  query: string;
  /** Generated execution plan (null until planning completes) */
  plan: ToolExecutionPlan | null;
  /** Multi-turn conversation history for LLM function calling */
  conversationHistory: ConversationMessage[];
  /** Results of executed steps */
  stepResults: StepResult[];
  /** User feedback for interactive sessions */
  feedback: UserFeedback[];
  /** Current turn number in multi-turn execution */
  currentTurn: number;
  /** Maximum turns allowed */
  maxTurns: number;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last update */
  updatedAt: string;
  /** Optional metadata for extensibility */
  metadata: Record<string, unknown>;
}

// ==================== Session Filter & Query ====================

export interface SessionFilter {
  type?: SessionType;
  state?: SessionState;
  limit?: number;
  offset?: number;
  sortBy?: "createdAt" | "updatedAt";
  sortOrder?: "asc" | "desc";
}

// ==================== API Response Types ====================

export interface CreateSessionRequest {
  query: string;
  type: SessionType;
  metadata?: Record<string, unknown>;
}

export interface FeedbackRequest {
  type: UserFeedback["type"];
  message?: string;
  modifiedPlan?: ToolExecutionPlan;
}

export interface SessionListResponse {
  sessions: ExecutionSession[];
  total: number;
  hasMore: boolean;
}

// ==================== Error Types ====================

export class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(sessionId: string) {
    super(`Session not found: ${sessionId}`, "SESSION_NOT_FOUND");
    this.name = "SessionNotFoundError";
  }
}

export class InvalidSessionStateError extends SessionError {
  constructor(sessionId: string, expected: SessionState, actual: SessionState) {
    super(
      `Invalid state for session ${sessionId}: expected ${expected}, got ${actual}`,
      "INVALID_SESSION_STATE",
    );
    this.name = "InvalidSessionStateError";
  }
}
