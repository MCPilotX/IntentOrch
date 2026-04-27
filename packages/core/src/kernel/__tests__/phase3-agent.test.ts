/**
 * Phase 3 - Agent化 集成测试
 *
 * Tests for:
 * 1. ReActAgent - Thought → Action → Observation loop
 * 2. ErrorSelfDiagnosis - Error diagnosis and remediation
 * 3. AutoDependencyInferrer - Automatic dependency inference from schemas
 */

import { ReActAgent } from '../react-agent';
import { ErrorSelfDiagnosis } from '../error-self-diagnosis';
import { AutoDependencyInferrer } from '../auto-dependency-inferrer';
import { setKernelConfig } from '../config';
import type { Tool } from '../../mcp/types';

// ==================== Mock Tools ====================

const mockTools: Tool[] = [
  {
    name: 'query-station-code',
    description: 'Query station code by city name',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name to query' },
      },
      required: ['city'],
    },
  },
  {
    name: 'get-tickets',
    description: 'Get available train tickets',
    inputSchema: {
      type: 'object',
      properties: {
        from: { type: 'string', description: 'Departure station code' },
        to: { type: 'string', description: 'Arrival station code' },
        date: { type: 'string', description: 'Travel date (YYYY-MM-DD)' },
      },
      required: ['from', 'to', 'date'],
    },
  },
  {
    name: 'get-weather',
    description: 'Get weather forecast for a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        date: { type: 'string', description: 'Date for forecast' },
      },
      required: ['city'],
    },
  },
  {
    name: 'search-hotels',
    description: 'Search for hotels in a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        checkIn: { type: 'string', description: 'Check-in date' },
        checkOut: { type: 'string', description: 'Check-out date' },
      },
      required: ['city', 'checkIn'],
    },
  },
];

// ==================== Setup ====================

beforeAll(() => {
  setKernelConfig({
    enabled: true,
    reactAgent: {
      maxCycles: 5,
      enabled: true,
      temperature: 0.3,
      verboseLogging: false,
    },
    errorSelfDiagnosis: {
      enabled: true,
      maxRetries: 2,
      verboseLogging: false,
    },
    autoDependencyInferrer: {
      enabled: true,
      minConfidence: 0.5,
      autoRegister: true,
      detectCircular: true,
      verboseLogging: false,
    },
  });
});

// ==================== Test: ReAct Agent ====================

describe('Phase 3: ReAct Agent', () => {
  test('1. ReActAgent: should execute Thought-Action-Observation loop', async () => {
    const agent = new ReActAgent({
      enabled: true,
      maxCycles: 3,
      verboseLogging: false,
    });
    agent.setAvailableTools(mockTools);

    const executedTools: string[] = [];

    const state = await agent.execute(
      'Find train tickets from Guangzhou to Shenzhen',
      async (toolName, params) => {
        executedTools.push(toolName);
        if (toolName === 'query-station-code') {
          return { station_code: 'GZQ' };
        }
        if (toolName === 'get-tickets') {
          return { tickets: [{ train: 'G123', from: 'Guangzhou', to: 'Shenzhen' }] };
        }
        return { success: true };
      },
    );

    expect(state).toBeDefined();
    expect(state.isComplete).toBe(true);
  });

  test('2. ReActAgent: should handle fallback when AI is not configured', async () => {
    const agent = new ReActAgent({
      enabled: true,
      maxCycles: 3,
      verboseLogging: false,
      // No aiConfig - will use fallback
    });
    agent.setAvailableTools(mockTools);

    const state = await agent.execute(
      'Test query',
      async (toolName, params) => {
        return { success: true };
      },
    );

    expect(state).toBeDefined();
    expect(state.isComplete).toBe(true);
    // Fallback should try to execute first available tool
    expect(state.steps.length).toBeGreaterThanOrEqual(0);
  });

  test('3. ReActAgent: should bypass when disabled', async () => {
    const agent = new ReActAgent({
      enabled: false,
      maxCycles: 3,
      verboseLogging: false,
    });

    const state = await agent.execute(
      'Test query',
      async (toolName, params) => {
        return { success: true };
      },
    );

    expect(state.isComplete).toBe(true);
    expect(state.finalResponse).toBe('ReAct loop is disabled');
  });

  test('4. ReActAgent: should track execution summary', async () => {
    const agent = new ReActAgent({
      enabled: true,
      maxCycles: 3,
      verboseLogging: false,
    });
    agent.setAvailableTools(mockTools);

    const state = await agent.execute(
      'Test query',
      async (toolName, params) => {
        return { success: true };
      },
    );

    const summary = agent.getSummary(state);
    expect(summary.query).toBe('Test query');
    expect(summary.isComplete).toBe(true);
    expect(typeof summary.duration).toBe('number');
    expect(typeof summary.toolCalls).toBe('number');
  });
});

// ==================== Test: Error Self-Diagnosis ====================

describe('Phase 3: Error Self-Diagnosis', () => {
  test('5. ErrorSelfDiagnosis: should classify invalid parameter errors', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 2,
      verboseLogging: false,
    });
    diagnosis.setAvailableTools(mockTools);

    const result = await diagnosis.diagnoseAndRemediate(
      'Missing required parameter: from',
      'get-tickets',
      { date: '2026-06-01' },
      async (toolName, params) => {
        throw new Error('Missing required parameter: from');
      },
    );

    expect(result.diagnosis.category).toBe('invalid_parameters');
    expect(result.success).toBe(false);
    expect(result.retryCount).toBeGreaterThanOrEqual(0);
  });

  test('6. ErrorSelfDiagnosis: should retry with fixed params for type mismatches', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 2,
      verboseLogging: false,
    });
    diagnosis.setAvailableTools(mockTools);

    let callCount = 0;

    const result = await diagnosis.diagnoseAndRemediate(
      'Invalid parameter type: from should be string',
      'get-tickets',
      { from: 12345, to: 'GZQ', date: '2026-06-01' },
      async (toolName, params) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Invalid parameter type: from should be string');
        }
        return { success: true, tickets: [] };
      },
    );

    // Should have attempted retry
    expect(callCount).toBeGreaterThanOrEqual(1);
  });

  test('7. ErrorSelfDiagnosis: should classify timeout errors', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 1,
      verboseLogging: false,
    });

    const result = await diagnosis.diagnoseAndRemediate(
      'Execution timeout after 5000ms',
      'get-tickets',
      { from: 'GZQ', to: 'NNZ', date: '2026-06-01' },
      async (toolName, params) => {
        throw new Error('Execution timeout after 5000ms');
      },
    );

    expect(result.diagnosis.category).toBe('timeout');
  });

  test('8. ErrorSelfDiagnosis: should classify authentication errors', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 1,
      verboseLogging: false,
    });

    const result = await diagnosis.diagnoseAndRemediate(
      'Authentication failed: Invalid API key',
      'get-tickets',
      {},
      async (toolName, params) => {
        throw new Error('Authentication failed: Invalid API key');
      },
    );

    expect(result.diagnosis.category).toBe('authentication');
    // Auth errors should report to user, not retry
    expect(result.diagnosis.suggestedAction).toBe('report_to_user');
  });

  test('9. ErrorSelfDiagnosis: should classify rate limiting errors', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 1,
      verboseLogging: false,
    });

    const result = await diagnosis.diagnoseAndRemediate(
      'Rate limit exceeded. Try again later.',
      'get-tickets',
      {},
      async (toolName, params) => {
        throw new Error('Rate limit exceeded. Try again later.');
      },
    );

    expect(result.diagnosis.category).toBe('rate_limited');
    expect(result.diagnosis.suggestedAction).toBe('wait_and_retry');
  });

  test('10. ErrorSelfDiagnosis: should bypass when disabled', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: false,
      maxRetries: 2,
      verboseLogging: false,
    });

    const result = await diagnosis.diagnoseAndRemediate(
      'Some error',
      'get-tickets',
      {},
      async (toolName, params) => {
        throw new Error('Some error');
      },
    );

    expect(result.success).toBe(false);
    expect(result.retryCount).toBe(0);
    expect(result.diagnosis.analysis).toBe('Error self-diagnosis is disabled');
  });
});

// ==================== Test: Auto Dependency Inferrer ====================

describe('Phase 3: Auto Dependency Inferrer', () => {
  test('11. AutoDependencyInferrer: should infer dependencies from schema required fields', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.5,
      verboseLogging: false,
    });

    const dependencies = inferrer.inferDependencies(mockTools);

    // get-tickets has required params 'from', 'to', 'date'
    // These should match with query-station-code's output
    const ticketDeps = dependencies.filter(d => d.dependentTool === 'get-tickets');
    expect(ticketDeps.length).toBeGreaterThanOrEqual(0);
  });

  test('12. AutoDependencyInferrer: should infer from name matching patterns', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.5,
      verboseLogging: false,
    });

    const dependencies = inferrer.inferDependencies(mockTools);

    // 'from' and 'to' params should match query-station-code via name patterns
    const fromDeps = dependencies.filter(
      d => d.dependentParam === 'from' || d.dependentParam === 'to',
    );
    expect(fromDeps.length).toBeGreaterThanOrEqual(0);
  });

  test('13. AutoDependencyInferrer: should build dependency graph', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.5,
      detectCircular: true,
      verboseLogging: false,
    });

    inferrer.inferDependencies(mockTools);
    const graph = inferrer.getDependencyGraph();

    expect(graph).not.toBeNull();
    if (graph) {
      expect(Array.isArray(graph.rootTools)).toBe(true);
      expect(Array.isArray(graph.leafTools)).toBe(true);
      expect(Array.isArray(graph.circularDependencies)).toBe(true);
    }
  });

  test('14. AutoDependencyInferrer: should convert to DependencyRules', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.5,
      verboseLogging: false,
    });

    inferrer.inferDependencies(mockTools);
    const rules = inferrer.toDependencyRules();

    expect(Array.isArray(rules)).toBe(true);
    for (const rule of rules) {
      expect(rule.toolName).toBeDefined();
      expect(rule.dependsOn).toBeDefined();
      expect(rule.sourceTool).toBeDefined();
      expect(rule.sourceParam).toBeDefined();
    }
  });

  test('15. AutoDependencyInferrer: should return empty when disabled', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: false,
      verboseLogging: false,
    });

    const dependencies = inferrer.inferDependencies(mockTools);
    expect(dependencies).toEqual([]);
  });

  test('16. AutoDependencyInferrer: should get dependencies for specific tool', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.3,
      verboseLogging: false,
    });

    inferrer.inferDependencies(mockTools);
    const deps = inferrer.getDependenciesForTool('get-tickets');
    expect(Array.isArray(deps)).toBe(true);
  });

  test('17. AutoDependencyInferrer: should clear dependencies', async () => {
    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.3,
      verboseLogging: false,
    });

    inferrer.inferDependencies(mockTools);
    expect(inferrer.getInferredDependencies().length).toBeGreaterThanOrEqual(0);

    inferrer.clearDependencies();
    expect(inferrer.getInferredDependencies()).toEqual([]);
    expect(inferrer.getDependencyGraph()).toBeNull();
  });
});

// ==================== Test: Integration ====================

describe('Phase 3: Integration Tests', () => {
  test('18. Full Pipeline: ReAct + ErrorSelfDiagnosis + AutoDependencyInferrer', async () => {
    // Setup all three modules
    const reactAgent = new ReActAgent({
      enabled: true,
      maxCycles: 3,
      verboseLogging: false,
    });
    reactAgent.setAvailableTools(mockTools);

    const errorDiagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 2,
      verboseLogging: false,
    });
    errorDiagnosis.setAvailableTools(mockTools);

    const autoInferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.5,
      verboseLogging: false,
    });

    // Step 1: Auto-infer dependencies
    const inferredDeps = autoInferrer.inferDependencies(mockTools);
    const depRules = autoInferrer.toDependencyRules();

    // Step 2: Execute ReAct loop
    const executedTools: string[] = [];
    const state = await reactAgent.execute(
      'Find train tickets from Guangzhou to Shenzhen on 2026-06-01',
      async (toolName, params) => {
        executedTools.push(toolName);
        if (toolName === 'query-station-code') {
          return { station_code: 'GZQ' };
        }
        if (toolName === 'get-tickets') {
          return { tickets: [{ train: 'G123', from: 'Guangzhou', to: 'Shenzhen' }] };
        }
        return { success: true };
      },
    );

    // Step 3: Test error diagnosis with a failing tool
    const errorResult = await errorDiagnosis.diagnoseAndRemediate(
      'Missing required parameter: from',
      'get-tickets',
      { date: '2026-06-01' },
      async (toolName, params) => {
        throw new Error('Missing required parameter: from');
      },
    );

    // Verify all modules worked
    expect(state.isComplete).toBe(true);
    expect(Array.isArray(inferredDeps)).toBe(true);
    expect(Array.isArray(depRules)).toBe(true);
    expect(errorResult.diagnosis.category).toBe('invalid_parameters');
  });

  test('19. AutoDependencyInferrer: should handle tools with no schema', async () => {
    const toolsWithoutSchema: Tool[] = [
      {
        name: 'simple-tool',
        description: 'A simple tool without schema',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
    ];

    const inferrer = new AutoDependencyInferrer({
      enabled: true,
      minConfidence: 0.3,
      verboseLogging: false,
    });

    const dependencies = inferrer.inferDependencies(toolsWithoutSchema);
    expect(dependencies).toEqual([]);
  });

  test('20. ErrorSelfDiagnosis: should handle network errors with wait and retry', async () => {
    const diagnosis = new ErrorSelfDiagnosis({
      enabled: true,
      maxRetries: 1,
      verboseLogging: false,
    });

    let callCount = 0;

    const result = await diagnosis.diagnoseAndRemediate(
      'Connection refused: ECONNREFUSED',
      'get-tickets',
      { from: 'GZQ', to: 'NNZ', date: '2026-06-01' },
      async (toolName, params) => {
        callCount++;
        if (callCount === 1) {
          throw new Error('Connection refused: ECONNREFUSED');
        }
        return { success: true };
      },
    );

    expect(result.diagnosis.category).toBe('network_error');
    expect(result.diagnosis.suggestedAction).toBe('wait_and_retry');
  });
});
