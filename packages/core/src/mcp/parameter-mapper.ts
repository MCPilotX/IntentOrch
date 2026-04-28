/**
 * Parameter Mapper - Generic parameter mapping solution
 * Provides intelligent parameter name mapping between different naming conventions
 */

import { Tool, JSONSchemaProperty } from './types';

export interface ParameterMapping {
  sourceName: string;
  targetName: string;
  transformation?: (value: unknown) => unknown;
}

export interface ParameterMappingRule {
  pattern: RegExp;
  mappings: ParameterMapping[];
  priority: number;
}

/**
 * Validation levels for parameter validation
 */
export enum ValidationLevel {
  /**
   * Strict validation - rejects all unknown parameters
   * when additionalProperties is false
   */
  STRICT = 'strict',

  /**
   * Compatible validation (default) - allows known compatibility parameters
   * like path/name, query/search, etc. even when additionalProperties is false
   */
  COMPATIBLE = 'compatible',

  /**
   * Lenient validation - allows all parameters regardless of schema
   * Useful for buggy MCP servers
   */
  LENIENT = 'lenient'
}

/**
 * Configuration for ParameterMapper
 */
export interface ParameterMapperConfig {
  /**
   * Validation level for parameter validation
   * @default ValidationLevel.COMPATIBLE
   */
  validationLevel?: ValidationLevel;

  /**
   * Whether to log warnings when compatibility parameters are added
   * @default true
   */
  logWarnings?: boolean;

  /**
   * Whether to throw errors for missing required parameters
   * @default true
   */
  enforceRequired?: boolean;
}

export class ParameterMapper {
  /**
   * Default configuration
   */
  private static defaultConfig: ParameterMapperConfig = {
    validationLevel: ValidationLevel.COMPATIBLE,
    logWarnings: true,
    enforceRequired: true,
  };

  /**
   * Current configuration
   */
  private static config: ParameterMapperConfig = { ...ParameterMapper.defaultConfig };
  private static DEFAULT_MAPPINGS: ParameterMappingRule[] = [
    // Universal parameter mapping rules - works for any MCP service
    {
      pattern: /.*/, // Matches all tools
      mappings: [
        // Universal path/location parameter mappings (bidirectional)
        { sourceName: 'name', targetName: 'path' },
        { sourceName: 'path', targetName: 'name' },
        { sourceName: 'filename', targetName: 'path' },
        { sourceName: 'file', targetName: 'path' },
        { sourceName: 'directory', targetName: 'path' },
        { sourceName: 'folder', targetName: 'path' },
        { sourceName: 'filepath', targetName: 'path' },
        { sourceName: 'location', targetName: 'path' },
        { sourceName: 'url', targetName: 'path' },
        { sourceName: 'uri', targetName: 'path' },

        // Universal search/query parameter mappings
        { sourceName: 'query', targetName: 'search' },
        { sourceName: 'filter', targetName: 'search' },
        { sourceName: 'term', targetName: 'search' },
        { sourceName: 'keyword', targetName: 'search' },
        { sourceName: 'q', targetName: 'search' },

        // Universal content/data parameter mappings
        { sourceName: 'content', targetName: 'data' },
        { sourceName: 'data', targetName: 'content' },
        { sourceName: 'body', targetName: 'data' },
        { sourceName: 'payload', targetName: 'data' },
        { sourceName: 'text', targetName: 'content' },
        { sourceName: 'message', targetName: 'content' },

        // Universal identifier parameter mappings
        { sourceName: 'id', targetName: 'identifier' },
        { sourceName: 'identifier', targetName: 'id' },
        { sourceName: 'key', targetName: 'id' },
        { sourceName: 'slug', targetName: 'id' },
        { sourceName: 'uuid', targetName: 'id' },
        { sourceName: 'guid', targetName: 'id' },

        // Universal configuration parameter mappings
        { sourceName: 'config', targetName: 'configuration' },
        { sourceName: 'configuration', targetName: 'config' },
        { sourceName: 'settings', targetName: 'config' },
        { sourceName: 'options', targetName: 'config' },
        { sourceName: 'params', targetName: 'parameters' },
        { sourceName: 'parameters', targetName: 'params' },
        { sourceName: 'args', targetName: 'arguments' },
        { sourceName: 'arguments', targetName: 'args' },

        // Universal type/format parameter mappings
        { sourceName: 'type', targetName: 'format' },
        { sourceName: 'format', targetName: 'type' },
        { sourceName: 'kind', targetName: 'type' },
        { sourceName: 'category', targetName: 'type' },
        { sourceName: 'class', targetName: 'type' },

        // Universal action/operation parameter mappings
        { sourceName: 'action', targetName: 'operation' },
        { sourceName: 'operation', targetName: 'action' },
        { sourceName: 'command', targetName: 'action' },
        { sourceName: 'method', targetName: 'action' },

        // Universal source/target parameter mappings
        { sourceName: 'source', targetName: 'from' },
        { sourceName: 'from', targetName: 'source' },
        { sourceName: 'destination', targetName: 'to' },
        { sourceName: 'to', targetName: 'destination' },
        { sourceName: 'target', targetName: 'destination' },
        { sourceName: 'input', targetName: 'source' },
        { sourceName: 'output', targetName: 'destination' },
        { sourceName: 'result', targetName: 'output' },
      ],
      priority: 10, // Default priority
    },
  ];

  /**
   * Map parameters from source to target naming convention
   */
  static mapParameters(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    sourceParams: Record<string, unknown>,
  ): Record<string, unknown> {
    let targetParams: Record<string, unknown> = { ...sourceParams };

    // Get sorted mapping rules (highest priority first)
    const sortedRules = [...this.DEFAULT_MAPPINGS].sort((a, b) => b.priority - a.priority);

    // Apply each matching rule
    for (const rule of sortedRules) {
      if (rule.pattern.test(toolName)) {
        for (const mapping of rule.mappings) {
          // Check if source parameter exists
          if (mapping.sourceName in sourceParams) {
            // Check if target parameter doesn't already exist
            if (!(mapping.targetName in targetParams)) {
              const value = sourceParams[mapping.sourceName];
              targetParams[mapping.targetName] = mapping.transformation
                ? mapping.transformation(value)
                : value;
            }
          }
        }
      }
    }

    // Apply naming convention matching for parameters that don't directly match schema
    const schemaProperties = Object.keys(toolSchema.properties || {});
    for (const [sourceName, value] of Object.entries(sourceParams)) {
      if (!schemaProperties.includes(sourceName)) {
        // Try to find a naming convention match
        const mapping = this.findNamingConventionMatch(sourceName, schemaProperties);
        if (mapping && !(mapping.targetName in targetParams)) {
          targetParams[mapping.targetName] = value;
        }
      }
    }

    return targetParams;
  }

  /**
   * Find a mapping for a given source parameter
   */
  private static findMapping(
    toolName: string,
    sourceName: string,
    targetSchemaProperties: string[],
  ): ParameterMapping | null {
    const sortedRules = [...this.DEFAULT_MAPPINGS].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.pattern.test(toolName)) {
        const mapping = rule.mappings.find(m => m.sourceName === sourceName);
        if (mapping && targetSchemaProperties.includes(mapping.targetName)) {
          return mapping;
        }
      }
    }

    return null;
  }

  /**
   * Check if a parameter is a compatibility parameter
   */
  private static isCompatibilityParameter(
    paramName: string,
    schemaProperties: string[],
  ): boolean {
    // Check if this parameter is a known compatibility parameter for any schema property
    for (const rule of this.DEFAULT_MAPPINGS) {
      for (const mapping of rule.mappings) {
        if (mapping.sourceName === paramName && schemaProperties.includes(mapping.targetName)) {
          return true;
        }
      }
    }
    return false;
  }

  /**
   * Find reverse mapping (target to source)
   */
  private static findReverseMapping(
    toolName: string,
    targetName: string,
    sourceParamNames: string[],
  ): string | null {
    const sortedRules = [...this.DEFAULT_MAPPINGS].sort((a, b) => b.priority - a.priority);

    for (const rule of sortedRules) {
      if (rule.pattern.test(toolName)) {
        const mapping = rule.mappings.find(m => m.targetName === targetName);
        if (mapping && sourceParamNames.includes(mapping.sourceName)) {
          return mapping.sourceName;
        }
      }
    }

    return null;
  }

  /**
   * Convert between different naming conventions
   */
  private static convertNamingConvention(name: string, targetConvention: 'camel' | 'snake' | 'kebab'): string {
    if (targetConvention === 'camel') {
      // Convert snake_case or kebab-case to camelCase
      return name.replace(/[_-]([a-z])/g, (_, letter) => letter.toUpperCase());
    } else if (targetConvention === 'snake') {
      // Convert camelCase or kebab-case to snake_case
      // Handle camelCase: insert underscore before uppercase letters (except first letter)
      const withUnderscores = name.replace(/([a-z])([A-Z])/g, '$1_$2');
      // Convert any hyphens to underscores
      const withSnake = withUnderscores.replace(/-/g, '_');
      // Convert to lowercase
      return withSnake.toLowerCase();
    } else if (targetConvention === 'kebab') {
      // Convert camelCase or snake_case to kebab-case
      // Handle camelCase: insert hyphen before uppercase letters (except first letter)
      const withHyphens = name.replace(/([a-z])([A-Z])/g, '$1-$2');
      // Convert any underscores to hyphens
      const withKebab = withHyphens.replace(/_/g, '-');
      // Convert to lowercase
      return withKebab.toLowerCase();
    }
    return name;
  }

  /**
   * Find naming convention match between source parameter and target properties
   */
  private static findNamingConventionMatch(
    sourceName: string,
    targetSchemaProperties: string[],
  ): ParameterMapping | null {
    // Try different naming convention conversions
    const conventions: Array<'camel' | 'snake' | 'kebab'> = ['camel', 'snake', 'kebab'];
    
    for (const targetConvention of conventions) {
      const converted = this.convertNamingConvention(sourceName, targetConvention);
      if (converted !== sourceName && targetSchemaProperties.includes(converted)) {
        return {
          sourceName,
          targetName: converted,
        };
      }
    }
    
    // Also try converting target properties to match source naming style
    // Determine source naming convention
    let sourceConvention: 'camel' | 'snake' | 'kebab' | 'unknown' = 'unknown';
    if (sourceName.includes('_')) {
      sourceConvention = 'snake';
    } else if (sourceName.includes('-')) {
      sourceConvention = 'kebab';
    } else if (/[A-Z]/.test(sourceName)) {
      sourceConvention = 'camel';
    }
    
    if (sourceConvention !== 'unknown') {
      for (const targetProperty of targetSchemaProperties) {
        const convertedTarget = this.convertNamingConvention(targetProperty, sourceConvention);
        if (convertedTarget === sourceName) {
          return {
            sourceName,
            targetName: targetProperty,
          };
        }
      }
    }
    
    return null;
  }

  /**
   * Configure the ParameterMapper
   */
  static configure(config: Partial<ParameterMapperConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Add custom mapping rules
   */
  static addMappingRules(rules: ParameterMappingRule[]): void {
    // Add new rules with priority 15 (higher than default rules)
    const enhancedRules = rules.map(rule => ({
      ...rule,
      priority: rule.priority || 15, // Default priority higher than existing rules
    }));

    this.DEFAULT_MAPPINGS.push(...enhancedRules);
  }

  /**
   * Clear all custom mapping rules
   */
  static clearCustomMappingRules(): void {
    // Keep only rules with priority <= 10 (default rules)
    this.DEFAULT_MAPPINGS = this.DEFAULT_MAPPINGS.filter(rule => rule.priority <= 10);
  }

  /**
   * Get all mapping rules (including custom ones)
   */
  static getAllMappingRules(): ParameterMappingRule[] {
    return [...this.DEFAULT_MAPPINGS];
  }

  /**
   * Reset configuration to defaults
   */
  static resetConfig(): void {
    this.config = { ...this.defaultConfig };
  }

  /**
   * Get current configuration
   */
  static getConfig(): ParameterMapperConfig {
    return { ...this.config };
  }

  /**
   * Validate and normalize parameters against tool schema
   */
  static validateAndNormalize(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    params: Record<string, unknown>,
  ): { normalized: Record<string, unknown>; warnings: string[] } {
    const warnings: string[] = [];
    const normalized = this.mapParameters(toolName, toolSchema, params);

    // Check for unknown parameters based on validation level
    const schemaProperties = Object.keys(toolSchema.properties || {});

    // Track which parameters were mapped from compatibility parameters
    const mappedCompatibilityParams = new Set<string>();

    // Check original parameters that were mapped
    for (const [sourceName] of Object.entries(params)) {
      if (!schemaProperties.includes(sourceName)) {
        // Check if this parameter was mapped to a schema property
        const mapping = this.findMapping(toolName, sourceName, schemaProperties);
        if (mapping && this.config.logWarnings) {
          // This is a compatibility parameter that was mapped
          mappedCompatibilityParams.add(sourceName);
        }
      }
    }

    if (toolSchema.additionalProperties === false) {
      for (const paramName of Object.keys(normalized)) {
        if (!schemaProperties.includes(paramName)) {
          const isCompatibilityParam = this.isCompatibilityParameter(paramName, schemaProperties);

          // Handle based on validation level
          switch (this.config.validationLevel) {
            case ValidationLevel.STRICT:
              // Strict: reject all unknown parameters
              warnings.push(`Unknown parameter "${paramName}" for tool "${toolName}"`);
              // Remove unknown parameter from normalized result
              delete normalized[paramName];
              break;

            case ValidationLevel.COMPATIBLE:
              // Compatible: allow only compatibility parameters
              if (!isCompatibilityParam) {
                warnings.push(`Unknown parameter "${paramName}" for tool "${toolName}"`);
              } else if (this.config.logWarnings) {
                warnings.push(`Added compatibility parameter "${paramName}" for tool "${toolName}"`);
              }
              break;

            case ValidationLevel.LENIENT:
              // Lenient: allow all parameters
              if (this.config.logWarnings) {
                warnings.push(`Allowing unknown parameter "${paramName}" for tool "${toolName}" (lenient mode)`);
              }
              break;
          }
        }
      }
    }

    // Check for missing required parameters
    if (this.config.enforceRequired && toolSchema.required) {
      for (const requiredParam of toolSchema.required) {
        if (!(requiredParam in normalized) && !(requiredParam in params)) {
          warnings.push(`Missing required parameter "${requiredParam}" for tool "${toolName}"`);
        }
      }
    }

    return { normalized, warnings };
  }

  /**
   * Filter parameters to only include those that match the schema
   */
  static filterSchemaParameters(
    toolSchema: Tool['inputSchema'],
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const schemaProperties = Object.keys(toolSchema.properties || {});
    const filtered: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      if (schemaProperties.includes(key)) {
        filtered[key] = value;
      }
    }

    return filtered;
  }

  /**
   * Get compatibility parameters for a given schema
   */
  static getCompatibilityParameters(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    params: Record<string, unknown>,
  ): Record<string, unknown> {
    const schemaProperties = Object.keys(toolSchema.properties || {});
    const compatibilityParams: Record<string, unknown> = {};

    for (const [sourceName, value] of Object.entries(params)) {
      if (!schemaProperties.includes(sourceName)) {
        // Check if this parameter is a known compatibility parameter
        const mapping = this.findMapping(toolName, sourceName, schemaProperties);
        if (mapping) {
          compatibilityParams[sourceName] = value;
        }
      }
    }

    return compatibilityParams;
  }
}
