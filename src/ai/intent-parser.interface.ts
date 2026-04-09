/**
 * Unified Intent Parser Interface
 * Provides a consistent interface for all intent parsing implementations
 */

import { IntentResult } from './intent-types';

/**
 * Parser context providing additional information for intent parsing
 */
export interface ParserContext {
  /** Available tools for tool-based parsers */
  availableTools?: string[];
  /** Whether to use AI for parsing (for hybrid parsers) */
  useAI?: boolean;
  /** Maximum allowed response time in milliseconds */
  maxResponseTime?: number;
  /** Additional metadata for parsing */
  metadata?: Record<string, any>;
}

/**
 * Parser type classification
 */
export type ParserType = 'rule' | 'hybrid' | 'cloud';

/**
 * Parser configuration
 */
export interface ParserConfig {
  /** Minimum confidence threshold for accepting results */
  confidenceThreshold?: number;
  /** Parser-specific configuration */
  [key: string]: any;
}

/**
 * Unified intent parser interface
 */
export interface IntentParser {
  /**
   * Parse a natural language query into an intent
   * @param query The natural language query to parse
   * @param context Optional parsing context
   * @returns Parsed intent result
   */
  parse(query: string, context?: ParserContext): Promise<IntentResult>;
  
  /**
   * Get the type of this parser
   */
  getParserType(): ParserType;
  
  /**
   * Get the confidence threshold for this parser
   */
  getConfidenceThreshold(): number;
  
  /**
   * Update parser configuration
   */
  updateConfig?(config: Partial<ParserConfig>): void;
}

/**
 * Parser selection strategy
 */
export type ParserSelectionStrategy = 
  | 'fastest'      // Use the fastest parser that meets confidence threshold
  | 'most_accurate' // Use the most accurate parser regardless of speed
  | 'hybrid'       // Try rule-based first, fallback to AI
  | 'cost_aware';  // Consider cost (e.g., API calls) in selection

/**
 * Parser capability flags
 */
export interface ParserCapabilities {
  /** Whether the parser supports AI/LLM integration */
  supportsAI: boolean;
  /** Whether the parser supports tool-based matching */
  supportsToolMatching: boolean;
  /** Whether the parser supports parameter extraction */
  supportsParameterExtraction: boolean;
  /** Whether the parser supports complex intent decomposition */
  supportsIntentDecomposition: boolean;
  /** Average response time in milliseconds */
  averageResponseTime: number;
  /** Cost per request (if applicable) */
  costPerRequest?: number;
}