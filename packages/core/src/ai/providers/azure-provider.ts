/**
 * Azure OpenAI Provider
 */

import { BaseLLMProvider } from "./base-provider.js";
import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";

export class AzureProvider extends BaseLLMProvider {
  get name(): string {
    return "azure";
  }

  get defaultModel(): string {
    return "gpt-35-turbo";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "https://YOUR_RESOURCE.openai.azure.com";
  }

  getHeaders(): Record<string, string> {
    return {
      "api-key": this.config?.apiKey || "",
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.config?.apiEndpoint) {
      return { success: false, message: "Missing API endpoint for Azure" };
    }

    try {
      const apiVersion = this.config.apiVersion || "2024-02-15-preview";
      const endpoint = this.config.apiEndpoint.replace(/\/$/, "");
      const url = `${endpoint}/openai/deployments?api-version=${apiVersion}`;

      const response = await fetch(url, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { success: true, message: "Azure OpenAI connection OK" };
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
    const endpoint = this.config?.apiEndpoint || "https://YOUR_RESOURCE.openai.azure.com";
    const apiVersion = this.config?.apiVersion || "2024-02-15-preview";
    const url = `${endpoint}/openai/deployments/${model}/chat/completions?api-version=${apiVersion}`;

    const requestBody: Record<string, unknown> = {
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1024,
    };

    if (options.functions && options.functions.length > 0) {
      requestBody.functions = options.functions;
      requestBody.function_call = options.functionCall || "auto";
    }

    const response = await fetch(url, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Azure OpenAI API error: ${response.status}`);
    }

    const raw = await response.json();
    return {
      text: raw.choices?.[0]?.message?.content || "",
      raw,
      provider: "azure",
      model,
    };
  }
}
