/**
 * Intent Parser Factory
 * Creates and manages intent parser instances
 */

import { logger } from '../core/logger';
import { RuleBasedParser } from './rule-based-parser';
import { HybridAIParser, HybridAIParserConfig } from './hybrid-ai-parser';
import { IntentParser, ParserConfig, ParserType, ParserSelectionStrategy } from './intent-parser.interface';

/**
 * Factory configuration
 */
export interface ParserFactoryConfig {
  /** Default parser type to create */
  defaultParserType?: ParserType;
  /** Configuration for each parser type */
  parserConfigs?: {
    rule?: ParserConfig;
    hybrid?: HybridAIParserConfig;
    cloud?: ParserConfig;
  };
  /** Parser selection strategy */
  selectionStrategy?: ParserSelectionStrategy;
}

/**
 * Intent Parser Factory
 */
export class IntentParserFactory {
  private config: ParserFactoryConfig;
  private parsers: Map<ParserType, IntentParser> = new Map();
  
  constructor(config: ParserFactoryConfig = {}) {
    this.config = {
      defaultParserType: 'hybrid',
      selectionStrategy: 'hybrid',
      ...config
    };
  }
  
  /**
   * Create a parser of the specified type
   */
  createParser(type: ParserType, config?: ParserConfig): IntentParser {
    logger.debug(`[IntentParserFactory] Creating parser of type: ${type}`);
    
    let parser: IntentParser;
    
    switch (type) {
      case 'rule':
        parser = this.createRuleBasedParser(config);
        break;
        
      case 'hybrid':
        parser = this.createHybridAIParser(config);
        break;
        
      case 'cloud':
        parser = this.createCloudParser(config);
        break;
        
      default:
        throw new Error(`Unknown parser type: ${type}`);
    }
    
    // Cache the parser
    this.parsers.set(type, parser);
    
    return parser;
  }
  
  /**
   * Create rule-based parser
   */
  private createRuleBasedParser(config?: ParserConfig): RuleBasedParser {
    const mergedConfig = {
      ...this.config.parserConfigs?.rule,
      ...config
    };
    
    return new RuleBasedParser(mergedConfig);
  }
  
  /**
   * Create hybrid AI parser
   */
  private createHybridAIParser(config?: ParserConfig): HybridAIParser {
    const mergedConfig: HybridAIParserConfig = {
      ...this.config.parserConfigs?.hybrid,
      ...config
    };
    
    return new HybridAIParser(mergedConfig);
  }
  
  /**
   * Create cloud parser (placeholder for now)
   */
  private createCloudParser(config?: ParserConfig): IntentParser {
    // For now, return a hybrid parser as placeholder
    // In a real implementation, this would create a CloudIntentParserAdapter
    logger.warn('[IntentParserFactory] Cloud parser not implemented, using hybrid parser as fallback');
    return this.createHybridAIParser(config);
  }
  
  /**
   * Get or create a parser of the specified type
   */
  getParser(type: ParserType, config?: ParserConfig): IntentParser {
    const cachedParser = this.parsers.get(type);
    if (cachedParser) {
      return cachedParser;
    }
    
    return this.createParser(type, config);
  }
  
  /**
   * Get the default parser
   */
  getDefaultParser(config?: ParserConfig): IntentParser {
    const defaultType = this.config.defaultParserType || 'hybrid';
    return this.getParser(defaultType, config);
  }
  
  /**
   * Create a chain of parsers for sequential trying
   */
  createParserChain(types?: ParserType[], configs?: Partial<Record<ParserType, ParserConfig>>): IntentParser[] {
    const parserTypes = types || this.getDefaultParserChain();
    const parsers: IntentParser[] = [];
    
    for (const type of parserTypes) {
      const typeConfig = configs?.[type];
      parsers.push(this.getParser(type, typeConfig));
    }
    
    return parsers;
  }
  
  /**
   * Get default parser chain based on selection strategy
   */
  private getDefaultParserChain(): ParserType[] {
    switch (this.config.selectionStrategy) {
      case 'fastest':
        return ['rule', 'hybrid', 'cloud'];
        
      case 'most_accurate':
        return ['cloud', 'hybrid', 'rule'];
        
      case 'hybrid':
      case 'cost_aware':
      default:
        return ['rule', 'hybrid', 'cloud'];
    }
  }
  
  /**
   * Clear parser cache
   */
  clearCache(): void {
    this.parsers.clear();
    logger.debug('[IntentParserFactory] Parser cache cleared');
  }
  
  /**
   * Update factory configuration
   */
  updateConfig(config: Partial<ParserFactoryConfig>): void {
    this.config = { ...this.config, ...config };
    
    // Clear cache if parser configs changed
    if (config.parserConfigs) {
      this.clearCache();
    }
    
    logger.debug('[IntentParserFactory] Configuration updated');
  }
  
  /**
   * Get all available parser types
   */
  getAvailableParserTypes(): ParserType[] {
    return ['rule', 'hybrid', 'cloud'];
  }
  
  /**
   * Get parser capabilities information
   */
  getParserCapabilities(type: ParserType): {
    supportsAI: boolean;
    supportsToolMatching: boolean;
    supportsParameterExtraction: boolean;
    supportsIntentDecomposition: boolean;
    averageResponseTime: number;
    costPerRequest?: number;
  } {
    switch (type) {
      case 'rule':
        return {
          supportsAI: false,
          supportsToolMatching: true,
          supportsParameterExtraction: true,
          supportsIntentDecomposition: false,
          averageResponseTime: 10, // ms
          costPerRequest: 0
        };
        
      case 'hybrid':
        return {
          supportsAI: true,
          supportsToolMatching: true,
          supportsParameterExtraction: true,
          supportsIntentDecomposition: false,
          averageResponseTime: 500, // ms (depends on AI)
          costPerRequest: 0.001 // Example cost
        };
        
      case 'cloud':
        return {
          supportsAI: true,
          supportsToolMatching: true,
          supportsParameterExtraction: true,
          supportsIntentDecomposition: true,
          averageResponseTime: 2000, // ms
          costPerRequest: 0.01 // Example cost
        };
        
      default:
        throw new Error(`Unknown parser type: ${type}`);
    }
  }
}