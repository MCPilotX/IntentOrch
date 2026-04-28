/**
 * Enhanced AI Service
 * 
 * Uses the apiService which provides a unified client for all backend interactions.
 */

import { apiService } from './api';
import type { UnifiedExecutionResult, UnifiedExecutionOptions } from '@intentorch/core';

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
export async function parseIntent(intent: string, context?: any): Promise<UnifiedExecutionResult> {
  console.log('[AI Enhanced Service] Parsing intent:', intent);
  return await apiService.parseIntent(intent, context);
}

/**
 * Execute pre-parsed steps
 */
export async function executeSteps(steps: any[], options?: UnifiedExecutionOptions): Promise<UnifiedExecutionResult> {
  console.log('[AI Enhanced Service] Executing pre-parsed steps');
  return await apiService.executeSteps({ steps, options });
}

// Export as a single object for convenience
export const aiService = {
  executeNaturalLanguage,
  parseIntent,
  executeSteps
};
