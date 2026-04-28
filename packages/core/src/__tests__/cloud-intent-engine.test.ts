/**
 * Unit tests for CloudIntentEngine
 */
import { CloudIntentEngine, PlanStep, ToolExecutionPlan } from '../ai/cloud-intent-engine';
import { LLMClient } from '../ai/llm-client';
import { ParameterMapper, ValidationLevel } from '../mcp/parameter-mapper';
import type { Tool } from '../mcp/types';

// Mock LLMClient
jest.mock('../ai/llm-client', () => {
  const mockChat = jest.fn();
  const mockConfigure = jest.fn();
  const mockIsConfigured = jest.fn().mockReturnValue(true);
  const mockGetProvider = jest.fn().mockReturnValue('openai');
  const mockGetModel = jest.fn().mockReturnValue('gpt-3.5-turbo');

  return {
    LLMClient: jest.fn().mockImplementation(() => ({
      chat: mockChat,
      configure: mockConfigure,
      isConfigured: mockIsConfigured,
      getProvider: mockGetProvider,
      getModel: mockGetModel,
    })),
    getLLMClient: jest.fn().mockImplementation(() => ({
      chat: mockChat,
      configure: mockConfigure,
      isConfigured: mockIsConfigured,
      getProvider: mockGetProvider,
      getModel: mockGetModel,
    })),
  };
});

// Mock ParameterMapper
jest.mock('../mcp/parameter-mapper', () => {
  const actual = jest.requireActual('../mcp/parameter-mapper');
  return {
    ...actual,
    ParameterMapper: {
      ...actual.ParameterMapper,
      configure: jest.fn(),
    },
  };
});

describe('CloudIntentEngine', () => {
  let engine: CloudIntentEngine;
  let mockTools: Tool[];

  beforeEach(() => {
    // Reset all mocks including implementations
    jest.clearAllMocks();
    const { getLLMClient } = require('../ai/llm-client');
    const client = getLLMClient();
    client.chat.mockReset();
    client.chat.mockResolvedValue(undefined);

    // Create engine with test config
    engine = new CloudIntentEngine({
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-3.5-turbo',
      },
      execution: {
        maxConcurrentTools: 3,
        timeout: 30000,
        retryAttempts: 2,
        retryDelay: 1000,
      },
      fallback: {
        enableKeywordMatching: true,
        askUserOnFailure: false,
      },
    });

    // Setup mock tools
    mockTools = [
      {
        name: 'search_files',
        description: 'Search for files matching a pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern' },
            path: { type: 'string', description: 'Directory path' },
          },
          required: ['pattern'],
        },
      },
      {
        name: 'read_file',
        description: 'Read the contents of a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' },
          },
          required: ['path'],
        },
      },
      {
        name: 'get_weather',
        description: 'Get weather information for a location',
        inputSchema: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name' },
          },
          required: ['location'],
        },
      },
    ];

    engine.setAvailableTools(mockTools);
  });

  describe('constructor', () => {
    it('should create an instance with default config values', () => {
      const defaultEngine = new CloudIntentEngine({
        llm: { provider: 'openai' },
        execution: {},
        fallback: {},
      });

      expect(defaultEngine).toBeInstanceOf(CloudIntentEngine);
    });

    it('should merge provided config with defaults', () => {
      const customEngine = new CloudIntentEngine({
        llm: {
          provider: 'anthropic',
          apiKey: 'custom-key',
          temperature: 0.5,
        },
        execution: {
          timeout: 60000,
        },
        fallback: {},
      });

      expect(customEngine).toBeInstanceOf(CloudIntentEngine);
    });
  });

  describe('setAvailableTools', () => {
    it('should set available tools and build cache', () => {
      const tools: Tool[] = [
        {
          name: 'test_tool',
          description: 'A test tool',
          inputSchema: {
            type: 'object',
            properties: { input: { type: 'string' } },
            required: [],
          },
        },
      ];

      engine.setAvailableTools(tools);
      // Should not throw
      expect(true).toBe(true);
    });

    it('should handle empty tool list', () => {
      engine.setAvailableTools([]);
      // Should not throw
      expect(true).toBe(true);
    });
  });

  describe('planQuery', () => {
    it('should return empty plan when no tools available', async () => {
      engine.setAvailableTools([]);
      const plan = await engine.planQuery('search for test files');

      expect(plan.steps).toEqual([]);
      expect(plan.confirmed).toBe(false);
    });

    it('should generate a plan from LLM response', async () => {
      const mockLLMResponse = {
        text: '',
        raw: { id: 'plan-test' },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_files',
              arguments: JSON.stringify({ pattern: 'test', path: '/home' }),
            },
          },
        ],
      };

      const { getLLMClient } = require('../ai/llm-client');
      const client = getLLMClient();
      client.chat.mockResolvedValue(mockLLMResponse);

      const plan = await engine.planQuery('search for test files in /home');

      expect(plan.steps).toHaveLength(1);
      expect(plan.steps[0].toolName).toBe('search_files');
      expect(plan.steps[0].arguments).toEqual({ pattern: 'test', path: '/home' });
      expect(plan.query).toBe('search for test files in /home');
      expect(plan.confirmed).toBe(false);
    });

    it('should return empty plan when LLM returns no tool calls', async () => {
      const noToolResponse = {
        text: 'I cannot help with that',
        raw: { id: 'no-tool' },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
      };

      const { getLLMClient } = require('../ai/llm-client');
      const client = getLLMClient();
      client.chat.mockResolvedValue(noToolResponse);

      const plan = await engine.planQuery('what is the weather in Beijing?');

      expect(plan.steps).toEqual([]);
      expect(plan.confirmed).toBe(false);
      expect(client.chat).toHaveBeenCalledTimes(1);
    });

    it('should handle plan generation errors', async () => {
      const { getLLMClient } = require('../ai/llm-client');
      const client = getLLMClient();
      client.chat.mockRejectedValue(new Error('LLM unavailable'));

      const plan = await engine.planQuery('search for files');

      expect(plan.steps).toEqual([]);
      expect(plan.summary).toContain('Failed to generate plan');
    });
  });

  describe('processQueryWithHistory', () => {
    it('should return no tool calls when no tools available', async () => {
      engine.setAvailableTools([]);
      const result = await engine.processQueryWithHistory([
        { role: 'user', content: 'hello' },
      ]);

      expect(result.hasToolCall).toBe(false);
      expect(result.toolCalls).toEqual([]);
    });

    it('should process multi-turn conversation', async () => {
      const mockLLMResponse = {
        text: 'I will search for files',
        raw: { id: 'test-id' },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'search_files',
              arguments: JSON.stringify({ pattern: '*.ts' }),
            },
          },
        ],
      };

      const { getLLMClient } = require('../ai/llm-client');
      const client = getLLMClient();
      client.chat.mockResolvedValue(mockLLMResponse);

      const result = await engine.processQueryWithHistory([
        { role: 'system', content: 'You are a helpful assistant.' },
        { role: 'user', content: 'find TypeScript files' },
      ]);

      expect(result.hasToolCall).toBe(true);
      expect(result.toolCalls).toHaveLength(1);
      expect(result.text).toBe('I will search for files');
    });
  });

  describe('confirmPlan', () => {
    let samplePlan: ToolExecutionPlan;

    beforeEach(() => {
      samplePlan = {
        id: 'plan_test_1',
        query: 'search for test files',
        steps: [
          {
            id: 'step_1',
            toolName: 'search_files',
            description: 'Search for files matching pattern',
            arguments: { pattern: 'test' },
            dependsOn: [],
          },
        ],
        confirmed: false,
        createdAt: new Date(),
        summary: 'Will execute 1 step',
      };
    });

    it('should auto-confirm plan with empty steps', async () => {
      const emptyPlan = { ...samplePlan, steps: [] };
      const confirmed = await engine.confirmPlan(emptyPlan, jest.fn());

      expect(confirmed.confirmed).toBe(true);
      expect(confirmed.confirmedAt).toBeDefined();
    });

    it('should confirm plan when callback returns confirmed', async () => {
      const callback = jest.fn().mockResolvedValue({ confirmed: true });

      const confirmed = await engine.confirmPlan(samplePlan, callback);

      expect(confirmed.confirmed).toBe(true);
      expect(confirmed.confirmedAt).toBeDefined();
      expect(callback).toHaveBeenCalledWith(samplePlan);
    });

    it('should reject plan when callback returns not confirmed', async () => {
      const callback = jest.fn().mockResolvedValue({
        confirmed: false,
        feedback: 'User cancelled',
      });

      const confirmed = await engine.confirmPlan(samplePlan, callback);

      expect(confirmed.confirmed).toBe(false);
      expect(confirmed.summary).toContain('User cancelled');
    });

    it('should handle callback errors', async () => {
      const callback = jest.fn().mockRejectedValue(new Error('Callback error'));

      const confirmed = await engine.confirmPlan(samplePlan, callback);

      expect(confirmed.confirmed).toBe(false);
      expect(confirmed.summary).toContain('Confirmation process error');
    });

    it('should handle callback that returns undefined', async () => {
      const invalidPlan: ToolExecutionPlan = {
        id: '',
        query: '',
        steps: [
          {
            id: 'step_1',
            toolName: '',
            description: '',
            arguments: {},
            dependsOn: ['nonexistent_step'],
          },
        ],
        confirmed: false,
        createdAt: new Date(),
        summary: '',
      };

      const result = await engine.confirmPlan(invalidPlan, jest.fn());

      expect(result.confirmed).toBe(false);
      expect(result.summary).toContain('Confirmation process error');
    });
  });

  describe('executePlan', () => {
    let confirmedPlan: ToolExecutionPlan;
    let mockExecutor: jest.Mock;

    beforeEach(() => {
      confirmedPlan = {
        id: 'plan_exec_1',
        query: 'search and read file',
        steps: [
          {
            id: 'step_1',
            toolName: 'search_files',
            description: 'Search for files',
            arguments: { pattern: 'test' },
            dependsOn: [],
          },
          {
            id: 'step_2',
            toolName: 'read_file',
            description: 'Read the file',
            arguments: { path: '{{step_1.result}}' },
            dependsOn: ['step_1'],
          },
        ],
        confirmed: true,
        createdAt: new Date(),
        confirmedAt: new Date(),
        summary: 'Will execute 2 steps',
      };

      mockExecutor = jest.fn();
    });

    it('should reject unconfirmed plan', async () => {
      const unconfirmedPlan = { ...confirmedPlan, confirmed: false };
      const result = await engine.executePlan(unconfirmedPlan, mockExecutor);

      expect(result.success).toBe(false);
      expect(result.finalResult).toContain('not been confirmed');
    });

    it('should handle empty plan', async () => {
      const emptyPlan = { ...confirmedPlan, steps: [] };
      const result = await engine.executePlan(emptyPlan, mockExecutor);

      expect(result.success).toBe(true);
      expect(result.stepResults).toEqual([]);
    });

    it('should execute steps in order', async () => {
      mockExecutor
        .mockResolvedValueOnce('/home/test.txt')
        .mockResolvedValueOnce('file content');

      const result = await engine.executePlan(confirmedPlan, mockExecutor);

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].stepId).toBe('step_1');
      expect(result.stepResults[1].stepId).toBe('step_2');
      expect(mockExecutor).toHaveBeenCalledTimes(2);
    });

    it('should stop execution on step failure', async () => {
      mockExecutor
        .mockResolvedValueOnce('result_1')
        .mockRejectedValueOnce(new Error('Step failed'));

      const result = await engine.executePlan(confirmedPlan, mockExecutor);

      expect(result.success).toBe(false);
      expect(result.stepResults).toHaveLength(2);
      expect(result.stepResults[0].success).toBe(true);
      expect(result.stepResults[1].success).toBe(false);
      expect(result.stepResults[1].error).toBe('Step failed');
    });

    it('should detect circular dependencies', async () => {
      const circularPlan: ToolExecutionPlan = {
        ...confirmedPlan,
        steps: [
          {
            id: 'step_1',
            toolName: 'search_files',
            description: 'Step 1',
            arguments: {},
            dependsOn: ['step_2'],
          },
          {
            id: 'step_2',
            toolName: 'read_file',
            description: 'Step 2',
            arguments: {},
            dependsOn: ['step_1'],
          },
        ],
      };

      const result = await engine.executePlan(circularPlan, mockExecutor);

      expect(result.success).toBe(false);
      expect(result.finalResult).toContain('Circular dependency');
    });
  });

  describe('planAndExecute', () => {
    it('should complete full plan-confirm-execute flow', async () => {
      const mockLLMResponse = {
        text: '',
        raw: { id: 'full-flow' },
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        toolCalls: [
          {
            id: 'call_1',
            type: 'function',
            function: {
              name: 'get_weather',
              arguments: JSON.stringify({ location: 'Shanghai' }),
            },
          },
        ],
      };

      const { getLLMClient } = require('../ai/llm-client');
      const client = getLLMClient();
      client.chat.mockResolvedValue(mockLLMResponse);

      const confirmationCallback = jest.fn().mockResolvedValue({ confirmed: true });
      const toolExecutor = jest.fn().mockResolvedValue({ temperature: 25, condition: 'sunny' });

      const result = await engine.planAndExecute(
        'what is the weather in Shanghai?',
        confirmationCallback,
        toolExecutor,
      );

      expect(result.success).toBe(true);
      expect(result.stepResults).toHaveLength(1);
      expect(result.stepResults[0].toolName).toBe('get_weather');
    });

    it('should handle plan with no steps', async () => {
      engine.setAvailableTools([]);

      const confirmationCallback = jest.fn();
      const toolExecutor = jest.fn();

      const result = await engine.planAndExecute(
        'do something',
        confirmationCallback,
        toolExecutor,
      );

      expect(result.success).toBe(false);
      expect(result.stepResults).toEqual([]);
    });
  });
});
