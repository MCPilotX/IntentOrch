/**
 * Google Gemini Provider
 */

import { BaseLLMProvider } from "./base-provider.js";
import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";

export class GoogleProvider extends BaseLLMProvider {
  get name(): string {
    return "google";
  }

  get defaultModel(): string {
    return "gemini-pro";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "https://generativelanguage.googleapis.com/v1";
  }

  getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    try {
      const response = await fetch(
        `${this.getBaseUrl()}/models?key=${this.config?.apiKey || ""}`,
      );

      if (response.ok) {
        return { success: true, message: "Google Gemini connection OK" };
      }
      return {
        success: false,
        message: `API returned error: ${response.status}`,
      };
    } catch (error: any) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`,
      };
    }
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const model = this.getModel();
    const apiKey = this.config?.apiKey || "";

    const response = await fetch(
      `${this.getBaseUrl()}/models/${model}:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: this.getHeaders(),
        body: JSON.stringify({
          contents: options.messages.map((msg) => ({
            parts: [{ text: msg.content }],
            role: msg.role === "user" ? "user" : "model",
          })),
          generationConfig: {
            temperature: options.temperature ?? 0.1,
            maxOutputTokens: options.maxTokens ?? 1024,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(`Google API error: ${response.status}`);
    }

    const raw = await response.json();
    return {
      text: raw.candidates?.[0]?.content?.parts?.[0]?.text || "",
      raw,
      provider: "google",
      model,
    };
  }
}
