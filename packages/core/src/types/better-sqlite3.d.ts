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
    run(...params: any[]): { changes: number };
    get(...params: any[]): any;
    all(...params: any[]): any[];
  }

  interface DatabaseConstructor {
    new (filename: string, options?: any): Database;
    (filename: string, options?: any): Database;
    default: DatabaseConstructor;
  }

  const Database: DatabaseConstructor;
  export default Database;
}
