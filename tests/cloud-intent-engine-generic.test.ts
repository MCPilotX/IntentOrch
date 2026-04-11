/**
 * Cloud Intent Engine Generic Functionality Tests
 * Tests for generic semantic matching, parameter mapping, and configuration
 */

import { CloudIntentEngine } from '../src/ai/cloud-intent-engine';
import { ParameterMapper, ValidationLevel } from '../src/mcp/parameter-mapper';

// Mock AI to avoid actual API calls
const mockAI = {
  configure: jest.fn().mockResolvedValue(undefined),
  callRawAPI: jest.fn().mockRejectedValue(new Error('Mock AI not configured for tests')),
  getStatus: jest.fn().mockReturnValue({ enabled: true }),
};

// Mock tools for testing
const mockTools = [
  {
    name: 'read_file',
    description: 'Read content from a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
      },
      required: ['path'],
    },
  },
  {
    name: 'write_file',
    description: 'Write content to a file',
    inputSchema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        content: { type: 'string', description: 'Content to write' },
        encoding: { type: 'string', description: 'File encoding', default: 'utf-8' },
      },
      required: ['path', 'content'],
    },
  },
  {
    name: 'execute_command',
    description: 'Execute a shell command',
    inputSchema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: 'Command to execute' },
        args: { type: 'array', description: 'Command arguments', items: { type: 'string' } },
      },
      required: ['command'],
    },
  },
  {
    name: 'http_request',
    description: 'Make an HTTP request',
    inputSchema: {
      type: 'object',
      properties: {
        url: { type: 'string', description: 'Request URL' },
        method: { type: 'string', description: 'HTTP method', default: 'GET' },
        headers: { type: 'object', description: 'Request headers' },
        body: { type: 'string', description: 'Request body' },
      },
      required: ['url'],
    },
  },
];

describe('Cloud Intent Engine Generic Functionality', () => {
  let engine: CloudIntentEngine;

  beforeEach(() => {
    // Reset ParameterMapper configuration
    ParameterMapper.resetConfig();
    ParameterMapper.clearCustomMappingRules();

    // Create engine with mock configuration
    engine = new CloudIntentEngine({
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      fallback: {
        enableKeywordMatching: true,
        askUserOnFailure: false,
      },
    });

    // Replace AI instance with mock
    (engine as any).ai = mockAI;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Generic Semantic Tool Selection', () => {
    beforeEach(() => {
      engine.setAvailableTools(mockTools);
    });

    test('should select file operation tools based on semantic matching', () => {
      // Mock the private method to test semantic matching
      const intent = {
        id: 'A1',
        type: 'read_file',
        description: 'Read the file at /tmp/test.txt',
        parameters: { filename: '/tmp/test.txt' },
      };

      // Use reflection to call private method
      const semanticToolSelection = (engine as any).semanticToolSelection.bind(engine);
      const result = semanticToolSelection(intent);

      // Should select read_file tool
      expect(result.toolName).toBe('read_file');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.mappedParameters.path).toBe('/tmp/test.txt');
    });

    test('should select command execution tools based on semantic matching', () => {
      const intent = {
        id: 'A2',
        type: 'execute_command',
        description: 'Execute the command ls -la',
        parameters: { command: 'ls', args: ['-la'] },
      };

      const semanticToolSelection = (engine as any).semanticToolSelection.bind(engine);
      const result = semanticToolSelection(intent);

      // Should select execute_command tool
      expect(result.toolName).toBe('execute_command');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.mappedParameters.command).toBe('ls');
    });

    test('should select HTTP tools based on semantic matching', () => {
      const intent = {
        id: 'A3',
        type: 'http_request',
        description: 'Make a GET request to https://api.example.com',
        parameters: { url: 'https://api.example.com', method: 'GET' },
      };

      const semanticToolSelection = (engine as any).semanticToolSelection.bind(engine);
      const result = semanticToolSelection(intent);

      // Should select http_request tool
      expect(result.toolName).toBe('http_request');
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.mappedParameters.url).toBe('https://api.example.com');
    });

    test('should handle generic parameter mapping in semantic selection', () => {
      const intent = {
        id: 'A4',
        type: 'write_file',
        description: 'Write content to a file',
        parameters: { 
          filename: '/tmp/output.txt',
          content: 'Hello World',
          text: 'Additional text', // Should be mapped to content
        },
      };

      const semanticToolSelection = (engine as any).semanticToolSelection.bind(engine);
      const result = semanticToolSelection(intent);

      // Should select write_file tool
      expect(result.toolName).toBe('write_file');
      // Parameters should be mapped using ParameterMapper
      expect(result.mappedParameters.path).toBe('/tmp/output.txt');
      expect(result.mappedParameters.content).toBe('Hello World');
    });
  });

  describe('Generic Parameter Compatibility Checking', () => {
    test('should check generic parameter compatibility', () => {
      // Create a test instance to test the method
      const testEngine = new CloudIntentEngine({
        llm: { provider: 'openai' },
      });
      
      // Use reflection to access private method
      const areParametersCompatibleGeneric = (testEngine as any).areParametersCompatibleGeneric.bind(testEngine);

      // Test direct matches
      expect(areParametersCompatibleGeneric('path', 'path')).toBe(true);
      expect(areParametersCompatibleGeneric('filename', 'filename')).toBe(true);

      // Test generic mappings
      expect(areParametersCompatibleGeneric('filename', 'path')).toBe(true);
      expect(areParametersCompatibleGeneric('file', 'path')).toBe(true);
      expect(areParametersCompatibleGeneric('directory', 'path')).toBe(true);
      expect(areParametersCompatibleGeneric('query', 'search')).toBe(true);
      expect(areParametersCompatibleGeneric('content', 'data')).toBe(true);
      expect(areParametersCompatibleGeneric('text', 'data')).toBe(true);
      expect(areParametersCompatibleGeneric('id', 'identifier')).toBe(true);

      // Test reverse mappings
      expect(areParametersCompatibleGeneric('path', 'filename')).toBe(true);
      expect(areParametersCompatibleGeneric('search', 'query')).toBe(true);
      expect(areParametersCompatibleGeneric('data', 'content')).toBe(true);

      // Test non-matching parameters
      expect(areParametersCompatibleGeneric('path', 'url')).toBe(false);
      expect(areParametersCompatibleGeneric('filename', 'command')).toBe(false);
    });

    test('should handle fuzzy parameter matching', () => {
      const areParametersCompatibleGeneric = (engine as any).areParametersCompatibleGeneric.bind(engine);

      // Test similar parameter names
      expect(areParametersCompatibleGeneric('file_name', 'filename')).toBe(true);
      expect(areParametersCompatibleGeneric('file-name', 'filename')).toBe(true);
      expect(areParametersCompatibleGeneric('file_path', 'filepath')).toBe(true);
      expect(areParametersCompatibleGeneric('search_term', 'searchterm')).toBe(true);
    });
  });

  describe('Generic Intent Type Based Tool Selection', () => {
    beforeEach(() => {
      engine.setAvailableTools(mockTools);
    });

    test('should select tools based on generic intent types', () => {
      const intentTypeBasedToolSelection = (engine as any).intentTypeBasedToolSelection.bind(engine);

      // Test data retrieval intent
      const readIntent = {
        id: 'A1',
        type: 'read_file',
        description: 'Read file',
        parameters: { path: '/tmp/test.txt' },
      };
      const readResult = intentTypeBasedToolSelection(readIntent);
      expect(readResult.toolName).toBe('read_file');
      expect(readResult.confidence).toBe(0.4);

      // Test data creation intent
      const writeIntent = {
        id: 'A2',
        type: 'write_file',
        description: 'Write file',
        parameters: { path: '/tmp/output.txt', content: 'test' },
      };
      const writeResult = intentTypeBasedToolSelection(writeIntent);
      expect(writeResult.toolName).toBe('write_file');
      expect(writeResult.confidence).toBe(0.4);

      // Test system operation intent
      const executeIntent = {
        id: 'A3',
        type: 'execute_command',
        description: 'Execute command',
        parameters: { command: 'ls' },
      };
      const executeResult = intentTypeBasedToolSelection(executeIntent);
      expect(executeResult.toolName).toBe('execute_command');
      expect(executeResult.confidence).toBe(0.4);
    });

    test('should handle base intent type extraction', () => {
      const intentTypeBasedToolSelection = (engine as any).intentTypeBasedToolSelection.bind(engine);

      // Test intent with suffix
      const intentWithSuffix = {
        id: 'A1',
        type: 'read_file_with_ai',
        description: 'Read file with AI',
        parameters: { path: '/tmp/test.txt' },
      };
      
      // This should still match read_file tool
      const result = intentTypeBasedToolSelection(intentWithSuffix);
      expect(result.toolName).toBe('read_file');
    });
  });

  describe('ParameterMapper Integration', () => {
    test('should use ParameterMapper for parameter mapping', () => {
      const simpleParameterMapping = (engine as any).simpleParameterMapping.bind(engine);

      const tool = mockTools[0]; // read_file tool
      const intentParams = { filename: '/tmp/test.txt', encoding: 'utf-8' };

      const result = simpleParameterMapping(intentParams, tool);

      // Should map filename to path using ParameterMapper
      expect(result.path).toBe('/tmp/test.txt');
      expect(result.encoding).toBe('utf-8');
      expect(result.filename).toBeUndefined(); // Should be removed after mapping
    });

    test('should handle complex parameter mapping scenarios', () => {
      const simpleParameterMapping = (engine as any).simpleParameterMapping.bind(engine);

      const tool = mockTools[1]; // write_file tool
      const intentParams = { 
        file: '/tmp/output.txt',
        text: 'Hello World',
        encoding: 'utf-8',
      };

      const result = simpleParameterMapping(intentParams, tool);

      // Should map file to path
      expect(result.path).toBe('/tmp/output.txt');
      // text should be mapped to content by ParameterMapper
      expect(result.content).toBe('Hello World');
      expect(result.encoding).toBe('utf-8');
    });
  });

  describe('Configuration Integration', () => {
    test('should configure ParameterMapper during initialization', async () => {
      const configureSpy = jest.spyOn(ParameterMapper, 'configure');

      // Create engine with parameter mapping configuration
      const configuredEngine = new CloudIntentEngine({
        llm: {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4',
        },
        parameterMapping: {
          validationLevel: ValidationLevel.STRICT,
          logWarnings: false,
          enforceRequired: false,
        },
      });

      // Replace AI with mock
      (configuredEngine as any).ai = mockAI;

      // Debug: check if config exists
      console.log('Engine config.parameterMapping:', configuredEngine.config.parameterMapping);
      
      await configuredEngine.initialize();

      // Debug: check if spy was called
      console.log('Configure spy calls:', configureSpy.mock.calls.length);
      if (configureSpy.mock.calls.length > 0) {
        console.log('Configure spy called with:', configureSpy.mock.calls[0]);
      }

      // Should have called ParameterMapper.configure with correct settings
      expect(configureSpy).toHaveBeenCalledWith({
        validationLevel: ValidationLevel.STRICT,
        logWarnings: false,
        enforceRequired: false,
      });

      configureSpy.mockRestore();
    });

    test('should use default ParameterMapper configuration when not specified', async () => {
      const configureSpy = jest.spyOn(ParameterMapper, 'configure');

      // Create engine without parameter mapping configuration
      const defaultEngine = new CloudIntentEngine({
        llm: {
          provider: 'openai',
          apiKey: 'test-key',
          model: 'gpt-4',
        },
      });

      // Replace AI with mock
      (defaultEngine as any).ai = mockAI;

      await defaultEngine.initialize();

      // Should not have called ParameterMapper.configure
      expect(configureSpy).not.toHaveBeenCalled();

      configureSpy.mockRestore();
    });
  });

  describe('Generic Tool Selection Fallback Strategies', () => {
    beforeEach(() => {
      engine.setAvailableTools(mockTools);
    });

    test('should fall back through multiple selection strategies', async () => {
      // Mock LLM to fail
      mockAI.callRawAPI.mockRejectedValue(new Error('LLM failed'));

      const selectToolForIntent = (engine as any).selectToolForIntent.bind(engine);
      
      // Use a more specific intent that can be matched by fallback strategies
      const intent = {
        id: 'A1',
        type: 'read_file',  // More specific type that matches tool name
        description: 'Read the file at /tmp/test.txt',
        parameters: { path: '/tmp/test.txt' },
      };

      const result = await selectToolForIntent(intent);

      // Should still return a result through fallback strategies
      expect(result).toBeDefined();
      expect(result.intentId).toBe('A1');
      // Should have selected a tool through semantic or keyword matching
      expect(result.toolName).toBeDefined();
      expect(result.confidence).toBeGreaterThan(0);
    });

    test('should return unknown tool when no strategies work', async () => {
      // Clear tools to simulate no available tools
      engine.setAvailableTools([]);

      const selectToolForIntent = (engine as any).selectToolForIntent.bind(engine);
      
      const intent = {
        id: 'A1',
        type: 'some_intent',
        description: 'Do something',
        parameters: {},
      };

      const result = await selectToolForIntent(intent);

      // Should return unknown tool
      expect(result.toolName).toBe('unknown');
      expect(result.confidence).toBe(0);
      expect(result.toolDescription).toContain('No tools available');
    });
  });

  describe('Generic Functionality Verification', () => {
    test('should not contain hardcoded service-specific logic', () => {
      // Check that engine methods don't contain hardcoded service names
      const engineMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(engine));
      
      // Use regex with word boundaries to avoid false positives like "previewPlan" matching "pr"
      const serviceSpecificPatterns = ['github', 'slack', 'jira', 'trello'];
      const serviceSpecificPatternsWithBoundaries = ['\\bpr\\b', '\\bpullrequest\\b', ...serviceSpecificPatterns];
      
      const hasServiceSpecificMethods = engineMethods.some(method => {
        const methodLower = method.toLowerCase();
        return serviceSpecificPatternsWithBoundaries.some(pattern => {
          if (pattern.startsWith('\\b')) {
            // Use regex for word boundary matching
            const regex = new RegExp(pattern, 'i');
            return regex.test(methodLower);
          } else {
            // Simple includes for full service names
            return methodLower.includes(pattern);
          }
        });
      });

      expect(hasServiceSpecificMethods).toBe(false);

      // Check that semantic matching doesn't contain service-specific keywords
      const semanticToolSelectionCode = (engine as any).semanticToolSelection.toString();
      const semanticCodeLower = semanticToolSelectionCode.toLowerCase();
      
      const hasServiceSpecificCode = serviceSpecificPatternsWithBoundaries.some(pattern => {
        if (pattern.startsWith('\\b')) {
          const regex = new RegExp(pattern, 'i');
          return regex.test(semanticCodeLower);
        } else {
          return semanticCodeLower.includes(pattern);
        }
      });

      expect(hasServiceSpecificCode).toBe(false);
    });

    test('should use generic parameter mappings', () => {
      const areParametersCompatibleGeneric = (engine as any).areParametersCompatibleGeneric.toString();
      
      // Should not contain GitHub/Slack specific mappings
      // Note: 'pr' might appear in other contexts (like 'property'), so we check for specific patterns
      expect(areParametersCompatibleGeneric).not.toContain('github');
      expect(areParametersCompatibleGeneric).not.toContain('slack');
      
      // Check for specific service-related patterns (case-insensitive)
      const lowerCode = areParametersCompatibleGeneric.toLowerCase();
      expect(lowerCode).not.toContain('pullrequest');
      expect(lowerCode).not.toContain('pull_request');
      
      // Should contain generic mappings
      expect(areParametersCompatibleGeneric).toContain('filename');
      expect(areParametersCompatibleGeneric).toContain('path');
      expect(areParametersCompatibleGeneric).toContain('content');
      expect(areParametersCompatibleGeneric).toContain('data');
    });
  });
});