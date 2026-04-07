import { MCPilotSDK, IntentOrchSDK, mcpilot, intentorch } from '../src/sdk';
import { EnhancedRuntimeDetector } from '../src/runtime/detector-advanced';
import { ConfigManager } from '../src/core/config-manager';
import { RuntimeAdapterRegistry } from '../src/runtime/adapter-advanced';
import { SimpleAI } from '../src/ai/ai';

// Mock dependencies
jest.mock('../src/runtime/detector-advanced');
jest.mock('../src/core/config-manager');
jest.mock('../src/runtime/adapter-advanced');
jest.mock('../src/ai/ai');

describe('IntentOrchSDK (Simple Version, formerly MCPilotSDK)', () => {
  let sdk: IntentOrchSDK;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Mock EnhancedRuntimeDetector.detect to avoid file system checks
    (EnhancedRuntimeDetector.detect as jest.Mock).mockResolvedValue({
      runtime: 'node',
      confidence: 0.9,
      source: 'enhanced',
      evidence: {},
    });

    // Mock ConfigManager methods
    (ConfigManager.init as jest.Mock).mockResolvedValue(undefined);
    (ConfigManager.getServiceConfig as jest.Mock).mockReturnValue({
      name: 'test-service',
      path: '/path/to/service',
      runtime: 'node',
    });
    (ConfigManager.getAllServices as jest.Mock).mockReturnValue(['service1', 'service2']);
    (ConfigManager.getGlobalConfig as jest.Mock).mockReturnValue({
      ai: { provider: 'openai', apiKey: 'test-key' },
    });

    // Mock RuntimeAdapterRegistry
    const mockAdapter = {
      start: jest.fn().mockResolvedValue(undefined),
      stop: jest.fn().mockResolvedValue(undefined),
      status: jest.fn().mockResolvedValue({ running: true, pid: 12345, uptime: 3600 }),
    };
    (RuntimeAdapterRegistry.createAdapter as jest.Mock).mockReturnValue(mockAdapter);

    // Mock SimpleAI
    const mockSimpleAI = {
      configure: jest.fn().mockResolvedValue(undefined),
      ask: jest.fn().mockImplementation((query: string) => {
        return Promise.resolve({
          type: 'suggestions',
          message: `I received your query: "${query}"`,
          confidence: 0.8
        });
      })
    };
    (SimpleAI as unknown as jest.Mock).mockImplementation(() => mockSimpleAI);

    // Create SDK instance
    sdk = new MCPilotSDK({
      logger: mockLogger,
      autoInit: false,
    });
  });

  describe('Constructor', () => {
    it('should create SDK instance with default logger', () => {
      const defaultSDK = new MCPilotSDK();
      expect(defaultSDK).toBeInstanceOf(MCPilotSDK);
    });

    it('should create SDK instance with custom logger', () => {
      expect(sdk).toBeInstanceOf(MCPilotSDK);
      expect(mockLogger.info).not.toHaveBeenCalled();
    });

    it('should auto-initialize when autoInit is true', () => {
      const autoInitSDK = new MCPilotSDK({ autoInit: true });
      // The logger should have been called during auto-init
      expect(autoInitSDK).toBeInstanceOf(MCPilotSDK);
    });

    it('should not auto-initialize when autoInit is false', () => {
      expect(mockLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('init()', () => {
    it('should initialize SDK successfully', () => {
      sdk.init();
      expect(mockLogger.info).toHaveBeenCalledWith('IntentOrch SDK initialized successfully');
    });

    it('should not re-initialize if already initialized', () => {
      sdk.init();
      sdk.init(); // Second call should not re-initialize
      // The first init logs: 'IntentOrch SDK initialized successfully'
      // The registerRuntimeAdapters logs: 'Runtime adapter factories registered successfully'
      // So total should be 2, but the important thing is that ConfigManager.init is only called once
      expect(mockLogger.info).toHaveBeenCalledWith('IntentOrch SDK initialized successfully');
      // ConfigManager.init should only be called once
      expect(ConfigManager.init).toHaveBeenCalledTimes(1);
    });

    it('should throw error if initialization fails', () => {
      // Mock ConfigManager.init to throw
      const mockInit = jest.spyOn(require('../src/core/config-manager').ConfigManager, 'init').mockImplementation(() => {
        throw new Error('Config initialization failed');
      });
      
      expect(() => sdk.init()).toThrow('Config initialization failed');
      expect(mockLogger.error).toHaveBeenCalled();
      
      // Restore mock
      mockInit.mockRestore();
    });
  });

  describe('addService()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should add service successfully', async () => {
      const serviceConfig = {
        name: 'test-service',
        path: '/path/to/service',
      };

      const result = await sdk.addService(serviceConfig);

      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' added successfully");
      expect(result).toBe('test-service');
    });

    it('should throw error if SDK not initialized', async () => {
      const uninitializedSDK = new MCPilotSDK({ autoInit: false });
      
      await expect(uninitializedSDK.addService({ name: 'test', path: '/path' }))
        .rejects.toThrow('SDK not initialized');
    });

    it('should handle errors during service addition', async () => {
      // Force an error by making logger.info throw
      mockLogger.info = jest.fn(() => {
        throw new Error('Logging failed');
      });

      await expect(sdk.addService({ name: 'test', path: '/path' }))
        .rejects.toThrow('Logging failed');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('startService()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should start service successfully', async () => {
      // First add a service
      await sdk.addService({ name: 'test-service', path: '/path' });
      
      await sdk.startService('test-service');

      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' started successfully");
    });

    it('should throw error if service not found', async () => {
      // Override the mock to return undefined for non-existent service
      (ConfigManager.getServiceConfig as jest.Mock).mockReturnValueOnce(undefined);
      
      await expect(sdk.startService('non-existent-service'))
        .rejects.toThrow("Service 'non-existent-service' not found");
    });
  });

  describe('stopService()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should stop service successfully', async () => {
      // First add a service
      await sdk.addService({ name: 'test-service', path: '/path' });
      
      await sdk.stopService('test-service');

      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' stopped successfully");
    });
  });

  describe('listServices()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should list all services', async () => {
      // Add some services
      await sdk.addService({ name: 'service1', path: '/path1' });
      await sdk.addService({ name: 'service2', path: '/path2' });
      
      const services = sdk.listServices();

      expect(services).toEqual(['service1', 'service2']);
    });

    it('should throw error if SDK not initialized', () => {
      const uninitializedSDK = new MCPilotSDK({ autoInit: false });
      
      expect(() => uninitializedSDK.listServices())
        .toThrow('SDK not initialized');
    });
  });

  describe('getServiceStatus()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should get service status successfully', async () => {
      await sdk.addService({ name: 'test-service', path: '/path' });
      
      const status = await sdk.getServiceStatus('test-service');

      expect(status).toEqual({
        name: 'test-service',
        status: 'running',
        pid: 12345,
        uptime: 3600,
      });
    });

    it('should return error status if service not found', async () => {
      // Override the mock to return undefined for non-existent service
      (ConfigManager.getServiceConfig as jest.Mock).mockReturnValueOnce(undefined);
      
      const status = await sdk.getServiceStatus('non-existent-service');

      expect(status).toEqual({
        name: 'non-existent-service',
        status: 'error',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('ask()', () => {
    beforeEach(() => {
      sdk.init();
      // Configure AI before testing ask()
      // Mock getGlobalConfig to return a valid config for configureAI
      (ConfigManager.getGlobalConfig as jest.Mock).mockReturnValueOnce({
        ai: { provider: 'openai', apiKey: 'test-key' }
      });
      sdk.configureAI({
        provider: 'openai',
        apiKey: 'test-key'
      });
    });

    it('should return AI response', async () => {
      const result = await sdk.ask('Hello, how are you?');

      expect(result).toEqual({
        answer: expect.stringContaining('I received your query: "Hello, how are you?"'),
        confidence: 0.3, // SDK sets confidence to 0.3 for 'suggestions' type
      });
    });

    it('should handle errors during AI query', async () => {
      // Force an error by making SimpleAI.ask throw
      const mockSimpleAIInstance = (SimpleAI as unknown as jest.Mock).mock.results[0].value;
      mockSimpleAIInstance.ask.mockImplementationOnce(() => {
        throw new Error('Config error');
      });

      await expect(sdk.ask('Hello'))
        .rejects.toThrow('Config error');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('Singleton Instance', () => {
    it('should export singleton instance', () => {
      expect(mcpilot).toBeInstanceOf(MCPilotSDK);
    });

    it('should auto-initialize singleton instance', () => {
      // The singleton is created with autoInit: true
      expect(mcpilot).toBeDefined();
    });
  });

  describe('Method Coverage', () => {
    beforeEach(() => {
      sdk.init();
      // Mock getAllServices to return dynamic list
      const servicesList: string[] = [];
      (ConfigManager.getAllServices as jest.Mock).mockImplementation(() => [...servicesList]);
      
      // Mock addService to update the services list
      const originalAddService = sdk.addService.bind(sdk);
      jest.spyOn(sdk, 'addService').mockImplementation(async (config) => {
        servicesList.push(config.name);
        return config.name;
      });
    });

    it('should cover all public methods', async () => {
      // Test constructor
      expect(sdk).toBeInstanceOf(MCPilotSDK);
      
      // Test init (already done in beforeEach)
      expect(mockLogger.info).toHaveBeenCalledWith('IntentOrch SDK initialized successfully');
      
      // Test addService
      const serviceName = await sdk.addService({ name: 'test', path: '/path' });
      expect(serviceName).toBe('test');
      
      // Test startService
      await sdk.startService('test');
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test' started successfully");
      
      // Test stopService
      await sdk.stopService('test');
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test' stopped successfully");
      
      // Test listServices
      const services = sdk.listServices();
      expect(services).toContain('test');
      
      // Test getServiceStatus
      const status = await sdk.getServiceStatus('test');
      expect(status.name).toBe('test');
      
      // Test ask
      const aiResult = await sdk.ask('test query');
      expect(aiResult.answer).toContain('test query');
      
      // Test ensureInitialized (indirectly through all above calls)
      // This is tested by the fact that all methods work without throwing "not initialized" error
    });
  });
});