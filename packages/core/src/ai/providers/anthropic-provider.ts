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

    // Build request body per Anthropic Messages API spec.
    const requestBody: Record<string, unknown> = {
      model,
      max_tokens: options.maxTokens ?? 1024,
      messages: options.messages,
      temperature: options.temperature ?? 0.1,
    };

    // Anthropic Messages API tool format (different from OpenAI):
    // tools: [{ name, description, input_schema }] — no outer { type: "function" } wrapper.
    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        input_schema: tool.function.parameters,
      }));
      if (options.toolChoice) {
        requestBody.tool_choice = options.toolChoice === "none"
          ? { type: "none" }
          : options.toolChoice === "required"
            ? { type: "any" }
            : { type: "auto" };
      }
    }

    const response = await fetch(`${this.getBaseUrl()}/messages`, {
      method: "POST",
      headers: this.getHeaders(),
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      throw new Error(`Anthropic API error: ${response.status}`);
    }

    const raw = await response.json();

    // Parse response content blocks.
    // Anthropic responses may contain a mix of "text" and "tool_use" blocks.
    let text = "";
    const toolCalls: LLMResponse["toolCalls"] = [];

    if (Array.isArray(raw.content)) {
      for (const block of raw.content) {
        if (block.type === "text") {
          text = block.text || "";
        } else if (block.type === "tool_use") {
          toolCalls.push({
            id: block.id || `toolu_${Date.now()}`,
            type: "function",
            function: {
              name: block.name || "",
              arguments: typeof block.input === "object" ? JSON.stringify(block.input) : String(block.input || ""),
            },
          });
        }
      }
    }

    return {
      text,
      raw,
      provider: "anthropic",
      model,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
    };
  }
}
