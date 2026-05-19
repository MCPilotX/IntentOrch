import { logger } from "../core/logger.js";
/**
 * CloudIntentEngine Factory
 * Creates properly configured CloudIntentEngine instances using OrchApp configuration system
 */

import { CloudIntentEngine, type CloudIntentEngineConfig } from "../ai/cloud-intent-engine.js";
import { ValidationLevel } from "../mcp/parameter-mapper.js";
import { getAIConfig } from "../core/config-service.js";
import type { AIConfig } from "../core/types.js";

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
    defaultTools?: Record<string, unknown>;
  };

  /**
   * Parameter mapping configuration
   */
  parameterMapping?: {
    validationLevel?: "strict" | "warning" | "none";
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
  options: CloudIntentEngineOptions = {},
): Promise<CloudIntentEngine> {
  // Get AI configuration from system or use provided override
  let aiConfig: AIConfig;

  if (options.aiConfig) {
    aiConfig = options.aiConfig;
  } else {
    try {
      aiConfig = await getAIConfig();
    } catch (error) {
      logger.warn(
        "Failed to load AI configuration from system, using environment variables as fallback",
      );

      // Fallback to environment variables
      aiConfig = {
        provider: (process.env.LLM_PROVIDER || "deepseek") as any,
        apiKey: process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY,
        model: process.env.LLM_MODEL || "deepseek-chat",
        apiEndpoint: process.env.LLM_API_ENDPOINT || "",
      };
    }
  }

  // Validate AI configuration
  if (!aiConfig.provider) {
    throw new Error(
      "AI configuration is incomplete. Please set provider in " +
        "~/.intorch/config.json or provide it via environment variables.\n" +
        "You can set configuration using: intorch config set provider <provider>",
    );
  }

  // For Ollama, apiKey is not required
  if (aiConfig.provider !== "ollama" && !aiConfig.apiKey) {
    throw new Error(
      `API key is required for provider "${aiConfig.provider}". Please set apiKey in ` +
        "~/.intorch/config.json or provide it via environment variables.\n" +
        "You can set configuration using: intorch config set apiKey <your-api-key>",
    );
  }

  // Build the CloudIntentEngine configuration
  const config: CloudIntentEngineConfig = {
    llm: {
      provider: aiConfig.provider as any,
      apiKey: aiConfig.apiKey,
      model: aiConfig.model || "gpt-3.5-turbo",
      endpoint: aiConfig.apiEndpoint || "",
      temperature: 0.3,
      maxTokens: 1000,
      timeout: 30000,
      maxRetries: 3,
    },
    execution: {
      maxConcurrentTools: 3,
      timeout: 60000,
      retryAttempts: 2,
      retryDelay: 1000,
      ...options.execution,
    },
    fallback: {
      enableKeywordMatching: true,
      askUserOnFailure: false,
      defaultTools: {} as Record<string, string>,
      ...(options.fallback ? { ...options.fallback, defaultTools: (options.fallback.defaultTools ?? {}) as Record<string, string> } : {}),
    },
    parameterMapping: {
      validationLevel: "warning" as ValidationLevel | undefined,
      enableCompatibilityMappings: true,
      logWarnings: true,
      enforceRequired: false,
      ...options.parameterMapping,
    } as CloudIntentEngineConfig["parameterMapping"],
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
  public async createEngine(
    options: CloudIntentEngineOptions = {},
  ): Promise<CloudIntentEngine> {
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
export async function getCloudIntentEngine(
  options?: CloudIntentEngineOptions,
): Promise<CloudIntentEngine> {
  return cloudIntentEngineFactory.createEngine(options);
}

/**
 * Get the default CloudIntentEngine instance
 */
export async function getDefaultCloudIntentEngine(): Promise<CloudIntentEngine> {
  return cloudIntentEngineFactory.getDefaultEngine();
}
