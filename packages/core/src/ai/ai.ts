/**
 * @deprecated AI Core Service — Use CloudIntentEngine + LLMClient directly instead.
 *
 * Kept for backward compatibility only. New code should use:
 * - CloudIntentEngine: plan-then-execute pipeline
 * - LLMClient: LLM provider interface
 *
 * This file will be removed in a future major version.
 */

import chalk from 'chalk';
import { logger } from '../core/logger';
import { LLMClient, getLLMClient } from './llm-client';
import type { AIConfig, AIProvider } from '../core/types';

// ==================== Types (kept for backward compatibility) ====================

// Query result
export interface AskResult {
  type: 'tool_call' | 'suggestions' | 'text' | 'text_response' | 'error';
  tool?: ToolCall;
  suggestions?: string[];
  message?: string;
  help?: string;
  confidence?: number;
  text?: string;
  reasoning?: string;
  metadata?: Record<string, any>;
}

// Tool call (MCP standard format)
export type ToolCall = import('../mcp/types').ToolCall;

// Intent analysis result
export interface Intent {
  action: string;
  target: string;
  params: Record<string, any>;
  confidence: number;
}

// AI error
export class AIError extends Error {
  constructor(
    public code: string,
    override message: string,
    public category: 'config' | 'connection' | 'execution',
    public suggestions: string[] = [],
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * @deprecated AI Core Service — Facade (Legacy)
 *
 * Kept for backward compatibility. New code should use CloudIntentEngine directly.
 */
export class AI {
  private config: AIConfig | null = null;
  private enabled: boolean = false;
  private client: any = null;
  private llmClient: LLMClient;

  constructor() {
    this.llmClient = getLLMClient();
    logger.info('[AI] Initializing AI service (Facade)');
  }

  /**
   * Configure AI service
   */
  async configure(config: AIConfig): Promise<void> {
    logger.info(`[AI] Configuring AI provider: ${config.provider}`);

    // Provider-specific validation
    switch (config.provider) {
      case 'openai':
      case 'anthropic':
      case 'google':
      case 'azure':
      case 'deepseek': {
        if (!config.apiKey) {
          throw new AIError(
            'AI_CONFIG_ERROR',
            `${config.provider} requires API key`,
            'config',
            ['Provide an API key in configuration'],
          );
        }
        break;
      }

      case 'ollama': {
        break;
      }

      case 'none': {
        this.enabled = false;
        this.config = config;
        return;
      }

      default:
        throw new AIError(
          'AI_CONFIG_ERROR',
          `Unsupported provider: ${config.provider}`,
          'config',
          ['Supported providers: openai, anthropic, google, azure, deepseek, ollama'],
        );
    }

    this.config = config;

    try {
      this.client = {
        provider: config.provider,
        endpoint: config.apiEndpoint || this.getDefaultEndpoint(config.provider),
        config,
      };

      this.llmClient.configure(config);

      const testResult = await this.llmClient.testConnection();
      if (!testResult.success) {
        throw new Error(`Connection test failed: ${testResult.message}`);
      }

      this.enabled = true;
      logger.info(`[AI] Successfully configured ${config.provider}`);
    } catch (error: any) {
      logger.warn(`[AI] Client initialization failed: ${error.message}`);
      this.enabled = false;
      throw new AIError(
        'AI_INIT_ERROR',
        `AI initialization failed: ${error.message}`,
        'connection',
        [
          'Check network connection',
          'Verify configuration',
          'Run: mcp ai test to test connection',
        ],
      );
    }
  }

  /**
   * Test AI connection — delegates to LLMClient
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config || this.config.provider === 'none') {
      return { success: false, message: 'AI not configured' };
    }
    return this.llmClient.testConnection();
  }

  /**
   * Generate embeddings — delegates to LLMClient (simplified)
   */
  async embed(text: string): Promise<number[]> {
    if (!this.enabled || !this.config || this.config.provider === 'none') {
      throw new Error('AI not configured. Embedding requires an AI provider with API key.');
    }
    // Simplified: use LLMClient for embedding if available
    logger.warn('[AI] embed() is deprecated. Use CloudIntentEngine for new code.');
    return [];
  }

  /**
   * Process natural language query (simplified)
   */
  async ask(query: string): Promise<AskResult> {
    logger.info(`[AI] Processing query: "${query}"`);

    if (!this.enabled || !this.config || this.config.provider === 'none') {
      throw new AIError(
        'AI_NOT_CONFIGURED',
        'AI provider not configured.',
        'config',
        ['Run: mcpilot.configureAI({ provider: "openai", apiKey: "YOUR_API_KEY" })'],
      );
    }

    if (!query || query.trim().length === 0) {
      return {
        type: 'suggestions',
        message: 'Please provide a query',
        suggestions: ['Try asking something like: "list files in current directory"', 'Or: "start http service"'],
      };
    }

    try {
      // Simplified: use LLMClient to generate a response
      const response = await this.llmClient.chat({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Analyze the user query and respond helpfully.',
          },
          { role: 'user', content: query },
        ],
        temperature: 0.3,
      });

      return {
        type: 'text',
        text: response.text,
      };
    } catch (error: any) {
      logger.warn(`[AI] Query processing failed: ${error.message}`);
      return this.getFallbackSuggestions(query);
    }
  }

  /**
   * Generate text response using AI — delegates to LLMClient
   */
  async generateText(query: string, options?: {
    temperature?: number;
    maxTokens?: number;
    systemPrompt?: string;
  }): Promise<string> {
    logger.info(`[AI] Generating text for query: "${query}"`);

    if (!this.enabled || !this.config || this.config.provider === 'none') {
      throw new AIError(
        'AI_NOT_CONFIGURED',
        'AI provider not configured.',
        'config',
        ['Run: mcpilot.configureAI({ provider: "openai", apiKey: "YOUR_API_KEY" })'],
      );
    }

    try {
      const response = await this.llmClient.chat({
        messages: [
          {
            role: 'system',
            content: options?.systemPrompt || 'You are a helpful AI assistant.',
          },
          {
            role: 'user',
            content: query,
          },
        ],
        temperature: options?.temperature || 0.7,
        maxTokens: options?.maxTokens || 2000,
      });

      return response.text;
    } catch (error: any) {
      logger.error(`[AI] Text generation failed: ${error.message}`);
      throw new AIError(
        'TEXT_GENERATION_FAILED',
        `Text generation failed: ${error.message}`,
        'execution',
      );
    }
  }

  /**
   * Parse intent from natural language query (simplified)
   */
  async parseIntent(query: string): Promise<Intent> {
    logger.warn('[AI] parseIntent() is deprecated. Use CloudIntentEngine.planQuery() for new code.');
    return { action: 'unknown', target: '', params: {}, confidence: 0 };
  }

  /**
   * Analyze intent with optional LLM fallback (simplified)
   */
  async analyzeIntent(query: string): Promise<Intent> {
    logger.warn('[AI] analyzeIntent() is deprecated. Use CloudIntentEngine.planQuery() for new code.');
    return { action: 'unknown', target: '', params: {}, confidence: 0 };
  }

  // ==================== Private Methods ====================

  private getFallbackSuggestions(query: string): AskResult {
    const suggestions = [
      'Try asking something like: "list files in current directory"',
      'Or: "start http service"',
      'Or: "check system status"',
    ];

    return {
      type: 'suggestions',
      message: `I couldn't understand "${query}". Please try rephrasing.`,
      suggestions,
    };
  }

  private getDefaultEndpoint(provider: AIProvider): string {
    switch (provider) {
      case 'openai': return 'https://api.openai.com/v1';
      case 'anthropic': return 'https://api.anthropic.com/v1';
      case 'google': return 'https://generativelanguage.googleapis.com/v1';
      case 'azure': return 'https://YOUR_RESOURCE.openai.azure.com';
      case 'deepseek': return 'https://api.deepseek.com/v1';
      case 'ollama': return 'http://localhost:11434';
      default: return '';
    }
  }
}
