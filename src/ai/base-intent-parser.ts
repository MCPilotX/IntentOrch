/**
 * Base Intent Parser Abstract Class
 * Provides common functionality for all intent parser implementations
 */

import { logger } from '../core/logger';
import { IntentResult } from './intent-types';
import { IntentParser, ParserConfig, ParserContext, ParserType } from './intent-parser.interface';

/**
 * Base abstract class for intent parsers
 */
export abstract class BaseIntentParser implements IntentParser {
  protected config: ParserConfig;
  
  constructor(config: ParserConfig = {}) {
    this.config = {
      confidenceThreshold: 0.6,
      ...config
    };
  }
  
  /**
   * Parse a natural language query into an intent
   * Must be implemented by subclasses
   */
  abstract parse(query: string, context?: ParserContext): Promise<IntentResult>;
  
  /**
   * Get the type of this parser
   * Must be implemented by subclasses
   */
  abstract getParserType(): ParserType;
  
  /**
   * Get the confidence threshold for this parser
   */
  getConfidenceThreshold(): number {
    return this.config.confidenceThreshold || 0.6;
  }
  
  /**
   * Update parser configuration
   */
  updateConfig(config: Partial<ParserConfig>): void {
    this.config = { ...this.config, ...config };
    logger.debug(`[${this.constructor.name}] Configuration updated`);
  }
  
  /**
   * Validate if a result meets the confidence threshold
   */
  protected validateResult(result: IntentResult): boolean {
    return result.confidence >= this.getConfidenceThreshold();
  }
  
  /**
   * Create a fallback intent result when parsing fails
   */
  protected createFallbackResult(query: string): IntentResult {
    return {
      service: 'unknown',
      method: 'unknown',
      parameters: { query },
      confidence: 0.1,
      parserType: this.getParserType(),
      error: 'No matching intent found'
    };
  }
  
  /**
   * Measure execution time of a function
   */
  protected async measureExecutionTime<T>(
    fn: () => Promise<T>,
    operationName: string = 'operation'
  ): Promise<{ result: T; duration: number }> {
    const startTime = Date.now();
    const result = await fn();
    const duration = Date.now() - startTime;
    
    logger.debug(`[${this.constructor.name}] ${operationName} completed in ${duration}ms`);
    return { result, duration };
  }
  
  /**
   * Check if context allows AI usage
   */
  protected shouldUseAI(context?: ParserContext): boolean {
    return context?.useAI !== false;
  }
  
  /**
   * Check if response time is within limits
   */
  protected isWithinTimeLimit(duration: number, context?: ParserContext): boolean {
    if (!context?.maxResponseTime) return true;
    return duration <= context.maxResponseTime;
  }
  
  /**
   * Extract available tools from context
   */
  protected getAvailableTools(context?: ParserContext): string[] {
    return context?.availableTools || [];
  }
  
  /**
   * Log parsing attempt
   */
  protected logParsingAttempt(query: string, context?: ParserContext): void {
    logger.debug(`[${this.constructor.name}] Parsing query: "${query}"`, {
      parserType: this.getParserType(),
      useAI: this.shouldUseAI(context),
      availableTools: this.getAvailableTools(context).length
    });
  }
  
  /**
   * Log parsing result
   */
  protected logParsingResult(result: IntentResult, duration: number): void {
    logger.debug(`[${this.constructor.name}] Parsing completed`, {
      success: result.confidence >= this.getConfidenceThreshold(),
      confidence: result.confidence,
      service: result.service,
      method: result.method,
      duration: `${duration}ms`
    });
  }
}