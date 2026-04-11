/**
 * AI Command Simple Tests
 * Simple tests for src/ai/ai-command.ts to improve test coverage
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { AICommand } from '../src/ai/ai-command';

// Mock chalk
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
  return {
    AI: class MockAI {
      private mockConfigured = false;
      private mockProvider = 'none';
      
      async configure(config: any): Promise<void> {
        this.mockConfigured = true;
        this.mockProvider = config.provider || 'none';
      }
      
      reset(): void {
        this.mockConfigured = false;
        this.mockProvider = 'none';
      }
      
      getStatus(): any {
        return {
          enabled: this.mockConfigured,
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
      
      async ask(query: string): Promise<any> {
        if (!this.mockConfigured) {
          throw new Error('AI provider not configured');
        }
        
        if (query.includes('list files')) {
          return {
            type: 'tool_call',
            tool: {
              name: 'filesystem.list_files',
              arguments: { path: '.' },
            },
            confidence: 0.9,
          };
        }
        
        return {
          type: 'suggestions',
          message: 'Mocked response',
          suggestions: ['Mocked suggestion'],
        };
      }
      
      async generateText(query: string): Promise<string> {
        if (!this.mockConfigured) {
          throw new Error('AI provider not configured');
        }
        
        if (query.includes('list files')) {
          return 'Mocked text response for list files query';
        }
        
        return 'Mocked text response';
      }
      
      getFriendlyError(error: Error): string {
        return `Friendly error: ${error.message}`;
      }
    },
    AIError: class MockAIError extends Error {
      constructor(code: string, message: string, category: string, suggestions?: string[]) {
        super(message);
        this.name = 'AIError';
      }
    },
  };
});

jest.mock('../src/ai/config', () => {
  return {
    AIConfigManager: class MockAIConfigManager {
      private mockConfig = { provider: 'none' };
      
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
          configFile: '/mock/config/path.json',
        };
      }
      
      formatConfig(): string {
        const config = this.mockConfig as any;
        return `Provider: ${config.provider}\nAPI Key: ${config.apiKey || 'Not set'}`;
      }
    },
  };
});

describe('AICommand Simple Tests', () => {
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
        expect.stringContaining('🤖 AI Response:')
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
  });
});