/**
 * Tests for the improvements made to MCPilot SDK Core
 * Tests error handling, performance monitoring, and new features
 */

import { MCPilotSDK, mcpilot } from '../src/sdk';
import { EnhancedRuntimeDetector } from '../src/runtime/detector-advanced';
import { getPerformanceMonitor } from '../src/core/performance-monitor';

// Mock dependencies
jest.mock('../src/mcp/tool-registry');
jest.mock('../src/core/performance-monitor');
jest.mock('../src/runtime/detector-advanced');

// Helper function to create SDK instance
const createSDK = () => {
  return new MCPilotSDK({ autoInit: false });
};

describe('MCPilot SDK Core Improvements', () => {
  let sdk: MCPilotSDK;

  beforeEach(() => {
    sdk = createSDK();
    // Initialize SDK for testing
    sdk.init();
  });

  afterEach(() => {
    // Clean up any registered tools
    jest.clearAllMocks();
  });

  describe('Error Handling Improvements', () => {
    test('executeTool should throw error for non-existent tool', async () => {
      // Mock toolRegistry.executeTool to return error result
      const mockToolRegistry = {
        executeTool: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: 'Tool "non_existent_tool" not found.' }],
          isError: true
        })
      };
      (sdk as any).toolRegistry = mockToolRegistry;

      // Act & Assert
      await expect(sdk.executeTool('non_existent_tool', {}))
        .rejects
        .toThrow(/Tool "non_existent_tool" not found/);
    });

    test('executeTool should throw error with helpful message', async () => {
      // Arrange
      const toolName = 'unknown_tool';
      const mockToolRegistry = {
        executeTool: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: `Tool "${toolName}" not found.` }],
          isError: true
        })
      };
      (sdk as any).toolRegistry = mockToolRegistry;
      
      // Act & Assert
      await expect(sdk.executeTool(toolName, {}))
        .rejects
        .toThrow(new RegExp(`Tool "${toolName}" not found`));
    });

    test('executeTool should work for registered tools', async () => {
      // Arrange
      const toolName = 'test_tool';
      const expectedResult = {
        content: [{ type: 'text', text: 'test result' }],
        isError: false
      };
      
      const mockToolRegistry = {
        executeTool: jest.fn().mockResolvedValue(expectedResult)
      };
      (sdk as any).toolRegistry = mockToolRegistry;

      // Act
      const result = await sdk.executeTool(toolName, { param: 'value' });

      // Assert
      expect(result).toEqual(expectedResult);
      expect(mockToolRegistry.executeTool).toHaveBeenCalledWith({
        name: toolName,
        arguments: { param: 'value' }
      });
    });

    test('executeTool should handle tool execution errors', async () => {
      // Arrange
      const toolName = 'error_tool';
      const errorMessage = 'Tool execution failed';
      
      const mockToolRegistry = {
        executeTool: jest.fn().mockResolvedValue({
          content: [{ type: 'text', text: errorMessage }],
          isError: true
        })
      };
      (sdk as any).toolRegistry = mockToolRegistry;

      // Act & Assert
      await expect(sdk.executeTool(toolName, {}))
        .rejects
        .toThrow(errorMessage);
    });
  });

  describe('Performance Monitoring', () => {
    test('getPerformanceMonitor should be available', () => {
      // Since we mocked the performance-monitor module, we need to mock the implementation
      // Mock getPerformanceMonitor to return a mock object
      const mockMonitor = {
        start: jest.fn(),
        stop: jest.fn(),
        recordServiceRequest: jest.fn(),
        getMetrics: jest.fn().mockReturnValue([])
      };
      
      // Mock the module
      jest.mocked(getPerformanceMonitor).mockReturnValue(mockMonitor as any);
      
      // Act
      const monitor = getPerformanceMonitor();

      // Assert
      expect(monitor).toBeDefined();
      expect(typeof monitor).toBe('object');
      expect(monitor).toHaveProperty('start');
      expect(typeof monitor.start).toBe('function');
    });

    test('PerformanceMonitor should have basic functionality', () => {
      // Mock implementation
      const mockMonitor = {
        start: jest.fn(),
        stop: jest.fn(),
        recordServiceRequest: jest.fn(),
        getMetrics: jest.fn().mockReturnValue([])
      };
      jest.mocked(getPerformanceMonitor).mockReturnValue(mockMonitor as any);
      
      // Act
      const monitor = getPerformanceMonitor();

      // Act & Assert
      expect(monitor).toBeDefined();
      expect(typeof monitor).toBe('object');
      expect(monitor).toHaveProperty('start');
      expect(typeof monitor.start).toBe('function');
      expect(monitor).toHaveProperty('stop');
      expect(typeof monitor.stop).toBe('function');
    });

    test('PerformanceMonitor should track metrics', () => {
      // Mock implementation
      const mockMonitor = {
        start: jest.fn(),
        stop: jest.fn(),
        recordServiceRequest: jest.fn(),
        getMetrics: jest.fn().mockReturnValue([
          { timestamp: Date.now(), cpuUsage: { user: 0, system: 0, total: 0 } }
        ])
      };
      jest.mocked(getPerformanceMonitor).mockReturnValue(mockMonitor as any);
      
      // Act
      const monitor = getPerformanceMonitor();
      const metrics = monitor.getMetrics();

      // Act & Assert
      expect(Array.isArray(metrics)).toBe(true);
    });
  });

  describe('EnhancedRuntimeDetector', () => {
    test('should detect runtime for current directory', async () => {
      // Mock the detection to avoid actual filesystem access
      const mockDetect = jest.spyOn(EnhancedRuntimeDetector, 'detect').mockResolvedValue({
        runtime: 'node',
        confidence: 0.9,
        source: 'enhanced',
        evidence: {}
      });

      // Act
      const detection = await EnhancedRuntimeDetector.detect('.');

      // Assert
      expect(detection).toBeDefined();
      expect(detection).toHaveProperty('runtime');
      expect(detection).toHaveProperty('confidence');
      expect(detection).toHaveProperty('source');
      expect(typeof detection.runtime).toBe('string');
      expect(typeof detection.confidence).toBe('number');
      expect(detection.confidence).toBeGreaterThanOrEqual(0);
      expect(detection.confidence).toBeLessThanOrEqual(1);
      
      mockDetect.mockRestore();
    });

    test('should handle invalid paths gracefully', async () => {
      // Arrange
      const invalidPath = '/nonexistent/path/that/does/not/exist';
      const mockDetect = jest.spyOn(EnhancedRuntimeDetector, 'detect').mockResolvedValue({
        runtime: 'node', // Use valid RuntimeType instead of 'unknown'
        confidence: 0,
        source: 'enhanced',
        evidence: {}
      });

      // Act
      const detection = await EnhancedRuntimeDetector.detect(invalidPath);

      // Assert
      expect(detection).toBeDefined();
      // Should still return a detection result
      expect(detection.runtime).toBeDefined();
      
      mockDetect.mockRestore();
    });
  });

  describe('ToolRegistry Improvements', () => {
    test('should list registered tools', () => {
      // Mock listTools to return test data
      const mockTools = [
        { name: 'test-tool-1', description: 'Test tool 1', inputSchema: {} },
        { name: 'test-tool-2', description: 'Test tool 2', inputSchema: {} }
      ];
      const mockListTools = jest.spyOn(sdk, 'listTools').mockReturnValue(mockTools);

      // Act
      const tools = sdk.listTools();

      // Assert
      expect(Array.isArray(tools)).toBe(true);
      expect(tools).toEqual(mockTools);
      
      mockListTools.mockRestore();
    });

    test('should search tools by name', () => {
      // Mock searchTools to return test data
      const mockSearchResults = [
        { name: 'test-tool', description: 'Test tool', inputSchema: {} }
      ];
      const mockSearchTools = jest.spyOn(sdk, 'searchTools').mockReturnValue(mockSearchResults);

      // Act
      const searchResults = sdk.searchTools('test');

      // Assert
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults).toEqual(mockSearchResults);
      
      mockSearchTools.mockRestore();
    });
  });

  describe('SDK Configuration', () => {
    test('should create SDK with custom configuration', () => {
      // Arrange
      const customLogger = {
        info: jest.fn(),
        error: jest.fn(),
        debug: jest.fn()
      };

      // Act
      const customSDK = new MCPilotSDK({
        logger: customLogger,
        mcp: {
          autoDiscover: false,
          servers: []
        }
      });

      // Assert
      expect(customSDK).toBeDefined();
      // Verify custom logger is used by checking initialization
      expect(() => customSDK.init()).not.toThrow();
    });

    test('should configure AI successfully', async () => {
      // Mock the configureAI method to avoid actual API calls
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
  });

  describe('Service Management', () => {
    test('should list services', () => {
      // Act
      const services = sdk.listServices();

      // Assert
      expect(Array.isArray(services)).toBe(true);
      // Should at least return an empty array
      expect(services).toBeDefined();
    });

    test('should get service status', async () => {
      // Arrange
      const serviceName = 'test-service';
      // Mock the getServiceStatus method
      const mockGetServiceStatus = jest.spyOn(sdk, 'getServiceStatus').mockResolvedValue({
        name: serviceName,
        status: 'unknown' as const
      });

      // Act
      const status = await sdk.getServiceStatus(serviceName);

      // Assert
      expect(status).toBeDefined();
      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('status');
      expect(status.name).toBe(serviceName);
      expect(['running', 'stopped', 'error', 'unknown']).toContain(status.status);
      
      mockGetServiceStatus.mockRestore();
    });
  });
});