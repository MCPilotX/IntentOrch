/**
 * Anthropic Provider
 */

import { BaseLLMProvider } from "./base-provider.js";
import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";

export class AnthropicProvider extends BaseLLMProvider {
  get name(): string {
    return "anthropic";
  }

  get defaultModel(): string {
    return "claude-3-haiku-20240307";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "https://api.anthropic.com/v1";
  }

  getHeaders(): Record<string, string> {
    return {
      "x-api-key": this.config?.apiKey || "",
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(`${this.getBaseUrl()}/messages`, {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          model: this.getModel(),
          max_tokens: 10,
          messages: [{ role: "user", content: "Hello" }],
        }),
      });

      if (response.ok) {
        return { success: true, message: "Anthropic connection OK" };
      }
      return {
        success: false,
        message: `API returned error: ${response.status}`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Connection test failed: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = this.getModel();

    const response = await fetch(`${this.getBaseUrl()}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 1024,
        messages: options.messages,
        temperature: options.temperature ?? 0.1,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const raw = await response.json();
    return {
      text: raw.content?.[0]?.text || "",
      raw,
      provider: "anthropic",
      model,
    };
  }
}
