/**
 * Ollama Provider
 */

import { BaseLLMProvider } from "./base-provider.js";
import type { LLMRequestOptions, LLMResponse, ConnectionTestResult } from "../llm-client.js";

export class OllamaProvider extends BaseLLMProvider {
  get name(): string {
    return "ollama";
  }

  get defaultModel(): string {
    return "llama2";
  }

  getBaseUrl(): string {
    return this.config?.apiEndpoint || "http://localhost:11434";
  }

  getHeaders(): Record<string, string> {
    return {
      "Content-Type": "application/json",
    };
  }

  async testConnection(): Promise<ConnectionTestResult> {
    const endpoint = this.getBaseUrl();
    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (response.ok) {
        return { success: true, message: `Ollama connection OK (${endpoint})` };
      }
      return {
        success: false,
        message: `Ollama service error: ${response.status}`,
      };
    } catch (error: unknown) {
      return {
        success: false,
        message: `Connection test failed: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    const endpoint = this.getBaseUrl();
    const model = this.getModel();

    const requestBody: Record<string, unknown> = {
      model,
      messages: options.messages,
      stream: false,
      options: {
        temperature: options.temperature ?? 0.1,
        num_predict: options.maxTokens ?? 1024,
      },
    };

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
      if (options.toolChoice) {
        requestBody.tool_choice = options.toolChoice;
      }
    }

    if (options.functions && options.functions.length > 0) {
      requestBody.functions = options.functions;
      if (options.functionCall) {
        requestBody.function_call = options.functionCall;
      }
    }

    const response = await fetch(`${endpoint}/api/chat`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status}`);
    }

    const raw = await response.json();
    const message = raw.message || {};
    const toolCalls = message.tool_calls;

    return {
      text: message.content || "",
      raw,
      provider: "ollama",
      model,
      toolCalls: toolCalls
        ? toolCalls.map((tc: { id?: string; function?: { name?: string; arguments?: unknown } }, idx: number) => ({
            id: tc.id || `call_${idx}`,
            type: "function",
            function: {
              name: tc.function?.name || "",
              arguments:
                typeof tc.function?.arguments === "string"
                  ? tc.function.arguments
                  : JSON.stringify(tc.function?.arguments || {}),
            },
          }))
        : undefined,
    };
  }
}
