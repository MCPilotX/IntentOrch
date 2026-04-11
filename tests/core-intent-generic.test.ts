
import { CloudIntentEngine } from '../src/ai/cloud-intent-engine';
import { ParameterMapper, ValidationLevel } from '../src/mcp/parameter-mapper';
import { logger } from '../src/core/logger';

describe('IntentOrch Core - Generic Logic & Coverage Reinforcement', () => {
  let engine: CloudIntentEngine;

  const mockTools = [
    {
      name: 'read-file',
      description: 'Read content from a file path',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          encoding: { type: 'string' }
        },
        required: ['path']
      }
    },
    {
      name: 'search-engine',
      description: 'Search for information online',
      inputSchema: {
        type: 'object',
        properties: {
          query: { type: 'string' }
        },
        required: ['query']
      }
    }
  ];

  beforeEach(() => {
    engine = new CloudIntentEngine({
      llm: { provider: 'openai', apiKey: 'test-key' }
    });
    engine.setAvailableTools(mockTools as any);
  });

  describe('Pre-analysis & Heuristics', () => {
    test('should identify simple queries correctly', () => {
      const result = (engine as any).preAnalyzeQuery('search for AI news');
      expect(result.isLikelySimpleQuery).toBe(true);
      expect(result.complexityScore).toBeLessThan(0.5);
    });

    test('should identify complex sequences correctly', () => {
      const result = (engine as any).preAnalyzeQuery('first read the file, then search for content and finally send email');
      expect(result.hasTemporalMarkers).toBe(true);
      expect(result.complexityScore).toBeGreaterThan(0.5);
    });

    test('should find likely single tool match based on name overlap', () => {
      const match = (engine as any).findLikelySingleToolMatch('please read-file test.txt');
      expect(match).toBe('read-file');
    });
  });

  describe('Minimal Decomposition Correction', () => {
    test('should merge redundant intents for simple queries', () => {
      const redundantResult = {
        intents: [
          { id: 'A1', type: 'read-file', description: 'Read part 1', parameters: {} },
          { id: 'A2', type: 'read-file', description: 'Read part 2', parameters: {} }
        ],
        edges: [{ from: 'A1', to: 'A2' }]
      };
      
      const preAnalysis = (engine as any).preAnalyzeQuery('read my file');
      // Force simple match
      (preAnalysis as any).likelySingleToolMatch = 'read-file';
      (preAnalysis as any).isLikelySimpleQuery = true;
      (preAnalysis as any).complexityScore = 0.2;

      const corrected = (engine as any).applyMinimalDecompositionCorrection(
        redundantResult,
        'read my file',
        preAnalysis
      );

      expect(corrected.intents.length).toBe(1);
      expect(corrected.intents[0].type).toBe('read-file');
    });
  });

  describe('Adaptive Parameter Mapping (Generic)', () => {
    test('should map synonymous parameters across conventions', () => {
      const schema = { properties: { path: { type: 'string' } }, required: ['path'] };
      const sourceParams = { filename: '/etc/hosts' };
      
      const mapped = ParameterMapper.mapParameters('any-tool', schema as any, sourceParams);
      
      expect(mapped.path).toBe('/etc/hosts');
      expect(mapped.filename).toBeUndefined();
    });

    test('should handle logical transformations (disabled -> !active)', () => {
      const schema = { properties: { active: { type: 'boolean' } } };
      const sourceParams = { disabled: true };
      
      const mapped = ParameterMapper.mapParameters('any-tool', schema as any, sourceParams);
      
      expect(mapped.active).toBe(false);
    });
  });

  describe('Confidence Assessment', () => {
    test('should penalize decomposition of simple queries', () => {
      const result = {
        intents: [{ id: 'A1', type: 'unknown', description: 'desc', parameters: {} }, { id: 'A2', type: 'unknown', description: 'desc', parameters: {} }],
        edges: []
      };
      const confidence = (engine as any).assessParsingConfidence(result, 'get data');
      // Simple queries with multiple intents should have lower confidence
      expect(confidence).toBeLessThan(0.7);
    });
  });
});
