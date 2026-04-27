/**
 * SQLite database module (deprecated)
 * 
 * This module previously provided SQLite database initialization with sqlite-vss
 * vector search extension. It has been removed as it was unused — the LLM
 * function calling approach has replaced the need for local vector search.
 * 
 * The exports are kept as no-ops for backward compatibility.
 */

import { logger } from '../core/logger';

export function getSqliteDb(): null {
  logger.debug('[SQLite] sqlite-vss has been removed (unused)');
  return null;
}

export function closeSqliteDb(): void {
  // No-op: sqlite-vss has been removed
}
