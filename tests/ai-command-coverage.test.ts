/**
 * AI Command Coverage Tests
 * Tests for src/ai/ai-command.ts to improve test coverage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AICommand } from '../src/ai/ai-command';
import { AI, AIError } from '../src/ai/ai';
import { AIConfigManager } from '../src/ai/config';

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

// Mock AI and AIConfigManager
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
        if (!this.mockConfigured) {
          throw new originalModule.AIError(
            'AI_NOT_CONFIGURED',
            'AI provider not configured',
            'config'
          );
        }
        
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
          target: 'query',
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
            name: 'filesystem.list_files',
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

jest.mock('../src/ai/config', () => {
  const originalModule = jest.requireActual('../src/ai/config') as any;
  
  return {
    ...originalModule,
    AIConfigManager: class MockAIConfigManager extends originalModule.AIConfigManager {
      private mockConfig = { provider: 'none' };
      private mockConfigFile = '/mock/config/path.json';
      
      getConfig(): any {
        return this.mockConfig;
      }
      
      parseFromArgs(args: string[]): any {
        const config: any = { provider: 'none' };
        
        for (const arg of args) {
          if (arg === 'openai') {
            config.provider = 'openai';
          } else if (arg === 'ollama') {
            config.provider = 'ollama';
          } else if (arg.startsWith('--api-key=')) {
            config.apiKey = arg.split('=')[1];
          } else if (arg.startsWith('--model=')) {
            config.model = arg.split('=')[1];
          } else if (arg.startsWith('--endpoint=')) {
            config.endpoint = arg.split('=')[1];
          }
        }
        
        return config;
      }
      
      async updateConfig(config: any): Promise<void> {
        this.mockConfig = { ...this.mockConfig, ...config };
      }
      
      resetConfig(): void {
        this.mockConfig = { provider: 'none' };
      }
      
      getStatus(): any {
        return {
          configured: this.mockConfig.provider !== 'none',
          configFile: this.mockConfigFile,
        };
      }
      
      formatConfig(): string {
        const config = this.mockConfig as any;
        return `Provider: ${config.provider}\nAPI Key: ${config.apiKey || 'Not set'}`;
      }
    },
  };
});

describe('AICommand Coverage Tests', () => {
  let aiCommand: AICommand;
  let consoleLogSpy: any;
  let consoleWarnSpy: any;
  let consoleErrorSpy: any;

  beforeEach(() => {
    consoleLogSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    
    aiCommand = new AICommand();
  });

  afterEach(() => {
    consoleLogSpy.mockRestore();
    consoleWarnSpy.mockRestore();
    consoleErrorSpy.mockRestore();
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create an instance', () => {
      expect(aiCommand).toBeInstanceOf(AICommand);
    });

    it('should handle loadConfiguration error from configManager', () => {
      // Mock configManager.getConfig to throw error
      const configManager = (aiCommand as any).configManager;
      const originalGetConfig = configManager.getConfig;
      configManager.getConfig = jest.fn().mockImplementation(() => {
        throw new Error('Config load error');
      });

      // Create new instance should not throw
      expect(() => new AICommand()).not.toThrow();
      
      // Restore original method
      configManager.getConfig = originalGetConfig;
    });

    it('should handle loadConfiguration error from ai.configure', () => {
      // Mock configManager.getConfig to return valid config
      const configManager = (aiCommand as any).configManager;
      const originalGetConfig = configManager.getConfig;
      configManager.getConfig = jest.fn().mockReturnValue({
        provider: 'openai',
        apiKey: 'test-key'
      });

      // Mock ai.configure to throw error
      const ai = (aiCommand as any).ai;
      const originalConfigure = ai.configure;
      ai.configure = jest.fn().mockRejectedValue(new Error('AI configure error') as any);

      // Create new instance should not throw
      expect(() => new AICommand()).not.toThrow();
      
      // Restore original methods
      configManager.getConfig = originalGetConfig;
      ai.configure = originalConfigure;
    });

    it('should handle loadConfiguration with none provider', () => {
      // Mock configManager.getConfig to return none provider
      const configManager = (aiCommand as any).configManager;
      const originalGetConfig = configManager.getConfig;
      configManager.getConfig = jest.fn().mockReturnValue({
        provider: 'none'
      });

      // Mock ai.configure to track calls
      const ai = (aiCommand as any).ai;
      const originalConfigure = ai.configure;
      const configureSpy = jest.spyOn(ai, 'configure');

      // Create new instance
      expect(() => new AICommand()).not.toThrow();
      
      // Verify ai.configure was not called
      expect(configureSpy).not.toHaveBeenCalled();
      
      // Restore original methods
      configManager.getConfig = originalGetConfig;
      configureSpy.mockRestore();
    });
  });

  describe('handleCommand', () => {
    it('should show status when no action provided', async () => {
      await aiCommand.handleCommand();
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Status:')
      );
    });

    it('should handle configure command', async () => {
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ AI configured with provider: openai')
      );
    });

    it('should handle configure command with Ollama', async () => {
      await aiCommand.handleCommand('configure', 'ollama');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ AI configured with provider: ollama')
      );
    });

    it('should handle configure command with none provider', async () => {
      await aiCommand.handleCommand('configure', 'none');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ AI configuration reset')
      );
    });

    it('should handle test command when configured', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Then test
      await aiCommand.handleCommand('test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔌 Testing AI connection...')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ Connection test successful')
      );
    });

    it('should handle test command when not configured', async () => {
      await aiCommand.handleCommand('test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ AI not configured')
      );
    });

    it('should handle generateText command with valid query', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Then ask
      await aiCommand.handleCommand('ask', 'list files in current directory');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 Query: "list files in current directory"')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/.*✅ Intent recognized.*/)
      );
    });

    it('should handle generateText command with empty query', async () => {
      await aiCommand.handleCommand('ask', '');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('⚠️ Please provide a query')
      );
    });

    it('should handle generateText command when not configured', async () => {
      await aiCommand.handleCommand('ask', 'test query');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('red(❌ AI provider not configured)')
      );
    });

    it('should handle status command', async () => {
      await aiCommand.handleCommand('status');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Status:')
      );
    });

    it('should handle reset command', async () => {
      await aiCommand.handleCommand('reset');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('✅ AI configuration reset to defaults')
      );
    });

    it('should handle help command', async () => {
      await aiCommand.handleCommand('help');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Commands:')
      );
    });

    it('should handle unknown command', async () => {
      await aiCommand.handleCommand('unknown');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('red(Unknown action: unknown)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Commands:')
      );
    });
  });

  describe('handleConfigure error handling', () => {
    it('should handle configuration failure', async () => {
      // Mock parseFromArgs to throw error
      const configManager = (aiCommand as any).configManager;
      const originalParseFromArgs = configManager.parseFromArgs;
      configManager.parseFromArgs = jest.fn().mockImplementation(() => {
        throw new Error('Invalid configuration');
      });
      
      await aiCommand.handleCommand('configure', 'invalid', 'args');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Configuration failed: Invalid configuration')
      );
      
      // Restore original method
      configManager.parseFromArgs = originalParseFromArgs;
    });

    it('should show OpenAI API key help when missing', async () => {
      // Mock parseFromArgs to return config without API key
      const configManager = (aiCommand as any).configManager;
      const originalParseFromArgs = configManager.parseFromArgs;
      configManager.parseFromArgs = jest.fn().mockReturnValue({
        provider: 'openai',
        // No apiKey
      });
      
      // Mock AI configure to throw error
      const ai = (aiCommand as any).ai;
      const originalConfigure = ai.configure;
      ai.configure = jest.fn().mockRejectedValue(
        new AIError('AI_CONFIG_ERROR', 'OpenAI requires API key', 'config') as any
      );
      
      await aiCommand.handleCommand('configure', 'openai');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧 How to get OpenAI API key:')
      );
      
      // Restore original methods
      configManager.parseFromArgs = originalParseFromArgs;
      ai.configure = originalConfigure;
    });
  });

  describe('handleTest error handling', () => {
    it('should handle test connection failure', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to throw error
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockRejectedValue(new Error('Connection failed') as any);
      
      await aiCommand.handleCommand('test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Test failed: Connection failed')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });

    it('should handle test connection failure with OpenAI provider', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to return failure
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockResolvedValue({
        success: false,
        message: 'OpenAI API key invalid'
      });
      
      await aiCommand.handleCommand('test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ OpenAI API key invalid')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧 OpenAI troubleshooting:')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });

    it('should handle test connection failure with Ollama provider', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'ollama');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to return failure
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockResolvedValue({
        success: false,
        message: 'Ollama service not running'
      });
      
      await aiCommand.handleCommand('test');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Ollama service not running')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Ollama troubleshooting:')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });
  });

  describe('handleAsk error handling', () => {
    it('should handle AIError in ask command', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock parseIntent to throw AIError
      const ai = (aiCommand as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockRejectedValue(
        new AIError('AI_ERROR', 'Test AI error', 'execution') as any
      );
      
      await aiCommand.handleCommand('ask', 'test query');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('red(❌ Test AI error)')
      );
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
    });

    it('should handle generic error in ask command', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock parseIntent to throw generic error
      const ai = (aiCommand as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockRejectedValue(new Error('Generic error') as any);
      
      await aiCommand.handleCommand('ask', 'test query');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Generic error')
      );
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
    });
  });

  describe('handleAskResult coverage', () => {
    it('should handle suggestions result type', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock parseIntent to return unknown intent (which will trigger generateText)
      const ai = (aiCommand as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockResolvedValue({
        action: 'unknown',
        target: 'query',
        params: { query: 'test query' },
        confidence: 0.3,
      });
      
      await aiCommand.handleCommand('ask', 'test query');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🤖 AI Response:')
      );
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
    });

    it('should handle error result type', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock parseIntent to throw error
      const ai = (aiCommand as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockRejectedValue(new Error('Failed to parse intent') as any);
      
      await aiCommand.handleCommand('ask', 'test query');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('❌ Error: Failed to parse intent')
      );
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
    });

    it('should handle tool_call result type', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock parseIntent to return valid intent
      const ai = (aiCommand as any).ai;
      const originalParseIntent = ai.parseIntent;
      ai.parseIntent = jest.fn().mockResolvedValue({
        action: 'list',
        target: 'files',
        params: { path: '.' },
        confidence: 0.9,
      });
      
      await aiCommand.handleCommand('ask', 'list files');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringMatching(/.*✅ Intent recognized.*/)
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔧 Tool call:')
      );
      
      // Restore original method
      ai.parseIntent = originalParseIntent;
    });
  });

  describe('showStatus coverage', () => {
    it('should handle test connection error in showStatus', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to throw error
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockRejectedValue(new Error('Connection test error') as any);
      
      await aiCommand.handleCommand('status');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔌 Connection test:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: red(Error)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message: Connection test error')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });

    it('should handle test connection failure in showStatus', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to return failure
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockResolvedValue({
        success: false,
        message: 'Test failed'
      });
      
      await aiCommand.handleCommand('status');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔌 Connection test:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: red(Failed)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message: Test failed')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });

    it('should handle test connection success in showStatus', async () => {
      // First configure
      await aiCommand.handleCommand('configure', 'openai', '--api-key=test-key');
      consoleLogSpy.mockClear();
      
      // Mock testConnection to return success
      const ai = (aiCommand as any).ai;
      const originalTestConnection = ai.testConnection;
      ai.testConnection = jest.fn().mockResolvedValue({
        success: true,
        message: 'Test successful'
      });
      
      await aiCommand.handleCommand('status');
      
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('🔌 Connection test:')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Status: green(OK)')
      );
      expect(consoleLogSpy).toHaveBeenCalledWith(
        expect.stringContaining('Message: Test successful')
      );
      
      // Restore original method
      ai.testConnection = originalTestConnection;
    });
  });

  describe('getter methods', () => {
    it('should get AI instance', () => {
      const aiInstance = aiCommand.getAIInstance();
      expect(aiInstance).toBeDefined();
      expect(aiInstance).toBeInstanceOf(AI);
    });

    it('should get config manager instance', () => {
      const configManager = aiCommand.getConfigManager();
      expect(configManager).toBeDefined();
      expect(configManager).toBeInstanceOf(AIConfigManager);
    });
  });
});