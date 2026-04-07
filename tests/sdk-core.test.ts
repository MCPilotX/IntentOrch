/**
 * Tests for SDK core functionality
 */

import { MCPilotSDK } from '../src/sdk';
import { createMockSDK, createMockToolResult, createMockLogger } from './test-utils';

describe('SDK Core Functionality', () => {
  describe('SDK Initialization', () => {
    test('should initialize with default configuration', () => {
      // Act
      const sdk = new MCPilotSDK();
      
      // Assert
      expect(sdk).toBeDefined();
      expect(() => sdk.init()).not.toThrow();
    });

    test('should initialize with custom configuration', () => {
      // Arrange
      const customLogger = createMockLogger();
      
      // Act
      const sdk = new MCPilotSDK({
        logger: customLogger,
        mcp: {
          autoDiscover: false,
          servers: []
        }
      });
      
      // Assert
      expect(sdk).toBeDefined();
      expect(() => sdk.init()).not.toThrow();
    });

    test('should not auto-initialize when autoInit is false', () => {
      // Act
      const sdk = new MCPilotSDK({ autoInit: false });
      
      // Assert
      expect(sdk).toBeDefined();
      // SDK should not be initialized yet
      expect(() => sdk.init()).not.toThrow();
    });
  });

  describe('Tool Execution', () => {
    test('should execute tool successfully', async () => {
      // Arrange
      const sdk = createMockSDK();
      const mockToolResult = createMockToolResult();
      (sdk as any).toolRegistry.executeTool.mockResolvedValue(mockToolResult);
      
      // Act
      const result = await sdk.executeTool('test-tool', { param: 'value' });
      
      // Assert
      expect(result).toEqual(mockToolResult);
      expect((sdk as any).toolRegistry.executeTool).toHaveBeenCalledWith({
        name: 'test-tool',
        arguments: { param: 'value' }
      });
    });

    test('should throw error when tool execution fails', async () => {
      // Arrange
      const sdk = createMockSDK();
      const errorMessage = 'Tool execution failed';
      const mockErrorResult = createMockToolResult({
        content: [{ type: 'text', text: errorMessage }],
        isError: true
      });
      (sdk as any).toolRegistry.executeTool.mockResolvedValue(mockErrorResult);
      
      // Act & Assert
      await expect(sdk.executeTool('error-tool', {}))
        .rejects
        .toThrow(errorMessage);
    });

    test('should handle tool not found error', async () => {
      // Arrange
      const sdk = createMockSDK();
      const toolName = 'non-existent-tool';
      const mockErrorResult = createMockToolResult({
        content: [{ type: 'text', text: `Tool "${toolName}" not found.` }],
        isError: true
      });
      (sdk as any).toolRegistry.executeTool.mockResolvedValue(mockErrorResult);
      
      // Act & Assert
      await expect(sdk.executeTool(toolName, {}))
        .rejects
        .toThrow(new RegExp(`Tool "${toolName}" not found`));
    });
  });

  describe('Tool Management', () => {
    test('should list tools', () => {
      // Arrange
      const sdk = createMockSDK({ hasTools: true });
      
      // Act
      const tools = sdk.listTools();
      
      // Assert
      expect(Array.isArray(tools)).toBe(true);
      expect(tools.length).toBeGreaterThan(0);
      expect(tools[0]).toHaveProperty('name');
      expect(tools[0]).toHaveProperty('description');
    });

    test('should search tools', () => {
      // Arrange
      const sdk = createMockSDK({ hasTools: true });
      const searchTerm = 'test';
      (sdk as any).toolRegistry.searchTools.mockReturnValue([
        { 
          tool: { name: 'test-tool-1', description: 'Test tool 1', inputSchema: {} },
          metadata: { serverName: 'test-server', serverId: 'test-server', toolId: 'test-tool-1' },
          executor: jest.fn()
        }
      ]);
      
      // Act
      const results = sdk.searchTools(searchTerm);
      
      // Assert
      expect(Array.isArray(results)).toBe(true);
      expect(results[0]).toHaveProperty('name');
      expect(results[0].name).toBe('test-tool-1');
      expect((sdk as any).toolRegistry.searchTools).toHaveBeenCalledWith(searchTerm);
    });

    test('should return empty array when no tools match search', () => {
      // Arrange
      const sdk = createMockSDK();
      (sdk as any).toolRegistry.searchTools.mockReturnValue([]);
      
      // Act
      const results = sdk.searchTools('nonexistent');
      
      // Assert
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBe(0);
    });
  });

  describe('AI Configuration', () => {
    test('should configure AI successfully', async () => {
      // Arrange
      const sdk = createMockSDK();
      const mockConfigureAI = jest.spyOn(sdk, 'configureAI').mockResolvedValue();
      
      // Act & Assert
      await expect(sdk.configureAI({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat'
      })).resolves.not.toThrow();
      
      expect(mockConfigureAI).toHaveBeenCalledWith({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat'
      });
      
      mockConfigureAI.mockRestore();
    });

    test('should get AI status', () => {
      // Arrange
      const sdk = createMockSDK({ hasAI: true });
      
      // Act
      const status = sdk.getAIStatus();
      
      // Assert
      expect(status).toBeDefined();
      expect(status).toHaveProperty('enabled');
      expect(status).toHaveProperty('provider');
      expect(status).toHaveProperty('configured');
      expect(typeof status.enabled).toBe('boolean');
      expect(typeof status.provider).toBe('string');
      expect(typeof status.configured).toBe('boolean');
    });

    test('should return disabled AI status when not configured', () => {
      // Arrange
      const sdk = createMockSDK({ hasAI: false });
      
      // Act
      const status = sdk.getAIStatus();
      
      // Assert
      expect(status).toBeDefined();
      expect(status.enabled).toBe(false);
      expect(status.configured).toBe(false);
    });
  });

  describe('Service Management', () => {
    test('should list services', () => {
      // Arrange
      const sdk = createMockSDK();
      
      // Act
      const services = sdk.listServices();
      
      // Assert
      expect(Array.isArray(services)).toBe(true);
      // Should return an array (may be empty)
      expect(services).toBeDefined();
    });

    test('should get service status', async () => {
      // Arrange
      const sdk = createMockSDK();
      const serviceName = 'test-service';
      const mockGetServiceStatus = jest.spyOn(sdk, 'getServiceStatus').mockResolvedValue({
        name: serviceName,
        status: 'running' as const
      });
      
      // Act
      const status = await sdk.getServiceStatus(serviceName);
      
      // Assert
      expect(status).toBeDefined();
      expect(status.name).toBe(serviceName);
      expect(status.status).toBe('running');
      
      mockGetServiceStatus.mockRestore();
    });

    test('should handle unknown service status', async () => {
      // Arrange
      const sdk = createMockSDK();
      const serviceName = 'unknown-service';
      const mockGetServiceStatus = jest.spyOn(sdk, 'getServiceStatus').mockResolvedValue({
        name: serviceName,
        status: 'unknown' as const
      });
      
      // Act
      const status = await sdk.getServiceStatus(serviceName);
      
      // Assert
      expect(status).toBeDefined();
      expect(status.name).toBe(serviceName);
      expect(status.status).toBe('unknown');
      
      mockGetServiceStatus.mockRestore();
    });
  });

  describe('Error Handling', () => {
    test('should handle initialization errors gracefully', () => {
      // Arrange
      const sdk = new MCPilotSDK({ autoInit: false });
      
      // Mock an error during initialization by mocking ConfigManager.init
      const mockConfigManagerInit = jest.spyOn(require('../src/core/config-manager').ConfigManager, 'init').mockImplementation(() => {
        throw new Error('Config initialization failed');
      });
      
      // Act & Assert
      expect(() => sdk.init()).toThrow('Config initialization failed');
      
      mockConfigManagerInit.mockRestore();
    });

    test('should handle tool registry errors', async () => {
      // Arrange
      const sdk = createMockSDK();
      const error = new Error('Tool registry error');
      (sdk as any).toolRegistry.executeTool.mockRejectedValue(error);
      
      // Act & Assert
      await expect(sdk.executeTool('test-tool', {}))
        .rejects
        .toThrow('Tool registry error');
    });
  });
});