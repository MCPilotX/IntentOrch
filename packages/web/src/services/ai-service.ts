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

/**
 * Step stream event from SSE
 */
export interface StepStreamEvent {
  type: 'step_result' | 'complete' | 'error';
  toolName?: string;
  success?: boolean;
  result?: unknown;
  error?: string;
  duration?: number;
  stepIndex?: number;
  totalSteps?: number;
}

/**
 * Execute natural language query with SSE streaming.
 * Calls onStep for each step result, and onComplete when done.
 */
export function executeNaturalLanguageStream(
  query: string,
  onStep: (event: StepStreamEvent) => void,
  options?: UnifiedExecutionOptions,
): Promise<{ success: boolean; result?: unknown; error?: string }> {
  const API_BASE_URL = (typeof window !== 'undefined' && window.location?.hostname)
    ? `${window.location.protocol}//${window.location.hostname}:9658`
    : 'http://localhost:9658';
  const url = `${API_BASE_URL}/api/execute/natural-language-stream`;

  return new Promise((resolve, reject) => {
    fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, options }),
    }).then(async (response) => {
      if (!response.ok) {
        const text = await response.text();
        reject(new Error(text));
        return;
      }

      const reader = response.body?.getReader();
      if (!reader) {
        reject(new Error('No response body'));
        return;
      }

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') continue;

          try {
            const event = JSON.parse(data) as StepStreamEvent;
            onStep(event);

            if (event.type === 'complete') {
              resolve({
                success: event.success || false,
                result: event.result,
                error: event.error,
              });
              return;
            }
            if (event.type === 'error') {
              resolve({ success: false, error: event.error });
              return;
            }
          } catch {
            // Ignore parse errors
          }
        }
      }

      resolve({ success: true });
    }).catch(reject);
  });
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
