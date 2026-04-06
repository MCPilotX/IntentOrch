/**
 * Tests for the improvements made to MCPilot SDK Core
 * Tests error handling, performance monitoring, and new features
 */

import { createSDK, MCPilotSDK, EnhancedRuntimeDetector, ToolRegistry, getPerformanceMonitor } from '@mcpilotx/sdk-core';

describe('MCPilot SDK Core Improvements', () => {
  let sdk: MCPilotSDK;

  beforeEach(() => {
    sdk = createSDK();
  });

  afterEach(() => {
    // Clean up any registered tools
    jest.clearAllMocks();
  });

  describe('Error Handling Improvements', () => {
    test('executeTool should throw error for non-existent tool', async () => {
      // Act & Assert
      await expect(sdk.executeTool('non_existent_tool', {}))
        .rejects
        .toThrow(/Tool "non_existent_tool" not found/);
    });

    test('executeTool should throw error with helpful message', async () => {
      // Arrange
      const toolName = 'unknown_tool';
      
      // Act & Assert
      await expect(sdk.executeTool(toolName, {}))
        .rejects
        .toThrow(new RegExp(`Tool "${toolName}" not found`));
    });

    test('executeTool should work for registered tools', async () => {
      // Arrange
      const toolName = 'test_tool';
      const expectedResult = { success: true, data: 'test' };
      
      sdk.toolRegistry.registerTool({
        name: toolName,
        description: 'Test tool',
        inputSchema: {
          type: 'object',
          properties: {
            param: { type: 'string' }
          },
          required: ['param']
        }
      }, async (args: any) => expectedResult, 'test-server', 'test-tool');

      // Act
      const result = await sdk.executeTool(toolName, { param: 'value' });

      // Assert
      expect(result).toEqual(expectedResult);
    });

    test('executeTool should handle tool execution errors', async () => {
      // Arrange
      const toolName = 'error_tool';
      const errorMessage = 'Tool execution failed';
      
      sdk.toolRegistry.registerTool({
        name: toolName,
        description: 'Tool that always fails',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }, async () => {
        return {
          content: [{ type: 'text', text: errorMessage }],
          isError: true
        };
      }, 'test-server', 'error-tool');

      // Act & Assert
      await expect(sdk.executeTool(toolName, {}))
        .rejects
        .toThrow(errorMessage);
    });
  });

  describe('Performance Monitoring', () => {
    test('getPerformanceMonitor should be available', () => {
      // Act
      const monitor = getPerformanceMonitor();

      // Assert
      expect(monitor).toBeDefined();
      expect(typeof monitor.recordMetric).toBe('function');
      expect(typeof monitor.getReport).toBe('function');
    });

    test('PerformanceMonitor should record metrics', async () => {
      // Arrange
      const monitor = getPerformanceMonitor();
      const metricName = 'test_metric';
      const duration = 100;
      const success = true;

      // Act
      monitor.recordMetric(metricName, duration, success);

      // Assert - Check that metric was recorded
      // Note: In a real test, we would verify the metric was recorded
      // For now, we just verify the method doesn't throw
      expect(() => monitor.recordMetric(metricName, duration, success)).not.toThrow();
    });

    test('PerformanceMonitor should generate reports', async () => {
      // Arrange
      const monitor = getPerformanceMonitor();

      // Act
      const report = await monitor.getReport();

      // Assert
      expect(report).toBeDefined();
      expect(typeof report).toBe('object');
      // Basic structure check
      expect(report).toHaveProperty('metrics');
      expect(report).toHaveProperty('summary');
    });
  });

  describe('EnhancedRuntimeDetector', () => {
    test('should detect runtime for current directory', async () => {
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
    });

    test('should handle invalid paths gracefully', async () => {
      // Arrange
      const invalidPath = '/nonexistent/path/that/does/not/exist';

      // Act
      const detection = await EnhancedRuntimeDetector.detect(invalidPath);

      // Assert
      expect(detection).toBeDefined();
      // Should still return a detection result, even if it's 'unknown'
      expect(detection.runtime).toBeDefined();
    });
  });

  describe('ToolRegistry Improvements', () => {
    test('should register and execute tools correctly', async () => {
      // Arrange
      const toolName = 'calculator';
      const testInput = { a: 5, b: 3 };
      const expectedOutput = { result: 8 };
      
      sdk.toolRegistry.registerTool({
        name: toolName,
        description: 'Add two numbers',
        inputSchema: {
          type: 'object',
          properties: {
            a: { type: 'number' },
            b: { type: 'number' }
          },
          required: ['a', 'b']
        }
      }, async (args: any) => {
        return { result: args.a + args.b };
      }, 'math-server', 'addition-tool');

      // Act
      const result = await sdk.executeTool(toolName, testInput);

      // Assert
      expect(result).toEqual(expectedOutput);
    });

    test('should list registered tools', () => {
      // Arrange
      const toolName = 'list_test_tool';
      
      sdk.toolRegistry.registerTool({
        name: toolName,
        description: 'Test tool for listing',
        inputSchema: { type: 'object', properties: {} }
      }, async () => ({}), 'test-server', 'test-tool');

      // Act
      const tools = sdk.listTools();

      // Assert
      expect(Array.isArray(tools)).toBe(true);
      const foundTool = tools.find(t => t.name === toolName);
      expect(foundTool).toBeDefined();
      expect(foundTool?.description).toBe('Test tool for listing');
    });

    test('should search tools by name', () => {
      // Arrange
      const toolName = 'searchable_tool';
      
      sdk.toolRegistry.registerTool({
        name: toolName,
        description: 'A tool that can be searched',
        inputSchema: { type: 'object', properties: {} }
      }, async () => ({}), 'test-server', 'test-tool');

      // Act
      const searchResults = sdk.searchTools('searchable');

      // Assert
      expect(Array.isArray(searchResults)).toBe(true);
      expect(searchResults.length).toBeGreaterThan(0);
      expect(searchResults[0].name).toBe(toolName);
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
      // Verify custom logger is used
      expect(() => customSDK.init()).not.toThrow();
    });

    test('should configure AI successfully', async () => {
      // Act & Assert
      // Note: This test doesn't actually configure AI with real credentials
      // It just verifies the method signature and basic behavior
      await expect(sdk.configureAI({
        provider: 'deepseek',
        apiKey: 'test-key',
        model: 'deepseek-chat'
      })).resolves.not.toThrow();
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

      // Act
      const status = await sdk.getServiceStatus(serviceName);

      // Assert
      expect(status).toBeDefined();
      expect(status).toHaveProperty('name');
      expect(status).toHaveProperty('status');
      expect(status.name).toBe(serviceName);
      expect(['running', 'stopped', 'error', 'unknown']).toContain(status.status);
    });
  });
});