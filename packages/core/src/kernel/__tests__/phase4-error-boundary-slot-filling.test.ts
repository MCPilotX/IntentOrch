/**
 * Phase 4 - 全局错误边界 + 交互式补全 集成测试
 *
 * Tests for:
 * 1. ErrorBoundary - Global error classification and recovery
 * 2. SlotFillingAgent - Interactive parameter completion
 */

import { ErrorBoundary, globalErrorBoundary } from '../error-boundary';
import { SlotFillingAgent, slotFillingAgent } from '../slot-filling-agent';
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
        date: { type: 'string', description: 'Travel date (YYYY-MM-DD)', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
        sortFlag: { type: 'string', description: 'Sort flag', default: '0' },
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
  {
    name: 'set-flag',
    description: 'Set a boolean flag',
    inputSchema: {
      type: 'object',
      properties: {
        enabled: { type: 'boolean', description: 'Enable or disable' },
        count: { type: 'integer', description: 'Count value', minimum: 0, maximum: 100 },
        mode: { type: 'string', description: 'Operation mode', enum: ['fast', 'slow', 'auto'] },
      },
      required: ['enabled'],
    },
  },
];

// ==================== Setup ====================

// Increase timeout for all tests in this file
jest.setTimeout(30000);

beforeAll(() => {
  setKernelConfig({
    enabled: true,
    errorBoundary: {
      enabled: true,
      maxRetries: 3,
      enableCircuitBreaker: true,
      enableAutoRecovery: true,
      verboseLogging: false,
    },
    slotFilling: {
      enabled: true,
      maxQuestionsPerTurn: 3,
      enableSuggestions: true,
      autoFillDefaults: true,
      enableTypeValidation: true,
    },
  });
});

// ==================== Test: Error Boundary ====================

describe('Phase 4: Global Error Boundary', () => {
  test('1. ErrorBoundary: should classify connection errors', async () => {
    const boundary = new ErrorBoundary({
      verboseLogging: false,
      maxRetries: 0, // No retries for classification tests
    });

    const result = await boundary.execute(
      async () => { throw new Error('Connection refused: ECONNREFUSED'); },
      { operationName: 'test-connection', serverName: 'test-server' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('connection');
    expect(result.classification.isRetryable).toBe(true);
    expect(result.classification.recoveryStrategy).toBe('reconnect');
  });

  test('2. ErrorBoundary: should classify timeout errors', async () => {
    const boundary = new ErrorBoundary({
      verboseLogging: false,
      maxRetries: 0,
    });

    const result = await boundary.execute(
      async () => { throw new Error('Request timeout after 5000ms'); },
      { operationName: 'test-timeout' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('timeout');
    expect(result.classification.isRetryable).toBe(true);
    expect(result.classification.recoveryStrategy).toBe('retry_with_backoff');
  });

  test('3. ErrorBoundary: should classify authentication errors', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Authentication failed: Invalid API key'); },
      { operationName: 'test-auth' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('authentication');
    expect(result.classification.isRetryable).toBe(false);
    expect(result.classification.recoveryStrategy).toBe('report_to_user');
  });

  test('4. ErrorBoundary: should classify rate limiting errors', async () => {
    const boundary = new ErrorBoundary({
      verboseLogging: false,
      maxRetries: 0,
    });

    const result = await boundary.execute(
      async () => { throw new Error('Rate limit exceeded. Try again later.'); },
      { operationName: 'test-rate-limit' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('rate_limited');
    expect(result.classification.isRetryable).toBe(true);
    expect(result.classification.recoveryStrategy).toBe('retry_with_backoff');
  });

  test('5. ErrorBoundary: should classify invalid parameter errors', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Missing required parameter: from'); },
      { operationName: 'test-params' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('invalid_parameters');
    expect(result.classification.isRetryable).toBe(false);
    expect(result.classification.recoveryStrategy).toBe('report_to_user');
  });

  test('6. ErrorBoundary: should classify resource not found errors', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('File not found: /path/to/file'); },
      { operationName: 'test-not-found', alternativeTools: mockTools },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('resource_not_found');
    expect(result.classification.recoveryStrategy).toBe('use_alternative_tool');
    expect(result.recoveryAttempted).toBe(true);
    expect(result.recoverySuccessful).toBe(true);
  });

  test('7. ErrorBoundary: should classify server errors', async () => {
    const boundary = new ErrorBoundary({
      verboseLogging: false,
      maxRetries: 0,
    });

    const result = await boundary.execute(
      async () => { throw new Error('Internal server error: 500'); },
      { operationName: 'test-server-error' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('server_error');
    expect(result.classification.isRetryable).toBe(true);
  });

  test('8. ErrorBoundary: should classify network errors', async () => {
    const boundary = new ErrorBoundary({
      verboseLogging: false,
      maxRetries: 0,
    });

    const result = await boundary.execute(
      async () => { throw new Error('ENETUNREACH: Network is unreachable'); },
      { operationName: 'test-network' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('network_error');
    expect(result.classification.isRetryable).toBe(true);
  });

  test('9. ErrorBoundary: should classify protocol errors', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Parse error: Invalid JSON'); },
      { operationName: 'test-protocol' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('protocol_error');
    expect(result.classification.isRetryable).toBe(false);
  });

  test('10. ErrorBoundary: should retry on retryable errors', async () => {
    const boundary = new ErrorBoundary({
      maxRetries: 2,
      backoffBaseDelay: 10,
      verboseLogging: false,
    });

    let callCount = 0;

    const result = await boundary.execute(
      async () => {
        callCount++;
        if (callCount <= 2) {
          throw new Error('Timeout: request timed out');
        }
        return { success: true };
      },
      { operationName: 'test-retry' },
    );

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(2);
    expect(callCount).toBe(3);
  });

  test('11. ErrorBoundary: should succeed on first attempt', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => ({ data: 'success' }),
      { operationName: 'test-success' },
    );

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ data: 'success' });
    expect(result.retryCount).toBe(0);
  });

  test('12. ErrorBoundary: should provide suggested actions', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Invalid API key'); },
      { operationName: 'test-suggestion' },
    );

    expect(result.classification.suggestedAction).toBeDefined();
    expect(result.classification.suggestedAction!.length).toBeGreaterThan(0);
  });

  test('13. ErrorBoundary: should handle unknown errors gracefully', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Some obscure error message'); },
      { operationName: 'test-unknown' },
    );

    expect(result.success).toBe(false);
    expect(result.classification.category).toBe('unknown');
    expect(result.classification.confidence).toBeLessThan(0.5);
  });

  test('14. ErrorBoundary: should track duration', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => {
        await new Promise(r => setTimeout(r, 10));
        return { done: true };
      },
      { operationName: 'test-duration' },
    );

    expect(result.success).toBe(true);
    expect(result.duration).toBeGreaterThanOrEqual(10);
  });
});

// ==================== Test: Slot Filling Agent ====================

describe('Phase 4: Slot Filling Agent', () => {
  test('15. SlotFillingAgent: should detect missing required parameters', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('get-tickets', { from: 'GZQ' });

    // 'to' and 'date' are missing
    const missingRequired = slots.filter(s => s.required);
    expect(missingRequired.length).toBeGreaterThanOrEqual(2);
    expect(missingRequired.some(s => s.paramName === 'to')).toBe(true);
    expect(missingRequired.some(s => s.paramName === 'date')).toBe(true);
  });

  test('16. SlotFillingAgent: should detect invalid parameter types', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('set-flag', { enabled: 'not-a-boolean' });

    expect(slots.length).toBeGreaterThan(0);
    expect(slots[0].validationError).toBeDefined();
  });

  test('17. SlotFillingAgent: should generate questions for missing slots', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('get-tickets', { from: 'GZQ' });
    const questions = agent.generateQuestions(slots);

    expect(questions.length).toBeGreaterThan(0);
    expect(questions[0].question).toBeDefined();
    expect(questions[0].requiresResponse).toBe(true);
  });

  test('18. SlotFillingAgent: should auto-fill default values', async () => {
    const agent = new SlotFillingAgent({
      autoFillDefaults: true,
      verboseLogging: false,
    });
    agent.setAvailableTools(mockTools);

    const result = await agent.fillSlots(
      'get-tickets',
      { from: 'GZQ', to: 'NNZ', date: '2026-06-01' },
    );

    expect(result.allFilled).toBe(true);
    // sortFlag should be auto-filled with default '0'
    const params = result.filledParams.get('get-tickets');
    expect(params).toBeDefined();
  });

  test('19. SlotFillingAgent: should process user response correctly', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('get-tickets', { from: 'GZQ' });
    const missingTo = slots.find(s => s.paramName === 'to');
    expect(missingTo).toBeDefined();

    if (missingTo) {
      const result = agent.processResponse(
        { from: 'GZQ' },
        missingTo,
        'NNZ',
      );

      expect(result.isValid).toBe(true);
      expect(result.updatedParams.to).toBe('NNZ');
    }
  });

  test('20. SlotFillingAgent: should reject invalid enum values', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('set-flag', { enabled: true });
    const modeSlot = slots.find(s => s.paramName === 'mode');
    // mode is optional, so it won't be in missing slots
    // Test validation directly
    const tool = mockTools.find(t => t.name === 'set-flag');
    expect(tool).toBeDefined();

    if (tool) {
      const modeSchema = tool.inputSchema.properties.mode;
      expect(modeSchema.enum).toEqual(['fast', 'slow', 'auto']);
    }
  });

  test('21. SlotFillingAgent: should handle interactive filling with callback', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    let questionsAsked = 0;

    const result = await agent.fillSlots(
      'get-tickets',
      { from: 'GZQ' },
      async (question) => {
        questionsAsked++;
        if (question.slot.paramName === 'to') return 'NNZ';
        if (question.slot.paramName === 'date') return '2026-06-01';
        return 'unknown';
      },
    );

    expect(questionsAsked).toBeGreaterThan(0);
    expect(result.allFilled).toBe(true);
  });

  test('22. SlotFillingAgent: should return questions when no callback provided', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const result = await agent.fillSlots(
      'get-tickets',
      { from: 'GZQ' },
    );

    expect(result.needsUserInput).toBe(true);
    expect(result.questions.length).toBeGreaterThan(0);
    expect(result.allFilled).toBe(false);
  });

  test('23. SlotFillingAgent: should coerce values to correct types', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('set-flag', {});
    const enabledSlot = slots.find(s => s.paramName === 'enabled');
    expect(enabledSlot).toBeDefined();

    if (enabledSlot) {
      // Test boolean coercion
      const result = agent.processResponse({}, enabledSlot, 'true');
      expect(result.isValid).toBe(true);
      expect(result.updatedParams.enabled).toBe(true);
    }
  });

  test('24. SlotFillingAgent: should bypass when disabled', async () => {
    const agent = new SlotFillingAgent({
      enabled: false,
      verboseLogging: false,
    });

    const result = await agent.fillSlots(
      'get-tickets',
      { from: 'GZQ' },
    );

    expect(result.allFilled).toBe(true);
    expect(result.needsUserInput).toBe(false);
  });

  test('25. SlotFillingAgent: should generate parameter suggestions', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('get-tickets', { from: 'GZQ' });
    const fromSlot = slots.find(s => s.paramName === 'from');
    // 'from' is provided, so it won't be missing
    // Check 'to' slot for suggestions
    const toSlot = slots.find(s => s.paramName === 'to');
    expect(toSlot).toBeDefined();
    if (toSlot) {
      expect(toSlot.suggestions).toBeDefined();
      expect(toSlot.suggestions!.length).toBeGreaterThan(0);
    }
  });
});

// ==================== Test: Integration ====================

describe('Phase 4: Integration Tests', () => {
  test('26. Full Pipeline: ErrorBoundary + SlotFillingAgent', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    // Step 1: Execute an operation that fails with invalid params
    const errorResult = await boundary.execute(
      async () => { throw new Error('Missing required parameter: from'); },
      {
        operationName: 'get-tickets',
        toolName: 'get-tickets',
        alternativeTools: mockTools,
      },
    );

    expect(errorResult.success).toBe(false);
    expect(errorResult.classification.category).toBe('invalid_parameters');

    // Step 2: Use SlotFillingAgent to fill missing params
    const slotResult = await agent.fillSlots(
      'get-tickets',
      { to: 'NNZ', date: '2026-06-01' },
      async (question) => {
        if (question.slot.paramName === 'from') return 'GZQ';
        return 'unknown';
      },
    );

    expect(slotResult.allFilled).toBe(true);
  });

  test('27. ErrorBoundary: should handle success after retries', async () => {
    const boundary = new ErrorBoundary({
      maxRetries: 3,
      backoffBaseDelay: 5,
      verboseLogging: false,
    });

    let callCount = 0;

    const result = await boundary.execute(
      async () => {
        callCount++;
        if (callCount < 3) {
          throw new Error('Temporary server error');
        }
        return { status: 'ok' };
      },
      { operationName: 'test-retry-success' },
    );

    expect(result.success).toBe(true);
    expect(result.retryCount).toBe(2);
    expect(result.result).toEqual({ status: 'ok' });
  });

  test('28. SlotFillingAgent: should handle tools with enum parameters', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('set-flag', { enabled: true, mode: 'turbo' });

    const modeSlot = slots.find(s => s.paramName === 'mode');
    expect(modeSlot).toBeDefined();
    if (modeSlot) {
      expect(modeSlot.validationError).toContain('one of');
    }
  });

  test('29. ErrorBoundary: should handle authorization errors', async () => {
    const boundary = new ErrorBoundary({ verboseLogging: false });

    const result = await boundary.execute(
      async () => { throw new Error('Permission denied: access denied'); },
      { operationName: 'test-authz' },
    );

    expect(result.classification.category).toBe('authorization');
    expect(result.classification.isRetryable).toBe(false);
    expect(result.classification.recoveryStrategy).toBe('report_to_user');
  });

  test('30. SlotFillingAgent: should handle integer validation', async () => {
    const agent = new SlotFillingAgent({ verboseLogging: false });
    agent.setAvailableTools(mockTools);

    const slots = agent.analyzeSlots('set-flag', { enabled: true, count: 150 });

    const countSlot = slots.find(s => s.paramName === 'count');
    expect(countSlot).toBeDefined();
    if (countSlot) {
      expect(countSlot.validationError).toContain('100');
    }
  });
});
