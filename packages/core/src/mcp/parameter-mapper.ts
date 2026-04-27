/**
 * Parameter Mapper - Generic parameter mapping solution
 * Provides intelligent parameter name mapping between different naming conventions
 */

import { Tool } from './types';

export interface ParameterMapping {
  sourceName: string;
  targetName: string;
  transformation?: (value: any) => any;
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

        // Universal ID parameter mappings
        { sourceName: 'id', targetName: 'identifier' },
        { sourceName: 'uuid', targetName: 'identifier' },
        { sourceName: 'guid', targetName: 'identifier' },
        { sourceName: 'uid', targetName: 'identifier' },

        // Universal content/data parameter mappings
        { sourceName: 'content', targetName: 'data' },
        { sourceName: 'text', targetName: 'data' },
        { sourceName: 'body', targetName: 'data' },
        { sourceName: 'message', targetName: 'data' },

        // Universal time parameter mappings
        { sourceName: 'time', targetName: 'timestamp' },
        { sourceName: 'date', targetName: 'timestamp' },
        { sourceName: 'datetime', targetName: 'timestamp' },

        // Universal quantity parameter mappings
        { sourceName: 'count', targetName: 'limit' },
        { sourceName: 'number', targetName: 'limit' },
        { sourceName: 'size', targetName: 'limit' },
        { sourceName: 'max', targetName: 'limit' },

        // Universal boolean parameter mappings
        { sourceName: 'enabled', targetName: 'active' },
        { sourceName: 'disabled', targetName: 'active', transformation: (v) => !v },
        { sourceName: 'on', targetName: 'active' },
        { sourceName: 'off', targetName: 'active', transformation: (v) => !v },

        // Universal configuration parameter mappings
        { sourceName: 'config', targetName: 'settings' },
        { sourceName: 'options', targetName: 'settings' },
        { sourceName: 'params', targetName: 'settings' },

        // Universal output parameter mappings
        { sourceName: 'output', targetName: 'result' },
        { sourceName: 'response', targetName: 'result' },
        { sourceName: 'return', targetName: 'result' },
      ],
      priority: 5,
    },

    // Domain-specific enhancement rules (higher priority)
    {
      pattern: /(read|write|edit|get|list|search|create|move|delete).*(file|directory|folder)/i,
      mappings: [
        // File system specific mappings
        { sourceName: 'name', targetName: 'path' },
        { sourceName: 'filename', targetName: 'path' },
        { sourceName: 'text', targetName: 'content' },
        { sourceName: 'data', targetName: 'content' },
        { sourceName: 'body', targetName: 'content' },
      ],
      priority: 10,
    },

    {
      pattern: /(search|find|query|filter).*/i,
      mappings: [
        // Search specific mappings
        { sourceName: 'query', targetName: 'search' },
        { sourceName: 'keyword', targetName: 'search' },
      ],
      priority: 10,
    },

    {
      pattern: /(database|db|sql|nosql).*/i,
      mappings: [
        // Database specific mappings
        { sourceName: 'table', targetName: 'collection' },
        { sourceName: 'record', targetName: 'document' },
        { sourceName: 'row', targetName: 'document' },
        { sourceName: 'where', targetName: 'filter' },
        { sourceName: 'condition', targetName: 'filter' },
      ],
      priority: 10,
    },

    {
      pattern: /(http|api|rest|graphql|web).*/i,
      mappings: [
        // Web API specific mappings
        { sourceName: 'endpoint', targetName: 'url' },
        { sourceName: 'path', targetName: 'url' },
        { sourceName: 'method', targetName: 'verb' },
        { sourceName: 'verb', targetName: 'method' }, // Bidirectional mapping
        { sourceName: 'headers', targetName: 'metadata' },
        { sourceName: 'params', targetName: 'query' },
      ],
      priority: 10,
    },

    {
      pattern: /(ai|ml|model|llm|chat|gpt).*/i,
      mappings: [
        // AI/ML specific mappings
        { sourceName: 'prompt', targetName: 'input' },
        { sourceName: 'question', targetName: 'input' },
        { sourceName: 'temperature', targetName: 'randomness' },
        { sourceName: 'max_tokens', targetName: 'length' },
        { sourceName: 'model', targetName: 'engine' },
      ],
      priority: 10,
    },
  ];

  /**
   * Map parameters from source to target based on tool name and schema
   */
  static mapParameters(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    sourceParams: Record<string, any>,
  ): Record<string, any> {
    let targetParams: Record<string, any> = { ...sourceParams };
    const requiredParams = toolSchema.required || [];
    const schemaProperties = Object.keys(toolSchema.properties || {});

    // First, try direct mapping
    // Track which source params map to which target for multi-value merging
    const mappedToTarget = new Map<string, { values: string[]; sourceKeys: string[] }>();
    for (const [sourceName, value] of Object.entries(sourceParams)) {
      // If parameter already matches schema, keep it
      if (schemaProperties.includes(sourceName)) {
        continue;
      }

      // Try to find mapping for this parameter
      const mapping = this.findMapping(toolName, sourceName, schemaProperties);
      if (mapping) {
        // Track mapping for potential multi-value merging
        if (!mappedToTarget.has(mapping.targetName)) {
          mappedToTarget.set(mapping.targetName, { values: [], sourceKeys: [] });
        }
        const entry = mappedToTarget.get(mapping.targetName)!;
        entry.sourceKeys.push(sourceName);
        if (typeof value === 'string' && value.length > 0) {
          entry.values.push(value);
        }

        // Apply mapping only if target parameter doesn't already exist
        // This prevents overwriting existing values (e.g., when both 'content' and 'text' are provided)
        if (!(mapping.targetName in targetParams)) {
          targetParams[mapping.targetName] = mapping.transformation
            ? mapping.transformation(value)
            : value;
        }

        // Clean up the original parameter if it's not a valid property in schema
        if (!schemaProperties.includes(sourceName)) {
          delete targetParams[sourceName];
        }
      }
    }

    // Multi-value merging: if multiple source params mapped to the same target,
    // merge their values using the schema description's separator hint.
    for (const [targetName, info] of mappedToTarget) {
      if (info.values.length >= 2) {
        const propSchema = toolSchema.properties[targetName] as any;
        if (propSchema && propSchema.type === 'string') {
          // Determine separator from schema description
          const description = propSchema.description || '';
          let separator = ',';
          if (description.includes('|')) separator = '|';
          else if (description.includes(',')) separator = ',';
          else if (description.includes('、')) separator = '、';
          
          targetParams[targetName] = info.values.join(separator);
        }
      }
    }

    // Ensure required parameters are present
    for (const requiredParam of requiredParams) {
      if (!(requiredParam in targetParams)) {
        // Try to find a source parameter that could map to this required parameter
        const possibleSource = this.findReverseMapping(toolName, requiredParam, Object.keys(sourceParams));
        if (possibleSource && sourceParams[possibleSource] !== undefined) {
          targetParams[requiredParam] = sourceParams[possibleSource];
        }
      }
    }

    // Handle common parameter aliases to improve compatibility
    // This is a generic solution for servers that have schema/validation mismatches
    targetParams = this.applyCommonParameterAliases(toolName, toolSchema, targetParams);

    // New: Universal Value Extraction for Data Flow
    // If a required parameter is a string but we have an object (from a previous step),
    // try to extract the core identifier automatically.
    for (const propName of schemaProperties) {
      const propSchema = toolSchema.properties[propName] as any;
      if (propSchema.type === 'string' && typeof targetParams[propName] === 'object' && targetParams[propName] !== null) {
        const extracted = this.extractCoreValue(targetParams[propName]);
        if (extracted) {
          targetParams[propName] = extracted;
        }
      }
      // Array to string conversion: if schema expects string but we got an array,
      // join the array elements with comma separator
      if (propSchema.type === 'string' && Array.isArray(targetParams[propName])) {
        targetParams[propName] = targetParams[propName].join(',');
      }
    }

    return targetParams;
  }

  /**
   * Extract a core identifier from an object (Universal logic)
   */
  private static extractCoreValue(obj: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    const coreKeys = [
      'station_code', 'stationCode', 'code', 'id', 'identifier', 
      'uuid', 'uid', 'value', 'key', 'name'
    ];

    // 1. Direct hit
    for (const key of coreKeys) {
      if (typeof obj[key] === 'string' && obj[key].length > 0) {
        return obj[key];
      }
    }

    // 2. Nested hit (like {"广州": {"station_code": "GZQ"}})
    const values = Object.values(obj);
    if (values.length === 1 && typeof values[0] === 'object' && values[0] !== null) {
      return this.extractCoreValue(values[0]);
    }

    // 3. Fallback: Any string field that looks like a code
    for (const key of Object.keys(obj)) {
      if (key.toLowerCase().endsWith('code') && typeof obj[key] === 'string') {
        return obj[key];
      }
    }

    return null;
  }

  /**
   * Find appropriate mapping for a source parameter
   */
  private static findMapping(
    toolName: string,
    sourceName: string,
    targetSchemaProperties: string[],
  ): ParameterMapping | null {
    // First, check if sourceName directly matches any target property
    if (targetSchemaProperties.includes(sourceName)) {
      return null; // No mapping needed
    }

    // Check for case-insensitive match in target properties
    const sourceLower = sourceName.toLowerCase();
    const caseInsensitiveMatch = targetSchemaProperties.find(p => p.toLowerCase() === sourceLower);
    if (caseInsensitiveMatch) {
      return {
        sourceName,
        targetName: caseInsensitiveMatch,
      };
    }

    // Check for plural/singular variations (e.g., city -> citys, cities)
    const singularToPluralMatch = this.findPluralSingularMatch(sourceLower, targetSchemaProperties);
    if (singularToPluralMatch) {
      return {
        sourceName,
        targetName: singularToPluralMatch,
      };
    }

    // Check for naming convention match (snake_case <-> camelCase <-> kebab-case)
    const namingConventionMatch = this.findNamingConventionMatch(sourceName, targetSchemaProperties);
    if (namingConventionMatch) {
      return namingConventionMatch;
    }

    // Apply mapping rules in priority order
    const sortedRules = [...this.DEFAULT_MAPPINGS].sort((a, b) => b.priority - a.priority);

    // First, try domain-specific rules
    for (const rule of sortedRules) {
      if (rule.pattern.test(toolName)) {
        const mapping = rule.mappings.find(m => m.sourceName === sourceName);
        if (mapping && targetSchemaProperties.includes(mapping.targetName)) {
          return mapping;
        }
      }
    }

    // If no domain-specific mapping found, try the universal rule
    const universalRule = this.DEFAULT_MAPPINGS.find(r => r.priority === 5);
    if (universalRule) {
      const mapping = universalRule.mappings.find(m => m.sourceName === sourceName);
      if (mapping && targetSchemaProperties.includes(mapping.targetName)) {
        return mapping;
      }
    }
    
    // Last resort: Fuzzy substring match for required parameters
    const fuzzyMatch = this.findFuzzyMatch(sourceLower, targetSchemaProperties);
    if (fuzzyMatch) {
      return {
        sourceName,
        targetName: fuzzyMatch
      };
    }

    return null;
  }

  /**
   * Find match based on plural/singular variations
   */
  private static findPluralSingularMatch(sourceLower: string, targetProperties: string[]): string | null {
    const targetPropertiesLower = targetProperties.map(p => p.toLowerCase());
    
    // Common plural/singular patterns
    const variations = [
      sourceLower + 's',
      sourceLower + 'es',
      sourceLower.endsWith('y') ? sourceLower.slice(0, -1) + 'ies' : sourceLower + 'ies',
    ];

    for (let i = 0; i < variations.length; i++) {
      const idx = targetPropertiesLower.indexOf(variations[i]);
      if (idx !== -1) return targetProperties[idx];
    }
    
    // Also try reverse: if source is plural and target is singular
    if (sourceLower.endsWith('s')) {
      const singulars = [
        sourceLower.slice(0, -1),
        sourceLower.slice(0, -2), // es
        sourceLower.endsWith('ies') ? sourceLower.slice(0, -3) + 'y' : null
      ].filter(Boolean) as string[];

      for (const singular of singulars) {
        const idx = targetPropertiesLower.indexOf(singular);
        if (idx !== -1) return targetProperties[idx];
      }
    }

    return null;
  }

  /**
   * Common prefixes that LLMs often add to parameter names
   * when they split a multi-value parameter into individual fields
   */
  private static readonly COMMON_PARAM_PREFIXES = [
    'from_', 'to_', 'source_', 'dest_', 'destination_',
    'start_', 'end_', 'begin_', 'finish_',
    'origin_', 'target_', 'input_', 'output_',
  ];

  /**
   * Find match based on fuzzy substring/similarity
   * Supports prefix stripping for LLM-generated parameter names
   */
  private static findFuzzyMatch(sourceLower: string, targetProperties: string[]): string | null {
    if (sourceLower.length < 3) return null;
    
    for (const prop of targetProperties) {
      const propLower = prop.toLowerCase();
      // If one is a substring of another and they are long enough
      if ((propLower.includes(sourceLower) || sourceLower.includes(propLower)) && 
          Math.abs(propLower.length - sourceLower.length) <= 3) {
        return prop;
      }
    }

    // Try stripping common prefixes from source name and match against target
    // This handles cases like "from_city" -> "citys", "to_station" -> "station"
    for (const prefix of this.COMMON_PARAM_PREFIXES) {
      if (sourceLower.startsWith(prefix)) {
        const stripped = sourceLower.slice(prefix.length);
        if (stripped.length >= 3) {
          for (const prop of targetProperties) {
            const propLower = prop.toLowerCase();
            // Check if stripped source is a substring of target or vice versa
            if ((propLower.includes(stripped) || stripped.includes(propLower)) &&
                Math.abs(propLower.length - stripped.length) <= 3) {
              return prop;
            }
          }
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
    params: Record<string, any>,
  ): { normalized: Record<string, any>; warnings: string[] } {
    const warnings: string[] = [];
    const normalized = this.mapParameters(toolName, toolSchema, params);

    // Check for unknown parameters based on validation level
    const schemaProperties = Object.keys(toolSchema.properties || {});

    // Track which parameters were mapped from compatibility parameters
    const mappedCompatibilityParams = new Set<string>();

    // Check original parameters that were mapped
    for (const [sourceName, _value] of Object.entries(params)) {
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
              // Lenient: allow all parameters, just log if enabled
              if (this.config.logWarnings && !isCompatibilityParam) {
                warnings.push(`Allowed unknown parameter "${paramName}" for tool "${toolName}" in lenient mode`);
              }
              break;
          }
        }
      }
    }

    // Add warnings for compatibility parameters that were mapped
    if (this.config.logWarnings) {
      for (const sourceName of mappedCompatibilityParams) {
        warnings.push(`Added compatibility parameter "${sourceName}" for tool "${toolName}"`);
      }
    }

    // Check required parameters if enforcement is enabled
    if (this.config.enforceRequired) {
      const requiredParams = toolSchema.required || [];
      for (const requiredParam of requiredParams) {
        if (!(requiredParam in normalized)) {
          throw new Error(`Missing required parameter: "${requiredParam}"`);
        }
      }
    }

    return { normalized, warnings };
  }

  /**
   * Get parameter mapping suggestions for a tool
   */
  static getMappingSuggestions(
    toolName: string,
    toolSchema: Tool['inputSchema'],
  ): ParameterMapping[] {
    const suggestions: ParameterMapping[] = [];
    const schemaProperties = Object.keys(toolSchema.properties || {});

    for (const rule of this.DEFAULT_MAPPINGS) {
      if (rule.pattern.test(toolName)) {
        for (const mapping of rule.mappings) {
          if (schemaProperties.includes(mapping.targetName)) {
            suggestions.push(mapping);
          }
        }
      }
    }

    return suggestions;
  }

  /**
   * Check if a parameter is a compatibility parameter
   * These are parameters we add to handle schema/validation mismatches
   */
  private static isCompatibilityParameter(
    paramName: string,
    schemaProperties: string[],
  ): boolean {
    // Common compatibility parameter patterns (bidirectional)
    const compatibilityPatterns = [
      // Path/name confusion (very common in MCP servers)
      { schemaParams: ['path', 'name'], compatibilityParams: ['path', 'name', 'filename', 'file', 'directory', 'folder', 'filepath', 'location'] },

      // Search/query confusion
      { schemaParams: ['search', 'query'], compatibilityParams: ['search', 'query', 'q', 'filter', 'term', 'keyword'] },

      // ID/identifier confusion
      { schemaParams: ['id', 'identifier'], compatibilityParams: ['id', 'identifier', 'uuid', 'guid', 'uid'] },

      // Data/content confusion
      { schemaParams: ['data', 'content'], compatibilityParams: ['data', 'content', 'text', 'body', 'message'] },

      // Time/timestamp confusion
      { schemaParams: ['time', 'timestamp'], compatibilityParams: ['time', 'timestamp', 'date', 'datetime'] },

      // Limit/count confusion
      { schemaParams: ['limit', 'count'], compatibilityParams: ['limit', 'count', 'number', 'size', 'max'] },

      // Active/enabled confusion
      { schemaParams: ['active', 'enabled'], compatibilityParams: ['active', 'enabled', 'disabled', 'on', 'off'] },

      // Settings/config confusion
      { schemaParams: ['settings', 'config'], compatibilityParams: ['settings', 'config', 'options', 'params'] },

      // Result/output confusion
      { schemaParams: ['result', 'output'], compatibilityParams: ['result', 'output', 'response', 'return'] },
    ];

    for (const pattern of compatibilityPatterns) {
      // Check if any schema parameter is in the schema
      const hasSchemaParam = pattern.schemaParams.some(sp => schemaProperties.includes(sp));

      // Check if the parameter is a compatibility parameter for any schema parameter
      const isCompatibleParam = pattern.compatibilityParams.includes(paramName);

      if (hasSchemaParam && isCompatibleParam) {
        return true;
      }
    }

    return false;
  }

  /**
   * Apply common parameter aliases to improve compatibility
   * This handles cases where servers have schema/validation mismatches
   */
  private static applyCommonParameterAliases(
    _toolName: string,
    toolSchema: Tool['inputSchema'],
    params: Record<string, any>,
  ): Record<string, any> {
    const result = { ...params };
    const schemaProperties = Object.keys(toolSchema.properties || {});

    // Common parameter alias patterns that often cause issues
    const commonAliases = [
      { primary: 'path', aliases: ['name', 'filename', 'file', 'directory', 'folder'] },
      { primary: 'name', aliases: ['path', 'filename', 'file'] },
      { primary: 'query', aliases: ['search', 'q', 'filter', 'term'] },
      { primary: 'id', aliases: ['identifier', 'uuid', 'guid'] },
      { primary: 'data', aliases: ['content', 'body', 'text'] },
    ];

    // For each common alias pattern
    for (const aliasPattern of commonAliases) {
      const { primary, aliases } = aliasPattern;

      // If the schema expects the primary parameter
      if (schemaProperties.includes(primary)) {
        // Check if we have any of the aliases
        for (const alias of aliases) {
          if (alias in result && !(primary in result)) {
            // Copy alias value to primary parameter
            result[primary] = result[alias];
          }
        }

        // Note: We no longer automatically add 'name' when 'path' exists or vice versa
        // This was causing confusion in warning messages
      }
    }

    return result;
  }
}
