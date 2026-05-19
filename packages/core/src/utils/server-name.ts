import {
  toUrn,
  toDisplayString,
  toStorageFormat,
  isSameService as isSameServiceOPF,
  toOwnerProjectFormat,
} from "./owner-project-format.js";

/**
 * Server name normalization utilities
 * Ensures unique identification of MCP services
 */

/**
 * Normalize server name to ensure uniqueness (Returns URN)
 * Format: source:owner/project[@branch][:path]
 */
export function normalizeServerName(serverName: string): string {
  return toUrn(serverName);
}

/**
 * Extract display name from normalized server name
 */
export function getDisplayName(serverName: string): string {
  return toDisplayString(serverName);
}

/**
 * Generate cache key from server name
 */
export function getCacheKey(serverName: string): string {
  return toStorageFormat(serverName);
}

/**
 * Check if two server names refer to the same service
 */
export function isSameService(name1: string, name2: string): boolean {
  return isSameServiceOPF(name1, name2);
}

/**
 * Parse server name into components
 */
export interface ServerNameComponents {
  source: string;
  owner: string;
  repo: string;
  branch?: string;
  path?: string;
  original: string;
}

export function parseServerName(serverName: string): ServerNameComponents {
  const format = toOwnerProjectFormat(serverName);
  
  return {
    source: format.source,
    owner: format.owner,
    repo: format.project,
    branch: format.branch,
    path: format.path,
    original: serverName,
  };
}
