import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AICommand } from '../src/ai/ai-command';

// Mock AI module
jest.mock('../src/ai/ai', () => ({
  AI: jest.fn().mockImplementation(() => ({
    configure: jest.fn().mockResolvedValue(undefined as any),
    ask: jest.fn().mockResolvedValue({ answer: 'Test answer' } as any),
    generateText: jest.fn().mockResolvedValue('Test text response'),
    getStatus: jest.fn().mockReturnValue({ 
      enabled: true, 
      configured: true, 
      provider: 'openai', 
      model: 'gpt-4' 
    }),
    reset: jest.fn(),
    testConnection: jest.fn().mockResolvedValue({
      success: true,
      message: 'Connection successful'
    }),
    getFriendlyError: jest.fn().mockReturnValue('Friendly error message'),
  })),
  AIError: class AIError extends Error {},
  AskResult: {},
}));

// Mock AIConfigManager
jest.mock('../src/ai/config', () => ({
  AIConfigManager: jest.fn().mockImplementation(() => ({
    getConfig: jest.fn().mockReturnValue({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
    }),
    setConfig: jest.fn(),
    saveConfig: jest.fn(),
    getStatus: jest.fn().mockReturnValue({
      configured: true,
      provider: 'openai',
      hasApiKey: true,
      configFile: '/test/path/ai-config.json',
    }),
    parseFromArgs: jest.fn().mockReturnValue({
      provider: 'openai',
      apiKey: 'test-key',
      model: 'gpt-4',
    }),
    updateConfig: jest.fn().mockResolvedValue(undefined),
    resetConfig: jest.fn(),
    formatConfig: jest.fn().mockReturnValue('Formatted config'),
  })),
}));

// Mock chalk
jest.mock('chalk', () => ({
  green: jest.fn((text) => text),
  yellow: jest.fn((text) => text),
  red: jest.fn((text) => text),
  blue: jest.fn((text) => text),
  cyan: jest.fn((text) => text),
  gray: jest.fn((text) => text),
  bold: jest.fn((text) => text),
}));

// Mock console
const mockConsoleLog = jest.fn();
const mockConsoleWarn = jest.fn();
const mockConsoleError = jest.fn();
global.console.log = mockConsoleLog;
global.console.warn = mockConsoleWarn;
global.console.error = mockConsoleError;

describe('AICommand', () => {
  let aiCommand: AICommand;

  beforeEach(() => {
    jest.clearAllMocks();
    aiCommand = new AICommand();
  });

  describe('constructor', () => {
    it('should create AICommand instance and load configuration', () => {
      expect(aiCommand).toBeInstanceOf(AICommand);
      
      // Verify AI was created
      const { AI } = require('../src/ai/ai');
      expect(AI).toHaveBeenCalled();
      
      // Verify config manager was created
      const { AIConfigManager } = require('../src/ai/config');
      expect(AIConfigManager).toHaveBeenCalled();
    });

    it('should handle configuration load errors gracefully', () => {
      // Mock config manager to throw error
      const { AIConfigManager } = require('../src/ai/config');
      const mockGetConfig = jest.fn().mockImplementation(() => {
        throw new Error('Config error');
      });
      AIConfigManager.mockImplementation(() => ({
        getConfig: mockGetConfig,
      }));

      // Should not throw when creating AICommand
      expect(() => new AICommand()).not.toThrow();
      expect(mockConsoleWarn).toHaveBeenCalledWith(
        expect.stringContaining('Failed to load AI configuration')
      );
    });
  });

  describe('handleCommand', () => {
    it('should show status when no action provided', async () => {
      // Ensure config manager has getStatus method
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'openai' }),
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'openai',
          hasApiKey: true,
          configFile: '/test/path/ai-config.json',
        }),
        formatConfig: jest.fn().mockReturnValue('Formatted config'),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand();
      
      // Should call showStatus internally
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle configure action', async () => {
      const mockUpdateConfig = jest.fn().mockResolvedValue(undefined);
      
      // Update mock
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'none' }),
        parseFromArgs: jest.fn().mockReturnValue({
          provider: 'openai',
          apiKey: 'test-key',
        }),
        updateConfig: mockUpdateConfig,
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'openai',
          hasApiKey: true,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand('configure', 'openai', 'test-key');
      
      expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('should handle configure action with ollama provider', async () => {
      const mockUpdateConfig = jest.fn().mockResolvedValue(undefined);
      
      // Update mock
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'none' }),
        parseFromArgs: jest.fn().mockReturnValue({
          provider: 'ollama',
        }),
        updateConfig: mockUpdateConfig,
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'ollama',
          hasApiKey: false,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand('configure', 'ollama');
      
      expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('should handle configure action with reset to none', async () => {
      const mockUpdateConfig = jest.fn().mockResolvedValue(undefined);
      
      // Update mock
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'openai' }),
        parseFromArgs: jest.fn().mockReturnValue({
          provider: 'none',
        }),
        updateConfig: mockUpdateConfig,
        getStatus: jest.fn().mockReturnValue({
          configured: false,
          provider: 'none',
          hasApiKey: false,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand('configure', 'none');
      
      expect(mockUpdateConfig).toHaveBeenCalled();
    });

    it('should handle configure errors with OpenAI API key message', async () => {
      const mockUpdateConfig = jest.fn().mockRejectedValue(new Error('OpenAI requires API key'));
      
      // Update mock
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'none' }),
        parseFromArgs: jest.fn().mockReturnValue({
          provider: 'openai',
        }),
        updateConfig: mockUpdateConfig,
        getStatus: jest.fn().mockReturnValue({
          configured: false,
          provider: 'none',
          hasApiKey: false,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand('configure', 'openai');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Configuration failed')
      );
    });

    it('should handle generateText action', async () => {
      await aiCommand.handleCommand('ask', 'What is AI?');
      
      // Verify AI.generateText was called
      const aiInstance = (aiCommand as any).ai;
      expect(aiInstance.generateText).toHaveBeenCalledWith('What is AI?');
    });

    it('should handle status action', async () => {
      await aiCommand.handleCommand('status');
      
      // Should log status
      expect(mockConsoleLog).toHaveBeenCalled();
    });

    it('should handle unknown action', async () => {
      await aiCommand.handleCommand('unknown');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Unknown action')
      );
    });
  });

  describe('showStatus', () => {
    it('should show AI status', async () => {
      // Access private method via any
      await (aiCommand as any).showStatus();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('AI Status')
      );
    });

    it('should handle AI not configured', async () => {
      // Mock AI to return status with configured: false
      const aiInstance = (aiCommand as any).ai;
      aiInstance.getStatus.mockReturnValue({ 
        enabled: false, 
        configured: false, 
        provider: 'none' 
      });
      
      // Mock config manager to return not configured
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'none' }),
        getStatus: jest.fn().mockReturnValue({
          configured: false,
          provider: 'none',
          hasApiKey: false,
          configFile: '/test/path/ai-config.json',
        }),
        formatConfig: jest.fn().mockReturnValue(''),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await (aiCommand as any).showStatus();
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('AI is not configured')
      );
    });
  });

  describe('handleTest', () => {
    it('should handle test action when AI is configured', async () => {
      const aiInstance = (aiCommand as any).ai;
      aiInstance.getStatus.mockReturnValue({ configured: true });
      aiInstance.testConnection = jest.fn().mockResolvedValue({
        success: true,
        message: 'Connection successful',
      });

      await aiCommand.handleCommand('test');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Testing AI connection')
      );
    });

    it('should handle test action when AI is not configured', async () => {
      const aiInstance = (aiCommand as any).ai;
      aiInstance.getStatus.mockReturnValue({ configured: false });

      await aiCommand.handleCommand('test');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('AI not configured')
      );
    });

    it('should handle test action with failed connection for OpenAI', async () => {
      // Mock config manager to return OpenAI config
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'openai' }),
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'openai',
          hasApiKey: true,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      // Override testConnection mock for this specific instance
      const aiInstance = (aiCommand as any).ai;
      aiInstance.testConnection.mockResolvedValue({
        success: false,
        message: 'Connection failed',
      });
      
      await aiCommand.handleCommand('test');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed')
      );
    });

    it('should handle test action with failed connection for Ollama', async () => {
      // Mock config manager to return Ollama config
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'ollama' }),
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'ollama',
          hasApiKey: false,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      // Override testConnection mock for this specific instance
      const aiInstance = (aiCommand as any).ai;
      aiInstance.testConnection.mockResolvedValue({
        success: false,
        message: 'Connection failed',
      });
      
      await aiCommand.handleCommand('test');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Connection failed')
      );
    });

    it('should handle test action with exception', async () => {
      const aiInstance = (aiCommand as any).ai;
      aiInstance.getStatus.mockReturnValue({ configured: true });
      aiInstance.testConnection = jest.fn().mockRejectedValue(new Error('Test failed'));

      await aiCommand.handleCommand('test');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('Test failed')
      );
    });
  });

  describe('handleReset', () => {
    it('should handle reset action', async () => {
      const mockResetConfig = jest.fn();
      
      // Update mock
      const { AIConfigManager } = require('../src/ai/config');
      AIConfigManager.mockImplementation(() => ({
        getConfig: jest.fn().mockReturnValue({ provider: 'openai' }),
        resetConfig: mockResetConfig,
        getStatus: jest.fn().mockReturnValue({
          configured: true,
          provider: 'openai',
          hasApiKey: true,
          configFile: '/test/path/ai-config.json',
        }),
      }));

      // Create new instance with updated mock
      aiCommand = new AICommand();
      
      await aiCommand.handleCommand('reset');
      
      expect(mockResetConfig).toHaveBeenCalled();
    });
  });

  describe('showHelp', () => {
    it('should handle help action', async () => {
      await aiCommand.handleCommand('help');
      
      expect(mockConsoleLog).toHaveBeenCalledWith(
        expect.stringContaining('AI Commands')
      );
    });
  });

  describe('getAIInstance', () => {
    it('should return AI instance', () => {
      const aiInstance = aiCommand.getAIInstance();
      expect(aiInstance).toBeDefined();
    });
  });

  describe('getConfigManager', () => {
    it('should return config manager instance', () => {
      const configManager = aiCommand.getConfigManager();
      expect(configManager).toBeDefined();
    });
  });
});