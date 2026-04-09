/**
 * Intent Types for AI Module
 * Common types and interfaces for natural language intent parsing
 */

import { Tool } from '../mcp/types';

/**
 * Basic intent structure (atomic)
 */
export interface Intent {
  /** Action to perform (e.g., "read", "write", "search") */
  action: string;
  
  /** Target of the action (e.g., "file", "directory", "database") */
  target: string;
  
  /** Additional parameters for the intent */
  parameters?: Record<string, any>;
  
  /** Context information */
  context?: {
    user?: Record<string, any>;
    system?: Record<string, any>;
    [key: string]: any;
  };
}

/**
 * Intent result from parsing
 * Unified result format for all parser implementations
 */
export interface IntentResult {
  /** Service name (e.g., "filesystem", "calculator") */
  service: string;
  
  /** Method name (e.g., "read", "calculate") */
  method: string;
  
  /** Parameters for the method */
  parameters: Record<string, any>;
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Parser type that produced this result */
  parserType?: string;
  
  /** Error message if parsing failed */
  error?: string;
  
  /** Additional metadata */
  metadata?: {
    aiUsed?: boolean;
    provider?: string;
    duration?: number;
    [key: string]: any;
  };
}

/**
 * Orchestration context (shared by parsers)
 */
export interface OrchestrationContext {
  /** Available tools for matching */
  availableTools: string[];
  
  /** User context (preferences, history, etc.) */
  userContext?: Record<string, any>;
  
  /** System context (environment, constraints, etc.) */
  systemContext?: Record<string, any>;
  
  /** Execution history */
  executionHistory?: any[];
  
  /** User preferences */
  preferences?: Record<string, any>;
}
