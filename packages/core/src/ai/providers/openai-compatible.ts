/**
 * OpenAI-Compatible Provider Base Class
 *
 * Shared implementation for providers that use the OpenAI-compatible API format:
 * - OpenAI
 * - DeepSeek
 * - Any other OpenAI-compatible provider
 *
 * Subclasses only need to override:
 * - name, defaultModel, getBaseUrl(), getHeaders()
 */

import { BaseLLMProvider } from "./base-provider.js";
import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";

export abstract class OpenAICompatibleProvider extends BaseLLMProvider {
  /**
   * Test connection by calling the models endpoint
   */
  async testConnection(): Promise<ConnectionTestResult> {
    const baseUrl = this.getBaseUrl();
    try {
      const response = await fetch(`${baseUrl}/models`, {
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { success: true, message: `${this.name} connection OK` };
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

  /**
   * Send a chat completion request using OpenAI-compatible API
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const baseUrl = this.getBaseUrl();
    const model = this.getModel();

    const requestBody: Record<string, unknown> = {
      model,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
      max_tokens: options.maxTokens ?? 1024,
    };

    if (options.responseFormat) {
      requestBody.response_format = options.responseFormat;
    }
    if (options.functions && options.functions.length > 0) {
      requestBody.functions = options.functions;
      requestBody.function_call = options.functionCall || "auto";
    }
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      requestBody.tool_choice = options.toolChoice || "auto";
      if (options.toolChoice === "required") {
        requestBody.strict = true;
      }
    }

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`${this.name} API error: ${response.status}`);
    }

    const raw = await response.json();
    return {
      text: raw.choices?.[0]?.message?.content || "",
      raw,
      provider: this.name as unknown as import("../../core/types.js").AIProvider,
      model,
      toolCalls: raw.choices?.[0]?.message?.tool_calls || undefined,
    };
  }
}
