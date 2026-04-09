/**
 * Legacy Adapters for Backward Compatibility
 * Provides adapters for existing EnhancedIntentEngine and IntentEngine interfaces
 */

import { IntentResult } from './intent-types';
import { IntentParser, ParserContext } from './intent-parser.interface';
import { IntentParserFactory } from './intent-parser-factory';
import { IntentParserSelector } from './intent-parser-selector';

/**
 * Adapter for EnhancedIntentEngine legacy interface
 * Maintains backward compatibility while using the new parser architecture
 */
export class EnhancedIntentEngineAdapter {
  private selector: IntentParserSelector;
  private config: any;
  
  constructor(config: any = {}) {
    this.config = config;
    
    // Initialize with hybrid parser as default (true to EnhancedIntentEngine's promise)
    this.selector = new IntentParserSelector({
      strategy: 'hybrid',
      preferAI: true,
      factoryConfig: {
        defaultParserType: 'hybrid',
        parserConfigs: {
          hybrid: {
            aiConfig: config.aiConfig,
            alwaysUseAI: config.alwaysUseAI || false,
            ruleConfidenceThreshold: config.ruleConfidenceThreshold || 0.7
          }
        }
      }
    });
  }
  
  /**
   * Parse method matching EnhancedIntentEngine interface
   */
  async parse(query: string, availableTools: string[]): Promise<IntentResult | null> {
    const context: ParserContext = {
      availableTools,
      useAI: true,
      metadata: { legacyEngine: 'EnhancedIntentEngine' }
    };
    
    try {
      const { result } = await this.selector.parseWithBestFit(query, context);
      return result;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: any): void {
    this.config = { ...this.config, ...config };
    this.selector.updateConfig?.(config);
  }
}

/**
 * Adapter for IntentEngine legacy interface
 * Maintains backward compatibility while using the new parser architecture
 */
export class IntentEngineAdapter {
  private factory: IntentParserFactory;
  private config: any;
  
  constructor(config: any = {}) {
    this.config = config;
    
    // Initialize with rule-based parser as default (true to IntentEngine's promise)
    this.factory = new IntentParserFactory({
      defaultParserType: 'rule',
      parserConfigs: {
        rule: {
          confidenceThreshold: config.confidenceThreshold || 0.8
        }
      }
    });
  }
  
  /**
   * Parse method matching IntentEngine interface
   */
  async parse(query: string, availableTools: string[]): Promise<IntentResult | null> {
    const context: ParserContext = {
      availableTools,
      useAI: false,
      metadata: { legacyEngine: 'IntentEngine' }
    };
    
    try {
      const parser = this.factory.getParser('rule');
      const result = await parser.parse(query, context);
      return result;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Update configuration
   */
  updateConfig(config: any): void {
    this.config = { ...this.config, ...config };
  }
}