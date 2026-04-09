/**
 * Rule-Based Intent Parser
 * Fast, rule-based intent parsing using pattern matching and tool name matching
 * Combines the best of IntentEngine and AI.parseIntentCore()
 */

import { logger } from '../core/logger';
import { BaseIntentParser } from './base-intent-parser';
import { IntentResult } from './intent-types';
import { ParserConfig, ParserContext, ParserType } from './intent-parser.interface';

/**
 * Rule pattern for intent matching
 */
interface RulePattern {
  /** Regular expression to match against query */
  regex: RegExp;
  /** Service name */
  service: string;
  /** Method name */
  method: string;
  /** Base confidence score */
  confidence: number;
  /** Parameter extractor function */
  paramExtractor: (query: string) => Record<string, any>;
  /** Optional priority (higher = tried first) */
  priority?: number;
}

/**
 * Rule-Based Intent Parser
 */
export class RuleBasedParser extends BaseIntentParser {
  private patterns: RulePattern[] = [];
  private toolCache: Map<string, { service: string; method: string }> = new Map();
  
  constructor(config: ParserConfig = {}) {
    super({
      confidenceThreshold: 0.7, // Higher threshold for rule-based parsing
      ...config
    });
    
    this.initializePatterns();
  }
  
  getParserType(): ParserType {
    return 'rule';
  }
  
  /**
   * Initialize rule patterns
   */
  private initializePatterns(): void {
    // File system operations
    this.patterns.push(
      {
        regex: /(read|view|open|show).*(file|document)/i,
        service: 'filesystem',
        method: 'read',
        confidence: 0.8,
        priority: 10,
        paramExtractor: (q: string) => {
          const pathMatch = q.match(/\/(?:[^/\s]+\/)*[^/\s]+/);
          return { path: pathMatch ? pathMatch[0] : '/unknown/path' };
        }
      },
      {
        regex: /(write|create|save).*(to|into|in)\s+\/|write\s+"[^"]+"\s+to/i,
        service: 'filesystem',
        method: 'write',
        confidence: 0.8,
        priority: 10,
        paramExtractor: (q: string) => {
          const pathMatch = q.match(/\/(?:[^/\s]+\/)*[^/\s]+/);
          const contentMatch = q.match(/"([^"]+)"|'([^']+)'/);
          return {
            path: pathMatch ? pathMatch[0] : '/unknown/path',
            content: contentMatch ? (contentMatch[1] || contentMatch[2] || '') : '',
          };
        }
      },
      {
        regex: /(list|show|display).*(file|directory|folder)/i,
        service: 'filesystem',
        method: 'list',
        confidence: 0.8,
        priority: 9,
        paramExtractor: (q: string) => {
          const pathMatch = q.match(/\/(?:[^/\s]+\/)*[^/\s]+/);
          return { path: pathMatch ? pathMatch[0] : '.' };
        }
      }
    );
    
    // Network operations
    this.patterns.push(
      {
        regex: /ping\s+([a-zA-Z0-9.-]+)/i,
        service: 'network',
        method: 'ping',
        confidence: 0.7,
        priority: 8,
        paramExtractor: (q: string) => {
          const hostMatch = q.match(/ping\s+([a-zA-Z0-9.-]+)/i);
          return { host: hostMatch ? hostMatch[1] : 'unknown' };
        }
      }
    );
    
    // Process operations
    this.patterns.push(
      {
        regex: /(start|launch|run|begin).*(server|process|service|application)/i,
        service: 'process',
        method: 'start',
        confidence: 0.7,
        priority: 7,
        paramExtractor: () => ({})
      },
      {
        regex: /(stop|halt|terminate|end).*(server|process|service|application)/i,
        service: 'process',
        method: 'stop',
        confidence: 0.7,
        priority: 7,
        paramExtractor: () => ({})
      }
    );
    
    // Calculator operations
    this.patterns.push(
      {
        regex: /(calculate|compute|what is|how much is).*[\d\+\-\*\/]/i,
        service: 'calculator',
        method: 'calculate',
        confidence: 0.75,
        priority: 6,
        paramExtractor: (q: string) => {
          const expressionMatch = q.match(/(\d+(?:\.\d+)?\s*[\+\-\*\/]\s*\d+(?:\.\d+)?)/);
          return { expression: expressionMatch ? expressionMatch[1] : q };
        }
      }
    );
    
    // Sort patterns by priority (higher priority first)
    this.patterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }
  
  /**
   * Parse query using rule-based patterns
   */
  async parse(query: string, context?: ParserContext): Promise<IntentResult> {
    this.logParsingAttempt(query, context);
    
    const { result, duration } = await this.measureExecutionTime(
      () => this.parseInternal(query, context),
      'rule-based parsing'
    );
    
    this.logParsingResult(result, duration);
    return result;
  }
  
  /**
   * Internal parsing logic
   */
  private async parseInternal(query: string, context?: ParserContext): Promise<IntentResult> {
    const queryLower = query.toLowerCase();
    
    // 1. Try rule patterns first (fastest)
    for (const pattern of this.patterns) {
      if (pattern.regex.test(query)) {
        const parameters = pattern.paramExtractor(query);
        return {
          service: pattern.service,
          method: pattern.method,
          parameters,
          confidence: pattern.confidence,
          parserType: this.getParserType(),
          metadata: {
            matchedPattern: pattern.regex.toString(),
            matchType: 'rule_pattern'
          }
        };
      }
    }
    
    // 2. Try tool name matching (if tools are available)
    const availableTools = this.getAvailableTools(context);
    if (availableTools.length > 0) {
      const toolMatch = this.matchToolByName(queryLower, availableTools);
      if (toolMatch) {
        return {
          service: toolMatch.service,
          method: toolMatch.method,
          parameters: {},
          confidence: toolMatch.confidence,
          parserType: this.getParserType(),
          metadata: {
            matchedTool: `${toolMatch.service}:${toolMatch.method}`,
            matchType: 'tool_name'
          }
        };
      }
    }
    
    // 3. Try keyword matching (fallback)
    const keywordMatch = this.matchByKeywords(queryLower);
    if (keywordMatch) {
      return {
        service: keywordMatch.service,
        method: keywordMatch.method,
        parameters: {},
        confidence: keywordMatch.confidence,
        parserType: this.getParserType(),
        metadata: {
          matchedKeywords: keywordMatch.keywords.join(', '),
          matchType: 'keyword'
        }
      };
    }
    
    // 4. Return fallback result
    return this.createFallbackResult(query);
  }
  
  /**
   * Match query against available tools by name
   */
  private matchToolByName(query: string, availableTools: string[]): 
    { service: string; method: string; confidence: number } | null {
    
    // Build tool cache if not already built
    if (this.toolCache.size === 0) {
      for (const tool of availableTools) {
        const [service, method] = tool.split(':');
        if (service && method) {
          this.toolCache.set(tool.toLowerCase(), { service, method });
        }
      }
    }
    
    // Try exact tool name match
    for (const [toolName, toolInfo] of this.toolCache) {
      if (toolName.includes(query) || query.includes(toolName)) {
        return {
          service: toolInfo.service,
          method: toolInfo.method,
          confidence: 0.7
        };
      }
    }
    
    // Try partial matching
    for (const [toolName, toolInfo] of this.toolCache) {
      const toolParts = toolName.split(':');
      for (const part of toolParts) {
        if (query.includes(part) || part.includes(query)) {
          return {
            service: toolInfo.service,
            method: toolInfo.method,
            confidence: 0.6
          };
        }
      }
    }
    
    return null;
  }
  
  /**
   * Match query by keywords
   */
  private matchByKeywords(query: string): 
    { service: string; method: string; confidence: number; keywords: string[] } | null {
    
    const keywordMap: Record<string, { service: string; method: string; confidence: number }> = {
      'file': { service: 'filesystem', method: 'read', confidence: 0.6 },
      'directory': { service: 'filesystem', method: 'list', confidence: 0.6 },
      'folder': { service: 'filesystem', method: 'list', confidence: 0.6 },
      'ping': { service: 'network', method: 'ping', confidence: 0.7 },
      'network': { service: 'network', method: 'ping', confidence: 0.6 },
      'calculate': { service: 'calculator', method: 'calculate', confidence: 0.7 },
      'math': { service: 'calculator', method: 'calculate', confidence: 0.6 },
      'start': { service: 'process', method: 'start', confidence: 0.6 },
      'stop': { service: 'process', method: 'stop', confidence: 0.6 },
      'read': { service: 'filesystem', method: 'read', confidence: 0.7 },
      'write': { service: 'filesystem', method: 'write', confidence: 0.7 },
      'list': { service: 'filesystem', method: 'list', confidence: 0.7 },
    };
    
    const matchedKeywords: string[] = [];
    let bestMatch: { service: string; method: string; confidence: number } | null = null;
    let bestConfidence = 0;
    
    for (const [keyword, match] of Object.entries(keywordMap)) {
      if (query.includes(keyword)) {
        matchedKeywords.push(keyword);
        if (match.confidence > bestConfidence) {
          bestMatch = match;
          bestConfidence = match.confidence;
        }
      }
    }
    
    if (bestMatch && matchedKeywords.length > 0) {
      return {
        ...bestMatch,
        keywords: matchedKeywords
      };
    }
    
    return null;
  }
  
  /**
   * Add custom pattern to the parser
   */
  addPattern(pattern: Omit<RulePattern, 'priority'> & { priority?: number }): void {
    this.patterns.push({
      priority: 5,
      ...pattern
    });
    // Re-sort patterns
    this.patterns.sort((a, b) => (b.priority || 0) - (a.priority || 0));
    logger.debug(`[RuleBasedParser] Added custom pattern: ${pattern.regex.toString()}`);
  }
  
  /**
   * Clear tool cache (useful when available tools change)
   */
  clearToolCache(): void {
    this.toolCache.clear();
    logger.debug('[RuleBasedParser] Tool cache cleared');
  }
}