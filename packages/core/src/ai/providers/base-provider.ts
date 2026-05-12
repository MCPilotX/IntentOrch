/**
 * Base LLM Provider — Strategy Pattern
 *
 * All providers must extend this abstract class and implement:
 * - testConnection(): Test connectivity to the provider
 * - chat(): Send a chat completion request
 * - getBaseUrl(): Get the base URL for API calls
 * - getHeaders(): Get HTTP headers for API calls
 */

import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";
import type { AIConfig } from "../../core/types.js";

export abstract class BaseLLMProvider {
  protected config: AIConfig | null = null;

  /**
   * Configure the provider with AI settings
   */
  configure(config: AIConfig): void {
    this.config = config;
  }

  /**
   * Get the provider name (e.g., "openai", "anthropic")
   */
  abstract get name(): string;

  /**
   * Get the default model for this provider
   */
  abstract get defaultModel(): string;

  /**
   * Get the base URL for API calls
   */
  abstract getBaseUrl(): string;

  /**
   * Get HTTP headers for API calls
   */
  abstract getHeaders(): Record<string, string>;

  /**
   * Test connection to the provider
   */
  abstract testConnection(): Promise<ConnectionTestResult>;

  /**
   * Send a chat completion request
   */
  abstract chat(options: LLMRequestOptions): Promise<LLMResponse>;

  /**
   * Check if the provider is properly configured
   */
  isConfigured(): boolean {
    return this.config !== null;
  }

  /**
   * Get the current model name
   */
  getModel(): string {
    return this.config?.model || this.defaultModel;
  }
}
