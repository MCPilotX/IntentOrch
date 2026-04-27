/**
 * AI Module Exports
 * Provides unified interface for AI functionality
 */

// Export AI functionality (legacy facade, kept for backward compatibility)
export { AI, AIError, type AskResult, type ToolCall } from './ai';
export { AIConfigManager } from './config';

// Export AIConfig from core types
export type { AIConfig } from '../core/types';

// Export Cloud LLM Intent Engine (recommended approach)
export {
  CloudIntentEngine,
  type CloudIntentEngineConfig,
  // Plan-then-Execute types
  type PlanStep,
  type ToolExecutionPlan,
  type PlanExecutionResult,
  type PlanConfirmationCallback,
} from './cloud-intent-engine';

// Export Intent Service (legacy, kept for backward compatibility)
export {
  IntentService,
  getIntentService,
  type IntentParseRequest,
  type IntentParseResponse,
} from './intent-service';

/**
 * Check AI capabilities
 * Simplified version without vector database
 */
export async function checkAICapabilities(config?: any): Promise<{
  aiAvailable: boolean;
  mode: 'api' | 'none';
}> {
  // Check if AI is configured
  const aiConfig = config || {};

  if (aiConfig.provider && aiConfig.provider !== 'none') {
    return {
      aiAvailable: true,
      mode: 'api',
    };
  }

  return {
    aiAvailable: false,
    mode: 'none',
  };
}

/**
 * Get AI system status
 */
export async function getAIStatus(config?: any) {
  const capabilities = await checkAICapabilities(config);

  return {
    ...capabilities,
    timestamp: new Date().toISOString(),
    version: '0.2.1',
    note: 'Vector database functionality has been removed. Use external AI services for semantic search.',
  };
}

/**
 * Get intent parser system status
 */
export async function getIntentParserStatus() {
  return {
    availableParsers: ['CloudIntentEngine (plan-then-execute)'],
    legacyEngines: ['EnhancedIntentEngine', 'IntentEngine', 'LLMFunctionCalling'],
    recommendedParser: 'CloudIntentEngine',
    migrationAvailable: true,
    timestamp: new Date().toISOString(),
    note: 'CloudIntentEngine with plan-then-execute is now the recommended approach.',
  };
}
