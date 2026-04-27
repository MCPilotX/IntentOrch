/**
 * Kernel-X Integration Tests
 *
 * Tests the full Kernel-X pipeline with generic tool scenarios:
 * - SemanticGateway: Hybrid search correctly identifies relevant tools
 * - LogicFlowScheduler: Dependency injection resolves missing params
 * - SandboxKernel: Execution isolation, timeout handling, health tracking
 * - KernelHistory: Full intent path recording
 */

import { KernelOrchestrator } from '../orchestrator';
import { setKernelConfig } from '../config';
import type { Tool } from '../../mcp/types';

// ==================== Mock VectorRegistry ====================
// We use jest.spyOn in beforeEach to mock vectorRegistry methods
// This avoids the hoisting issues with jest.mock
import * as vectorRegistryModule from '../../registry/vector-registry';
const mockVectorRegistry = vectorRegistryModule.vectorRegistry;

// Helper to create mock functions for vector registry
let mockSearchTools: jest.SpyInstance;
let mockSearchToolsFTS: jest.SpyInstance;

// ==================== Mock Data ====================

const MOCK_TOOLS: Tool[] = [
  {
    name: 'search-data',
    description: 'Search data records with query parameters',
    inputSchema: {
      type: 'object',
      properties: {
        keyword: { type: 'string', description: 'Search keyword' },
        category: { type: 'string', description: 'Data category' },
        date: { type: 'string', description: 'Date filter in YYYY-MM-DD format' },
        auth_token: { type: 'string', description: 'Authentication token for API access' },
      },
      required: ['keyword', 'category', 'date', 'auth_token'],
    },
  },
  {
    name: 'get-auth-token',
    description: 'Get authentication token for API access',
    inputSchema: {
      type: 'object',
      properties: {
        username: { type: 'string', description: 'Username for authentication' },
      },
      required: ['username'],
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
      required: ['city', 'date'],
    },
  },
  {
    name: 'search-hotel',
    description: 'Search for hotels in a city',
    inputSchema: {
      type: 'object',
      properties: {
        city: { type: 'string', description: 'City name' },
        checkIn: { type: 'string', description: 'Check-in date' },
        checkOut: { type: 'string', description: 'Check-out date' },
      },
      required: ['city', 'checkIn', 'checkOut'],
    },
  },
  {
    name: 'get-restaurant',
    description: 'Find restaurants near a location',
    inputSchema: {
      type: 'object',
      properties: {
        location: { type: 'string', description: 'Location name' },
        cuisine: { type: 'string', description: 'Cuisine preference' },
      },
      required: ['location'],
    },
  },
];

// ==================== Test Suite ====================

describe('Kernel-X: Generic Pipeline Tests', () => {
  let orchestrator: KernelOrchestrator;

  beforeAll(() => {
    // Enable Kernel-X with test configuration
    setKernelConfig({
      enabled: true,
      semanticGateway: {
        topK: 5,
        keywordWeight: 0.3,
        semanticWeight: 0.7,
        minConfidence: 0.3,
      },
      logicFlow: {
        enableDependencyInjection: true,
        enableRecursivePlanning: true,
        enableSchemaValidation: true,
        maxRecursionDepth: 3,
      },
      sandboxKernel: {
        executionTimeout: 5000,
        healthDecayRate: 0.2,
        healthRecoveryRate: 0.1,
        minHealthScore: 0.3,
        enableShadowLogging: true,
      },
      kernelHistory: {
        enabled: true,
        maxRecords: 100,
      },
    });

    orchestrator = new KernelOrchestrator();
  });

  beforeEach(() => {
    // Setup spy mocks for vector registry methods
    // searchToolsFTS is private, so we use (as any) to access it
    mockSearchTools = jest.spyOn(mockVectorRegistry, 'searchTools').mockResolvedValue([]);
    mockSearchToolsFTS = jest.spyOn(mockVectorRegistry as any, 'searchToolsFTS').mockReturnValue([]);
  });

  afterEach(() => {
    // Clean up spies
    mockSearchTools?.mockRestore();
    mockSearchToolsFTS?.mockRestore();
  });

  test('1. SemanticGateway: should rank relevant tools higher than unrelated ones', async () => {
    // Setup mock vector registry to return weather-related tools
    mockSearchTools.mockResolvedValue([
      { name: 'get-weather', description: 'Get weather forecast for a city', distance: 0.1 },
      { name: 'search-hotel', description: 'Search for hotels in a city', distance: 0.5 },
      { name: 'get-restaurant', description: 'Find restaurants near a location', distance: 0.6 },
    ]);
    mockSearchToolsFTS.mockReturnValue([
      { name: 'get-weather', description: 'Get weather forecast for a city' },
      { name: 'search-hotel', description: 'Search for hotels in a city' },
    ]);

    const query = 'search for weather data in Beijing tomorrow';
    const gateway = orchestrator.getSemanticGateway();

    const results = await gateway.hybridSearch(query);

    console.log(`\n=== Semantic Gateway Results ===`);
    console.log(`Query: "${query}"`);
    console.log(`Found ${results.length} relevant tools:`);
    results.forEach((r, i) => {
      console.log(`  ${i + 1}. ${r.tool.name} (confidence: ${(r.combinedScore * 100).toFixed(0)}%)`);
    });

    // Should find weather-related tools
    const weatherTools = results.filter(r =>
      r.tool.name === 'get-weather',
    );
    expect(weatherTools.length).toBeGreaterThan(0);

    // get-weather should be ranked higher than unrelated tools like search-hotel
    const weatherRank = results.findIndex(r => r.tool.name === 'get-weather');
    const hotelRank = results.findIndex(r => r.tool.name === 'search-hotel');
    expect(weatherRank).toBeLessThan(hotelRank);
  });

  test('2. LogicFlowScheduler: should detect missing required params via schema validation', async () => {
    const scheduler = orchestrator.getLogicFlowScheduler();

    const intents = [
      {
        id: 'intent_1',
        type: 'data_search',
        description: 'Search data records',
        parameters: {
          keyword: 'test',
          category: 'logs',
          date: '2026-06-01',
          // auth_token is intentionally missing
        },
      },
    ];

    const toolSelections = [
      {
        intentId: 'intent_1',
        toolName: 'search-data',
        mappedParameters: {
          keyword: 'test',
          category: 'logs',
          date: '2026-06-01',
          // auth_token is intentionally missing
        },
        confidence: 0.95,
      },
    ];

    const planning = await scheduler.plan(intents, toolSelections, MOCK_TOOLS);

    console.log(`\n=== Logic Flow Scheduler Results ===`);
    console.log(`Resolved intents: ${planning.resolvedIntents.length}`);
    console.log(`Pre-tasks injected: ${planning.preTasks.length}`);
    console.log(`Warnings: ${planning.warnings.length}`);
    console.log(`Errors: ${planning.errors.length}`);

    planning.preTasks.forEach(pt => {
      console.log(`  Pre-task: ${pt.toolName} -> ${pt.description}`);
    });
    planning.warnings.forEach(w => console.log(`  Warning: ${w}`));

    // Schema validation should detect missing required params
    // Since auth_token is required but missing, there should be errors
    expect(planning.errors.length).toBeGreaterThan(0);
    expect(planning.errors[0]).toContain('auth_token');
  });

  test('3. LogicFlowScheduler: should inject pre-tasks via registered dependency rules', async () => {
    const scheduler = orchestrator.getLogicFlowScheduler();

    // Register a custom dependency rule
    scheduler.registerDependencyRule({
      toolName: 'search-data',
      dependsOn: 'auth_token',
      sourceTool: 'get-auth-token',
      sourceParam: 'token',
      required: true,
      description: 'Auth token is required for data search',
    });

    const intents = [
      {
        id: 'intent_1',
        type: 'data_search',
        description: 'Search data records',
        parameters: {
          keyword: 'test',
          category: 'logs',
          date: '2026-06-01',
          // auth_token is missing - should trigger dependency injection
        },
      },
    ];

    const toolSelections = [
      {
        intentId: 'intent_1',
        toolName: 'search-data',
        mappedParameters: {
          keyword: 'test',
          category: 'logs',
          date: '2026-06-01',
          // auth_token is missing
        },
        confidence: 0.95,
      },
    ];

    const planning = await scheduler.plan(intents, toolSelections, MOCK_TOOLS);

    console.log(`\n=== Logic Flow Scheduler Dependency Injection Results ===`);
    console.log(`Pre-tasks injected: ${planning.preTasks.length}`);
    planning.preTasks.forEach(pt => {
      console.log(`  Pre-task: ${pt.toolName} -> ${pt.description}`);
    });
    planning.warnings.forEach(w => console.log(`  Warning: ${w}`));

    // Should inject pre-task for auth_token
    expect(planning.preTasks.length).toBeGreaterThan(0);
    expect(planning.preTasks[0].toolName).toBe('get-auth-token');
    expect(planning.preTasks[0].isPreTask).toBe(true);

    // Should have warnings about missing parameter
    expect(planning.warnings.length).toBeGreaterThan(0);
    expect(planning.warnings[0]).toContain('auth_token');
  });

  test('4. SandboxKernel: should execute with timeout and health tracking', async () => {
    const kernel = orchestrator.getSandboxKernel();

    // Mock successful execution
    const successResult = await kernel.execute(
      'data-service',
      'search-data',
      { keyword: 'test', category: 'logs', date: '2026-06-01' },
      async (toolName, params) => {
        return { records: ['record1', 'record2'], count: 2 };
      },
    );

    console.log(`\n=== Sandbox Kernel Results ===`);
    console.log(`Success: ${successResult.success}`);
    console.log(`Duration: ${successResult.duration}ms`);
    console.log(`Health score: ${successResult.healthScore.toFixed(2)}`);
    console.log(`Result: ${JSON.stringify(successResult.result)}`);

    expect(successResult.success).toBe(true);
    expect(successResult.result).toBeDefined();
    expect(successResult.result.records).toContain('record1');

    // Health score should be 1.0 after success
    const health = kernel.getHealthScore('data-service');
    expect(health).toBeDefined();
    expect(health!.score).toBe(1.0);
  });

  test('5. SandboxKernel: should handle timeout gracefully', async () => {
    // Use a fresh kernel with short timeout for fast test
    const { SandboxKernel } = require('../sandbox-kernel');
    const fastKernel = new SandboxKernel({
      executionTimeout: 500,
      healthDecayRate: 0.2,
      healthRecoveryRate: 0.1,
      minHealthScore: 0.3,
    });

    // Use a flag to track if the executor was cancelled
    let executorFinished = false;

    // Mock slow execution that exceeds timeout
    const timeoutResult = await fastKernel.execute(
      'slow-service',
      'slow-operation',
      {},
      async (toolName, params) => {
        await new Promise(resolve => setTimeout(resolve, 600)); // 600ms > 500ms timeout
        executorFinished = true;
        return { data: 'too late' };
      },
    );

    // Small delay to let the executor finish (so no open handles)
    await new Promise(resolve => setTimeout(resolve, 200));

    console.log(`\n=== Sandbox Kernel Timeout Test ===`);
    console.log(`Success: ${timeoutResult.success}`);
    console.log(`Duration: ${timeoutResult.duration}ms`);
    console.log(`Error: ${timeoutResult.error?.substring(0, 100)}`);
    console.log(`Health score: ${timeoutResult.healthScore.toFixed(2)}`);

    expect(timeoutResult.success).toBe(false);
    expect(timeoutResult.error).toContain('timeout');

    // Health score should have decreased
    const health = fastKernel.getHealthScore('slow-service');
    expect(health).toBeDefined();
    expect(health!.score).toBeLessThan(1.0);
  });

  test('6. SandboxKernel: should degrade server after repeated failures', async () => {
    const kernel = orchestrator.getSandboxKernel();

    // Simulate multiple failures to trigger degradation
    for (let i = 0; i < 5; i++) {
      await kernel.execute(
        'unstable-service',
        'unstable-operation',
        {},
        async (toolName, params) => {
          throw new Error('Connection refused');
        },
      );
    }

    const health = kernel.getHealthScore('unstable-service');
    console.log(`\n=== Sandbox Kernel Degradation Test ===`);
    console.log(`Health score after 5 failures: ${health!.score.toFixed(2)}`);
    console.log(`Is degraded: ${health!.isDegraded}`);

    // Should be degraded
    expect(health!.isDegraded).toBe(true);
    expect(health!.score).toBeLessThan(0.3);

    // Next execution should immediately fail with degradation message
    const degradedResult = await kernel.execute(
      'unstable-service',
      'unstable-operation',
      {},
      async (toolName, params) => {
        return { data: 'should not reach here' };
      },
    );

    console.log(`Degraded execution result: success=${degradedResult.success}, error=${degradedResult.error?.substring(0, 80)}`);
    expect(degradedResult.success).toBe(false);
    expect(degradedResult.isDegraded).toBe(true);
  });

  test('7. KernelHistory: should record full intent path', async () => {
    const history = orchestrator.getKernelHistory();

    const record = history.record({
      query: 'search for data records with specific keywords',
      vectorMatch: [
        { toolName: 'search-data', score: 0.92 },
        { toolName: 'get-auth-token', score: 0.78 },
      ],
      logicPlan: {
        resolvedIntents: 1,
        preTasks: 1,
        warnings: ['Missing required parameter "auth_token"'],
        errors: [],
      },
      toolExecution: [
        {
          toolName: 'get-auth-token',
          serverName: 'auth-service',
          success: true,
          duration: 200,
        },
        {
          toolName: 'search-data',
          serverName: 'data-service',
          success: true,
          duration: 1500,
          error: undefined,
        },
      ],
      resultNormalization: {
        success: true,
        outputFormat: 'json',
      },
    });

    console.log(`\n=== Kernel History Results ===`);
    console.log(`Record ID: ${record.id}`);
    console.log(`Tags: ${record.tags.join(', ')}`);
    console.log(`Total duration: ${record.totalDuration}ms`);
    console.log(`Query: ${record.intentPath.query.substring(0, 60)}...`);

    expect(record.id).toBeDefined();
    expect(record.tags).toContain('success');
    expect(record.tags).toContain('search-data');
    expect(record.tags).toContain('has-pre-tasks');
    expect(record.tags).toContain('has-warnings');
    expect(record.totalDuration).toBe(1700);

    // Verify stats
    const stats = history.getStats();
    console.log(`Stats: ${JSON.stringify(stats, null, 2)}`);
    expect(stats.totalRecords).toBeGreaterThan(0);
    expect(stats.successRate).toBe(100);
  });

  test('8. Full Pipeline: end-to-end execution with dependency injection', async () => {
    // Create a fresh orchestrator for clean state
    const orch = new KernelOrchestrator();
    const scheduler = orch.getLogicFlowScheduler();

    // Register dependency rule for this test
    scheduler.registerDependencyRule({
      toolName: 'search-data',
      dependsOn: 'auth_token',
      sourceTool: 'get-auth-token',
      sourceParam: 'token',
      required: true,
      description: 'Auth token is required for data search',
    });

    const input = {
      query: 'search for data records with keyword test in logs category',
      intents: [
        {
          id: 'intent_1',
          type: 'data_search',
          description: 'Search data records',
          parameters: {
            keyword: 'test',
            category: 'logs',
            date: '2026-06-01',
          },
        },
      ],
      toolSelections: [
        {
          intentId: 'intent_1',
          toolName: 'search-data',
          mappedParameters: {
            keyword: 'test',
            category: 'logs',
            date: '2026-06-01',
            // auth_token is missing - should be auto-resolved
          },
          confidence: 0.95,
        },
      ],
      availableTools: MOCK_TOOLS,
      executor: async (serverName: string, toolName: string, params: Record<string, any>) => {
        console.log(`  [Executor] ${serverName}.${toolName}(${JSON.stringify(params)})`);

        if (toolName === 'get-auth-token') {
          return { token: 'abc123', username: 'test-user' };
        }

        if (toolName === 'search-data') {
          return {
            records: [
              { id: 1, name: 'record1', category: 'logs' },
              { id: 2, name: 'record2', category: 'logs' },
            ],
          };
        }

        throw new Error(`Unknown tool: ${toolName}`);
      },
    };

    const output = await orch.execute(input);

    console.log(`\n=== Full Pipeline Results ===`);
    console.log(`Overall success: ${output.success}`);
    console.log(`History ID: ${output.historyId}`);
    console.log(`\nPlanning:`);
    console.log(`  Resolved intents: ${output.planning.resolvedIntents.length}`);
    console.log(`  Pre-tasks: ${output.planning.preTasks.length}`);
    console.log(`  Warnings: ${output.planning.warnings.join(', ')}`);
    console.log(`  Errors: ${output.planning.errors.join(', ')}`);

    console.log(`\nPre-task results:`);
    output.preTaskResults.forEach(r => {
      console.log(`  ${r.toolName}: success=${r.success}, duration=${r.duration}ms`);
    });

    console.log(`\nMain results:`);
    output.results.forEach(r => {
      console.log(`  ${r.toolName}: success=${r.success}, duration=${r.duration}ms`);
      if (r.result) {
        console.log(`    Records: ${JSON.stringify(r.result.records)}`);
      }
    });

    // Verify pipeline success
    expect(output.success).toBe(true);
    expect(output.historyId).toBeDefined();

    // Verify pre-tasks were executed
    expect(output.preTaskResults.length).toBeGreaterThan(0);
    expect(output.preTaskResults[0].toolName).toBe('get-auth-token');
    expect(output.preTaskResults[0].success).toBe(true);

    // Verify main tasks executed
    expect(output.results.length).toBeGreaterThan(0);
    expect(output.results[0].toolName).toBe('search-data');
    expect(output.results[0].success).toBe(true);

    // Verify history was recorded
    const history = orch.getKernelHistory();
    const record = history.getRecord(output.historyId!);
    expect(record).toBeDefined();
    expect(record!.intentPath.query).toContain('search');
    expect(record!.tags).toContain('has-pre-tasks');
  });

  test('9. Bypass mode: should work when Kernel-X is disabled', async () => {
    // Disable Kernel-X
    setKernelConfig({ enabled: false });
    const orch = new KernelOrchestrator();

    const input = {
      query: 'search for data records',
      intents: [
        {
          id: 'intent_1',
          type: 'data_search',
          description: 'Search records',
          parameters: { keyword: 'test', category: 'logs', date: '2026-06-01' },
        },
      ],
      toolSelections: [
        {
          intentId: 'intent_1',
          toolName: 'search-data',
          mappedParameters: { keyword: 'test', category: 'logs', date: '2026-06-01' },
          confidence: 0.9,
        },
      ],
      availableTools: MOCK_TOOLS,
      executor: async (_serverName: string, _toolName: string, _params: Record<string, any>) => {
        return { records: ['record1'] };
      },
    };

    const output = await orch.execute(input);

    console.log(`\n=== Bypass Mode Results ===`);
    console.log(`Success: ${output.success}`);
    console.log(`Pre-tasks (should be 0): ${output.preTaskResults.length}`);

    // In bypass mode, no pre-tasks should be injected
    expect(output.preTaskResults.length).toBe(0);
    expect(output.planning.preTasks.length).toBe(0);
    expect(output.success).toBe(true);

    // Re-enable for subsequent tests
    setKernelConfig({ enabled: true });
  });
});
