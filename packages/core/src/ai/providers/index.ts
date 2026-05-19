/**
 * Provider Registry — Strategy Pattern
 *
 * Manages registration and lookup of LLM provider implementations.
 * Adding a new provider is as simple as:
 * 1. Create a new class extending BaseLLMProvider
 * 2. Register it here with ProviderRegistry.register()
 */

import { BaseLLMProvider } from "./base-provider.js";
import { OpenAIProvider } from "./openai-provider.js";
import { AnthropicProvider } from "./anthropic-provider.js";
import { GoogleProvider } from "./google-provider.js";
import { AzureProvider } from "./azure-provider.js";
import { DeepSeekProvider } from "./deepseek-provider.js";
import { OllamaProvider } from "./ollama-provider.js";
import type { AIProvider } from "../../core/types.js";

/**
 * Provider Registry — manages provider instances
 */
export class ProviderRegistry {
  private static providers = new Map<string, new () => BaseLLMProvider>();

  /**
   * Register a provider class
   */
  static register(name: string, providerClass: new () => BaseLLMProvider): void {
    this.providers.set(name, providerClass);
  }

  /**
   * Create a provider instance by name
   */
  static create(name: string): BaseLLMProvider {
    const ProviderClass = this.providers.get(name);
    if (!ProviderClass) {
      throw new Error(`Unsupported provider: ${name}`);
    }
    return new ProviderClass();
  }

  /**
   * Check if a provider is registered
   */
  static has(name: string): boolean {
    return this.providers.has(name);
  }

  /**
   * Get all registered provider names
   */
  static getRegisteredProviders(): string[] {
    return Array.from(this.providers.keys());
  }
}

// Register all built-in providers
ProviderRegistry.register("openai", OpenAIProvider);
ProviderRegistry.register("anthropic", AnthropicProvider);
ProviderRegistry.register("google", GoogleProvider);
ProviderRegistry.register("azure", AzureProvider);
ProviderRegistry.register("deepseek", DeepSeekProvider);
ProviderRegistry.register("ollama", OllamaProvider);

// Re-export for convenience
export { BaseLLMProvider } from "./base-provider.js";
export { OpenAICompatibleProvider } from "./openai-compatible.js";
export { OpenAIProvider } from "./openai-provider.js";
export { AnthropicProvider } from "./anthropic-provider.js";
export { GoogleProvider } from "./google-provider.js";
export { AzureProvider } from "./azure-provider.js";
export { DeepSeekProvider } from "./deepseek-provider.js";
export { OllamaProvider } from "./ollama-provider.js";
