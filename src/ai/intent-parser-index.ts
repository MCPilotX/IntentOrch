/**
 * Intent Parser Module Index
 * Main exports for the new intent parser architecture
 */

import { IntentResult, Intent } from './intent-types';
import { 
  IntentParser, 
  ParserContext, 
  ParserType, 
  ParserConfig, 
  ParserSelectionStrategy,
  ParserCapabilities
} from './intent-parser.interface';
import { RuleBasedParser } from './rule-based-parser';
import { HybridAIParser, HybridAIParserConfig } from './hybrid-ai-parser';
import { IntentParserFactory, ParserFactoryConfig } from './intent-parser-factory';
import { IntentParserSelector, ParserSelectorConfig, SelectionResult } from './intent-parser-selector';

// Re-export everything from individual modules
export * from './intent-parser.interface';
export * from './intent-types';

// Base classes
export { BaseIntentParser } from './base-intent-parser';

// Parser implementations
export { RuleBasedParser } from './rule-based-parser';
export { HybridAIParser } from './hybrid-ai-parser';

// Factory and selector
export { IntentParserFactory } from './intent-parser-factory';
export { IntentParserSelector } from './intent-parser-selector';

/**
 * Quick start utility functions
 */
export class IntentParserUtils {
  /**
   * Create a default parser selector with recommended settings
   */
  static createDefaultSelector(): IntentParserSelector {
    return new IntentParserSelector({
      strategy: 'hybrid',
      maxResponseTime: 3000,
      minConfidence: 0.6
    });
  }
  
  /**
   * Create a simple parser for basic use cases
   */
  static createSimpleParser(): RuleBasedParser {
    return new RuleBasedParser({
      confidenceThreshold: 0.7
    });
  }
  
  /**
   * Create an AI-enhanced parser
   */
  static createAIParser(aiConfig?: any): HybridAIParser {
    return new HybridAIParser({
      aiConfig,
      confidenceThreshold: 0.6,
      ruleConfidenceThreshold: 0.7
    });
  }
  
  /**
   * Parse a query with the default selector
   */
  static async parseQuery(query: string, availableTools?: string[]): Promise<{
    result: IntentResult;
    parserType: string;
    confidence: number;
  }> {
    const selector = this.createDefaultSelector();
    const context: ParserContext = availableTools ? { availableTools } : {};
    
    const { result, selection } = await selector.parseWithBestFit(query, context);
    
    return {
      result,
      parserType: selection.parserType,
      confidence: result.confidence
    };
  }
}

/**
 * Example queries for testing and demonstration
 */
export const IntentParserExamples = [
  'read file /home/user/test.txt',
  'list files in current directory',
  'ping google.com',
  'start the web server',
  'stop the background service',
  'check status of my-service'
];

/**
 * Type exports for TypeScript users
 */
export type {
  IntentResult,
  IntentParser,
  ParserContext,
  ParserType,
  ParserConfig,
  ParserSelectionStrategy,
  ParserCapabilities,
  HybridAIParserConfig,
  ParserFactoryConfig,
  ParserSelectorConfig,
  SelectionResult,
  Intent
};
