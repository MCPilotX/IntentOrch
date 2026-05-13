/**
 * PromptRecorder — Records AI requests/responses with SQLite persistence
 *
 * Uses the existing DatabaseManager for storage.
 */

import { DatabaseManager } from "../utils/sqlite.js";
import { logger } from "../core/logger.js";
import type { AIRecord } from "./types.js";

// ==================== PromptRecorder Class ====================

export class PromptRecorder {
  private static instance: PromptRecorder;
  private records: Map<string, AIRecord> = new Map();
  private recordOrder: string[] = [];
  private maxRecords: number;
  private hooks: Array<(record: AIRecord) => void> = [];

  private constructor(maxRecords = 500) {
    this.maxRecords = maxRecords;
  }

  static getInstance(): PromptRecorder {
    if (!PromptRecorder.instance) {
      PromptRecorder.instance = new PromptRecorder();
    }
    return PromptRecorder.instance;
  }

  onRecord(hook: (record: AIRecord) => void): void {
    this.hooks.push(hook);
  }

  /**
   * Record an AI interaction. Persists to SQLite and keeps in-memory cache.
   */
  async recordAIRecord(record: AIRecord): Promise<void> {
    this.records.set(record.id, record);
    this.recordOrder.push(record.id);

    if (this.recordOrder.length > this.maxRecords) {
      const oldest = this.recordOrder.shift();
      if (oldest) this.records.delete(oldest);
    }

    // Persist to SQLite
    try {
      const db = DatabaseManager.getInstance();
      if (db.initialized) {
        const client = db.getClient();
        await client.execute(
          `INSERT OR REPLACE INTO ai_records
           (id, trace_id, timestamp, provider, model, system_prompt, user_message,
            tools_provided, raw_response, parsed_tool_calls, latency, success, error, token_usage)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            record.id,
            record.traceId || null,
            record.timestamp,
            record.provider,
            record.model,
            record.systemPrompt,
            record.userMessage,
            JSON.stringify(record.toolsProvided),
            JSON.stringify(record.rawResponse),
            JSON.stringify(record.parsedToolCalls),
            record.latency,
            record.success ? 1 : 0,
            record.error || null,
            record.tokenUsage ? JSON.stringify(record.tokenUsage) : null,
          ],
        );
      }
    } catch (err: unknown) {
      logger.warn(`[PromptRecorder] Failed to persist AI record: ${err instanceof Error ? err.message : String(err)}`);
    }

    for (const hook of this.hooks) hook(record);
  }

  /**
   * Get AI records by trace ID.
   */
  getAIRecordsByTrace(traceId: string): AIRecord[] {
    const result: AIRecord[] = [];
    for (const id of this.recordOrder) {
      const record = this.records.get(id);
      if (record && record.traceId === traceId) {
        result.push(record);
      }
    }
    return result;
  }

  /**
   * Get the latest N records.
   */
  getLatestRecords(n = 10): AIRecord[] {
    const result: AIRecord[] = [];
    const ids = [...this.recordOrder].reverse().slice(0, n);
    for (const id of ids) {
      const record = this.records.get(id);
      if (record) result.push(record);
    }
    return result;
  }

  /**
   * Get all record IDs (for API listing).
   */
  getAllRecordIds(): string[] {
    return [...this.recordOrder];
  }

  /**
   * Get a single record by ID.
   */
  getRecord(id: string): AIRecord | null {
    return this.records.get(id) || null;
  }

  /**
   * Initialize the database table for AI records.
   */
  async ensureSchema(): Promise<void> {
    try {
      const db = DatabaseManager.getInstance();
      if (!db.initialized) await db.initialize();
      const client = db.getClient();

      // Create ai_records table if not exists
      await client.execute(`CREATE TABLE IF NOT EXISTS ai_records (
        id TEXT PRIMARY KEY,
        trace_id TEXT,
        timestamp TEXT NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        system_prompt TEXT,
        user_message TEXT,
        tools_provided TEXT,
        raw_response TEXT,
        parsed_tool_calls TEXT,
        latency REAL,
        success INTEGER NOT NULL DEFAULT 1,
        error TEXT,
        token_usage TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )`);

      await client.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_records_trace_id ON ai_records(trace_id)",
      );
      await client.execute(
        "CREATE INDEX IF NOT EXISTS idx_ai_records_timestamp ON ai_records(timestamp)",
      );
    } catch (err: unknown) {
      logger.warn(`[PromptRecorder] Failed to ensure schema: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
