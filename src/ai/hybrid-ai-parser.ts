/**
 * Hybrid AI Intent Parser
 * Combines rule-based parsing with AI fallback for enhanced accuracy
 * This is the true "EnhancedIntentEngine" implementation
 */

import { logger } from '../core/logger';
import { BaseIntentParser } from './base-intent-parser';
import { RuleBasedParser } from './rule-based-parser';
import { IntentResult } from './intent-types';
import { ParserConfig, ParserContext, ParserType } from './intent-parser.interface';
import { AI } from './ai';

/**
 * Hybrid AI Parser Configuration
 */
export interface HybridAIParserConfig extends ParserConfig {
  /** Whether to always try AI parsing (not just as fallback) */
  alwaysUseAI?: boolean;
  /** Minimum confidence for rule-based results to be accepted without AI */
  ruleConfidenceThreshold?: number;
  /** AI provider configuration */
  aiConfig?: any;
}

/**
 * Hybrid AI Intent Parser
 * Implements the true "EnhancedIntentEngine" with AI capabilities
 */
export class HybridAIParser extends BaseIntentParser {
  private ruleParser: RuleBasedParser;
  private aiService: AI | null = null;
  private aiEnabled: boolean = false;
  private alwaysUseAI: boolean;
  private ruleConfidenceThreshold: number;
  
  constructor(config: HybridAIParserConfig = {}) {
    super({
      confidenceThreshold: 0.6, // Lower threshold since AI can improve confidence
      ...config
    });
    
    this.alwaysUseAI = config.alwaysUseAI || false;
    this.ruleConfidenceThreshold = config.ruleConfidenceThreshold || 0.7;
    
    // Initialize rule-based parser
    this.ruleParser = new RuleBasedParser({
      confidenceThreshold: this.ruleConfidenceThreshold
    });
    
    // Initialize AI service if config provided
    if (config.aiConfig) {
      this.initializeAIService(config.aiConfig);
    }
  }
  
  getParserType(): ParserType {
    return 'hybrid';
  }
  
  /**
   * Initialize AI service
   */
  private async initializeAIService(aiConfig: any): Promise<void> {
    try {
      this.aiService = new AI();
      this.aiEnabled = true; // Set enabled immediately
      await this.aiService.configure(aiConfig);
      logger.info('[HybridAIParser] AI service initialized successfully');
    } catch (error) {
      logger.warn(`[HybridAIParser] Failed to initialize AI service: ${error}`);
      this.aiEnabled = false;
    }
  }
  
  /**
   * Parse query using hybrid approach
   */
  async parse(query: string, context?: ParserContext): Promise<IntentResult> {
    this.logParsingAttempt(query, context);
    
    const { result, duration } = await this.measureExecutionTime(
      () => this.parseInternal(query, context),
      'hybrid AI parsing'
    );
    
    this.logParsingResult(result, duration);
    return result;
  }
  
  /**
   * Internal parsing logic with hybrid approach
   */
  private async parseInternal(query: string, context?: ParserContext): Promise<IntentResult> {
    const useAI = this.shouldUseAI(context) && this.aiEnabled;
    
    // If AI is disabled or not allowed, use rule-based only
    if (!useAI) {
      return this.parseWithRulesOnly(query, context);
    }
    
    // If configured to always use AI, skip rule-based parsing
    if (this.alwaysUseAI) {
      return this.parseWithAI(query, context);
    }
    
    // Hybrid approach: try rules first, fallback to AI if needed
    return this.parseWithHybridApproach(query, context);
  }
  
  /**
   * Parse using only rule-based approach
   */
   private async parseWithRulesOnly(query: string, context?: ParserContext): Promise<IntentResult> {
     const ruleResult = await this.ruleParser.parse(query, context);
     
     // Add parser type metadata
     return {
       ...ruleResult,
       parserType: this.getParserType(),
       metadata: {
         ...(ruleResult.metadata || {}),
         aiUsed: false,
         fallbackReason: 'AI disabled or not allowed'
       }
     };
   }
  
  /**
   * Parse using only AI approach
   */
  private async parseWithAI(query: string, context?: ParserContext): Promise<IntentResult> {
    if (!this.aiService) {
      logger.warn('[HybridAIParser] AI service not available, falling back to rules');
      return this.parseWithRulesOnly(query, context);
    }
    
    try {
      // Use AI's analyzeIntent method which includes LLM fallback
      const aiIntent = await this.aiService.analyzeIntent(query);
      
      // Convert AI Intent to IntentResult
      const result: IntentResult = {
        service: this.mapActionToService(aiIntent.action),
        method: aiIntent.action,
        parameters: aiIntent.params || {},
        confidence: aiIntent.confidence,
        parserType: this.getParserType(),
        metadata: {
          aiUsed: true,
          aiProvider: 'AI',
          originalAction: aiIntent.action,
          originalTarget: aiIntent.target
        }
      };
      
      return result;
    } catch (error) {
      logger.error(`[HybridAIParser] AI parsing failed: ${error}`);
      
      // Fallback to rule-based parsing
      const fallbackResult = await this.parseWithRulesOnly(query, context);
      return {
        ...fallbackResult,
        metadata: {
          ...(fallbackResult.metadata || {}),
          aiUsed: false,
          aiError: error instanceof Error ? error.message : String(error)
        }
      };
    }
  }
  
  /**
   * Hybrid parsing: rules first, AI fallback
   */
  private async parseWithHybridApproach(query: string, context?: ParserContext): Promise<IntentResult> {
    // Step 1: Try rule-based parsing
    const ruleResult = await this.ruleParser.parse(query, context);
    
    // Step 2: Check if rule-based result is good enough
    if (this.isRuleResultAcceptable(ruleResult)) {
      return {
        ...ruleResult,
        parserType: this.getParserType(),
        metadata: {
          ...(ruleResult.metadata || {}),
          aiUsed: false,
          decision: 'rule_based_sufficient'
        }
      };
    }
    
    // Step 3: Rule-based result not good enough, try AI
    logger.debug(`[HybridAIParser] Rule-based confidence ${ruleResult.confidence} below threshold, trying AI`);
    
    try {
      const aiResult = await this.parseWithAI(query, context);
      
      // Step 4: Compare AI result with rule-based result
      if (this.shouldUseAIResult(aiResult, ruleResult)) {
        return {
          ...aiResult,
          metadata: {
            ...(aiResult.metadata || {}),
            decision: 'ai_better',
            ruleBasedConfidence: ruleResult.confidence,
            aiConfidence: aiResult.confidence
          }
        };
      } else {
        // AI result not better, use rule-based with AI insights
        return {
          ...ruleResult,
          confidence: Math.max(ruleResult.confidence, aiResult.confidence * 0.8), // Boost slightly
          parserType: this.getParserType(),
          metadata: {
            ...(ruleResult.metadata || {}),
            ...(aiResult.metadata || {}), // Include AI metadata including aiError
            aiUsed: true,
            decision: 'rule_based_with_ai_validation',
            aiValidated: true,
            originalAiConfidence: aiResult.confidence
          }
        };
      }
    } catch (aiError) {
      // AI failed, use rule-based result
      logger.warn(`[HybridAIParser] AI parsing failed, using rule-based result: ${aiError}`);
      return {
        ...ruleResult,
        parserType: this.getParserType(),
        metadata: {
          ...(ruleResult.metadata || {}),
          aiUsed: false,
          decision: 'ai_failed_fallback_to_rules',
          aiError: aiError instanceof Error ? aiError.message : String(aiError)
        }
      };
    }
  }
  
  /**
   * Check if rule-based result is acceptable
   */
  private isRuleResultAcceptable(result: IntentResult): boolean {
    // Check confidence threshold
    if (result.confidence >= this.ruleConfidenceThreshold) {
      return true;
    }
    
    // Check if it's a fallback/unknown result
    if (result.service === 'unknown' || result.method === 'unknown') {
      return false;
    }
    
    // Additional checks can be added here
    return false;
  }
  
  /**
   * Decide whether to use AI result over rule-based result
   */
  private shouldUseAIResult(aiResult: IntentResult, ruleResult: IntentResult): boolean {
    // If AI confidence is significantly higher
    if (aiResult.confidence > ruleResult.confidence + 0.2) {
      return true;
    }
    
    // If rule-based result is unknown but AI found something
    if (ruleResult.service === 'unknown' && aiResult.service !== 'unknown') {
      return true;
    }
    
    // If AI extracted parameters but rule-based didn't
    const aiHasParams = Object.keys(aiResult.parameters || {}).length > 0;
    const ruleHasParams = Object.keys(ruleResult.parameters || {}).length > 0;
    if (aiHasParams && !ruleHasParams) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Map AI action to service name
   */
  private mapActionToService(action: string): string {
    const actionToService: Record<string, string> = {
      'read': 'filesystem',
      'write': 'filesystem',
      'list': 'filesystem',
      'ping': 'network',
      'start': 'process',
      'stop': 'process',
      'calculate': 'calculator',
      'unknown': 'unknown'
    };
    
    return actionToService[action] || action;
  }
  
  /**
   * Update AI configuration
   */
  async updateAIConfig(aiConfig: any): Promise<void> {
    try {
      await this.initializeAIService(aiConfig);
      logger.info('[HybridAIParser] AI configuration updated successfully');
    } catch (error) {
      logger.error(`[HybridAIParser] Failed to update AI config: ${error}`);
      throw error;
    }
  }
  
  /**
   * Check if AI service is available
   */
  isAIAvailable(): boolean {
    return this.aiEnabled && this.aiService !== null;
  }
  
  /**
   * Enable or disable AI usage
   */
  setAIEnabled(enabled: boolean): void {
    this.aiEnabled = enabled;
    logger.debug(`[HybridAIParser] AI usage ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  /**
   * Set whether to always use AI
   */
  setAlwaysUseAI(alwaysUseAI: boolean): void {
    this.alwaysUseAI = alwaysUseAI;
    logger.debug(`[HybridAIParser] Always use AI: ${alwaysUseAI}`);
  }
  
  /**
   * Get the underlying rule parser for customization
   */
  getRuleParser(): RuleBasedParser {
    return this.ruleParser;
  }
}