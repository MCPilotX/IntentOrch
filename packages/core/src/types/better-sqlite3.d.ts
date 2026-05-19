/**
 * Type declarations for better-sqlite3 (optional dependency)
 * 
 * better-sqlite3 is an optional dependency used by ExecutionRecorder
 * for persisting workflow execution history. If not installed,
 * execution recording will gracefully degrade to no-op.
 */

declare module "better-sqlite3" {
  interface Database {
    pragma(source: string): void;
    exec(source: string): void;
    prepare(sql: string): Statement;
    close(): void;
  }

  interface Statement {
    run(...params: unknown[]): { changes: number };
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  interface DatabaseConstructor {
    new (filename: string, options?: Record<string, unknown>): Database;
    (filename: string, options?: Record<string, unknown>): Database;
    default: DatabaseConstructor;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
