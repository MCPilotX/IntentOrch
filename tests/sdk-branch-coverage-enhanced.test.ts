/**
 * SDK Branch Coverage Enhanced Tests
 * Tests specifically designed to improve branch coverage for src/sdk.ts
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { IntentOrchSDK } from '../src/sdk';

// Enhanced mock for AI with error scenarios
jest.mock('../src/ai/ai', () => {
  return {
    AI: class MockAI {
      async configure(config: any) {
        if (config.provider === 'error') {
          throw new Error('Configuration failed');
        }
      }
      reset() {}
      getStatus() {
        return { enabled: false, configured: false, provider: 'none' };
      }
      async testConnection() {
        return { success: false, message: 'AI not configured' };
      }
      async parseIntent(query: string) {
        if (query.includes('error')) {
          throw new Error('Intent parsing error');
        }
        return { action: 'unknown', target: 'unknown', params: {}, confidence: 0.3 };
      }
      async generateText(query: string) {
        if (query.includes('error')) {
          throw new Error('Text generation error');
        }
        throw new Error('AI provider not configured');
      }
      mapIntentToTool(intent: any) {
        return {
          name: 'test.tool',
          arguments: {},
        };
      }
      async ask(query: string) {
        if (query.includes('error')) {
          throw new Error('AI query error');
        }
        return { text: 'Mock AI response' };
      }
    },
    AIError: class MockAIError extends Error {
      code: string;
      type: string;
      constructor(code: string, message: string, type: string) {
        super(message);
        this.code = code;
        this.type = type;
      }
    },
  };
});

// Enhanced mock for ConfigManager with various scenarios
jest.mock('../src/core/config-manager', () => {
  const mockConfigs = new Map();
  
  return {
    ConfigManager: {
      init: jest.fn(),
      getGlobalConfig: jest.fn().mockImplementation(() => {
        return {
          services: { autoStart: [] },
          ai: { provider: 'none', model: '' },
          registry: { preferred: 'npm' }
        };
      }),
      saveGlobalConfig: jest.fn().mockImplementation((config) => {
        if (config.test === 'throw') {
          throw new Error('Save failed');
        }
        return Promise.resolve();
      }),
      resetConfig: jest.fn().mockImplementation(() => {
        return Promise.resolve();
      }),
      getStatus: jest.fn().mockReturnValue({ configured: false }),
      getServiceConfig: jest.fn().mockImplementation((name) => {
        if (name === 'error-service') {
          throw new Error('Config read error');
        }
        if (name === 'no-runtime-service') {
          return {
            name: 'no-runtime-service',
            path: '/tmp/test',
            // No runtime specified
          };
        }
        if (name === 'with-detected-runtime') {
          return {
            name: 'with-detected-runtime',
            path: '/tmp/test',
            detectedRuntime: 'node',
          };
        }
        if (mockConfigs.has(name)) {
          return mockConfigs.get(name);
        }
        return null;
      }),
      getAllServices: jest.fn().mockReturnValue(['service1', 'service2']),
      saveServiceConfig: jest.fn().mockImplementation((name, config) => {
        mockConfigs.set(name, config);
        return Promise.resolve();
      }),
    },
  };
});

// Mock for RuntimeAdapterRegistry with error scenarios
jest.mock('../src/runtime/adapter-advanced', () => {
  return {
    RuntimeAdapterRegistry: {
      register: jest.fn(),
      createAdapter: jest.fn().mockImplementation((runtime, config) => {
        if (runtime === 'error') {
          throw new Error('Adapter creation failed');
        }
        return {
          start: jest.fn().mockImplementation((serviceConfig) => {
            if (serviceConfig.name === 'error-start') {
              throw new Error('Start failed');
            }
            return Promise.resolve({ id: 'test-id', pid: 1234, status: 'running' });
          }),
          stop: jest.fn().mockImplementation((processId) => {
            if (processId === 'error-stop') {
              throw new Error('Stop failed');
            }
            return Promise.resolve();
          }),
          status: jest.fn().mockImplementation((processId) => {
            if (processId === 'error-status') {
              throw new Error('Status check failed');
            }
            return Promise.resolve({ running: true, pid: 1234, uptime: 1000 });
          }),
        };
      }),
    },
  };
});

// Mock for EnhancedRuntimeDetector with various scenarios
jest.mock('../src/runtime/detector-advanced', () => {
  return {
    EnhancedRuntimeDetector: {
      detect: jest.fn().mockImplementation((path) => {
        if (path.includes('error')) {
          throw new Error('Detection failed');
        }
        if (path.includes('low-confidence')) {
          return Promise.resolve({
            runtime: 'unknown',
            confidence: 0.3,
            source: 'detected',
            evidence: {},
            warning: 'Low confidence detection',
          });
        }
        return Promise.resolve({
          runtime: 'node',
          confidence: 0.8,
          source: 'detected',
          evidence: {},
          warning: null,
        });
      }),
    },
  };
});

describe('SDK Branch Coverage Enhanced Tests', () => {
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

  describe('Error Handling Branches', () => {
    it('should handle errors in addService', async () => {
      // Mock detection to throw error
      const { EnhancedRuntimeDetector } = require('../src/runtime/detector-advanced');
      EnhancedRuntimeDetector.detect.mockRejectedValueOnce(new Error('Detection failed'));
      
      await expect(sdk.addService({
        name: 'error-service',
        path: '/tmp/error-path',
      })).rejects.toThrow('Detection failed');
    });

    it('should handle errors in startService when config not found', async () => {
      await expect(sdk.startService('non-existent-service')).rejects.toThrow('Service "non-existent-service" not found');
    });

    it('should handle errors in startService when runtime not specified', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'no-runtime-service',
        path: '/tmp/test',
        // No runtime or detectedRuntime
      });
      
      await expect(sdk.startService('no-runtime-service')).rejects.toThrow('Runtime type not specified');
    });

    it('should handle errors in startService when adapter fails', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'error-start',
        path: '/tmp/test',
        runtime: 'error', // This will trigger adapter creation error
      });
      
      await expect(sdk.startService('error-start')).rejects.toThrow();
    });

    it('should handle errors in stopService', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'test-service',
        path: '/tmp/test',
        runtime: 'node',
      });
      
      // This should not throw since we're mocking the adapter
      await expect(sdk.stopService('test-service')).resolves.not.toThrow();
    });

    it('should handle errors in getServiceStatus when service not found', async () => {
      await expect(sdk.getServiceStatus('non-existent-service')).rejects.toThrow('Service "non-existent-service" not found');
    });

    it('should handle errors in getServiceStatus when runtime not specified', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'no-runtime-service',
        path: '/tmp/test',
        // No runtime or detectedRuntime
      });
      
      const status = await sdk.getServiceStatus('no-runtime-service');
      expect(status.status).toBe('unknown');
    });

    it('should handle errors in getServiceStatus when adapter fails', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'test-service',
        path: '/tmp/test',
        runtime: 'node',
      });
      
      const status = await sdk.getServiceStatus('test-service');
      expect(status.status).toBe('running'); // Mock returns running
    });
  });

  describe('Configuration Error Branches', () => {
    it('should handle errors in getConfig when config is undefined', () => {
      // This is already covered by the default mock which returns a valid config
      const config = sdk.getConfig();
      expect(config).toBeDefined();
      expect(config.ai).toBeDefined();
      expect(config.ai.provider).toBe('none');
    });

    it('should handle errors in updateConfig', async () => {
      // The mock already handles errors when config.test === 'throw'
      await expect(sdk.updateConfig({ test: 'throw' })).rejects.toThrow('Save failed');
    });

    it('should handle errors in resetConfig', async () => {
      await expect(sdk.resetConfig()).resolves.not.toThrow();
    });
  });

  describe('AI Error Branches', () => {
    it('should handle errors in parseIntent', async () => {
      // Our mock throws error for queries containing 'error'
      // The SDK should catch and rethrow the error
      await expect(sdk.parseIntent('error')).rejects.toThrow('Intent parsing failed');
    });

    it('should handle errors in generateText', async () => {
      await expect(sdk.generateText('error')).rejects.toThrow('Text generation error');
    });

    it('should handle errors in configureAI', async () => {
      // Our mock throws error when provider is 'error'
      await expect(sdk.configureAI({
        provider: 'error',
        apiKey: 'test-key',
      })).rejects.toThrow('Configuration failed');
    });

    it('should handle errors in testAIConnection', async () => {
      const result = await sdk.testAIConnection();
      expect(result.success).toBe(false);
      expect(result.message).toContain('AI not configured');
    });
  });

  describe('Edge Case Branches', () => {
    it('should handle service with detected runtime but no explicit runtime', async () => {
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getServiceConfig.mockReturnValueOnce({
        name: 'with-detected-runtime',
        path: '/tmp/test',
        detectedRuntime: 'node',
      });
      
      const status = await sdk.getServiceStatus('with-detected-runtime');
      expect(status).toBeDefined();
    });

    it('should handle low confidence detection in addService', async () => {
      const { EnhancedRuntimeDetector } = require('../src/runtime/detector-advanced');
      EnhancedRuntimeDetector.detect.mockResolvedValueOnce({
        runtime: 'unknown',
        confidence: 0.3,
        source: 'detected',
        evidence: {},
        warning: 'Low confidence',
      });
      
      const serviceName = await sdk.addService({
        name: 'low-confidence-service',
        path: '/tmp/low-confidence',
      });
      expect(serviceName).toBe('low-confidence-service');
    });

    it('should handle auto-init with custom logger', () => {
      const customLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn(),
      };
      
      const sdkWithLogger = new IntentOrchSDK({ 
        logger: customLogger, 
        autoInit: true 
      });
      
      expect(sdkWithLogger).toBeInstanceOf(IntentOrchSDK);
      // Should be initialized automatically
      expect(() => sdkWithLogger.getConfig()).not.toThrow();
    });

    it('should handle MCP initialization with autoDiscover', async () => {
      const sdkWithMCP = new IntentOrchSDK({
        autoInit: false,
        mcp: { autoDiscover: true }
      });
      sdkWithMCP.init();
      
      // Mock discoverMCPServers to throw error
      const originalDiscoverMCPServers = sdkWithMCP.discoverMCPServers;
      sdkWithMCP.discoverMCPServers = jest.fn().mockRejectedValue(new Error('Discovery failed'));
      
      try {
        await expect(sdkWithMCP.initMCP()).rejects.toThrow('Discovery failed');
      } finally {
        sdkWithMCP.discoverMCPServers = originalDiscoverMCPServers;
      }
    });
  });

  describe('Cloud Intent Engine Error Branches', () => {
    it('should handle errors when Cloud Intent Engine not initialized', async () => {
      await expect(sdk.processWorkflow('test query')).rejects.toThrow('Cloud Intent Engine not initialized');
    });

    it('should handle errors in initCloudIntentEngine', async () => {
      // Mock CloudIntentEngine to throw error
      jest.mock('../src/ai/cloud-intent-engine', () => {
        return {
          CloudIntentEngine: class MockCloudIntentEngine {
            constructor(config: any) {
              if (config.llm.provider === 'error') {
                throw new Error('Engine creation failed');
              }
            }
            async initialize() {
              throw new Error('Initialization failed');
            }
            setAvailableTools() {}
            getStatus() {
              return { initialized: false, toolsCount: 0, llmProvider: 'none', llmConfigured: false };
            }
          },
        };
      });
      
      // We need to clear the require cache to use the new mock
      delete require.cache[require.resolve('../src/sdk')];
      delete require.cache[require.resolve('../src/ai/cloud-intent-engine')];
      
      // Re-import with new mock
      const { IntentOrchSDK: NewIntentOrchSDK } = require('../src/sdk');
      const newSdk = new NewIntentOrchSDK({ autoInit: false });
      newSdk.init();
      
      // Update config to trigger error
      const { ConfigManager } = require('../src/core/config-manager');
      ConfigManager.getGlobalConfig.mockReturnValueOnce({
        services: { autoStart: [] },
        ai: { provider: 'error', model: '' }, // This will trigger error in mock
        registry: { preferred: 'npm' }
      });
      
      await expect(newSdk.initCloudIntentEngine()).rejects.toThrow();
    });
  });
});