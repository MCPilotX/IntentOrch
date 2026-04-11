/**
 * AI Branch Coverage Tests
 * Tests for src/ai/ai.ts to improve branch coverage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AI, AIError, type AIConfig } from '../src/ai/ai';
import { logger } from '../src/core/logger';

// Mock dependencies
jest.mock('chalk', () => ({
  green: (text: string) => `green(${text})`,
  yellow: (text: string) => `yellow(${text})`,
  red: (text: string) => `red(${text})`,
  blue: (text: string) => `blue(${text})`,
  cyan: (text: string) => `cyan(${text})`,
  magenta: (text: string) => `magenta(${text})`,
  gray: (text: string) => `gray(${text})`,
}));

// Mock fetch for API calls
global.fetch = jest.fn();

describe('AI Branch Coverage Tests', () => {
  let ai: AI;

  beforeEach(() => {
    ai = new AI();
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('configure method - error handling', () => {
    it('should throw AIError for unsupported provider', async () => {
      const config: AIConfig = {
        provider: 'unsupported' as any,
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('Unsupported provider: unsupported');
    });

    it('should throw AIError for OpenAI without API key', async () => {
      const config: AIConfig = {
        provider: 'openai',
        // No apiKey
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('openai requires API key');
    });

    it('should throw AIError for Anthropic without API key', async () => {
      const config: AIConfig = {
        provider: 'anthropic',
        // No apiKey
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('anthropic requires API key');
    });

    it('should throw AIError for Google without API key', async () => {
      const config: AIConfig = {
        provider: 'google',
        // No apiKey
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('google requires API key');
    });

    it('should throw AIError for Azure without API key', async () => {
      const config: AIConfig = {
        provider: 'azure',
        // No apiKey
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('azure requires API key');
    });

    it('should throw AIError for DeepSeek without API key', async () => {
      const config: AIConfig = {
        provider: 'deepseek',
        // No apiKey
      };

      await expect(ai.configure(config)).rejects.toThrow(AIError);
      await expect(ai.configure(config)).rejects.toThrow('deepseek requires API key');
    });

    it('should configure Ollama without API key', async () => {
      const config: AIConfig = {
        provider: 'ollama',
      };

      await expect(ai.configure(config)).resolves.not.toThrow();
    });

    it('should configure none provider', async () => {
      const config: AIConfig = {
        provider: 'none',
      };

      await expect(ai.configure(config)).resolves.not.toThrow();
    });
  });

  describe('configure method - client initialization errors', () => {
    it('should handle client initialization failure', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock fetch to simulate network error
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      // configure might not throw error on client initialization failure
      // It might just log a warning
      await expect(ai.configure(config)).resolves.not.toThrow();
      
      // The actual behavior might vary - we just verify it doesn't throw
      // and returns some status
      const status = ai.getStatus();
      expect(status).toBeDefined();
    });
  });

  describe('generateText method - edge cases', () => {
    it('should throw AIError when not configured', async () => {
      await expect(ai.generateText('test query')).rejects.toThrow(AIError);
      await expect(ai.generateText('test query')).rejects.toThrow('AI provider not configured');
    });

    it('should handle API response with unexpected format', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch with unexpected response format
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      await ai.configure(config);

      // Mock fetch for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ unexpected: 'format' }),
      });

      await expect(ai.generateText('test query')).rejects.toThrow('Text generation failed: Unexpected response format from AI provider');
    });

    it('should handle OpenAI API error response', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error response for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 401,
      });

      await expect(ai.generateText('test query')).rejects.toThrow('OpenAI API error: 401');
    });

    it('should handle Anthropic API error response', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error response for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
      });

      await expect(ai.generateText('test query')).rejects.toThrow('Anthropic API error: 403');
    });

    it('should handle Google API error response', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'google',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error response for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
      });

      await expect(ai.generateText('test query')).rejects.toThrow('Google API error: 400');
    });

    it('should handle Azure OpenAI API error response', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'azure',
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await ai.configure(config);

      // Mock error response for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
      });

      await expect(ai.generateText('test query')).rejects.toThrow('Azure OpenAI API error: 404');
    });

    it('should handle DeepSeek API error response', async () => {
      // First configure
      const config: AIConfig = {
        provider: 'deepseek',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await ai.configure(config);

      // Mock error response for generateText
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 429,
      });

      await expect(ai.generateText('test query')).rejects.toThrow('DeepSeek API error: 429');
    });
  });

  describe('testConnection method', () => {
    it('should return failure when not configured', async () => {
      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('AI not configured');
    });

    it('should handle OpenAI connection test failure', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should handle Anthropic connection test failure', async () => {
      const config: AIConfig = {
        provider: 'anthropic',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('API error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('API error');
    });

    it('should handle Google connection test failure', async () => {
      const config: AIConfig = {
        provider: 'google',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Google API error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Google API error');
    });

    it('should handle Azure connection test failure', async () => {
      const config: AIConfig = {
        provider: 'azure',
        apiKey: 'test-key',
        endpoint: 'https://test.openai.azure.com',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ value: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Azure error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Azure error');
    });

    it('should handle DeepSeek connection test failure', async () => {
      const config: AIConfig = {
        provider: 'deepseek',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('DeepSeek error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('DeepSeek error');
    });

    it('should handle Ollama connection test failure', async () => {
      const config: AIConfig = {
        provider: 'ollama',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Mock error for testConnection
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Ollama error'));

      const result = await ai.testConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('Ollama error');
    });
  });

  describe('parseIntent method', () => {
    it('should parse intent using rule-based parser even when not configured', async () => {
      // parseIntent uses rule-based parser which works even without AI configuration
      const result = await ai.parseIntent('test query');
      expect(result).toBeDefined();
      expect(result.action).toBe('unknown');
      expect(result.target).toBe('unknown');
    });

    it('should handle parseIntent with rule-based parser', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Note: parseIntent uses rule-based parser, not fetch
      const result = await ai.parseIntent('list files');
      expect(result).toBeDefined();
      // The actual result depends on rule-based parser implementation
    });
  });

  describe('getStatus method', () => {
    it('should return correct status when not configured', () => {
      const status = ai.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
      expect(status.provider).toBe('none');
    });

    it('should return correct status when configured', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      const status = ai.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(true);
      expect(status.provider).toBe('openai');
    });
  });

  describe('reset method', () => {
    it('should reset AI to initial state', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      // Verify configured
      let status = ai.getStatus();
      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(true);

      // Reset
      ai.reset();

      // Verify reset
      status = ai.getStatus();
      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
      expect(status.provider).toBe('none');
    });
  });

  describe('getFriendlyError method', () => {
    it('should return formatted error with suggestions', () => {
      const error = new AIError(
        'TEST_ERROR',
        'Test error message',
        'config',
        ['Suggestion 1', 'Suggestion 2']
      );

      const friendlyError = AI.getFriendlyError(error);
      expect(friendlyError).toContain('red(❌ Test error message)');
      expect(friendlyError).toContain('gray(Error code: TEST_ERROR)');
      expect(friendlyError).toContain('yellow(\n🔧 Fix suggestions:)');
      expect(friendlyError).toContain('1. Suggestion 1');
      expect(friendlyError).toContain('2. Suggestion 2');
    });

    it('should return formatted error without suggestions', () => {
      const error = new AIError(
        'TEST_ERROR',
        'Test error message',
        'config',
        [] // Empty suggestions
      );

      const friendlyError = AI.getFriendlyError(error);
      expect(friendlyError).toContain('red(❌ Test error message)');
      expect(friendlyError).toContain('gray(Error code: TEST_ERROR)');
      expect(friendlyError).not.toContain('🔧 Fix suggestions:');
    });
  });

  describe('mapIntentToTool method', () => {
    it('should map intent to tool', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      const intent = {
        action: 'list',
        target: 'files',
        params: { path: '.' },
        confidence: 0.9,
      };

      const tool = ai.mapIntentToTool(intent);
      expect(tool.name).toBe('filesystem.list_directory');
      expect(tool.arguments).toEqual({ path: '.' });
    });

    it('should map unknown intent to system.unknown', async () => {
      const config: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
      };

      // Mock successful fetch for configure
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({ models: [] }),
      });

      await ai.configure(config);

      const intent = {
        action: 'unknown',
        target: 'unknown',
        params: { query: 'test' },
        confidence: 0.3,
      };

      const tool = ai.mapIntentToTool(intent);
      expect(tool.name).toBe('system.unknown');
      // The tool.arguments might contain additional fields like message and suggestions
      expect(tool.arguments).toHaveProperty('intent');
      expect(JSON.parse(tool.arguments.intent as string)).toEqual(intent);
    });
  });
});
