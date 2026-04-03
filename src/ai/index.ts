/**
 * AI Module Exports
 * Provides unified interface for AI functionality
 */

// Export simplified AI functionality
export { SimpleAI, AIError, type SimpleAIConfig, type AskResult, type ToolCall } from './ai';
export { SimpleAIConfigManager } from './config';
export { SimpleAICommand } from './command';

// Legacy exports (for backward compatibility)
export { EnhancedIntentEngine } from './enhanced-intent';
export { IntentEngine } from './intent';

import { logger } from '../core/logger';

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
      mode: 'api'
    };
  }
  
  return {
    aiAvailable: false,
    mode: 'none'
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
    note: 'Vector database functionality has been removed. Use external AI services for semantic search.'
  };
}