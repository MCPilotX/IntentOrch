/**
 * AI Module Exports
 * Provides unified interface for AI functionality
 */

// Export AI functionality
export { AI, AIError, type AskResult, type ToolCall } from './ai';
export { AIConfigManager } from './config';
export { AICommand } from './ai-command';

// Export AIConfig from core types
export type { AIConfig } from '../core/types';

// Export Cloud LLM Intent Engine
export {
  CloudIntentEngine,
  type CloudIntentEngineConfig,
  type AtomicIntent,
  type DependencyEdge,
  type IntentParseResult,
  type ToolSelectionResult,
  type ExecutionContext,
  type ExecutionResult,
  // Enhanced types for user access
  type EnhancedExecutionStep,
  type WorkflowPlan,
  type EnhancedExecutionResult,
} from './cloud-intent-engine';

// Export Intent Service
export {
  IntentService,
  getIntentService,
  type IntentParseRequest,
  type IntentParseResponse,
} from './intent-service';

// New Intent Parser Architecture (Recommended)
export {
  // Core interfaces and types
  type IntentResult,
  type IntentParser,
  type ParserContext,
  type ParserType,
  type ParserConfig,
  type ParserSelectionStrategy,

  // Parser implementations
  RuleBasedParser,
  HybridAIParser,
  type HybridAIParserConfig,

  // Factory and selector
  IntentParserFactory,
  type ParserFactoryConfig,
  IntentParserSelector,
  type ParserSelectorConfig,
  type SelectionResult,

  // Utilities
  IntentParserUtils,
  IntentParserExamples,
} from './intent-parser-index';

// Legacy exports (for backward compatibility - DEPRECATED)
/** @deprecated Use EnhancedIntentEngineAdapter or HybridAIParser instead */
export { EnhancedIntentEngineAdapter as EnhancedIntentEngine } from './legacy-adapters';
/** @deprecated Use IntentEngineAdapter or RuleBasedParser instead */
export { IntentEngineAdapter as IntentEngine } from './legacy-adapters';

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
  const availableParsers = ['RuleBasedParser', 'HybridAIParser'];
  const legacyEngines = ['EnhancedIntentEngine', 'IntentEngine'];

  return {
    availableParsers,
    legacyEngines,
    recommendedParser: 'HybridAIParser',
    migrationAvailable: true,
    timestamp: new Date().toISOString(),
    note: 'New intent parser architecture eliminates code duplication and provides true AI integration.',
  };
}
