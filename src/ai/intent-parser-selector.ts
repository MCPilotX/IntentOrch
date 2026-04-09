/**
 * Intent Parser Selector
 * Intelligently selects the best parser for a given query and context
 */

import { logger } from '../core/logger';
import { IntentParser, ParserContext, ParserSelectionStrategy, ParserType } from './intent-parser.interface';
import { IntentResult } from './intent-types';
import { IntentParserFactory } from './intent-parser-factory';

/**
 * Selection result with metadata
 */
export interface SelectionResult {
  /** The selected parser */
  parser: IntentParser;
  /** Parser type */
  parserType: string;
  /** Why this parser was selected */
  selectionReason: string;
  /** Performance metrics */
  metrics: {
    responseTime: number;
    confidence: number;
    cost?: number;
  };
}

/**
 * Parser selector configuration
 */
export interface ParserSelectorConfig {
  /** Selection strategy */
  strategy?: ParserSelectionStrategy;
  /** Maximum allowed response time in milliseconds */
  maxResponseTime?: number;
  /** Maximum cost per request */
  maxCost?: number;
  /** Minimum confidence threshold */
  minConfidence?: number;
  /** Whether to prefer AI-based parsing */
  preferAI?: boolean;
  /** Factory configuration */
  factoryConfig?: any;
}

/**
 * Intelligent Parser Selector
 */
export class IntentParserSelector {
  private factory: IntentParserFactory;
  private config: ParserSelectorConfig;
  
  constructor(config: ParserSelectorConfig = {}) {
    this.config = {
      strategy: 'hybrid',
      maxResponseTime: 5000,
      minConfidence: 0.6,
      preferAI: false,
      ...config
    };
    
    this.factory = new IntentParserFactory(this.config.factoryConfig);
  }
  
  /**
   * Select and use the best parser for a query
   */
  async parseWithBestFit(query: string, context?: ParserContext): Promise<{
    result: IntentResult;
    selection: SelectionResult;
  }> {
    logger.debug(`[IntentParserSelector] Selecting parser for query: "${query}"`);
    
    const startTime = Date.now();
    
    // Get candidate parsers based on strategy
    const candidateParsers = this.getCandidateParsers(context);
    
    // Try parsers in order
    for (const parser of candidateParsers) {
      const parserType = parser.getParserType();
      
      // Check if parser meets constraints
      if (!this.meetsConstraints(parser, context)) {
        logger.debug(`[IntentParserSelector] Parser ${parserType} does not meet constraints, skipping`);
        continue;
      }
      
      try {
        const parseStartTime = Date.now();
        const result = await parser.parse(query, context);
        const responseTime = Date.now() - parseStartTime;
        
        // Check if result meets confidence threshold
        if (this.isResultAcceptable(result, parser)) {
          const selection: SelectionResult = {
            parser,
            parserType,
            selectionReason: this.getSelectionReason(parser, result, responseTime),
            metrics: {
              responseTime,
              confidence: result.confidence,
              cost: this.estimateCost(parser)
            }
          };
          
          const totalTime = Date.now() - startTime;
          logger.info(`[IntentParserSelector] Selected ${parserType} parser in ${totalTime}ms`, {
            confidence: result.confidence,
            responseTime,
            selectionReason: selection.selectionReason
          });
          
          return { result, selection };
        } else {
          logger.debug(`[IntentParserSelector] Parser ${parserType} result confidence ${result.confidence} below threshold`);
        }
      } catch (error) {
        logger.warn(`[IntentParserSelector] Parser ${parserType} failed: ${error}`);
        // Continue to next parser
      }
    }
    
    // All parsers failed, use fallback
    return this.useFallbackParser(query, context, startTime);
  }
  
  /**
   * Get candidate parsers based on selection strategy
   */
  private getCandidateParsers(context?: ParserContext): IntentParser[] {
    const strategy = this.config.strategy || 'hybrid';
    
    switch (strategy) {
      case 'fastest':
        return this.factory.createParserChain(['rule', 'hybrid', 'cloud']);
        
      case 'most_accurate':
        return this.factory.createParserChain(['cloud', 'hybrid', 'rule']);
        
      case 'cost_aware':
        return this.getCostAwareParsers(context);
        
      case 'hybrid':
      default:
        return this.factory.createParserChain(['rule', 'hybrid', 'cloud']);
    }
  }
  
  /**
   * Get cost-aware parser chain
   */
  private getCostAwareParsers(context?: ParserContext): IntentParser[] {
    const parsers = this.factory.createParserChain();
    
    // Sort by estimated cost (ascending)
    return parsers.sort((a, b) => {
      const costA = this.estimateCost(a);
      const costB = this.estimateCost(b);
      return costA - costB;
    });
  }
  
  /**
   * Check if parser meets constraints
   */
  private meetsConstraints(parser: IntentParser, context?: ParserContext): boolean {
    const parserType = parser.getParserType();
    const capabilities = this.factory.getParserCapabilities(parserType);
    
    // Check response time constraint
    if (this.config.maxResponseTime && capabilities.averageResponseTime > this.config.maxResponseTime) {
      return false;
    }
    
    // Check cost constraint
    if (this.config.maxCost !== undefined && capabilities.costPerRequest !== undefined) {
      if (capabilities.costPerRequest > this.config.maxCost) {
        return false;
      }
    }
    
    // Check AI preference
    if (this.config.preferAI && !capabilities.supportsAI) {
      return false;
    }
    
    // Check context constraints
    if (context?.useAI === false && capabilities.supportsAI) {
      return false;
    }
    
    if (context?.maxResponseTime && capabilities.averageResponseTime > context.maxResponseTime) {
      return false;
    }
    
    return true;
  }
  
  /**
   * Check if result is acceptable
   */
  private isResultAcceptable(result: IntentResult, parser: IntentParser): boolean {
    const minConfidence = this.config.minConfidence || 0.6;
    
    // Check confidence threshold
    if (result.confidence < minConfidence) {
      return false;
    }
    
    // Check parser's own confidence threshold
    if (result.confidence < parser.getConfidenceThreshold()) {
      return false;
    }
    
    // Additional checks can be added here
    return true;
  }
  
  /**
   * Estimate cost of using a parser
   */
  private estimateCost(parser: IntentParser): number {
    const parserType = parser.getParserType();
    const capabilities = this.factory.getParserCapabilities(parserType);
    return capabilities.costPerRequest || 0;
  }
  
  /**
   * Get selection reason
   */
  private getSelectionReason(parser: IntentParser, result: IntentResult, responseTime: number): string {
    const parserType = parser.getParserType();
    
    if (parserType === 'rule' && result.confidence >= 0.8) {
      return 'High confidence rule-based match';
    }
    
    if (parserType === 'hybrid' && result.metadata?.aiUsed) {
      return 'AI-enhanced parsing provided better accuracy';
    }
    
    if (parserType === 'cloud') {
      return 'Complex intent requiring cloud AI decomposition';
    }
    
    if (responseTime < 100) {
      return 'Fast response time';
    }
    
    return `Selected based on ${this.config.strategy} strategy`;
  }
  
  /**
   * Use fallback parser when all others fail
   */
  private async useFallbackParser(query: string, context: ParserContext | undefined, startTime: number): Promise<{
    result: IntentResult;
    selection: SelectionResult;
  }> {
    logger.warn('[IntentParserSelector] All parsers failed, using fallback');
    
    // Use rule-based parser as fallback (most reliable)
    const fallbackParser = this.factory.getParser('rule');
    const parseStartTime = Date.now();
    
    const result = await fallbackParser.parse(query, context);
    const responseTime = Date.now() - parseStartTime;
    
    const selection: SelectionResult = {
      parser: fallbackParser,
      parserType: 'rule',
      selectionReason: 'Fallback after all other parsers failed',
      metrics: {
        responseTime,
        confidence: result.confidence,
        cost: 0
      }
    };
    
    const totalTime = Date.now() - startTime;
    logger.info(`[IntentParserSelector] Used fallback parser in ${totalTime}ms`);
    
    return { result, selection };
  }
  
  /**
   * Get parser factory for direct access
   */
  getFactory(): IntentParserFactory {
    return this.factory;
  }
  
  /**
   * Update selector configuration
   */
  updateConfig(config: Partial<ParserSelectorConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug('[IntentParserSelector] Configuration updated');
  }
  
  /**
   * Analyze query to suggest parser strategy
   */
  analyzeQuery(query: string): {
    suggestedStrategy: ParserSelectionStrategy;
    complexity: 'low' | 'medium' | 'high';
    estimatedParsers: ParserType[];
  } {
    const queryLower = query.toLowerCase();
    
    // Simple heuristic for complexity
    let complexity: 'low' | 'medium' | 'high' = 'low';
    let suggestedStrategy: ParserSelectionStrategy = 'fastest';
    
    // Check for complex patterns
    const complexPatterns = [
      /and|then|after|before|first|next/i,
      /multiple|several|various|different/i,
      /workflow|pipeline|sequence|process/i
    ];
    
    const complexMatches = complexPatterns.filter(pattern => pattern.test(queryLower)).length;
    
    if (complexMatches >= 2 || query.split(' ').length > 10) {
      complexity = 'high';
      suggestedStrategy = 'most_accurate';
    } else if (complexMatches >= 1 || query.split(' ').length > 5) {
      complexity = 'medium';
      suggestedStrategy = 'hybrid';
    }
    
    // Determine estimated parsers
    let estimatedParsers: ParserType[] = [];
    switch (complexity) {
      case 'low':
        estimatedParsers = ['rule', 'hybrid'];
        break;
      case 'medium':
        estimatedParsers = ['hybrid', 'rule', 'cloud'];
        break;
      case 'high':
        estimatedParsers = ['cloud', 'hybrid'];
        break;
    }
    
    return {
      suggestedStrategy,
      complexity,
      estimatedParsers
    };
  }
}