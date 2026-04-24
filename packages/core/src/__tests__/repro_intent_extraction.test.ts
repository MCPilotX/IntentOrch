import { CloudIntentEngine, AtomicIntent, ToolSelectionResult } from '../packages/core/src/ai/cloud-intent-engine';
import { ParameterMapper } from '../packages/core/src/mcp/parameter-mapper';

// Mock logger to avoid cluttering output
jest.mock('../packages/core/src/core/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('CloudIntentEngine Parameter Extraction Fix', () => {
  let engine: any;

  beforeEach(() => {
    const config = {
      llm: {
        provider: 'openai',
        apiKey: 'test-key',
        model: 'gpt-4',
      },
      execution: {
        maxConcurrentTools: 3,
      },
    };
    engine = new CloudIntentEngine(config as any);
    
    // Mock available tools
    const mockTools = [
      {
        name: 'get-tickets',
        description: 'Search for train tickets',
        inputSchema: {
          type: 'object',
          properties: {
            fromStation: { type: 'string', description: 'Origin city' },
            toStation: { type: 'string', description: 'Destination city' },
            date: { type: 'string', description: 'Travel date' },
          },
          required: ['fromStation', 'toStation'],
        },
      },
    ];
    engine.setAvailableTools(mockTools);
  });

  it('should merge Phase 1 parameters into Phase 2 tool arguments', async () => {
    const intent: AtomicIntent = {
      id: 'A1',
      type: 'search',
      description: '查询车票',
      parameters: {
        from: '北京',
        to: '上海',
      },
    };

    // Mock LLM response for tool selection (Phase 2)
    // Simulating a case where LLM fails to extract arguments from the simplified description
    const mockLlmResponse = JSON.stringify({
      tool_name: 'get-tickets',
      arguments: {
        fromStation: null,
        toStation: null,
      },
      confidence: 0.9,
    });

    // We need to mock callLLM which is private, or mock the whole process
    // For this test, we'll manually call the private parseToolSelectionResponse
    const result = (engine as any).parseToolSelectionResponse(mockLlmResponse, intent);

    expect(result.toolName).toBe('get-tickets');
    // from/to should be mapped to fromStation/toStation via ParameterMapper
    expect(result.mappedParameters.fromStation).toBe('北京');
    expect(result.mappedParameters.toStation).toBe('上海');
  });

  it('should correctly extract locations using the refined regex', () => {
    const query1 = '北京到上海的车票';
    const from1 = (engine as any).extractLocationFromQuery(query1, 'from');
    const to1 = (engine as any).extractLocationFromQuery(query1, 'to');
    
    expect(from1).toBe('北京');
    expect(to1).toBe('上海');

    const query2 = '从北京到上海';
    const from2 = (engine as any).extractLocationFromQuery(query2, 'from');
    const to2 = (engine as any).extractLocationFromQuery(query2, 'to');
    
    expect(from2).toBe('北京');
    expect(to2).toBe('上海');
  });
});
