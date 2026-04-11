/**
 * SDK Simple Coverage Tests
 * Simple tests for src/sdk.ts to improve branch coverage
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IntentOrchSDK } from '../src/sdk';

// Simple mock for AI
jest.mock('../src/ai/ai', () => {
  return {
    AI: class MockAI {
      async configure() {}
      reset() {}
      getStatus() {
        return { enabled: false, configured: false, provider: 'none' };
      }
      async testConnection() {
        return { success: false, message: 'AI not configured' };
      }
      async parseIntent() {
        return { action: 'unknown', target: 'unknown', params: {}, confidence: 0.3 };
      }
      async generateText() {
        throw new Error('AI provider not configured');
      }
      mapIntentToTool(intent: any) {
        return {
          name: 'test.tool',
          arguments: {},
        };
      }
    },
    AIError: class MockAIError extends Error {
      constructor(code: string, message: string, type: string) {
        super(message);
      }
    },
  };
});

// Simple mock for ConfigManager
jest.mock('../src/core/config-manager', () => {
  return {
    ConfigManager: {
      init: jest.fn(),
      getGlobalConfig: jest.fn().mockReturnValue({}),
      saveGlobalConfig: jest.fn().mockResolvedValue(undefined),
      resetConfig: jest.fn().mockResolvedValue(undefined),
      getStatus: jest.fn().mockReturnValue({ configured: false }),
    },
  };
});

describe('SDK Simple Coverage Tests', () => {
  let sdk: IntentOrchSDK;

  beforeEach(() => {
    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'debug').mockImplementation(() => {});
    
    sdk = new IntentOrchSDK({ autoInit: false });
    // Initialize SDK before tests
    sdk.init();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with default options', () => {
      expect(sdk).toBeInstanceOf(IntentOrchSDK);
    });

    it('should create instance with custom logger', () => {
      const customLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      
      const sdkWithLogger = new IntentOrchSDK({ logger: customLogger, autoInit: false });
      expect(sdkWithLogger).toBeInstanceOf(IntentOrchSDK);
    });
  });

  describe('generateText method', () => {
    it('should throw error when AI is not configured', async () => {
      await expect(sdk.generateText('test query')).rejects.toThrow('AI provider not configured');
    });
  });

  describe('parseIntent method', () => {
    it('should parse intent using rule-based parser', async () => {
      const result = await sdk.parseIntent('test query');
      expect(result).toBeDefined();
      expect(result.type).toBe('tool_call');
      expect(result.tool).toBeDefined();
      expect(result.confidence).toBe(0.3);
    });
  });

  describe('getAIStatus method', () => {
    it('should return AI status when not configured', () => {
      const status = sdk.getAIStatus();
      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
    });
  });

  describe('testAIConnection method', () => {
    it('should return failure when AI is not configured', async () => {
      const result = await sdk.testAIConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('AI not configured');
    });
  });

  describe('utility methods', () => {
    it('should get SDK version', () => {
      const version = sdk.getVersion();
      expect(typeof version).toBe('string');
    });

    it('should check if SDK is initialized', () => {
      const initialized = sdk.isInitialized();
      expect(typeof initialized).toBe('boolean');
    });

    it('should get configuration', () => {
      const config = sdk.getConfig();
      expect(config).toBeDefined();
    });

    it('should update configuration', async () => {
      const newConfig = { test: 'value' };
      await expect(sdk.updateConfig(newConfig)).resolves.not.toThrow();
    });

    it('should reset configuration', async () => {
      await expect(sdk.resetConfig()).resolves.not.toThrow();
    });
  });
});