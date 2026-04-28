/**
 * Unit tests for ParameterMapper
 */
import { ParameterMapper, ValidationLevel } from '../mcp/parameter-mapper';
import type { Tool } from '../mcp/types';

describe('ParameterMapper', () => {
  // Reset config before each test
  beforeEach(() => {
    ParameterMapper.resetConfig();
  });

  describe('configure', () => {
    it('should apply custom configuration', () => {
      ParameterMapper.configure({
        validationLevel: ValidationLevel.STRICT,
        logWarnings: false,
        enforceRequired: false,
      });

      const config = ParameterMapper.getConfig();
      expect(config.validationLevel).toBe(ValidationLevel.STRICT);
      expect(config.logWarnings).toBe(false);
      expect(config.enforceRequired).toBe(false);
    });

    it('should merge partial configuration with defaults', () => {
      ParameterMapper.configure({
        validationLevel: ValidationLevel.LENIENT,
      });

      const config = ParameterMapper.getConfig();
      expect(config.validationLevel).toBe(ValidationLevel.LENIENT);
      expect(config.logWarnings).toBe(true); // default
      expect(config.enforceRequired).toBe(true); // default
    });
  });

  describe('resetConfig', () => {
    it('should reset to default configuration', () => {
      ParameterMapper.configure({
        validationLevel: ValidationLevel.STRICT,
        logWarnings: false,
      });

      ParameterMapper.resetConfig();

      const config = ParameterMapper.getConfig();
      expect(config.validationLevel).toBe(ValidationLevel.COMPATIBLE);
      expect(config.logWarnings).toBe(true);
      expect(config.enforceRequired).toBe(true);
    });
  });

  describe('mapParameters', () => {
    const testToolSchema: Tool['inputSchema'] = {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        search: { type: 'string', description: 'Search pattern' },
        limit: { type: 'number', description: 'Max results' },
        active: { type: 'boolean', description: 'Active flag' },
      },
      required: ['path'],
    };

    it('should keep parameters that already match schema', () => {
      const result = ParameterMapper.mapParameters(
        'search_files',
        testToolSchema,
        { path: '/home', search: 'test' },
      );

      expect(result.path).toBe('/home');
      expect(result.search).toBe('test');
    });

    it('should map name to path', () => {
      const result = ParameterMapper.mapParameters(
        'search_files',
        testToolSchema,
        { name: '/home/test.txt' },
      );

      expect(result.path).toBe('/home/test.txt');
    });

    it('should map query to search', () => {
      const result = ParameterMapper.mapParameters(
        'search_files',
        testToolSchema,
        { query: 'test pattern' },
      );

      expect(result.search).toBe('test pattern');
    });

    it('should not overwrite existing target parameter', () => {
      const result = ParameterMapper.mapParameters(
        'search_files',
        testToolSchema,
        { path: '/original', name: '/override' },
      );

      // path should keep original value since it already exists
      expect(result.path).toBe('/original');
    });

    it('should handle empty source params', () => {
      const result = ParameterMapper.mapParameters(
        'search_files',
        testToolSchema,
        {},
      );

      expect(result).toEqual({});
    });

    it('should handle naming convention conversion (camelCase to snake_case)', () => {
      const schemaWithSnakeCase: Tool['inputSchema'] = {
        type: 'object',
        properties: {
          file_path: { type: 'string' },
        },
        required: [],
      };

      const result = ParameterMapper.mapParameters(
        'test_tool',
        schemaWithSnakeCase,
        { filePath: '/home/test.txt' },
      );

      expect(result.file_path).toBe('/home/test.txt');
    });
  });

  describe('validateAndNormalize', () => {
    const testToolSchema: Tool['inputSchema'] = {
      type: 'object',
      properties: {
        path: { type: 'string', description: 'File path' },
        search: { type: 'string', description: 'Search pattern' },
      },
      required: ['path'],
      additionalProperties: false,
    };

    it('should normalize valid parameters', () => {
      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { path: '/home', search: 'test' },
      );

      expect(result.normalized.path).toBe('/home');
      expect(result.normalized.search).toBe('test');
    });

    it('should not throw on missing required when enforceRequired is false', () => {
      ParameterMapper.configure({ enforceRequired: false });

      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { search: 'test' },
      );

      expect(result.normalized.search).toBe('test');
      expect(result.normalized.path).toBeUndefined();
    });

    it('should warn on unknown parameters in strict mode', () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.STRICT });

      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { path: '/home', unknown_param: 'value' },
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Unknown parameter');
      // Unknown param should be removed
      expect(result.normalized.unknown_param).toBeUndefined();
    });

    it('should allow compatibility parameters in compatible mode', () => {
      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { path: '/home', name: 'test.txt' },
      );

      // 'name' is a compatibility parameter for 'path'
      expect(result.normalized.path).toBe('/home');
    });

    it('should allow all parameters in lenient mode', () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.LENIENT });

      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { path: '/home', random_param: 'value' },
      );

      expect(result.normalized.random_param).toBe('value');
    });

    it('should map compatibility parameters and add warnings', () => {
      ParameterMapper.configure({ logWarnings: true });

      const result = ParameterMapper.validateAndNormalize(
        'search_files',
        testToolSchema,
        { path: '/home', query: 'test' },
      );

      // query should be mapped to search
      expect(result.normalized.search).toBe('test');
    });
  });

  describe('addMappingRules', () => {
    it('should add custom mapping rules', () => {
      ParameterMapper.addMappingRules([
        {
          pattern: /custom_tool/,
          mappings: [
            { sourceName: 'custom_input', targetName: 'path' },
          ],
          priority: 20,
        },
      ]);

      const rules = ParameterMapper.getAllMappingRules();
      const customRule = rules.find(r => r.priority === 20);
      expect(customRule).toBeDefined();
      expect(customRule!.mappings[0].sourceName).toBe('custom_input');
    });
  });

  describe('clearCustomMappingRules', () => {
    it('should remove custom rules but keep defaults', () => {
      ParameterMapper.addMappingRules([
        {
          pattern: /custom/,
          mappings: [{ sourceName: 'a', targetName: 'b' }],
          priority: 20,
        },
      ]);

      ParameterMapper.clearCustomMappingRules();

      const rules = ParameterMapper.getAllMappingRules();
      const customRule = rules.find(r => r.priority === 20);
      expect(customRule).toBeUndefined();
      // Default rules (priority <= 10) should still exist
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe('getCompatibilityParameters', () => {
    it('should return compatibility parameters for a schema', () => {
      const schema: Tool['inputSchema'] = {
        type: 'object',
        properties: {
          path: { type: 'string' },
          search: { type: 'string' },
        },
        required: [],
      };

      const compatParams = ParameterMapper.getCompatibilityParameters(
        'search_files',
        schema,
        { name: '/home', query: 'test' },
      );

      // Should include compatibility mappings for path and search
      expect(Object.keys(compatParams).length).toBeGreaterThan(0);
    });
  });

  describe('filterSchemaParameters', () => {
    it('should filter parameters matching schema', () => {
      const schema: Tool['inputSchema'] = {
        type: 'object',
        properties: {
          path: { type: 'string' },
          search: { type: 'string' },
        },
        required: [],
      };

      const result = ParameterMapper.filterSchemaParameters(
        schema,
        { path: '/home', search: 'test', extra: 'value' },
      );

      expect(result.path).toBe('/home');
      expect(result.search).toBe('test');
      expect(result.extra).toBeUndefined();
    });
  });
});
