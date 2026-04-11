/**
 * SDK Branch Coverage Tests
 * Tests for src/sdk.ts to improve branch coverage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { IntentOrchSDK, type SDKOptions, type GenerateTextOptions } from '../src/sdk';
import { AI, AIError } from '../src/ai/ai';
import { CloudIntentEngine } from '../src/ai/cloud-intent-engine';
import { MCPClient, ToolRegistry } from '../src/mcp';
import { ConfigManager } from '../src/core/config-manager';

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

// Mock AI
jest.mock('../src/ai/ai', () => {
  const originalModule = jest.requireActual('../src/ai/ai') as any;
  
  return {
    ...originalModule,
    AI: class MockAI extends originalModule.AI {
      private mockConfigured = false;
      private mockProvider = 'none';
      private mockEnabled = false;
      
      async configure(config: any): Promise<void> {
        this.mockConfigured = true;
        this.mockProvider = config.provider || 'none';
        this.mockEnabled = config.provider !== 'none';
      }
      
      reset(): void {
        this.mockConfigured = false;
        this.mockProvider = 'none';
        this.mockEnabled = false;
      }
      
      getStatus(): any {
        return {
          enabled: this.mockEnabled,
          provider: this.mockProvider,
          configured: this.mockConfigured,
        };
      }
      
      async testConnection(): Promise<any> {
        if (!this.mockConfigured) {
          return { success: false, message: 'AI not configured' };
        }
        return { success: true, message: 'Connection test successful (mocked)' };
      }
      
      async parseIntent(query: string): Promise<any> {
        // Even when AI is not configured, parseIntent should still work
        // using rule-based parser
        if (query.includes('list files')) {
          return {
            action: 'list',
            target: 'files',
            params: { path: '.' },
            confidence: 0.9,
          };
        }
        
        return {
          action: 'unknown',
          target: 'unknown',
          params: { query },
          confidence: 0.3,
        };
      }
      
      async generateText(query: string, options?: any): Promise<string> {
        if (!this.mockConfigured) {
          throw new originalModule.AIError(
            'AI_NOT_CONFIGURED',
            'AI provider not configured',
            'config'
          );
        }
        
        return `Mocked text response for: ${query}`;
      }
      
      mapIntentToTool(intent: any): any {
        if (intent.action === 'list' && intent.target === 'files') {
          return {
            name: 'filesystem.list_directory',
            arguments: { path: intent.params.path || '.' },
          };
        }
        
        return {
          name: 'system.unknown',
          arguments: { intent: JSON.stringify(intent) },
        };
      }
      
      getFriendlyError(error: AIError): string {
        return `Friendly error: ${error.message}`;
      }
    },
  };
});

// Mock CloudIntentEngine
jest.mock('../src/ai/cloud-intent-engine', () => {
  return {
    CloudIntentEngine: class MockCloudIntentEngine {
      private mockConfigured = false;
      
      async configure(config: any): Promise<void> {
        this.mockConfigured = true;
      }
      
      async parseIntent(query: string): Promise<any> {
        if (!this.mockConfigured) {
          throw new Error('CloudIntentEngine not configured');
        }
        
        return {
          action: 'cloud',
          target: 'intent',
          params: { query },
          confidence: 0.8,
        };
      }
      
      reset(): void {
        this.mockConfigured = false;
      }
    },
  };
});

// Mock MCPClient
jest.mock('../src/mcp', () => {
  return {
    MCPClient: class MockMCPClient {
      private mockConnected = false;
      
      async connect(): Promise<void> {
        this.mockConnected = true;
      }
      
      async disconnect(): Promise<void> {
        this.mockConnected = false;
      }
      
      isConnected(): boolean {
        return this.mockConnected;
      }
      
      async callTool(toolName: string, args: any): Promise<any> {
        if (!this.mockConnected) {
          throw new Error('MCP client not connected');
        }
        
        return { result: `Mocked result for ${toolName}` };
      }
    },
    ToolRegistry: class MockToolRegistry {
      private tools: Map<string, any> = new Map();
      
      registerTool(tool: any): void {
        this.tools.set(tool.name, tool);
      }
      
      getTool(name: string): any {
        return this.tools.get(name);
      }
      
      getAllTools(): any[] {
        return Array.from(this.tools.values());
      }
      
      clear(): void {
        this.tools.clear();
      }
    },
    createMCPConfig: jest.fn(),
    discoverLocalMCPServers: jest.fn().mockResolvedValue([]),
  };
});

// Mock ConfigManager
jest.mock('../src/core/config-manager', () => {
  return {
    ConfigManager: {
      init: jest.fn(),
      getInstance: jest.fn().mockReturnValue({
        getConfig: jest.fn().mockReturnValue({}),
        updateConfig: jest.fn().mockResolvedValue(undefined),
        resetConfig: jest.fn().mockResolvedValue(undefined),
        getStatus: jest.fn().mockReturnValue({ configured: false }),
      }),
      getGlobalConfig: jest.fn().mockReturnValue({}),
      saveGlobalConfig: jest.fn().mockResolvedValue(undefined),
      resetConfig: jest.fn().mockResolvedValue(undefined),
    },
  };
});

describe('SDK Branch Coverage Tests', () => {
  let sdk: IntentOrchSDK;
  let consoleLogSpy: any;
  let consoleErrorSpy: any;
  let consoleDebugSpy: any;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    consoleDebugSpy = jest.spyOn(console, 'debug').mockImplementation(() => {});
    
    sdk = new IntentOrchSDK();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    consoleDebugSpy.mockRestore();
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
      
      const sdkWithLogger = new IntentOrchSDK({ logger: customLogger });
      expect(sdkWithLogger).toBeInstanceOf(IntentOrchSDK);
    });

    it('should create instance with autoInit disabled', () => {
      const sdkNoAutoInit = new IntentOrchSDK({ autoInit: false });
      expect(sdkNoAutoInit).toBeInstanceOf(IntentOrchSDK);
    });

    it('should create instance with MCP options', () => {
      const mcpOptions = {
        autoDiscover: true,
        servers: [],
      };
      
      const sdkWithMCP = new IntentOrchSDK({ mcp: mcpOptions });
      expect(sdkWithMCP).toBeInstanceOf(IntentOrchSDK);
    });
  });

  describe('init method', () => {
    it('should initialize successfully', () => {
      expect(() => sdk.init()).not.toThrow();
    });

    it('should handle initialization error', () => {
      // Mock AI configure to throw error
      const ai = (sdk as any).ai;
      const originalConfigure = ai.configure;
      ai.configure = jest.fn().mockRejectedValue(new Error('AI configuration failed'));
      
      expect(() => sdk.init()).not.toThrow(); // Should not throw, just log error
      
      // Restore original method
      ai.configure = originalConfigure;
    });
  });


  describe('generateText method', () => {
    it('should throw error when AI is not configured', async () => {
      await expect(sdk.generateText('test query')).rejects.toThrow('AI provider not configured');
    });

    it('should generate text when AI is configured', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      const result = await sdk.generateText('test query');
      expect(result.text).toContain('Mocked text response for: test query');
      expect(result.type).toBe('text');
    });

    it('should handle generateText with options', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      const options: GenerateTextOptions = {
        temperature: 0.7,
        maxTokens: 100,
        systemPrompt: 'You are a helpful assistant',
      };
      
      const result = await sdk.generateText('test query', options);
      expect(result.text).toContain('Mocked text response for: test query');
      expect(result.type).toBe('text');
    });
  });

  describe('parseIntent method', () => {
    it('should parse intent using rule-based parser', async () => {
      const result = await sdk.parseIntent('test query');
      expect(result).toBeDefined();
      expect(result.type).toBe('tool_call');
      expect(result.tool).toBeDefined();
    });

    it('should parse intent when AI is configured', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      const result = await sdk.parseIntent('list files');
      expect(result).toBeDefined();
    });
  });

  describe('configureAI method', () => {
    it('should configure AI successfully', async () => {
      const config = {
        provider: 'openai' as const,
        apiKey: 'test-key',
        model: 'gpt-4',
      };
      
      await expect(sdk.configureAI(config)).resolves.not.toThrow();
    });

    it('should handle AI configuration error', async () => {
      const config = {
        provider: 'openai' as const,
        apiKey: 'test-key',
      };
      
      // Mock AI configure to throw error
      const ai = (sdk as any).ai;
      const originalConfigure = ai.configure;
      ai.configure = jest.fn().mockRejectedValue(new Error('Configuration failed'));
      
      await expect(sdk.configureAI(config)).rejects.toThrow('Configuration failed');
      
      // Restore original method
      ai.configure = originalConfigure;
    });
  });

  describe('getAIStatus method', () => {
    it('should return AI status when not configured', () => {
      const status = sdk.getAIStatus();
      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
    });

    it('should return AI status when configured', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      const status = sdk.getAIStatus();
      expect(status.enabled).toBe(true);
      expect(status.configured).toBe(true);
    });
  });

  describe('testAIConnection method', () => {
    it('should return failure when AI is not configured', async () => {
      const result = await sdk.testAIConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('AI not configured');
    });

    it('should test connection when AI is configured', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      const result = await sdk.testAIConnection();
      expect(result.success).toBe(true);
      expect(result.message).toContain('Connection test successful');
    });
  });

  // Note: resetAI method is not implemented in the current SDK version
  // This test has been removed as it tests a non-existent method

  // Note: MCP related methods are not implemented in the current SDK version
  // These tests have been removed as they test non-existent methods

  describe('error handling', () => {
    it('should handle errors in init method', () => {
      // Mock ConfigManager to throw error
      const ConfigManager = require('../src/core/config-manager').ConfigManager;
      const originalGetInstance = ConfigManager.getInstance;
      ConfigManager.getInstance = jest.fn().mockImplementation(() => {
        throw new Error('ConfigManager error');
      });
      
      expect(() => sdk.init()).not.toThrow(); // Should not throw, just log error
      
      // Restore original method
      ConfigManager.getInstance = originalGetInstance;
    });

    it('should handle generic errors in generateText method', async () => {
      // First configure AI
      await (sdk as any).ai.configure({ provider: 'openai', apiKey: 'test-key' });
      
      // Mock generateText to throw generic error
      const ai = (sdk as any).ai;
      const originalGenerateText = ai.generateText;
      ai.generateText = jest.fn().mockRejectedValue(new Error('Generic error'));
      
      await expect(sdk.generateText('test query')).rejects.toThrow('Generic error');
      
      // Restore original method
      ai.generateText = originalGenerateText;
    });

    it('should handle errors in parseIntent method', async () => {
      // Mock parseIntent to throw error
      const ai = (sdk as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockRejectedValue(new Error('Parse intent error'));
      
      await expect(sdk.parseIntent('test query')).rejects.toThrow('Parse intent error');
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
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
