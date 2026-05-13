/**
 * Enhanced AI Service
 * 
 * Uses the apiService which provides a unified client for all backend interactions.
 * 
 * Session-based API (recommended):
 * 1. createSession(query, 'direct') -> get sessionId
 * 2. executeSession(sessionId) -> auto plan + execute
 * 
 * Interactive session API:
 * 1. createSession(query, 'interactive') -> get sessionId
 * 2. executeSession(sessionId) -> plan generated, returns for review
 * 3. sendFeedback(sessionId, 'confirm') -> confirm plan
 * 4. executeSession(sessionId) -> execute confirmed plan
 */

import { apiService } from './api';
import type { UnifiedExecutionResult, UnifiedExecutionOptions } from '@intentorch/core';
import type { SessionCreateResponse, SessionExecuteResponse, SessionListResponse, ExecutionSession } from '../types';

// ==================== Session-Based API ====================

/**
 * Create a new execution session.
 */
export async function createSession(
  query: string,
  type: 'direct' | 'interactive' = 'direct',
  metadata?: Record<string, unknown>,
): Promise<SessionCreateResponse> {
  console.log(`[AI Service] Creating ${type} session for query:`, query);
  return await apiService.createSession(query, type, metadata);
}

/**
 * Execute a session by ID.
 */
export async function executeSession(
  sessionId: string,
  options?: UnifiedExecutionOptions,
): Promise<SessionExecuteResponse> {
  console.log('[AI Service] Executing session:', sessionId);
  return await apiService.executeSession(sessionId, options);
}

/**
 * Send feedback for an interactive session.
 */
export async function sendFeedback(
  sessionId: string,
  type: string,
  message?: string,
  modifiedPlan?: Record<string, unknown>,
): Promise<ExecutionSession> {
  console.log(`[AI Service] Sending feedback for session ${sessionId}: ${type}`);
  return await apiService.sendFeedback(sessionId, type, message, modifiedPlan);
}

/**
 * Get a session by ID.
 */
export async function getSession(sessionId: string): Promise<ExecutionSession> {
  return await apiService.getSession(sessionId);
}

/**
 * List all sessions.
 */
export async function listSessions(): Promise<SessionListResponse> {
  return await apiService.listSessions();
}

/**
 * Cancel a session.
 */
export async function cancelSession(sessionId: string): Promise<ExecutionSession> {
  return await apiService.cancelSession(sessionId);
}

// ==================== Legacy API (kept for backward compatibility) ====================

/**
 * Call the unified execution service API for natural language queries
 */
export async function executeNaturalLanguage(query: string, options?: UnifiedExecutionOptions): Promise<UnifiedExecutionResult> {
  console.log('[AI Enhanced Service] Executing natural language query:', query);
  return await apiService.executeNaturalLanguage(query, options);
}

/**
 * Call the unified execution service API for intent parsing
 */
export async function parseIntent(intent: string, context?: Record<string, unknown>): Promise<UnifiedExecutionResult> {
  console.log('[AI Enhanced Service] Parsing intent:', intent);
  return await apiService.parseIntent(intent, context);
}

/**
 * Execute pre-parsed steps
 */
export async function executeSteps(steps: Record<string, unknown>[], options?: UnifiedExecutionOptions): Promise<UnifiedExecutionResult> {
  console.log('[AI Enhanced Service] Executing pre-parsed steps');
  return await apiService.executeSteps({ steps, options });
}

// Export as a single object for convenience
export const aiService = {
  // Session-based API
  createSession,
  executeSession,
  sendFeedback,
  getSession,
  listSessions,
  cancelSession,
  // Legacy API
  executeNaturalLanguage,
  parseIntent,
  executeSteps,
};
