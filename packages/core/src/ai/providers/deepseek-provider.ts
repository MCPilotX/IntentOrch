/**
 * DeepSeek Provider
 *
 * Uses OpenAI-compatible API format
 */

import { OpenAICompatibleProvider } from "./openai-compatible.js";

export class DeepSeekProvider extends OpenAICompatibleProvider {
  get name(): string {
    return "deepseek";
  }

  get defaultModel(): string {
    return "deepseek-chat";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "https://api.deepseek.com/v1";
  }

  getHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config?.apiKey || ""}`,
      "Content-Type": "application/json",
    };
  }
}
