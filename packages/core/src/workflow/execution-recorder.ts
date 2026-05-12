/**
 * Workflow Execution Recorder
 *
 * Records workflow execution history to SQLite for persistence.
 * Provides query capabilities for execution history, statistics, and debugging.
 *
 * Schema:
 *   - workflow_executions: one row per workflow execution
 *   - step_executions: one row per step within an execution
 */

import { logger } from "../core/logger.js";
import type { Workflow, WorkflowStep } from "./types.js";
import { getInTorchDir } from "../utils/paths.js";
import path from "path";
import fs from "fs/promises";

// ==================== Types ====================

export interface WorkflowExecutionRecord {
  id: string;
  workflowId: string;
  workflowName: string;
  status: "running" | "success" | "failed" | "cancelled";
  startedAt: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  totalSteps: number;
  completedSteps: number;
  failedSteps: number;
  /** JSON string of input parameters */
  inputs?: string;
  /** JSON string of final output */
  output?: string;
}

export interface StepExecutionRecord {
  id: string;
  executionId: string;
  stepId: string;
  stepIndex: number;
  toolName: string;
  serverName?: string;
  status: "pending" | "running" | "success" | "failed" | "skipped";
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  error?: string;
  /** JSON string of input parameters */
  input?: string;
  /** JSON string of output result */
  output?: string;
}

export interface ExecutionQuery {
  workflowId?: string;
  workflowName?: string;
  status?: string;
  limit?: number;
  offset?: number;
  sortBy?: "startedAt" | "durationMs";
  sortOrder?: "asc" | "desc";
}

export interface ExecutionStats {
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  averageDurationMs: number;
  totalStepsExecuted: number;
  totalStepsFailed: number;
}

// ==================== Execution Recorder ====================

export class ExecutionRecorder {
  private dbPath: string;
  private db: any = null;
  private initialized = false;

  constructor() {
    this.dbPath = path.join(getInTorchDir(), "executions.db");
  }

  /**
   * Initialize the SQLite database and create tables if needed
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      // Dynamically import better-sqlite3
      const Database = (await import("better-sqlite3")).default;
      this.db = new Database(this.dbPath);

      // Enable WAL mode for better concurrent access
      this.db.pragma("journal_mode = WAL");

      // Create tables
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS workflow_executions (
          id TEXT PRIMARY KEY,
          workflow_id TEXT NOT NULL,
          workflow_name TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'running',
          started_at TEXT NOT NULL,
          completed_at TEXT,
          duration_ms INTEGER,
          error TEXT,
          total_steps INTEGER NOT NULL DEFAULT 0,
          completed_steps INTEGER NOT NULL DEFAULT 0,
          failed_steps INTEGER NOT NULL DEFAULT 0,
          inputs TEXT,
          output TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS step_executions (
          id TEXT PRIMARY KEY,
          execution_id TEXT NOT NULL,
          step_id TEXT NOT NULL,
          step_index INTEGER NOT NULL,
          tool_name TEXT NOT NULL,
          server_name TEXT,
          status TEXT NOT NULL DEFAULT 'pending',
          started_at TEXT,
          completed_at TEXT,
          duration_ms INTEGER,
          error TEXT,
          input TEXT,
          output TEXT,
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          FOREIGN KEY (execution_id) REFERENCES workflow_executions(id)
        );

        CREATE INDEX IF NOT EXISTS idx_step_executions_execution_id
          ON step_executions(execution_id);

        CREATE INDEX IF NOT EXISTS idx_workflow_executions_workflow_id
          ON workflow_executions(workflow_id);

        CREATE INDEX IF NOT EXISTS idx_workflow_executions_status
          ON workflow_executions(status);

        CREATE INDEX IF NOT EXISTS idx_workflow_executions_started_at
          ON workflow_executions(started_at);
      `);

      this.initialized = true;
      logger.debug(`[ExecutionRecorder] Initialized at ${this.dbPath}`);
    } catch (error: any) {
      logger.warn(
        `[ExecutionRecorder] Failed to initialize SQLite (better-sqlite3 may not be installed): ${error.message}`,
      );
      logger.warn(
        "[ExecutionRecorder] Execution recording will be disabled. Install better-sqlite3 to enable.",
      );
      this.db = null;
    }
  }

  /**
   * Check if the recorder is available
   */
  isAvailable(): boolean {
    return this.db !== null && this.initialized;
  }

  /**
   * Start recording a workflow execution
   */
  async startExecution(
    executionId: string,
    workflow: Workflow,
    inputs?: Record<string, any>,
  ): Promise<void> {
    await this.initialize();
    if (!this.isAvailable()) return;

    try {
      const stmt = this.db.prepare(`
        INSERT INTO workflow_executions (id, workflow_id, workflow_name, status, started_at, total_steps, inputs)
        VALUES (?, ?, ?, 'running', ?, ?, ?)
      `);

      stmt.run(
        executionId,
        workflow.id || "unknown",
        workflow.name,
        new Date().toISOString(),
        workflow.steps?.length || 0,
        inputs ? JSON.stringify(inputs) : null,
      );
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to start execution: ${error.message}`,
      );
    }
  }

  /**
   * Complete a workflow execution with final status
   */
  async completeExecution(
    executionId: string,
    status: "success" | "failed" | "cancelled",
    error?: string,
    output?: any,
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const completedAt = new Date().toISOString();

      // Get the startedAt to calculate duration
      const record = this.getExecution(executionId);
      const startedAt = record?.startedAt
        ? new Date(record.startedAt).getTime()
        : Date.now();
      const durationMs = Date.now() - startedAt;

      const stmt = this.db.prepare(`
        UPDATE workflow_executions
        SET status = ?, completed_at = ?, duration_ms = ?, error = ?, output = ?
        WHERE id = ?
      `);

      stmt.run(
        status,
        completedAt,
        durationMs,
        error || null,
        output ? JSON.stringify(output) : null,
        executionId,
      );
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to complete execution: ${error.message}`,
      );
    }
  }

  /**
   * Record a step execution start
   */
  async startStep(
    executionId: string,
    step: WorkflowStep,
    stepIndex: number,
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const stepExecutionId = `${executionId}_step_${stepIndex}`;
      const stmt = this.db.prepare(`
        INSERT INTO step_executions (id, execution_id, step_id, step_index, tool_name, server_name, status, started_at, input)
        VALUES (?, ?, ?, ?, ?, ?, 'running', ?, ?)
      `);

      stmt.run(
        stepExecutionId,
        executionId,
        step.id,
        stepIndex,
        step.toolName,
        step.serverName || step.serverId || null,
        new Date().toISOString(),
        JSON.stringify(step.parameters),
      );
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to start step: ${error.message}`,
      );
    }
  }

  /**
   * Complete a step execution
   */
  async completeStep(
    executionId: string,
    stepIndex: number,
    status: "success" | "failed" | "skipped",
    result?: any,
    error?: string,
  ): Promise<void> {
    if (!this.isAvailable()) return;

    try {
      const stepExecutionId = `${executionId}_step_${stepIndex}`;
      const completedAt = new Date().toISOString();

      // Get startedAt to calculate duration
      const stepRecord = this.getStepExecution(stepExecutionId);
      const startedAt = stepRecord?.startedAt
        ? new Date(stepRecord.startedAt).getTime()
        : Date.now();
      const durationMs = Date.now() - startedAt;

      const stmt = this.db.prepare(`
        UPDATE step_executions
        SET status = ?, completed_at = ?, duration_ms = ?, output = ?, error = ?
        WHERE id = ?
      `);

      stmt.run(
        status,
        completedAt,
        durationMs,
        result ? JSON.stringify(result) : null,
        error || null,
        stepExecutionId,
      );

      // Update parent execution counters
      if (status === "success") {
        this.db.prepare(`
          UPDATE workflow_executions
          SET completed_steps = completed_steps + 1
          WHERE id = ?
        `).run(executionId);
      } else if (status === "failed") {
        this.db.prepare(`
          UPDATE workflow_executions
          SET failed_steps = failed_steps + 1
          WHERE id = ?
        `).run(executionId);
      }
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to complete step: ${error.message}`,
      );
    }
  }

  /**
   * Get a workflow execution record
   */
  getExecution(executionId: string): WorkflowExecutionRecord | null {
    if (!this.isAvailable()) return null;

    try {
      const row = this.db
        .prepare("SELECT * FROM workflow_executions WHERE id = ?")
        .get(executionId);

      if (!row) return null;

      return this.mapExecutionRow(row);
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to get execution: ${error.message}`,
      );
      return null;
    }
  }

  /**
   * Get step execution records for a workflow execution
   */
  getStepExecutions(executionId: string): StepExecutionRecord[] {
    if (!this.isAvailable()) return [];

    try {
      const rows = this.db
        .prepare(
          "SELECT * FROM step_executions WHERE execution_id = ? ORDER BY step_index ASC",
        )
        .all(executionId);

      return rows.map(this.mapStepExecutionRow);
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to get step executions: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Query workflow executions with filters
   */
  queryExecutions(query: ExecutionQuery = {}): WorkflowExecutionRecord[] {
    if (!this.isAvailable()) return [];

    try {
      let sql = "SELECT * FROM workflow_executions WHERE 1=1";
      const params: any[] = [];

      if (query.workflowId) {
        sql += " AND workflow_id = ?";
        params.push(query.workflowId);
      }

      if (query.workflowName) {
        sql += " AND workflow_name LIKE ?";
        params.push(`%${query.workflowName}%`);
      }

      if (query.status) {
        sql += " AND status = ?";
        params.push(query.status);
      }

      // Sorting
      const sortBy = query.sortBy === "durationMs" ? "duration_ms" : "started_at";
      const sortOrder = query.sortOrder === "asc" ? "ASC" : "DESC";
      sql += ` ORDER BY ${sortBy} ${sortOrder}`;

      // Pagination
      const limit = query.limit || 50;
      const offset = query.offset || 0;
      sql += " LIMIT ? OFFSET ?";
      params.push(limit, offset);

      const rows = this.db.prepare(sql).all(...params);
      return rows.map(this.mapExecutionRow);
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to query executions: ${error.message}`,
      );
      return [];
    }
  }

  /**
   * Get execution statistics
   */
  getStats(): ExecutionStats {
    if (!this.isAvailable()) {
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDurationMs: 0,
        totalStepsExecuted: 0,
        totalStepsFailed: 0,
      };
    }

    try {
      const stats = this.db
        .prepare(`
          SELECT
            COUNT(*) as total,
            SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as successful,
            SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
            AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms ELSE 0 END) as avg_duration,
            SUM(completed_steps) as total_steps,
            SUM(failed_steps) as total_failed
          FROM workflow_executions
        `)
        .get();

      return {
        totalExecutions: stats.total || 0,
        successfulExecutions: stats.successful || 0,
        failedExecutions: stats.failed || 0,
        averageDurationMs: Math.round(stats.avg_duration || 0),
        totalStepsExecuted: stats.total_steps || 0,
        totalStepsFailed: stats.total_failed || 0,
      };
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to get stats: ${error.message}`,
      );
      return {
        totalExecutions: 0,
        successfulExecutions: 0,
        failedExecutions: 0,
        averageDurationMs: 0,
        totalStepsExecuted: 0,
        totalStepsFailed: 0,
      };
    }
  }

  /**
   * Delete old execution records
   */
  async cleanOldExecutions(maxAgeDays: number = 30): Promise<number> {
    if (!this.isAvailable()) return 0;

    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - maxAgeDays);
      const cutoffStr = cutoffDate.toISOString();

      // Delete step executions first (foreign key)
      const deleteSteps = this.db.prepare(`
        DELETE FROM step_executions
        WHERE execution_id IN (
          SELECT id FROM workflow_executions WHERE started_at < ?
        )
      `);
      deleteSteps.run(cutoffStr);

      // Delete workflow executions
      const result = this.db
        .prepare("DELETE FROM workflow_executions WHERE started_at < ?")
        .run(cutoffStr);

      return result.changes;
    } catch (error: any) {
      logger.error(
        `[ExecutionRecorder] Failed to clean old executions: ${error.message}`,
      );
      return 0;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.initialized = false;
    }
  }

  // ==================== Private Helpers ====================

  private getStepExecution(
    stepExecutionId: string,
  ): StepExecutionRecord | null {
    try {
      const row = this.db
        .prepare("SELECT * FROM step_executions WHERE id = ?")
        .get(stepExecutionId);
      return row ? this.mapStepExecutionRow(row) : null;
    } catch {
      return null;
    }
  }

  private mapExecutionRow(row: any): WorkflowExecutionRecord {
    return {
      id: row.id,
      workflowId: row.workflow_id,
      workflowName: row.workflow_name,
      status: row.status,
      startedAt: row.started_at,
      completedAt: row.completed_at || undefined,
      durationMs: row.duration_ms || undefined,
      error: row.error || undefined,
      totalSteps: row.total_steps,
      completedSteps: row.completed_steps,
      failedSteps: row.failed_steps,
      inputs: row.inputs || undefined,
      output: row.output || undefined,
    };
  }

  private mapStepExecutionRow(row: any): StepExecutionRecord {
    return {
      id: row.id,
      executionId: row.execution_id,
      stepId: row.step_id,
      stepIndex: row.step_index,
      toolName: row.tool_name,
      serverName: row.server_name || undefined,
      status: row.status,
      startedAt: row.started_at || undefined,
      completedAt: row.completed_at || undefined,
      durationMs: row.duration_ms || undefined,
      error: row.error || undefined,
      input: row.input || undefined,
      output: row.output || undefined,
    };
  }
}

// Singleton instance
let executionRecorder: ExecutionRecorder | null = null;

export function getExecutionRecorder(): ExecutionRecorder {
  if (!executionRecorder) {
    executionRecorder = new ExecutionRecorder();
  }
  return executionRecorder;
}
