/**
 * Session Store
 *
 * SQLite-backed persistent storage for execution sessions.
 * Uses the existing DatabaseManager for database access.
 * Handles serialization/deserialization of complex session data.
 */

import { randomUUID } from "crypto";
import { DatabaseManager } from "../utils/sqlite.js";
import { logger } from "../core/logger.js";
import type {
  ExecutionSession,
  SessionFilter,
  SessionListResponse,
  SessionState,
  ConversationMessage,
  StepResult,
  UserFeedback,
} from "./types.js";
import { SessionNotFoundError } from "./types.js";

// ==================== Schema Extension ====================

const SESSION_TABLE_SQL = `
CREATE TABLE IF NOT EXISTS execution_sessions (
  id                   TEXT PRIMARY KEY,
  type                 TEXT NOT NULL CHECK(type IN ('direct', 'interactive')),
  state                TEXT NOT NULL DEFAULT 'planning'
                       CHECK(state IN ('planning', 'reviewing', 'confirmed', 'executing', 'completed', 'failed', 'cancelled')),
  query                TEXT NOT NULL,
  plan                 TEXT,
  conversation_history TEXT,
  step_results         TEXT,
  feedback             TEXT,
  current_turn         INTEGER NOT NULL DEFAULT 0,
  max_turns            INTEGER NOT NULL DEFAULT 5,
  metadata             TEXT,
  created_at           TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at           TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_sessions_type ON execution_sessions(type);
CREATE INDEX IF NOT EXISTS idx_sessions_state ON execution_sessions(state);
CREATE INDEX IF NOT EXISTS idx_sessions_created ON execution_sessions(created_at);
`;

// ==================== Session Store ====================

export class SessionStore {
  private db: DatabaseManager;
  private schemaApplied = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private static readonly DEFAULT_CLEANUP_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes
  private static readonly DEFAULT_SESSION_MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24 hours

  constructor() {
    this.db = DatabaseManager.getInstance();
  }

  /**
   * Start automatic periodic cleanup of old sessions.
   * Cleans up completed/failed/cancelled sessions older than maxAgeMs.
   * Runs every intervalMs.
   */
  startAutoCleanup(
    intervalMs: number = SessionStore.DEFAULT_CLEANUP_INTERVAL_MS,
    maxAgeMs: number = SessionStore.DEFAULT_SESSION_MAX_AGE_MS,
  ): void {
    if (this.cleanupTimer) {
      logger.warn("[SessionStore] Auto-cleanup already running, restarting");
      this.stopAutoCleanup();
    }

    logger.info(
      `[SessionStore] Starting auto-cleanup (interval: ${intervalMs}ms, maxAge: ${maxAgeMs}ms)`,
    );

    this.cleanupTimer = setInterval(async () => {
      try {
        const cleaned = await this.cleanup(maxAgeMs);
        if (cleaned > 0) {
          logger.info(`[SessionStore] Auto-cleanup removed ${cleaned} old sessions`);
        }
      } catch (error: unknown) {
        logger.error(`[SessionStore] Auto-cleanup error: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }, intervalMs);

    // Allow the timer to not block process exit
    if (this.cleanupTimer && typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      (this.cleanupTimer as NodeJS.Timeout).unref();
    }
  }

  /**
   * Stop automatic periodic cleanup.
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug("[SessionStore] Auto-cleanup stopped");
    }
  }

  /**
   * Ensure the session table schema exists.
   * Called lazily on first operation to avoid ordering issues during initialization.
   */
  private async ensureSchema(): Promise<void> {
    if (this.schemaApplied) return;

    // Ensure database is initialized before executing schema
    await this.db.initialize();

    const statements = SESSION_TABLE_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await this.db.execute(stmt + ";");
    }

    this.schemaApplied = true;
    logger.debug("[SessionStore] Schema ensured");
  }

  // ==================== CRUD Operations ====================

  /**
   * Create a new session and persist it.
   */
  async create(session: Partial<ExecutionSession> & { query: string; type: "direct" | "interactive" }): Promise<ExecutionSession> {
    await this.ensureSchema();

    const id = session.id || randomUUID();
    const now = new Date().toISOString();

    const newSession: ExecutionSession = {
      id,
      type: session.type,
      state: "planning",
      query: session.query,
      plan: null,
      conversationHistory: [],
      stepResults: [],
      feedback: [],
      currentTurn: 0,
      maxTurns: session.maxTurns || 5,
      createdAt: now,
      updatedAt: now,
      metadata: session.metadata || {},
    };

    await this.db.execute(
      `INSERT INTO execution_sessions
       (id, type, state, query, plan, conversation_history, step_results, feedback,
        current_turn, max_turns, metadata, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        newSession.id,
        newSession.type,
        newSession.state,
        newSession.query,
        null,
        JSON.stringify([]),
        JSON.stringify([]),
        JSON.stringify([]),
        newSession.currentTurn,
        newSession.maxTurns,
        JSON.stringify(newSession.metadata),
        newSession.createdAt,
        newSession.updatedAt,
      ],
    );

    logger.debug(`[SessionStore] Created session ${id} (${session.type})`);
    return newSession;
  }

  /**
   * Retrieve a session by ID.
   */
  async get(id: string): Promise<ExecutionSession | null> {
    await this.ensureSchema();

    const row = await this.db.queryOne<Record<string, unknown>>(
      "SELECT * FROM execution_sessions WHERE id = ?",
      [id],
    );

    if (!row) return null;
    return this.rowToSession(row);
  }

  /**
   * Get a session or throw if not found.
   */
  async getOrThrow(id: string): Promise<ExecutionSession> {
    const session = await this.get(id);
    if (!session) {
      throw new SessionNotFoundError(id);
    }
    return session;
  }

  /**
   * Update session state.
   */
  async updateState(id: string, state: ExecutionSession["state"]): Promise<void> {
    await this.ensureSchema();
    await this.db.execute(
      "UPDATE execution_sessions SET state = ?, updated_at = datetime('now') WHERE id = ?",
      [state, id],
    );
  }

  /**
   * Update the execution plan for a session.
   */
  async updatePlan(id: string, plan: ExecutionSession["plan"]): Promise<void> {
    await this.ensureSchema();
    await this.db.execute(
      "UPDATE execution_sessions SET plan = ?, updated_at = datetime('now') WHERE id = ?",
      [plan ? JSON.stringify(plan) : null, id],
    );
  }

  /**
   * Append messages to the conversation history.
   */
  async appendConversation(id: string, messages: ConversationMessage[]): Promise<void> {
    await this.ensureSchema();

    const session = await this.getOrThrow(id);
    const updatedHistory = [...session.conversationHistory, ...messages];

    await this.db.execute(
      "UPDATE execution_sessions SET conversation_history = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updatedHistory), id],
    );
  }

  /**
   * Add a step result to the session.
   */
  async addStepResult(id: string, result: StepResult): Promise<void> {
    await this.ensureSchema();

    const session = await this.getOrThrow(id);
    const updatedResults = [...session.stepResults, result];

    await this.db.execute(
      "UPDATE execution_sessions SET step_results = ?, current_turn = current_turn + 1, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updatedResults), id],
    );
  }

  /**
   * Add user feedback to an interactive session.
   */
  async addFeedback(id: string, feedback: UserFeedback): Promise<void> {
    await this.ensureSchema();

    const session = await this.getOrThrow(id);
    const updatedFeedback = [...session.feedback, feedback];

    await this.db.execute(
      "UPDATE execution_sessions SET feedback = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(updatedFeedback), id],
    );
  }

  /**
   * Update session metadata.
   */
  async updateMetadata(id: string, metadata: Record<string, unknown>): Promise<void> {
    await this.ensureSchema();
    await this.db.execute(
      "UPDATE execution_sessions SET metadata = ?, updated_at = datetime('now') WHERE id = ?",
      [JSON.stringify(metadata), id],
    );
  }

  /**
   * Delete a session.
   */
  async delete(id: string): Promise<void> {
    await this.ensureSchema();
    await this.db.execute(
      "DELETE FROM execution_sessions WHERE id = ?",
      [id],
    );
  }

  // ==================== Query Operations ====================

  /**
   * List sessions with optional filtering and pagination.
   */
  async list(filter?: SessionFilter): Promise<SessionListResponse> {
    await this.ensureSchema();

    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter?.type) {
      conditions.push("type = ?");
      params.push(filter.type);
    }

    if (filter?.state) {
      conditions.push("state = ?");
      params.push(filter.state);
    }

    const whereClause = conditions.length > 0
      ? `WHERE ${conditions.join(" AND ")}`
      : "";

    const sortBy = filter?.sortBy === "updatedAt" ? "updated_at" : "created_at";
    const sortOrder = filter?.sortOrder === "asc" ? "ASC" : "DESC";
    const limit = filter?.limit || 50;
    const offset = filter?.offset || 0;

    // Get total count
    const countRow = await this.db.queryOne<{ total: number }>(
      `SELECT COUNT(*) as total FROM execution_sessions ${whereClause}`,
      params,
    );
    const total = countRow?.total ?? 0;

    // Get paginated results
    const rows = await this.db.query<Record<string, unknown>>(
      `SELECT * FROM execution_sessions ${whereClause} ORDER BY ${sortBy} ${sortOrder} LIMIT ? OFFSET ?`,
      [...params, limit, offset],
    );

    const sessions = rows.map((row) => this.rowToSession(row));

    return {
      sessions,
      total,
      hasMore: offset + limit < total,
    };
  }

  /**
   * List active (running) sessions — includes planning, reviewing, confirmed, and executing.
   */
  async listActive(): Promise<ExecutionSession[]> {
    const activeStates: SessionState[] = ["planning", "reviewing", "confirmed", "executing"];
    const results = await Promise.all(
      activeStates.map((state) =>
        this.list({ state, limit: 100 }).then((r) => r.sessions),
      ),
    );
    return results.flat();
  }

  /**
   * Clean up old completed/failed/cancelled sessions.
   * Returns the number of deleted sessions.
   */
  async cleanup(maxAgeMs: number): Promise<number> {
    await this.ensureSchema();

    const cutoff = new Date(Date.now() - maxAgeMs).toISOString();

    const result = await this.db.query<{ count: number }>(
      `SELECT COUNT(*) as count FROM execution_sessions
       WHERE state IN ('completed', 'failed', 'cancelled')
       AND updated_at < ?`,
      [cutoff],
    );

    const count = result[0]?.count ?? 0;

    if (count > 0) {
      await this.db.execute(
        `DELETE FROM execution_sessions
         WHERE state IN ('completed', 'failed', 'cancelled')
         AND updated_at < ?`,
        [cutoff],
      );
      logger.info(`[SessionStore] Cleaned up ${count} old sessions`);
    }

    return count;
  }

  // ==================== Serialization Helpers ====================

  private rowToSession(row: Record<string, unknown>): ExecutionSession {
    return {
      id: row.id as string,
      type: row.type as "direct" | "interactive",
      state: row.state as ExecutionSession["state"],
      query: row.query as string,
      plan: row.plan ? JSON.parse(row.plan as string) : null,
      conversationHistory: row.conversation_history
        ? JSON.parse(row.conversation_history as string)
        : [],
      stepResults: row.step_results
        ? JSON.parse(row.step_results as string)
        : [],
      feedback: row.feedback
        ? JSON.parse(row.feedback as string)
        : [],
      currentTurn: (row.current_turn as number) || 0,
      maxTurns: (row.max_turns as number) || 5,
      createdAt: row.created_at as string,
      updatedAt: row.updated_at as string,
      metadata: row.metadata
        ? JSON.parse(row.metadata as string)
        : {},
    };
  }
}

// ==================== Singleton ====================

let sessionStoreInstance: SessionStore | null = null;

export function getSessionStore(): SessionStore {
  if (!sessionStoreInstance) {
    sessionStoreInstance = new SessionStore();
  }
  return sessionStoreInstance;
}
