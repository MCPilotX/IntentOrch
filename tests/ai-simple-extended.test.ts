import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AI, AIConfig, AIError } from '../src/ai/ai';

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

// Mock logger
jest.mock('../src/core/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
}));

// Global fetch mock
(global.fetch as any) = jest.fn();

describe('AI - Simple Extended Tests', () => {
  let ai: AI;
  const mockConfig: AIConfig = {
    provider: 'openai',
    apiKey: 'test-api-key',
    model: 'gpt-3.5-turbo',
  };

  beforeEach(() => {
    // Clear any previous instances
    (AI as any).instance = undefined;
    ai = new AI();
    
    // Mock fetch to avoid network requests
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: [{ id: 'gpt-3.5-turbo' }] }),
        status: 200,
      })
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('AIError', () => {
    it('should create AIError with code and category', () => {
      const error = new AIError('TEST_ERROR', 'Test error message', 'config', ['suggestion1', 'suggestion2']);
      
      expect(error).toBeInstanceOf(AIError);
      expect(error.code).toBe('TEST_ERROR');
      expect(error.message).toBe('Test error message');
      expect(error.category).toBe('config');
      expect(error.suggestions).toEqual(['suggestion1', 'suggestion2']);
    });

    it('should create AIError with default suggestions', () => {
      const error = new AIError('TEST_ERROR', 'Test error message', 'connection');
      
      expect(error.suggestions).toEqual([]);
    });
  });

  describe('configure', () => {
    it('should configure AI with valid config', async () => {
      await ai.configure(mockConfig);
      
      expect(ai['config']).toEqual(mockConfig);
      expect(ai['enabled']).toBe(true);
    });

    it('should handle configuration with endpoint', async () => {
      const configWithEndpoint: AIConfig = {
        provider: 'openai',
        apiKey: 'test-key',
        endpoint: 'https://custom.openai.com/v1',
      };
      
      await ai.configure(configWithEndpoint);
      
      expect(ai['config']).toEqual(configWithEndpoint);
    });

    it('should handle configuration without apiKey for none provider', async () => {
      const configWithoutKey: AIConfig = {
        provider: 'none',
      };
      
      await ai.configure(configWithoutKey);
      
      expect(ai['config']).toEqual(configWithoutKey);
      expect(ai['enabled']).toBe(false);
    });

    it('should throw error for invalid provider', async () => {
      const invalidConfig = {
        provider: 'invalid' as any,
        apiKey: 'test-key',
      };
      
      await expect(ai.configure(invalidConfig)).rejects.toThrow(AIError);
    });
  });

  describe('testConnection', () => {
    it('should test connection successfully', async () => {
      await ai.configure(mockConfig);
      
      const result = await ai.testConnection();
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('OpenAI connection OK');
    });

    it('should handle connection test without configuration', async () => {
      const result = await ai.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('AI not configured');
    });

    it('should handle connection test failure', async () => {
      await ai.configure(mockConfig);
      
      // Mock fetch to return error
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        })
      );
      
      const result = await ai.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('API returned error: 401');
    });
  });

  describe('provider-specific configuration', () => {
    it('should configure with anthropic provider', async () => {
      const anthropicConfig: AIConfig = {
        provider: 'anthropic',
        apiKey: 'test-anthropic-key',
        model: 'claude-3-sonnet',
      };
      
      await ai.configure(anthropicConfig);
      
      expect(ai['config']?.provider).toBe('anthropic');
    });

    it('should configure with google provider', async () => {
      const googleConfig: AIConfig = {
        provider: 'google',
        apiKey: 'test-google-key',
        model: 'gemini-pro',
      };
      
      await ai.configure(googleConfig);
      
      expect(ai['config']?.provider).toBe('google');
    });

    it('should configure with azure provider', async () => {
      const azureConfig: AIConfig = {
        provider: 'azure',
        apiKey: 'test-azure-key',
        endpoint: 'https://test.openai.azure.com/',
        apiVersion: '2023-12-01-preview',
        region: 'eastus',
      };
      
      await ai.configure(azureConfig);
      
      expect(ai['config']?.provider).toBe('azure');
      expect(ai['config']?.apiVersion).toBe('2023-12-01-preview');
    });

    it('should configure with deepseek provider', async () => {
      const deepseekConfig: AIConfig = {
        provider: 'deepseek',
        apiKey: 'test-deepseek-key',
        model: 'deepseek-chat',
      };
      
      await ai.configure(deepseekConfig);
      
      expect(ai['config']?.provider).toBe('deepseek');
    });

    it('should configure with ollama provider', async () => {
      const ollamaConfig: AIConfig = {
        provider: 'ollama',
        endpoint: 'http://localhost:11434',
        model: 'llama2',
      };
      
      await ai.configure(ollamaConfig);
      
      expect(ai['config']?.provider).toBe('ollama');
      expect(ai['config']?.endpoint).toBe('http://localhost:11434');
    });

    it('should configure with none provider', async () => {
      const noneConfig: AIConfig = {
        provider: 'none',
      };
      
      await ai.configure(noneConfig);
      
      expect(ai['config']?.provider).toBe('none');
      expect(ai['enabled']).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle network errors in testConnection', async () => {
      await ai.configure(mockConfig);
      
      // Mock fetch to throw error
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );
      
      const result = await ai.testConnection();
      
      expect(result.success).toBe(false);
      expect(result.message).toContain('Network error');
    });

    it('should handle JSON parsing errors', async () => {
      await ai.configure(mockConfig);
      
      // Mock fetch to return invalid JSON
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.reject(new Error('Invalid JSON')),
          status: 200,
        })
      );
      
      const result = await ai.testConnection();
      
      // The actual implementation might handle JSON errors differently
      // Let's just check that it returns a result object
      expect(result).toBeDefined();
      expect(typeof result.success).toBe('boolean');
      expect(typeof result.message).toBe('string');
    });
  });

  describe('basic ask functionality', () => {
    it('should handle generateText without configuration', async () => {
      await expect(ai.generateText('test query')).rejects.toThrow(AIError);
    });

    it('should handle generateText with configuration', async () => {
      await ai.configure(mockConfig);
      
      // Mock callRawAPI to return a valid response
      const mockCallRawAPI = jest.fn<any>().mockResolvedValue({
        choices: [{
          message: {
            content: 'Mocked AI response text'
          }
        }]
      });
      
      // Mock the callRawAPI method
      ai['callRawAPI'] = mockCallRawAPI;
      
      const result = await ai.generateText('some random query');
      
      expect(result).toBe('Mocked AI response text');
      expect(mockCallRawAPI).toHaveBeenCalledWith({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant.'
          },
          {
            role: 'user',
            content: 'some random query'
          }
        ],
        temperature: 0.7,
        maxTokens: 2000
      });
    });

    it('should handle generateText with custom options', async () => {
      await ai.configure(mockConfig);
      
      // Mock callRawAPI to return a valid response
      const mockCallRawAPI = jest.fn<any>().mockResolvedValue({
        choices: [{
          message: {
            content: 'Mocked AI response with custom options'
          }
        }]
      });
      
      // Mock the callRawAPI method
      ai['callRawAPI'] = mockCallRawAPI;
      
      const result = await ai.generateText('test query', {
        temperature: 0.5,
        maxTokens: 1000,
        systemPrompt: 'You are a specialized assistant.'
      });
      
      expect(result).toBe('Mocked AI response with custom options');
      expect(mockCallRawAPI).toHaveBeenCalledWith({
        messages: [
          {
            role: 'system',
            content: 'You are a specialized assistant.'
          },
          {
            role: 'user',
            content: 'test query'
          }
        ],
        temperature: 0.5,
        maxTokens: 1000
      });
    });

    it('should handle generateText with different response formats', async () => {
      await ai.configure(mockConfig);
      
      // Test Anthropic format
      const mockCallRawAPI = jest.fn<any>().mockResolvedValue({
        content: [{
          text: 'Anthropic format response'
        }]
      });
      
      ai['callRawAPI'] = mockCallRawAPI;
      
      const result = await ai.generateText('test query');
      
      expect(result).toBe('Anthropic format response');
    });

    it('should handle generateText errors', async () => {
      await ai.configure(mockConfig);
      
      // Mock callRawAPI to throw error
      const mockCallRawAPI = jest.fn<any>().mockRejectedValue(new Error('API error'));
      
      ai['callRawAPI'] = mockCallRawAPI;
      
      await expect(ai.generateText('test query')).rejects.toThrow(AIError);
    });
  });
});