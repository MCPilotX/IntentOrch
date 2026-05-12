/**
 * OpenAI Provider
 */

import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class OpenAIProvider extends OpenAICompatibleProvider {
  get name(): string {
    return "openai";
  }

  get defaultModel(): string {
    return "gpt-3.5-turbo";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "https://api.openai.com/v1";
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config?.apiKey || ""}`,
      "Content-Type": "application/json",
    };
  }
}
