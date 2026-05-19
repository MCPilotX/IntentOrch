/**
 * Session Manager
 *
 * State machine orchestrator for execution sessions.
 * Manages the lifecycle of both direct and interactive sessions:
 *
 * direct sessions:      planning -> executing -> completed | failed
 * interactive sessions: planning -> reviewing -> confirmed -> executing -> completed | failed
 *                       planning -> reviewing -> cancelled
 *                       planning -> reviewing -> planning (regenerate)
 *
 * This replaces the ad-hoc state management in ExecuteService and CloudIntentEngine
 * with a unified, persistent, and testable state machine.
 */

import { randomUUID } from "crypto";
import { logger } from "../core/logger.js";
import { SessionStore, getSessionStore } from "./session-store.js";
import type {
  ExecutionSession,
  SessionType,
  SessionState,
  ConversationMessage,
  StepResult,
  UserFeedback,
  CreateSessionRequest,
  FeedbackRequest,
} from "./types.js";
import {
  SessionNotFoundError,
  InvalidSessionStateError,
} from "./types.js";

// ==================== State Transition Map ====================

/**
 * Valid state transitions for each session type.
 */
const STATE_TRANSITIONS: Record<SessionType, Record<SessionState, SessionState[]>> = {
  direct: {
    planning: ["executing"],
    reviewing: [], // direct sessions never enter reviewing
    confirmed: [], // direct sessions never need confirmation
    executing: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
  },
  interactive: {
    planning: ["reviewing"],
    reviewing: ["confirmed", "cancelled", "planning"], // planning = regenerate
    confirmed: ["executing"],
    executing: ["completed", "failed"],
    completed: [],
    failed: [],
    cancelled: [],
  },
};

// ==================== Session Manager ====================

export class SessionManager {
  private store: SessionStore;

  constructor(store?: SessionStore) {
    this.store = store || getSessionStore();
  }

  // ==================== Lifecycle Methods ====================

  /**
   * Create a new session.
   */
  async createSession(request: CreateSessionRequest): Promise<ExecutionSession> {
    logger.info(
      `[SessionManager] Creating ${request.type} session for query: "${request.query.substring(0, 100)}..."`,
    );

    const session = await this.store.create({
      query: request.query,
      type: request.type,
      metadata: request.metadata,
    });

    logger.debug(`[SessionManager] Created session ${session.id}`);
    return session;
  }

  /**
   * Get a session by ID.
   */
  async getSession(id: string): Promise<ExecutionSession | null> {
    return this.store.get(id);
  }

  /**
   * Transition a session to a new state.
   * Validates the transition against the state machine.
   */
  async transitionState(
    id: string,
    newState: SessionState,
  ): Promise<ExecutionSession> {
    const session = await this.store.getOrThrow(id);

    // Validate the transition
    const allowedTransitions = STATE_TRANSITIONS[session.type][session.state];
    if (!allowedTransitions.includes(newState)) {
      throw new InvalidSessionStateError(id, newState, session.state);
    }

    await this.store.updateState(id, newState);
    logger.debug(
      `[SessionManager] Session ${id}: ${session.state} -> ${newState}`,
    );

    return (await this.store.getOrThrow(id))!;
  }

  /**
   * Store the generated plan and transition to the appropriate next state.
   * - direct sessions: planning -> executing
   * - interactive sessions: planning -> reviewing
   */
  async storePlan(
    id: string,
    plan: ExecutionSession["plan"],
  ): Promise<ExecutionSession> {
    const session = await this.store.getOrThrow(id);

    await this.store.updatePlan(id, plan);

    // Transition to next state based on session type
    const nextState: SessionState =
      session.type === "direct" ? "executing" : "reviewing";

    return this.transitionState(id, nextState);
  }

  /**
   * Handle user feedback for interactive sessions.
   * - confirm: reviewing -> confirmed
   * - modify: reviewing -> confirmed (with modified plan)
   * - reject: reviewing -> cancelled
   * - regenerate: reviewing -> planning
   */
  async handleFeedback(
    id: string,
    feedback: FeedbackRequest,
  ): Promise<ExecutionSession> {
    const session = await this.store.getOrThrow(id);

    if (session.type !== "interactive") {
      throw new InvalidSessionStateError(
        id,
        "reviewing",
        session.state,
      );
    }

    if (session.state !== "reviewing") {
      throw new InvalidSessionStateError(id, "reviewing", session.state);
    }

    const feedbackEntry: UserFeedback = {
      type: feedback.type,
      message: feedback.message,
      modifiedPlan: feedback.modifiedPlan,
      timestamp: new Date().toISOString(),
    };

    await this.store.addFeedback(id, feedbackEntry);

    switch (feedback.type) {
      case "confirm":
        await this.transitionState(id, "confirmed");
        break;

      case "modify":
        if (feedback.modifiedPlan) {
          await this.store.updatePlan(id, feedback.modifiedPlan);
        }
        await this.transitionState(id, "confirmed");
        break;

      case "reject":
        await this.transitionState(id, "cancelled");
        break;

      case "regenerate":
        await this.transitionState(id, "planning");
        break;
    }

    return (await this.store.getOrThrow(id))!;
  }

  /**
   * Record a step execution result.
   * If all steps are done, auto-transition to completed/failed.
   */
  async recordStepResult(
    id: string,
    result: StepResult,
  ): Promise<ExecutionSession> {
    const session = await this.store.getOrThrow(id);

    if (session.state !== "executing") {
      throw new InvalidSessionStateError(id, "executing", session.state);
    }

    await this.store.addStepResult(id, result);

    return (await this.store.getOrThrow(id))!;
  }

  /**
   * Complete a session (all steps done successfully).
   */
  async completeSession(id: string): Promise<ExecutionSession> {
    return this.transitionState(id, "completed");
  }

  /**
   * Fail a session (a step encountered an unrecoverable error).
   */
  async failSession(id: string): Promise<ExecutionSession> {
    return this.transitionState(id, "failed");
  }

  /**
   * Cancel a session (user rejected the plan).
   */
  async cancelSession(id: string): Promise<ExecutionSession> {
    return this.transitionState(id, "cancelled");
  }

  /**
   * Append messages to the conversation history.
   */
  async appendConversation(
    id: string,
    messages: ConversationMessage[],
  ): Promise<void> {
    await this.store.appendConversation(id, messages);
  }

  /**
   * Delete a session.
   */
  async deleteSession(id: string): Promise<void> {
    await this.store.delete(id);
    logger.debug(`[SessionManager] Deleted session ${id}`);
  }

  // ==================== Query Methods ====================

  /**
   * List sessions with filtering.
   */
  async listSessions(filter?: {
    type?: SessionType;
    state?: SessionState;
    limit?: number;
    offset?: number;
  }) {
    return this.store.list(filter);
  }

  /**
   * Get active sessions (planning, reviewing, confirmed, or executing).
   */
  async getActiveSessions(): Promise<ExecutionSession[]> {
    return this.store.listActive();
  }

  /**
   * Clean up old sessions.
   */
  async cleanupOldSessions(maxAgeMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    return this.store.cleanup(maxAgeMs);
  }
}

// ==================== Singleton ====================

let sessionManagerInstance: SessionManager | null = null;

export function getSessionManager(): SessionManager {
  if (!sessionManagerInstance) {
    sessionManagerInstance = new SessionManager();
  }
  return sessionManagerInstance;
}
