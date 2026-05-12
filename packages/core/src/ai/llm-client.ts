/**
 * LLMClient — Unified LLM Provider Interface
 *
 * Uses the Strategy Pattern via ProviderRegistry to delegate to provider-specific implementations.
 * Adding a new provider is as simple as:
 * 1. Create a new class extending BaseLLMProvider in src/ai/providers/
 * 2. Register it in src/ai/providers/index.ts
 *
 * Supported providers: openai, anthropic, google, azure, deepseek, ollama
 */

import { logger } from "../core/logger.js";
import type { AIConfig, AIProvider } from "../core/types.js";
import { ProviderRegistry } from "./providers/index.js";
import type { BaseLLMProvider } from "./providers/base-provider.js";

// ==================== Types ====================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "text" | "json_object" };
  functions?: Array<{
    name: string;
    description?: string;
    parameters: Record<string, any>;
  }>;
  functionCall?: "auto" | "none" | { name: string };
  /** Tools in OpenAI-compatible format for function calling */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }>;
  /** Tool choice strategy */
  toolChoice?: "auto" | "none" | "required";
}

export interface LLMResponse {
  text: string;
  raw: any;
  provider: AIProvider;
  model: string;
  /** Parsed tool calls from the response */
  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

// ==================== LLMClient Class ====================

export class LLMClient {
  private config: AIConfig | null = null;
  private provider: BaseLLMProvider | null = null;

  /**
   * Configure the LLM client with provider settings
   */
  configure(config: AIConfig): void {
    this.config = config;

    if (config.provider === "none" || !config.provider) {
      this.provider = null;
      return;
    }

    if (!ProviderRegistry.has(config.provider)) {
      throw new Error(
        `Unsupported provider: ${config.provider}. Supported providers: ${ProviderRegistry.getRegisteredProviders().join(", ")}`,
      );
    }

    this.provider = ProviderRegistry.create(config.provider);
    this.provider.configure(config);
    logger.debug(`[LLMClient] Configured for provider: ${config.provider}`);
  }

  /**
   * Check if the client is configured and ready
   */
  isConfigured(): boolean {
    return this.config !== null && this.config.provider !== "none" && this.provider !== null;
  }

  /**
   * Get the current provider name
   */
  getProvider(): AIProvider | "none" {
    return this.config?.provider || "none";
  }

  /**
   * Get the current model name
   */
  getModel(): string {
    return this.provider?.getModel() || "unknown";
  }

  /**
   * Test connection to the configured provider
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.config || !this.provider) {
      return { success: false, message: "AI not configured" };
    }

    try {
      return await this.provider.testConnection();
    } catch (error: any) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  /**
   * Send a chat completion request to the configured provider
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.config || !this.provider) {
      throw new Error(
        "AI provider not configured. Please call configure() first.",
      );
    }

    try {
      return await this.provider.chat(options);
    } catch (error: any) {
      logger.error(`[LLMClient] Chat request failed: ${error.message}`);
      throw error;
    }
  }
}

// Singleton instance
let defaultClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = new LLMClient();
  }
  return defaultClient;
}
