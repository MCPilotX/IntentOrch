/**
 * Unit tests for ParameterMapper
 */
import { ParameterMapper, ValidationLevel } from "../../packages/core/src/mcp/parameter-mapper";
import type { Tool } from "../../packages/core/src/mcp/types";

describe("ParameterMapper", () => {
  // Reset config before each test
  beforeEach(() => {
    ParameterMapper.resetConfig();
  });

  describe("configure", () => {
    it("should apply custom configuration", () => {
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

    it("should merge partial configuration with defaults", () => {
      ParameterMapper.configure({
        validationLevel: ValidationLevel.LENIENT,
      });

      const config = ParameterMapper.getConfig();
      expect(config.validationLevel).toBe(ValidationLevel.LENIENT);
      expect(config.logWarnings).toBe(true); // default
      expect(config.enforceRequired).toBe(true); // default
    });
  });

  describe("resetConfig", () => {
    it("should reset to default configuration", () => {
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

  describe("mapParameters", () => {
    const testToolSchema: Tool["inputSchema"] = {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        search: { type: "string", description: "Search pattern" },
        limit: { type: "number", description: "Max results" },
        active: { type: "boolean", description: "Active flag" },
      },
      required: ["path"],
    };

    it("should keep parameters that already match schema", () => {
      const result = ParameterMapper.mapParameters(
        "search_files",
        testToolSchema,
        { path: "/home", search: "test" },
      );

      expect(result.path).toBe("/home");
      expect(result.search).toBe("test");
    });

    it("should map name to path", () => {
      const result = ParameterMapper.mapParameters(
        "search_files",
        testToolSchema,
        { name: "/home/test.txt" },
      );

      expect(result.path).toBe("/home/test.txt");
    });

    it("should map query to search", () => {
      const result = ParameterMapper.mapParameters(
        "search_files",
        testToolSchema,
        { query: "test pattern" },
      );

      expect(result.search).toBe("test pattern");
    });

    it("should not overwrite existing target parameter", () => {
      const result = ParameterMapper.mapParameters(
        "search_files",
        testToolSchema,
        { path: "/original", name: "/override" },
      );

      // path should keep original value since it already exists
      expect(result.path).toBe("/original");
    });

    it("should handle empty source params", () => {
      const result = ParameterMapper.mapParameters(
        "search_files",
        testToolSchema,
        {},
      );

      expect(result).toEqual({});
    });

    it("should handle naming convention conversion (camelCase to snake_case)", () => {
      const schemaWithSnakeCase: Tool["inputSchema"] = {
        type: "object",
        properties: {
          file_path: { type: "string" },
        },
        required: [],
      };

      const result = ParameterMapper.mapParameters(
        "test_tool",
        schemaWithSnakeCase,
        { filePath: "/home/test.txt" },
      );

      expect(result.file_path).toBe("/home/test.txt");
    });
  });

  describe("validateAndNormalize", () => {
    const testToolSchema: Tool["inputSchema"] = {
      type: "object",
      properties: {
        path: { type: "string", description: "File path" },
        search: { type: "string", description: "Search pattern" },
      },
      required: ["path"],
      additionalProperties: false,
    };

    it("should normalize valid parameters", () => {
      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { path: "/home", search: "test" },
      );

      expect(result.normalized.path).toBe("/home");
      expect(result.normalized.search).toBe("test");
    });

    it("should not throw on missing required when enforceRequired is false", () => {
      ParameterMapper.configure({ enforceRequired: false });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { search: "test" },
      );

      expect(result.normalized.search).toBe("test");
      expect(result.normalized.path).toBeUndefined();
    });

    it("should warn on unknown parameters in strict mode", () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.STRICT });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { path: "/home", unknown_param: "value" },
      );

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain("Unknown parameter");
      // Unknown param should be removed
      expect(result.normalized.unknown_param).toBeUndefined();
    });

    it("should allow compatibility parameters in compatible mode", () => {
      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { path: "/home", name: "test.txt" },
      );

      // 'name' is a compatibility parameter for 'path'
      expect(result.normalized.path).toBe("/home");
    });

    it("should allow all parameters in lenient mode", () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.LENIENT });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { path: "/home", random_param: "value" },
      );

      expect(result.normalized.random_param).toBe("value");
    });

    it("should map compatibility parameters and add warnings", () => {
      ParameterMapper.configure({ logWarnings: true });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        testToolSchema,
        { path: "/home", query: "test" },
      );

      // query should be mapped to search
      expect(result.normalized.search).toBe("test");
    });
  });

  describe("addMappingRules", () => {
    it("should add custom mapping rules", () => {
      ParameterMapper.addMappingRules([
        {
          pattern: /custom_tool/,
          mappings: [{ sourceName: "custom_input", targetName: "path" }],
          priority: 20,
        },
      ]);

      const rules = ParameterMapper.getAllMappingRules();
      const customRule = rules.find((r) => r.priority === 20);
      expect(customRule).toBeDefined();
      expect(customRule!.mappings[0].sourceName).toBe("custom_input");
    });
  });

  describe("clearCustomMappingRules", () => {
    it("should remove custom rules but keep defaults", () => {
      ParameterMapper.addMappingRules([
        {
          pattern: /custom/,
          mappings: [{ sourceName: "a", targetName: "b" }],
          priority: 20,
        },
      ]);

      ParameterMapper.clearCustomMappingRules();

      const rules = ParameterMapper.getAllMappingRules();
      const customRule = rules.find((r) => r.priority === 20);
      expect(customRule).toBeUndefined();
      // Default rules (priority <= 10) should still exist
      expect(rules.length).toBeGreaterThan(0);
    });
  });

  describe("getCompatibilityParameters", () => {
    it("should return compatibility parameters for a schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: {
          path: { type: "string" },
          search: { type: "string" },
        },
        required: [],
      };

      const compatParams = ParameterMapper.getCompatibilityParameters(
        "search_files",
        schema,
        { name: "/home", query: "test" },
      );

      // Should include compatibility mappings for path and search
      expect(Object.keys(compatParams).length).toBeGreaterThan(0);
    });
  });

  describe("filterSchemaParameters", () => {
    it("should filter parameters matching schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: {
          path: { type: "string" },
          search: { type: "string" },
        },
        required: [],
      };

      const result = ParameterMapper.filterSchemaParameters(schema, {
        path: "/home",
        search: "test",
        extra: "value",
      });

      expect(result.path).toBe("/home");
      expect(result.search).toBe("test");
      expect(result.extra).toBeUndefined();
    });
  });


  // ==================== Edge Cases for mapParameters ====================

  describe("mapParameters - edge cases", () => {
    it("should apply transformation when present", () => {
      // Mock transformation via custom rule
      ParameterMapper.addMappingRules([
        {
          pattern: /my_tool/,
          mappings: [{
            sourceName: "raw",
            targetName: "processed",
            transformation: (v) => String(v).toUpperCase(),
          }],
          priority: 20,
        },
      ]);

      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { processed: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.mapParameters("my_tool", schema, { raw: "hello" });
      expect(result.processed).toBe("HELLO");
    });

    it("should handle snake_case source to camelCase schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { fileName: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.mapParameters("tool", schema, { file_name: "/tmp/test.txt" });
      expect(result.fileName).toBe("/tmp/test.txt");
    });

    it("should handle kebab-case source to camelCase schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { fileName: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.mapParameters("tool", schema, { "file-name": "/tmp/test.txt" });
      expect(result.fileName).toBe("/tmp/test.txt");
    });

    it("should handle camelCase source to kebab-case schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { "file-name": { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.mapParameters("tool", schema, { fileName: "/tmp/test.txt" });
      expect(result["file-name"]).toBe("/tmp/test.txt");
    });

    it("should handle camelCase source to snake_case schema", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { file_name: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.mapParameters("tool", schema, { fileName: "/tmp/test.txt" });
      expect(result.file_name).toBe("/tmp/test.txt");
    });
  });

  // ==================== validateAndNormalize - Additional Coverage ====================

  describe("validateAndNormalize - additional coverage", () => {
    const schemaWithAdditionalFalse: Tool["inputSchema"] = {
      type: "object",
      properties: { path: { type: "string", description: "File path" } },
      required: ["path"],
      additionalProperties: false,
    };

    it("should warn on missing required parameters", () => {
      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        {},
      );
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some(w => w.includes("Missing required"))).toBe(true);
    });

    it("should not warn on missing required when enforceRequired is false", () => {
      ParameterMapper.configure({ enforceRequired: false });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        {},
      );
      const missingWarnings = result.warnings.filter(w => w.includes("Missing required"));
      expect(missingWarnings.length).toBe(0);
    });

    it("should handle schema without additionalProperties flag (defaults to true)", () => {
      const schemaWithoutAdditional: Tool["inputSchema"] = {
        type: "object",
        properties: { path: { type: "string" } },
        required: [],
        // additionalProperties is undefined (defaults to true per JSON Schema)
      };

      const result = ParameterMapper.validateAndNormalize(
        "tool",
        schemaWithoutAdditional,
        { path: "/tmp", extra_param: "value" },
      );

      // extra_param should be present because additionalProperties is not false
      expect(result.normalized.extra_param).toBe("value");
      // No "Unknown parameter" warnings since additionalProperties is not false
      const unknownWarnings = result.warnings.filter(w => w.includes("Unknown parameter"));
      expect(unknownWarnings.length).toBe(0);
    });

    it("should not add warning for compatibility param with logWarnings=false", () => {
      ParameterMapper.configure({ logWarnings: false });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        { path: "/home", name: "test.txt" },
      );

      // name is a compatibility parameter for path, but logWarnings is false
      const compatWarnings = result.warnings.filter(w => w.includes("compatibility"));
      expect(compatWarnings.length).toBe(0);
    });

    it("should warn on compatibility param in compatible mode with logWarnings=true", () => {
      ParameterMapper.configure({ logWarnings: true, validationLevel: ValidationLevel.COMPATIBLE });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        { path: "/home", query: "test" },
      );

      const compatWarnings = result.warnings.filter(w => w.includes("compatibility"));
      // query is a known compat param for search
      expect(compatWarnings.length).toBeGreaterThan(0);
    });

    it("should warn on unknown param in strict mode that is not compat param", () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.STRICT });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        { path: "/home", totally_unknown: "value" },
      );

      const unknownWarnings = result.warnings.filter(w => w.includes("Unknown parameter"));
      expect(unknownWarnings.length).toBeGreaterThan(0);
      // Unknown param should be removed from normalized
      expect(result.normalized.totally_unknown).toBeUndefined();
    });

    it("should warn on unknown param in compatible mode", () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.COMPATIBLE });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        { path: "/home", totally_unknown: "value" },
      );

      const unknownWarnings = result.warnings.filter(w => w.includes("Unknown parameter"));
      expect(unknownWarnings.length).toBeGreaterThan(0);
    });

    it("should allow unknown params in lenient mode", () => {
      ParameterMapper.configure({ validationLevel: ValidationLevel.LENIENT, logWarnings: false });

      const result = ParameterMapper.validateAndNormalize(
        "search_files",
        schemaWithAdditionalFalse,
        { path: "/home", unknown_ok: "value" },
      );

      expect(result.normalized.unknown_ok).toBe("value");
    });
  });

  // ==================== getCompatibilityParameters - Edge Cases ====================

  describe("getCompatibilityParameters - edge cases", () => {
    it("should return empty for params that match schema directly", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { path: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.getCompatibilityParameters(
        "tool",
        schema,
        { path: "/home" },
      );

      expect(Object.keys(result).length).toBe(0);
    });

    it("should return empty for unknown non-compat params", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { path: { type: "string" } },
        required: [],
      };

      const result = ParameterMapper.getCompatibilityParameters(
        "tool",
        schema,
        { random_key: "value" },
      );

      expect(Object.keys(result).length).toBe(0);
    });
  });

  // ==================== Naming Convention Conversion ====================

  describe("naming convention conversion edge cases", () => {
    it("should convert snake_case to kebab-case via convention matching", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { "file-name": { type: "string" } },
        required: [],
      };

      // snake_case source -> should detect snake -> convert to kebab for matching
      const result = ParameterMapper.mapParameters("tool", schema, { file_name: "/tmp/test.txt" });
      expect(result["file-name"]).toBe("/tmp/test.txt");
    });

    it("should handle name that doesn't convert and has no match", () => {
      const schema: Tool["inputSchema"] = {
        type: "object",
        properties: { someProperty: { type: "string" } },
        required: [],
      };

      // A name with no known convention and no match
      const result = ParameterMapper.mapParameters("tool", schema, { "unknown": "value" });
      expect(result.someProperty).toBeUndefined();
      expect(result.unknown).toBe("value");
    });
  });

});