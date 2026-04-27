import { CloudIntentEngine } from '../ai/cloud-intent-engine';
import { ParameterMapper } from '../mcp/parameter-mapper';

// Mock logger to avoid cluttering output
jest.mock('../core/logger', () => ({
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
