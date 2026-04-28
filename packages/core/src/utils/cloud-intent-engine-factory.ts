import { logger } from "../core/logger";
/**
 * CloudIntentEngine Factory
 * Creates properly configured CloudIntentEngine instances using OrchApp configuration system
 */

import { CloudIntentEngine } from '../ai/cloud-intent-engine';
import { getAIConfig, AIConfig } from './config';

export interface CloudIntentEngineOptions {
  /**
   * Override AI configuration (optional)
   * If not provided, uses system configuration from ~/.intorch/config.json
   */
  aiConfig?: AIConfig;
  
  /**
   * Execution configuration
   */
  execution?: {
    maxConcurrentTools?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
  };
  
  /**
   * Fallback configuration
   */
  fallback?: {
    enableKeywordMatching?: boolean;
    askUserOnFailure?: boolean;
    defaultTools?: Record<string, any>;
  };
  
  /**
   * Parameter mapping configuration
   */
  parameterMapping?: {
    validationLevel?: 'strict' | 'warning' | 'none';
    enableCompatibilityMappings?: boolean;
    logWarnings?: boolean;
    enforceRequired?: boolean;
  };
}

/**
 * Creates a CloudIntentEngine instance with proper configuration
 * @param options Configuration options
 * @returns Configured CloudIntentEngine instance
 */
export async function createCloudIntentEngine(
  options: CloudIntentEngineOptions = {}
): Promise<CloudIntentEngine> {
  // Get AI configuration from system or use provided override
  let aiConfig: AIConfig;
  
  if (options.aiConfig) {
    aiConfig = options.aiConfig;
  } else {
    try {
      aiConfig = await getAIConfig();
    } catch (error) {
      logger.warn('Failed to load AI configuration from system, using environment variables as fallback');
      
      // Fallback to environment variables
      aiConfig = {
        provider: process.env.LLM_PROVIDER as any || 'deepseek',
        apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
        model: process.env.LLM_MODEL || 'deepseek-chat'
      };
    }
  }
  
  // Validate AI configuration
  if (!aiConfig.provider || !aiConfig.apiKey) {
    throw new Error(
      'AI configuration is incomplete. Please set provider and apiKey in ' +
      '~/.intorch/config.json or provide them via environment variables.\n' +
      'You can set configuration using: intorch config set provider <provider>\n' +
      'And: intorch config set apiKey <your-api-key>'
    );
  }
  
  // Build the CloudIntentEngine configuration
  const config = {
    llm: {
      provider: aiConfig.provider as any, // Type assertion to avoid import issues
      apiKey: aiConfig.apiKey,
      model: aiConfig.model || 'gpt-3.5-turbo',
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 30000,
      maxRetries: 3
    },
    execution: {
      maxConcurrentTools: 3,
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 1000,
      ...options.execution
    },
    fallback: {
      enableKeywordMatching: true,
      askUserOnFailure: false,
      defaultTools: {},
      ...options.fallback
    },
    parameterMapping: {
      validationLevel: 'warning' as any, // Type assertion for compatibility
      enableCompatibilityMappings: true,
      logWarnings: true,
      enforceRequired: false,
      ...options.parameterMapping
    }
  };
  
  // Create the engine
  const engine = new CloudIntentEngine(config);
  
  // The engine is initialized in the constructor - no separate initialize() call needed
  return engine;
}

/**
 * Factory class for creating CloudIntentEngine instances
 */
export class CloudIntentEngineFactory {
  private static instance: CloudIntentEngineFactory;
  private defaultEngine: CloudIntentEngine | null = null;
  
  private constructor() {}
  
  /**
   * Get singleton instance of the factory
   */
  public static getInstance(): CloudIntentEngineFactory {
    if (!CloudIntentEngineFactory.instance) {
      CloudIntentEngineFactory.instance = new CloudIntentEngineFactory();
    }
    return CloudIntentEngineFactory.instance;
  }
  
  /**
   * Create a new CloudIntentEngine instance
   */
  public async createEngine(options: CloudIntentEngineOptions = {}): Promise<CloudIntentEngine> {
    return createCloudIntentEngine(options);
  }
  
  /**
   * Get or create a default CloudIntentEngine instance
   */
  public async getDefaultEngine(): Promise<CloudIntentEngine> {
    if (!this.defaultEngine) {
      this.defaultEngine = await createCloudIntentEngine();
    }
    return this.defaultEngine;
  }
  
  /**
   * Reset the default engine (useful for testing)
   */
  public resetDefaultEngine(): void {
    this.defaultEngine = null;
  }
}

// Export convenience functions
export const cloudIntentEngineFactory = CloudIntentEngineFactory.getInstance();

/**
 * Convenience function to create a CloudIntentEngine
 */
export async function getCloudIntentEngine(options?: CloudIntentEngineOptions): Promise<CloudIntentEngine> {
  return cloudIntentEngineFactory.createEngine(options);
}

/**
 * Get the default CloudIntentEngine instance
 */
export async function getDefaultCloudIntentEngine(): Promise<CloudIntentEngine> {
  return cloudIntentEngineFactory.getDefaultEngine();
}