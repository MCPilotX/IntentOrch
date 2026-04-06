/**
 * AI Module Exports
 * Provides unified interface for AI functionality
 */
export { SimpleAI, AIError, type SimpleAIConfig, type AskResult, type ToolCall } from './ai';
export { SimpleAIConfigManager } from './config';
export { SimpleAICommand } from './command';
export { CloudIntentEngine, type CloudIntentEngineConfig, type AtomicIntent, type DependencyEdge, type IntentParseResult, type ToolSelectionResult, type ExecutionContext, type ExecutionResult, type EnhancedExecutionStep, type WorkflowPlan, type EnhancedExecutionResult } from './cloud-intent-engine';
export { EnhancedIntentEngine } from './enhanced-intent';
export { IntentEngine } from './intent';
/**
 * Check AI capabilities
 * Simplified version without vector database
 */
export declare function checkAICapabilities(config?: any): Promise<{
    aiAvailable: boolean;
    mode: 'api' | 'none';
}>;
/**
 * Get AI system status
 */
export declare function getAIStatus(config?: any): Promise<{
    timestamp: string;
    version: string;
    note: string;
    aiAvailable: boolean;
    mode: "api" | "none";
}>;
//# sourceMappingURL=index.d.ts.map