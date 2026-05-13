/**
 * LLMClient — Unified LLM Provider Interface
 *
 * Uses the Strategy Pattern via ProviderRegistry to delegate to provider-specific implementations.
 * Adding a new provider is as simple as:
 * 1. Create a new class extending BaseLLMProvider in src/ai/providers/
 * 2. Register it in src/ai/providers/index.ts
 *
 * Supported providers: openai, anthropic, google, azure, deepseek, ollama
 */

import { logger } from "../core/logger.js";
import type { AIConfig, AIProvider } from "../core/types.js";
import { ProviderRegistry } from "./providers/index.js";
import type { BaseLLMProvider } from "./providers/base-provider.js";
import { telemetry } from "../telemetry/index.js";

// ==================== Types ====================

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  messages: LLMMessage[];
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: "text" | "json_object" };
  functions?: Array<{
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  }>;
  functionCall?: "auto" | "none" | { name: string };
  /** Tools in OpenAI-compatible format for function calling */
  tools?: Array<{
    type: "function";
    function: {
      name: string;
      description: string;
      parameters: Record<string, unknown>;
    };
  }>;
  /** Tool choice strategy */
  toolChoice?: "auto" | "none" | "required";
}

export interface LLMResponse {
  text: string;
  raw: unknown;
  provider: AIProvider;
  model: string;
  /** Parsed tool calls from the response */
  toolCalls?: Array<{
    id: string;
    type: string;
    function: {
      name: string;
      arguments: string;
    };
  }>;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

// ==================== LLMClient Class ====================

export class LLMClient {
  private config: AIConfig | null = null;
  private provider: BaseLLMProvider | null = null;

  /**
   * Configure the LLM client with provider settings
   */
  configure(config: AIConfig): void {
    this.config = config;

    if (config.provider === "none" || !config.provider) {
      this.provider = null;
      return;
    }

    if (!ProviderRegistry.has(config.provider)) {
      throw new Error(
        `Unsupported provider: ${config.provider}. Supported providers: ${ProviderRegistry.getRegisteredProviders().join(", ")}`,
      );
    }

    this.provider = ProviderRegistry.create(config.provider);
    this.provider.configure(config);
    logger.debug(`[LLMClient] Configured for provider: ${config.provider}`);
  }

  /**
   * Check if the client is configured and ready
   */
  isConfigured(): boolean {
    return this.config !== null && this.config.provider !== "none" && this.provider !== null;
  }

  /**
   * Get the current provider name
   */
  getProvider(): AIProvider | "none" {
    return this.config?.provider || "none";
  }

  /**
   * Get the current model name
   */
  getModel(): string {
    return this.provider?.getModel() || "unknown";
  }

  /**
   * Test connection to the configured provider
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.config || !this.provider) {
      return { success: false, message: "AI not configured" };
    }

    try {
      return await this.provider.testConnection();
    } catch (error: unknown) {
      return {
        success: false,
        message: `Connection test failed: ${(error instanceof Error ? error.message : String(error))}`,
      };
    }
  }

  /**
   * Send a chat completion request to the configured provider
   */
  async chat(options: LLMRequestOptions): Promise<LLMResponse> {
    if (!this.config || !this.provider) {
      throw new Error(
        "AI provider not configured. Please call configure() first.",
      );
    }

    const startTime = Date.now();
    const activeSpan = telemetry.tracer.getActiveSpan();
    const span = telemetry.tracer.startSpan("llm.chat", {
      parentSpanId: activeSpan?.spanId,
      attributes: {
        provider: this.config.provider,
        model: this.getModel(),
      },
    });

    // Extract system prompt and user message for recording
    const systemMsg = options.messages.find((m) => m.role === "system");
    const userMsg = options.messages.find((m) => m.role === "user");
    const toolsProvided = (options.tools || []).map((t) => ({
      name: t.function.name,
      description: t.function.description,
    }));

    try {
      const response = await this.provider.chat(options);
      const latency = Date.now() - startTime;

      telemetry.tracer.addEvent(span.spanId, {
        name: "llm.response",
        attributes: {
          latency,
          toolCalls: response.toolCalls?.length || 0,
        },
      });

      // Record AI interaction
      telemetry.promptRecorder.recordAIRecord({
        id: `ai_${startTime}_${Math.random().toString(36).substr(2, 9)}`,
        traceId: span.traceId,
        timestamp: new Date(startTime).toISOString(),
        provider: this.config.provider,
        model: this.getModel(),
        systemPrompt: systemMsg?.content || "",
        userMessage: userMsg?.content || "",
        toolsProvided,
        rawResponse: response.raw || response.text,
        parsedToolCalls: (response.toolCalls || []).map((tc) => ({
          name: tc.function.name,
          args: tc.function.arguments,
        })),
        latency,
        success: true,
      });

      // Record timing metric
      telemetry.metrics.timing("llm.request.duration", latency, {
        provider: this.config.provider,
        model: this.getModel(),
      });
      telemetry.metrics.increment("llm.request.count", {
        provider: this.config.provider,
      });

      telemetry.tracer.endSpan(span.spanId, "ok");
      return response;
    } catch (error: unknown) {
      const latency = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      telemetry.tracer.addEvent(span.spanId, {
        name: "llm.error",
        attributes: { error: errorMessage, latency },
      });

      // Record failed AI interaction
      telemetry.promptRecorder.recordAIRecord({
        id: `ai_${startTime}_${Math.random().toString(36).substr(2, 9)}`,
        traceId: span.traceId,
        timestamp: new Date(startTime).toISOString(),
        provider: this.config.provider,
        model: this.getModel(),
        systemPrompt: systemMsg?.content || "",
        userMessage: userMsg?.content || "",
        toolsProvided,
        rawResponse: null,
        parsedToolCalls: [],
        latency,
        success: false,
        error: errorMessage,
      });

      telemetry.metrics.increment("llm.request.error", {
        provider: this.config.provider,
      });

      telemetry.tracer.endSpan(span.spanId, "error");
      logger.error(`[LLMClient] Chat request failed: ${errorMessage}`);
      throw error;
    }
  }
}

// Singleton instance
let defaultClient: LLMClient | null = null;

export function getLLMClient(): LLMClient {
  if (!defaultClient) {
    defaultClient = new LLMClient();
  }
  return defaultClient;
}
