import { Logger, LogLevel, logger } from '../src/core/logger';

describe('Logger', () => {
  let testLogger: Logger;

  beforeEach(() => {
    // Create a new logger instance for testing
    testLogger = Logger.getInstance();
  });

  describe('LogLevel enum', () => {
    it('should have correct log levels', () => {
      expect(LogLevel.DEBUG).toBe('DEBUG');
      expect(LogLevel.INFO).toBe('INFO');
      expect(LogLevel.WARN).toBe('WARN');
      expect(LogLevel.ERROR).toBe('ERROR');
    });
  });

  describe('Singleton pattern', () => {
    it('should return same instance via getInstance', () => {
      const instance1 = Logger.getInstance();
      const instance2 = Logger.getInstance();
      expect(instance1).toBe(instance2);
    });

    it('should export singleton logger instance', () => {
      expect(logger).toBeDefined();
      expect(logger).toBeInstanceOf(Logger);
    });
  });

  describe('Log level configuration', () => {
    it('should default to INFO level', () => {
      expect(testLogger['logLevel']).toBe(LogLevel.INFO);
    });

    it('should set log level correctly', () => {
      testLogger.setLogLevel(LogLevel.DEBUG);
      expect(testLogger['logLevel']).toBe(LogLevel.DEBUG);

      testLogger.setLogLevel(LogLevel.ERROR);
      expect(testLogger['logLevel']).toBe(LogLevel.ERROR);
    });
  });

  describe('Log filtering', () => {
    beforeEach(() => {
      // Mock console methods to avoid cluttering test output
      jest.spyOn(console, 'debug').mockImplementation(() => {});
      jest.spyOn(console, 'info').mockImplementation(() => {});
      jest.spyOn(console, 'warn').mockImplementation(() => {});
      jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log DEBUG messages when level is DEBUG', () => {
      testLogger.setLogLevel(LogLevel.DEBUG);
      const consoleSpy = jest.spyOn(console, 'debug');
      
      testLogger.debug('Test debug message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log DEBUG messages when level is INFO', () => {
      testLogger.setLogLevel(LogLevel.INFO);
      const consoleSpy = jest.spyOn(console, 'debug');
      
      testLogger.debug('Test debug message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });

    it('should log INFO messages when level is INFO', () => {
      testLogger.setLogLevel(LogLevel.INFO);
      const consoleSpy = jest.spyOn(console, 'info');
      
      testLogger.info('Test info message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should log ERROR messages when level is ERROR', () => {
      testLogger.setLogLevel(LogLevel.ERROR);
      const consoleSpy = jest.spyOn(console, 'error');
      
      testLogger.error('Test error message');
      expect(consoleSpy).toHaveBeenCalled();
    });

    it('should not log INFO messages when level is ERROR', () => {
      testLogger.setLogLevel(LogLevel.ERROR);
      const consoleSpy = jest.spyOn(console, 'info');
      
      testLogger.info('Test info message');
      expect(consoleSpy).not.toHaveBeenCalled();
    });
  });

  describe('Message formatting', () => {
    it('should format messages with timestamp and level', () => {
      const message = testLogger['formatMessage'](LogLevel.INFO, 'Test message');
      expect(message).toMatch(/\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\] \[INFO\] Test message/);
    });

    it('should include context in formatted messages', () => {
      const context = { userId: 123, action: 'test' };
      const message = testLogger['formatMessage'](LogLevel.INFO, 'Test message', context);
      expect(message).toContain('{"userId":123,"action":"test"}');
    });
  });

  describe('Specialized logging methods', () => {
    beforeEach(() => {
      // Clear any previous mocks
      jest.restoreAllMocks();
      // Ensure log level is INFO for these tests
      testLogger.setLogLevel(LogLevel.INFO);
    });

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('should log requests correctly', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const data = { param1: 'value1', param2: 'value2' };
      
      testLogger.logRequest('test-command', data);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Received command: test-command')
      );
    });

    it('should log service events correctly', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const details = { status: 'running', pid: 12345 };
      
      testLogger.logServiceEvent('my-service', 'started', details);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Service my-service: started')
      );
    });

    it('should log AI queries correctly', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const result = { answer: 'Test answer', confidence: 0.9 };
      
      testLogger.logAIQuery('What is the meaning of life?', result);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('AI Query: "What is the meaning of life?"')
      );
    });

    it('should log config updates with masked API keys', () => {
      const consoleSpy = jest.spyOn(console, 'info').mockImplementation(() => {});
      const config = {
        provider: 'openai',
        apiKey: 'sk-1234567890abcdef',
        model: 'gpt-4'
      };
      
      testLogger.logConfigUpdate('ai', config);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Configuration updated: ai')
      );
      
      // Check that API key is masked
      const callArgs = consoleSpy.mock.calls[0];
      expect(callArgs[0]).toContain('***cdef');
      expect(callArgs[0]).not.toContain('1234567890abcdef');
    });
  });

  describe('File writing', () => {
    it('should handle file write errors gracefully', () => {
      // Mock fs.appendFileSync to throw an error
      const fs = require('fs');
      const appendFileSyncSpy = jest.spyOn(fs, 'appendFileSync')
        .mockImplementation(() => {
          throw new Error('Disk full');
        });
      
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
      
      // This should not throw an error
      expect(() => {
        testLogger['writeToFile']('Test message');
      }).not.toThrow();
      
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to write to log file')
      );
      
      appendFileSyncSpy.mockRestore();
      consoleErrorSpy.mockRestore();
    });
  });
});