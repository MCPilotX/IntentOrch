import { MCPilotSDK, mcpilot } from '../src/sdk';
import { ConfigManager } from '../src/core/config-manager';
import { RuntimeAdapterRegistry } from '../src/runtime/adapter-advanced';
import { EnhancedRuntimeDetector } from '../src/runtime/detector-advanced';
import { MCPClient, ToolRegistry } from '../src/mcp';

// Mock dependencies
jest.mock('../src/core/config-manager');
jest.mock('../src/runtime/adapter-advanced');
jest.mock('../src/runtime/detector-advanced');
jest.mock('../src/mcp');

describe('MCPilotSDK', () => {
  let sdk: MCPilotSDK;
  let mockLogger: any;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    };

    // Reset all mocks
    jest.clearAllMocks();

    // Mock ToolRegistry methods
    const mockToolRegistry = {
      getAllTools: jest.fn().mockReturnValue([]),
      searchTools: jest.fn().mockReturnValue([]),
      executeTool: jest.fn(),
      registerMCPTool: jest.fn(),
      unregisterServerTools: jest.fn(),
      getToolStatistics: jest.fn(),
    };
    
    // Mock ToolRegistry constructor
    (ToolRegistry as any).mockImplementation(() => mockToolRegistry);

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
      const mockConfigManagerInit = jest.spyOn(ConfigManager, 'init');
      const autoInitSDK = new MCPilotSDK({ autoInit: true });
      expect(mockConfigManagerInit).toHaveBeenCalled();
    });

    it('should not auto-initialize when autoInit is false', () => {
      const mockConfigManagerInit = jest.spyOn(ConfigManager, 'init');
      new MCPilotSDK({ autoInit: false });
      expect(mockConfigManagerInit).not.toHaveBeenCalled();
    });
  });

  describe('init()', () => {
    it('should initialize SDK successfully', () => {
      const mockConfigManagerInit = jest.spyOn(ConfigManager, 'init');
      
      sdk.init();
      
      expect(mockConfigManagerInit).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith('MCPilot SDK initialized successfully');
    });

    it('should not re-initialize if already initialized', () => {
      const mockConfigManagerInit = jest.spyOn(ConfigManager, 'init');
      
      sdk.init();
      sdk.init(); // Second call should not re-initialize
      
      expect(mockConfigManagerInit).toHaveBeenCalledTimes(1);
    });

    it('should throw error if initialization fails', () => {
      const mockConfigManagerInit = jest.spyOn(ConfigManager, 'init').mockImplementation(() => {
        throw new Error('Config initialization failed');
      });
      
      expect(() => sdk.init()).toThrow('Config initialization failed');
      expect(mockLogger.error).toHaveBeenCalled();
      
      // Restore the mock
      mockConfigManagerInit.mockRestore();
    });
  });

  describe('addService()', () => {
    beforeEach(() => {
      sdk.init(); // Ensure SDK is initialized
    });

    it('should add service successfully', async () => {
      const mockDetect = jest.spyOn(EnhancedRuntimeDetector, 'detect').mockResolvedValue({
        runtime: 'node',
        confidence: 0.9,
        source: 'enhanced',
        evidence: {},
      });

      const serviceConfig = {
        name: 'test-service',
        path: '/path/to/service',
      };

      const result = await sdk.addService(serviceConfig);

      expect(mockDetect).toHaveBeenCalledWith('/path/to/service');
      expect(mockLogger.info).toHaveBeenCalledWith('Detected runtime: node (confidence: 0.9)');
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' added successfully");
      expect(result).toBe('test-service');
    });

    it('should add service with specified runtime', async () => {
      const mockDetect = jest.spyOn(EnhancedRuntimeDetector, 'detect');
      
      const serviceConfig = {
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      };

      const result = await sdk.addService(serviceConfig);

      expect(mockDetect).not.toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' added successfully");
      expect(result).toBe('test-service');
    });

    it('should throw error if SDK not initialized', async () => {
      const uninitializedSDK = new MCPilotSDK({ autoInit: false });
      
      await expect(uninitializedSDK.addService({ name: 'test', path: '/path' }))
        .rejects.toThrow('SDK not initialized');
    });

    it('should handle errors during service addition', async () => {
      jest.spyOn(EnhancedRuntimeDetector, 'detect').mockRejectedValue(new Error('Detection failed'));

      await expect(sdk.addService({ name: 'test', path: '/path' }))
        .rejects.toThrow('Detection failed');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('startService()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should start service successfully', async () => {
      const mockGetServiceConfig = jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      });

      const mockAdapter = {
        start: jest.fn().mockResolvedValue(undefined),
      };
      const mockCreateAdapter = jest.spyOn(RuntimeAdapterRegistry, 'createAdapter').mockReturnValue(mockAdapter as any);

      await sdk.startService('test-service');

      expect(mockGetServiceConfig).toHaveBeenCalledWith('test-service');
      expect(mockCreateAdapter).toHaveBeenCalledWith('node', expect.any(Object));
      expect(mockAdapter.start).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' started successfully");
    });

    it('should throw error if service not found', async () => {
      jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue(undefined);

      await expect(sdk.startService('non-existent-service'))
        .rejects.toThrow("Service 'non-existent-service' not found");
    });

    it('should throw error if runtime not specified', async () => {
      jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
      });

      await expect(sdk.startService('test-service'))
        .rejects.toThrow("Runtime type not specified for service 'test-service'");
    });

    it('should handle errors during service start', async () => {
      jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      });

      const mockAdapter = {
        start: jest.fn().mockRejectedValue(new Error('Start failed')),
      };
      jest.spyOn(RuntimeAdapterRegistry, 'createAdapter').mockReturnValue(mockAdapter as any);

      await expect(sdk.startService('test-service'))
        .rejects.toThrow('Start failed');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('stopService()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should stop service successfully', async () => {
      const mockGetServiceConfig = jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      });

      const mockAdapter = {
        stop: jest.fn().mockResolvedValue(undefined),
      };
      const mockCreateAdapter = jest.spyOn(RuntimeAdapterRegistry, 'createAdapter').mockReturnValue(mockAdapter as any);

      await sdk.stopService('test-service');

      expect(mockGetServiceConfig).toHaveBeenCalledWith('test-service');
      expect(mockCreateAdapter).toHaveBeenCalledWith('node', expect.any(Object));
      expect(mockAdapter.stop).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith("Service 'test-service' stopped successfully");
    });
  });

  describe('listServices()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should list all services', () => {
      const mockServices = ['service1', 'service2', 'service3'];
      jest.spyOn(ConfigManager, 'getAllServices').mockReturnValue(mockServices);

      const services = sdk.listServices();

      expect(services).toEqual(mockServices);
      expect(ConfigManager.getAllServices).toHaveBeenCalled();
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
      const mockGetServiceConfig = jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      });

      const mockAdapter = {
        status: jest.fn().mockResolvedValue({
          running: true,
          pid: 12345,
          uptime: 3600,
        }),
      };
      jest.spyOn(RuntimeAdapterRegistry, 'createAdapter').mockReturnValue(mockAdapter as any);

      const status = await sdk.getServiceStatus('test-service');

      expect(status).toEqual({
        name: 'test-service',
        status: 'running',
        pid: 12345,
        uptime: 3600,
      });
    });

    it('should return unknown status if runtime not specified', async () => {
      jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
      });

      const status = await sdk.getServiceStatus('test-service');

      expect(status).toEqual({
        name: 'test-service',
        status: 'unknown',
      });
    });

    it('should return error status if adapter fails', async () => {
      jest.spyOn(ConfigManager, 'getServiceConfig').mockReturnValue({
        name: 'test-service',
        path: '/path/to/service',
        runtime: 'node' as const,
      });

      const mockAdapter = {
        status: jest.fn().mockRejectedValue(new Error('Status check failed')),
      };
      jest.spyOn(RuntimeAdapterRegistry, 'createAdapter').mockReturnValue(mockAdapter as any);

      const status = await sdk.getServiceStatus('test-service');

      expect(status).toEqual({
        name: 'test-service',
        status: 'error',
      });
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('getConfig()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should get configuration', () => {
      const mockConfig = { ai: { provider: 'none' } };
      jest.spyOn(ConfigManager, 'getGlobalConfig').mockReturnValue(mockConfig as any);

      const config = sdk.getConfig();

      expect(config).toEqual(mockConfig);
      expect(ConfigManager.getGlobalConfig).toHaveBeenCalled();
    });
  });

  describe('updateConfig()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should update configuration successfully', async () => {
      const mockSaveGlobalConfig = jest.spyOn(ConfigManager, 'saveGlobalConfig').mockImplementation(() => {});

      await sdk.updateConfig({ ai: { provider: 'openai', model: 'gpt-3.5-turbo' } });

      expect(mockSaveGlobalConfig).toHaveBeenCalledWith({ ai: { provider: 'openai', model: 'gpt-3.5-turbo' } });
      expect(mockLogger.info).toHaveBeenCalledWith('Configuration updated successfully');
    });

    it('should handle errors during configuration update', async () => {
      jest.spyOn(ConfigManager, 'saveGlobalConfig').mockImplementation(() => {
        throw new Error('Update failed');
      });

      await expect(sdk.updateConfig({ ai: { provider: 'openai', model: 'gpt-3.5-turbo' } }))
        .rejects.toThrow('Update failed');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('ask()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should return AI response when AI is configured', async () => {
      jest.spyOn(ConfigManager, 'getGlobalConfig').mockReturnValue({
        ai: { provider: 'openai', apiKey: 'test-key' },
      } as any);

      const result = await sdk.ask('Hello, how are you?');

      expect(result).toEqual({
        answer: expect.stringContaining('I received your query: "Hello, how are you?"'),
        confidence: 0.8,
      });
    });

    it('should throw error when AI is not configured', async () => {
      jest.spyOn(ConfigManager, 'getGlobalConfig').mockReturnValue({
        ai: { provider: 'none' },
      } as any);

      await expect(sdk.ask('Hello'))
        .rejects.toThrow('AI functionality is not configured');
    });

    it('should handle errors during AI query', async () => {
      jest.spyOn(ConfigManager, 'getGlobalConfig').mockImplementation(() => {
        throw new Error('Config error');
      });

      await expect(sdk.ask('Hello'))
        .rejects.toThrow('Config error');
      
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('configureAI()', () => {
    beforeEach(() => {
      sdk.init();
    });

    it('should configure AI successfully', async () => {
      const mockGetConfig = jest.spyOn(ConfigManager, 'getGlobalConfig').mockReturnValue({
        ai: { provider: 'none' },
      } as any);
      const mockUpdateConfig = jest.spyOn(sdk, 'updateConfig').mockResolvedValue();

      await sdk.configureAI({ provider: 'openai', apiKey: 'test-key' });

      expect(mockGetConfig).toHaveBeenCalled();
      expect(mockUpdateConfig).toHaveBeenCalledWith({
        ai: { provider: 'openai', apiKey: 'test-key' },
      });
      expect(mockLogger.info).toHaveBeenCalledWith('AI configuration updated successfully');
    });
  });

  describe('MCP Functionality', () => {
    beforeEach(() => {
      sdk.init();
    });

    describe('initMCP()', () => {
      it('should initialize MCP functionality', async () => {
        const mockDiscoverMCPServers = jest.spyOn(sdk, 'discoverMCPServers').mockResolvedValue([]);
        const mockConnectMCPServer = jest.spyOn(sdk, 'connectMCPServer').mockResolvedValue({} as any);

        await sdk.initMCP();

        expect(mockDiscoverMCPServers).not.toHaveBeenCalled(); // autoDiscover is false by default
        expect(mockConnectMCPServer).not.toHaveBeenCalled(); // no servers configured
        expect(mockLogger.info).toHaveBeenCalledWith('MCP functionality initialized successfully');
      });

      it('should auto-discover servers when enabled', async () => {
        const sdkWithAutoDiscover = new MCPilotSDK({
          logger: mockLogger,
          autoInit: true,
          mcp: { autoDiscover: true },
        });

        const mockDiscoverMCPServers = jest.spyOn(sdkWithAutoDiscover, 'discoverMCPServers').mockResolvedValue([]);

        await sdkWithAutoDiscover.initMCP();

        expect(mockDiscoverMCPServers).toHaveBeenCalled();
      });
    });

    describe('listMCPServers()', () => {
      it('should list MCP servers', () => {
        // This would test the actual implementation
        const servers = sdk.listMCPServers();
        expect(Array.isArray(servers)).toBe(true);
      });
    });

    describe('listTools()', () => {
      it('should list tools', () => {
        const tools = sdk.listTools();
        expect(Array.isArray(tools)).toBe(true);
        expect(tools).toEqual([]);
      });
    });

    describe('searchTools()', () => {
      it('should search tools', () => {
        const tools = sdk.searchTools('test');
        expect(Array.isArray(tools)).toBe(true);
        expect(tools).toEqual([]);
      });
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
});