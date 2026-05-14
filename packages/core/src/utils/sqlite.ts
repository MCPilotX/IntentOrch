/**
 * SQLite Database Manager
 *
 * Provides a unified SQLite database layer for IntentOrch using @libsql/client.
 * Features:
 * - Singleton database instance with WAL mode for concurrent access
 * - Automatic schema creation and migration
 * - Repository pattern interfaces for type-safe data access
 * - Transaction support
 * - Data migration from legacy JSON files
 */

import { createClient } from "@libsql/client";
import type { InArgs, InValue } from "@libsql/client";
import path from "path";
import fs from "fs";
import { getInTorchDir } from "./paths.js";
import { logger } from "../core/logger.js";

// ==================== Database Schema Version ====================

const SCHEMA_SQL = `
-- Schema version tracking
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== 1. Global Configuration ====================
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- ==================== 2. Encrypted Secrets ====================
CREATE TABLE IF NOT EXISTS secrets (
  name            TEXT PRIMARY KEY,
  encrypted_value BLOB NOT NULL,
  iv              BLOB NOT NULL,
  auth_tag        BLOB NOT NULL,
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== 3. Process Management ====================
CREATE TABLE IF NOT EXISTS processes (
  pid            INTEGER PRIMARY KEY,
  server_name    TEXT NOT NULL,
  name           TEXT NOT NULL,
  version        TEXT NOT NULL,
  manifest       TEXT NOT NULL,
  start_time     INTEGER NOT NULL,
  status         TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'stopped', 'error')),
  port           INTEGER,
  log_path       TEXT,
  external       INTEGER DEFAULT 0,
  transport_type TEXT,
  url            TEXT,
  tools          TEXT,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_processes_server_name ON processes(server_name);
CREATE INDEX IF NOT EXISTS idx_processes_status ON processes(status);

-- ==================== 4. Tool Registry ====================
CREATE TABLE IF NOT EXISTS tools (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  name                  TEXT NOT NULL,
  description           TEXT NOT NULL DEFAULT '',
  server_name           TEXT NOT NULL,
  actual_server_name    TEXT,
  parameters            TEXT,
  categories            TEXT,
  keywords              TEXT,
  requires_preprocessing INTEGER DEFAULT 0,
  is_dynamic            INTEGER DEFAULT 0,
  discovery_time        TEXT,
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(server_name, name)
);

CREATE INDEX IF NOT EXISTS idx_tools_server_name ON tools(server_name);
CREATE INDEX IF NOT EXISTS idx_tools_name ON tools(name);

-- ==================== 5. Manifest Cache ====================
CREATE TABLE IF NOT EXISTS manifest_cache (
  server_name TEXT PRIMARY KEY,
  manifest    TEXT NOT NULL,
  cached_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ==================== 6. Workflow Definitions ====================
CREATE TABLE IF NOT EXISTS workflows (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  version     TEXT NOT NULL DEFAULT '1.0',
  description TEXT,
  definition  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_workflows_name ON workflows(name);

-- ==================== 7. Workflow Execution Records ====================
CREATE TABLE IF NOT EXISTS workflow_executions (
  id          TEXT PRIMARY KEY,
  workflow_id TEXT NOT NULL REFERENCES workflows(id),
  status      TEXT NOT NULL DEFAULT 'running' CHECK(status IN ('running', 'completed', 'failed', 'cancelled')),
  input       TEXT,
  output      TEXT,
  error       TEXT,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  finished_at TEXT,
  duration_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_executions_workflow_id ON workflow_executions(workflow_id);

CREATE TABLE IF NOT EXISTS execution_steps (
  id              TEXT PRIMARY KEY,
  execution_id    TEXT NOT NULL REFERENCES workflow_executions(id),
  step_index      INTEGER NOT NULL,
  tool_name       TEXT NOT NULL,
  parameters      TEXT,
  result          TEXT,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'running', 'completed', 'failed', 'skipped')),
  error           TEXT,
  started_at      TEXT,
  finished_at     TEXT,
  duration_ms     INTEGER
);

CREATE INDEX IF NOT EXISTS idx_execution_steps_execution_id ON execution_steps(execution_id);
`;

// ==================== Database Manager ====================

export class DatabaseManager {
  private static instance: DatabaseManager | null = null;
  private db: Awaited<ReturnType<typeof createClient>> | null = null;
  private dbPath: string;
  private _initialized = false;

  private constructor() {
    this.dbPath = path.join(getInTorchDir(), "intorch.db");
  }

  static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize the database: create file, run schema, apply migrations
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    // Ensure .intorch directory exists
    const dir = getInTorchDir();
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    logger.info(`[SQLite] Initializing database at: ${this.dbPath}`);

    this.db = createClient({
      url: `file:${this.dbPath}`,
    });

    // Enable WAL mode for better concurrent read performance
    await this.db.execute("PRAGMA journal_mode=WAL");
    // Enable foreign keys
    await this.db.execute("PRAGMA foreign_keys=ON");

    // Run schema (split by semicolons to execute individually)
    const statements = SCHEMA_SQL
      .split(";")
      .map((s) => s.trim())
      .filter((s) => s.length > 0);

    for (const stmt of statements) {
      await this.db.execute(stmt + ";");
    }

    // Check and apply migrations
    await this.applyMigrations();

    this._initialized = true;
    logger.info("[SQLite] Database initialized successfully");
  }

  /**
   * Get the underlying database client
   */
  getClient(): Awaited<ReturnType<typeof createClient>> {
    if (!this.db) {
      throw new Error("Database not initialized. Call initialize() first.");
    }
    return this.db;
  }

  /**
   * Execute a query with parameters (async) - accepts unknown[] for convenience
   */
  async execute(sql: string, params?: unknown[]): Promise<void> {
    await this.getClient().execute(sql, params as InArgs);
  }

  /**
   * Execute a query and return rows (async) - accepts unknown[] for convenience
   */
  async query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]> {
    const result = await this.getClient().execute(sql, params as InArgs);
    return result.rows as unknown as T[];
  }

  /**
   * Execute a query and return the first row (async) - accepts unknown[] for convenience
   */
  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | null> {
    const rows = await this.query<T>(sql, params);
    return rows.length > 0 ? rows[0] : null;
  }

  /**
   * Execute a function within a transaction (async)
   */
  async transaction<T>(fn: () => Promise<T>): Promise<T> {
    const client = this.getClient();
    await client.execute("BEGIN IMMEDIATE");
    try {
      const result = await fn();
      await client.execute("COMMIT");
      return result;
    } catch (error) {
      await client.execute("ROLLBACK");
      throw error;
    }
  }

  /**
   * Close the database connection
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
      this._initialized = false;
      logger.info("[SQLite] Database connection closed");
    }
  }

  /**
   * Apply pending schema migrations
   */
  private async applyMigrations(): Promise<void> {
    const currentVersion = await this.getCurrentVersion();

    if (currentVersion < 1) {
      // Version 1 is the initial schema, already applied above
      await this.setVersion(1);
    }

    // Future migrations:
    // if (currentVersion < 2) { ... await this.setVersion(2); }
  }

  private async getCurrentVersion(): Promise<number> {
    const row = await this.queryOne<{ version: number }>(
      "SELECT COALESCE(MAX(version), 0) as version FROM schema_version",
    );
    return row?.version ?? 0;
  }

  private async setVersion(version: number): Promise<void> {
    await this.execute(
      "INSERT INTO schema_version (version) VALUES (?)",
      [version],
    );
    logger.info(`[SQLite] Schema migrated to version ${version}`);
  }

  /**
   * Check if the database file exists
   */
  static dbFileExists(): boolean {
    const dbPath = path.join(getInTorchDir(), "intorch.db");
    return fs.existsSync(dbPath);
  }
}

// ==================== Repository Interfaces ====================

/**
 * Generic repository interface for CRUD operations
 */
export interface IRepository<T> {
  get(id: string): Promise<T | null>;
  set(id: string, value: T): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<T[]>;
}

/**
 * Configuration repository
 */
export interface IConfigRepository {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  getAll(): Promise<Record<string, string>>;
  delete(key: string): Promise<void>;
}

/**
 * Secrets repository (encrypted binary storage)
 */
export interface ISecretRepository {
  get(name: string): Promise<{ encryptedValue: Buffer; iv: Buffer; authTag: Buffer } | null>;
  set(name: string, encryptedValue: Buffer, iv: Buffer, authTag: Buffer): Promise<void>;
  list(): Promise<string[]>;
  delete(name: string): Promise<void>;
}

/**
 * Process repository
 */
export interface IProcessRepository {
  findByPid(pid: number): Promise<Record<string, unknown> | null>;
  findByServerName(serverName: string): Promise<Record<string, unknown> | null>;
  findByStatus(status: string): Promise<Record<string, unknown>[]>;
  upsert(process: Record<string, unknown>): Promise<void>;
  delete(pid: number): Promise<void>;
  list(): Promise<Record<string, unknown>[]>;
}

/**
 * Tool repository
 */
export interface IToolRepository {
  findByServerAndName(serverName: string, toolName: string): Promise<Record<string, unknown> | null>;
  findByServer(serverName: string): Promise<Record<string, unknown>[]>;
  upsert(tool: Record<string, unknown>): Promise<void>;
  deleteByServer(serverName: string): Promise<void>;
  search(keyword: string): Promise<Record<string, unknown>[]>;
  list(): Promise<Record<string, unknown>[]>;
}

/**
 * Manifest cache repository
 */
export interface IManifestCacheRepository {
  get(serverName: string): Promise<Record<string, unknown> | null>;
  set(serverName: string, manifest: Record<string, unknown>): Promise<void>;
  delete(serverName: string): Promise<void>;
  list(): Promise<string[]>;
  clear(): Promise<void>;
}

/**
 * Workflow repository
 */
export interface IWorkflowRepository {
  get(id: string): Promise<Record<string, unknown> | null>;
  findByName(name: string): Promise<Record<string, unknown> | null>;
  upsert(workflow: Record<string, unknown>): Promise<void>;
  delete(id: string): Promise<void>;
  list(): Promise<Record<string, unknown>[]>;
}

/**
 * Workflow execution repository
 */
export interface IWorkflowExecutionRepository {
  get(id: string): Promise<Record<string, unknown> | null>;
  findByWorkflowId(workflowId: string): Promise<Record<string, unknown>[]>;
  create(execution: Record<string, unknown>): Promise<void>;
  update(id: string, updates: Record<string, unknown>): Promise<void>;
  addStep(step: Record<string, unknown>): Promise<void>;
  getSteps(executionId: string): Promise<Record<string, unknown>[]>;
}

// ==================== SQLite Repository Implementations ====================

class SqliteConfigRepository implements IConfigRepository {
  async get(key: string): Promise<string | null> {
    const row = await DatabaseManager.getInstance().queryOne<{ value: string }>(
      "SELECT value FROM config WHERE key = ?",
      [key],
    );
    return row?.value ?? null;
  }

  async set(key: string, value: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
      [key, value],
    );
  }

  async getAll(): Promise<Record<string, string>> {
    const rows = await DatabaseManager.getInstance().query<{ key: string; value: string }>(
      "SELECT key, value FROM config",
    );
    const result: Record<string, string> = {};
    for (const row of rows) {
      result[row.key] = row.value;
    }
    return result;
  }

  async delete(key: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM config WHERE key = ?",
      [key],
    );
  }
}

class SqliteSecretRepository implements ISecretRepository {
  async get(name: string): Promise<{ encryptedValue: Buffer; iv: Buffer; authTag: Buffer } | null> {
    const row = await DatabaseManager.getInstance().queryOne<{
      encrypted_value: Uint8Array;
      iv: Uint8Array;
      auth_tag: Uint8Array;
    }>(
      "SELECT encrypted_value, iv, auth_tag FROM secrets WHERE name = ?",
      [name],
    );
    if (!row) return null;
    return {
      encryptedValue: Buffer.from(row.encrypted_value),
      iv: Buffer.from(row.iv),
      authTag: Buffer.from(row.auth_tag),
    };
  }

  async set(name: string, encryptedValue: Buffer, iv: Buffer, authTag: Buffer): Promise<void> {
    await DatabaseManager.getInstance().execute(
      `INSERT OR REPLACE INTO secrets (name, encrypted_value, iv, auth_tag, updated_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [name, encryptedValue, iv, authTag],
    );
  }

  async list(): Promise<string[]> {
    const rows = await DatabaseManager.getInstance().query<{ name: string }>(
      "SELECT name FROM secrets ORDER BY name",
    );
    return rows.map((r) => r.name);
  }

  async delete(name: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM secrets WHERE name = ?",
      [name],
    );
  }
}

class SqliteProcessRepository implements IProcessRepository {
  async findByPid(pid: number): Promise<Record<string, unknown> | null> {
    return DatabaseManager.getInstance().queryOne(
      "SELECT * FROM processes WHERE pid = ?",
      [pid],
    );
  }

  async findByServerName(serverName: string): Promise<Record<string, unknown> | null> {
    return DatabaseManager.getInstance().queryOne(
      "SELECT * FROM processes WHERE server_name = ? AND status = 'running' ORDER BY updated_at DESC LIMIT 1",
      [serverName],
    );
  }

  async findByStatus(status: string): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM processes WHERE status = ? ORDER BY start_time DESC",
      [status],
    );
  }

  async upsert(process: Record<string, unknown>): Promise<void> {
    const db = DatabaseManager.getInstance();
    await db.execute(
      `INSERT OR REPLACE INTO processes
       (pid, server_name, name, version, manifest, start_time, status, port, log_path,
        external, transport_type, url, tools, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        process.pid ?? 0,
        process.serverName ?? process.server_name ?? "",
        process.name ?? "",
        process.version ?? "",
        process.manifest ?? "{}",
        process.startTime ?? process.start_time ?? Date.now(),
        process.status ?? "running",
        process.port ?? null,
        process.logPath ?? process.log_path ?? null,
        process.external ?? 0,
        process.transportType ?? process.transport_type ?? null,
        process.url ?? null,
        process.tools ?? null,
      ],
    );
  }

  async delete(pid: number): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM processes WHERE pid = ?",
      [pid],
    );
  }

  async list(): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM processes ORDER BY start_time DESC",
    );
  }
}

class SqliteToolRepository implements IToolRepository {
  async findByServerAndName(serverName: string, toolName: string): Promise<Record<string, unknown> | null> {
    return DatabaseManager.getInstance().queryOne(
      "SELECT * FROM tools WHERE server_name = ? AND name = ?",
      [serverName, toolName],
    );
  }

  async findByServer(serverName: string): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM tools WHERE server_name = ? ORDER BY name",
      [serverName],
    );
  }

  async upsert(tool: Record<string, unknown>): Promise<void> {
    await DatabaseManager.getInstance().execute(
      `INSERT OR REPLACE INTO tools
       (name, description, server_name, actual_server_name, parameters, categories,
        keywords, requires_preprocessing, is_dynamic, discovery_time, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`,
      [
        tool.name,
        tool.description ?? "",
        tool.server_name,
        tool.actual_server_name ?? null,
        tool.parameters ?? null,
        tool.categories ?? null,
        tool.keywords ?? null,
        tool.requires_preprocessing ?? 0,
        tool.is_dynamic ?? 0,
        tool.discovery_time ?? null,
      ],
    );
  }

  async deleteByServer(serverName: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM tools WHERE server_name = ?",
      [serverName],
    );
  }

  async search(keyword: string): Promise<Record<string, unknown>[]> {
    const pattern = `%${keyword}%`;
    return DatabaseManager.getInstance().query(
      `SELECT * FROM tools
       WHERE name LIKE ? OR description LIKE ? OR keywords LIKE ?
       ORDER BY name`,
      [pattern, pattern, pattern],
    );
  }

  async list(): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM tools ORDER BY server_name, name",
    );
  }
}

class SqliteManifestCacheRepository implements IManifestCacheRepository {
  async get(serverName: string): Promise<Record<string, unknown> | null> {
    const row = await DatabaseManager.getInstance().queryOne<{ manifest: string }>(
      "SELECT manifest FROM manifest_cache WHERE server_name = ?",
      [serverName],
    );
    if (!row) return null;
    return JSON.parse(row.manifest);
  }

  async set(serverName: string, manifest: Record<string, unknown>): Promise<void> {
    await DatabaseManager.getInstance().execute(
      `INSERT OR REPLACE INTO manifest_cache (server_name, manifest, cached_at)
       VALUES (?, ?, datetime('now'))`,
      [serverName, JSON.stringify(manifest)],
    );
  }

  async delete(serverName: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM manifest_cache WHERE server_name = ?",
      [serverName],
    );
  }

  async list(): Promise<string[]> {
    const rows = await DatabaseManager.getInstance().query<{ server_name: string }>(
      "SELECT server_name FROM manifest_cache ORDER BY server_name",
    );
    return rows.map((r) => r.server_name);
  }

  async clear(): Promise<void> {
    await DatabaseManager.getInstance().execute("DELETE FROM manifest_cache");
  }
}

class SqliteWorkflowRepository implements IWorkflowRepository {
  async get(id: string): Promise<Record<string, unknown> | null> {
    const row = await DatabaseManager.getInstance().queryOne<{ definition: string }>(
      "SELECT definition FROM workflows WHERE id = ?",
      [id],
    );
    if (!row) return null;
    return JSON.parse(row.definition);
  }

  async findByName(name: string): Promise<Record<string, unknown> | null> {
    const row = await DatabaseManager.getInstance().queryOne<{ definition: string }>(
      "SELECT definition FROM workflows WHERE name = ? ORDER BY updated_at DESC LIMIT 1",
      [name],
    );
    if (!row) return null;
    return JSON.parse(row.definition);
  }

  async upsert(workflow: Record<string, unknown>): Promise<void> {
    const id = workflow.id as string;
    await DatabaseManager.getInstance().execute(
      `INSERT OR REPLACE INTO workflows (id, name, version, description, definition, updated_at)
       VALUES (?, ?, ?, ?, ?, datetime('now'))`,
      [
        id,
        workflow.name ?? "",
        workflow.version ?? "1.0",
        workflow.description ?? null,
        JSON.stringify(workflow),
      ],
    );
  }

  async delete(id: string): Promise<void> {
    await DatabaseManager.getInstance().execute(
      "DELETE FROM workflows WHERE id = ?",
      [id],
    );
  }

  async list(): Promise<Record<string, unknown>[]> {
    const rows = await DatabaseManager.getInstance().query<{ definition: string }>(
      "SELECT definition FROM workflows ORDER BY updated_at DESC",
    );
    return rows.map((r) => JSON.parse(r.definition));
  }
}

class SqliteWorkflowExecutionRepository implements IWorkflowExecutionRepository {
  async get(id: string): Promise<Record<string, unknown> | null> {
    return DatabaseManager.getInstance().queryOne(
      "SELECT * FROM workflow_executions WHERE id = ?",
      [id],
    );
  }

  async findByWorkflowId(workflowId: string): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM workflow_executions WHERE workflow_id = ? ORDER BY started_at DESC",
      [workflowId],
    );
  }

  async create(execution: Record<string, unknown>): Promise<void> {
    await DatabaseManager.getInstance().execute(
      `INSERT INTO workflow_executions (id, workflow_id, status, input, started_at)
       VALUES (?, ?, ?, ?, datetime('now'))`,
      [execution.id, execution.workflow_id, execution.status, execution.input ?? null],
    );
  }

  async update(id: string, updates: Record<string, unknown>): Promise<void> {
    const setClauses: string[] = [];
    const params: unknown[] = [];

    for (const [key, value] of Object.entries(updates)) {
      setClauses.push(`${key} = ?`);
      params.push(value);
    }

    if (setClauses.length > 0) {
      params.push(id);
      await DatabaseManager.getInstance().execute(
        `UPDATE workflow_executions SET ${setClauses.join(", ")} WHERE id = ?`,
        params,
      );
    }
  }

  async addStep(step: Record<string, unknown>): Promise<void> {
    await DatabaseManager.getInstance().execute(
      `INSERT INTO execution_steps
       (id, execution_id, step_index, tool_name, parameters, status, started_at)
       VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
      [step.id, step.execution_id, step.step_index, step.tool_name, step.parameters ?? null, step.status],
    );
  }

  async getSteps(executionId: string): Promise<Record<string, unknown>[]> {
    return DatabaseManager.getInstance().query(
      "SELECT * FROM execution_steps WHERE execution_id = ? ORDER BY step_index",
      [executionId],
    );
  }
}

// ==================== Factory Functions ====================

let configRepo: IConfigRepository | null = null;
let secretRepo: ISecretRepository | null = null;
let processRepo: IProcessRepository | null = null;
let toolRepo: IToolRepository | null = null;
let manifestCacheRepo: IManifestCacheRepository | null = null;
let workflowRepo: IWorkflowRepository | null = null;
let workflowExecutionRepo: IWorkflowExecutionRepository | null = null;

export function getConfigRepository(): IConfigRepository {
  if (!configRepo) configRepo = new SqliteConfigRepository();
  return configRepo;
}

export function getSecretRepository(): ISecretRepository {
  if (!secretRepo) secretRepo = new SqliteSecretRepository();
  return secretRepo;
}

export function getProcessRepository(): IProcessRepository {
  if (!processRepo) processRepo = new SqliteProcessRepository();
  return processRepo;
}

export function getToolRepository(): IToolRepository {
  if (!toolRepo) toolRepo = new SqliteToolRepository();
  return toolRepo;
}

export function getManifestCacheRepository(): IManifestCacheRepository {
  if (!manifestCacheRepo) manifestCacheRepo = new SqliteManifestCacheRepository();
  return manifestCacheRepo;
}

export function getWorkflowRepository(): IWorkflowRepository {
  if (!workflowRepo) workflowRepo = new SqliteWorkflowRepository();
  return workflowRepo;
}

export function getWorkflowExecutionRepository(): IWorkflowExecutionRepository {
  if (!workflowExecutionRepo) workflowExecutionRepo = new SqliteWorkflowExecutionRepository();
  return workflowExecutionRepo;
}

// ==================== Legacy Compatibility ====================

/**
 * Legacy getSqliteDb() - kept for backward compatibility
 */
export function getSqliteDb(): { isReady: boolean } {
  return { isReady: DatabaseManager.getInstance().initialized };
}

/**
 * Legacy closeSqliteDb() - kept for backward compatibility
 */
export function closeSqliteDb(): void {
  DatabaseManager.getInstance().close();
}
