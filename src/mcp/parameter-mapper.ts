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
    enforceRequired: true
  };
  
  /**
   * Current configuration
   */
  private static config: ParameterMapperConfig = { ...ParameterMapper.defaultConfig };
  private static readonly DEFAULT_MAPPINGS: ParameterMappingRule[] = [
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
      priority: 5
    },
    
    // Domain-specific enhancement rules (higher priority)
    {
      pattern: /(read|write|edit|get|list|search|create|move|delete).*(file|directory|folder)/i,
      mappings: [
        // File system specific mappings
        { sourceName: 'name', targetName: 'path' },
        { sourceName: 'filename', targetName: 'path' },
      ],
      priority: 10
    },
    
    {
      pattern: /(search|find|query|filter).*/i,
      mappings: [
        // Search specific mappings
        { sourceName: 'query', targetName: 'search' },
        { sourceName: 'keyword', targetName: 'search' },
      ],
      priority: 10
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
      priority: 10
    },
    
    {
      pattern: /(http|api|rest|graphql|web).*/i,
      mappings: [
        // Web API specific mappings
        { sourceName: 'endpoint', targetName: 'url' },
        { sourceName: 'path', targetName: 'url' },
        { sourceName: 'method', targetName: 'verb' },
        { sourceName: 'headers', targetName: 'metadata' },
        { sourceName: 'params', targetName: 'query' },
      ],
      priority: 10
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
      priority: 10
    }
  ];

  /**
   * Map parameters from source to target based on tool name and schema
   */
  static mapParameters(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    sourceParams: Record<string, any>
  ): Record<string, any> {
    let targetParams: Record<string, any> = { ...sourceParams };
    const requiredParams = toolSchema.required || [];
    const schemaProperties = Object.keys(toolSchema.properties || {});
    
    // First, try direct mapping
    for (const [sourceName, value] of Object.entries(sourceParams)) {
      // If parameter already matches schema, keep it
      if (schemaProperties.includes(sourceName)) {
        continue;
      }
      
      // Try to find mapping for this parameter
      const mapping = this.findMapping(toolName, sourceName, schemaProperties);
      if (mapping) {
        // Apply mapping
        targetParams[mapping.targetName] = mapping.transformation 
          ? mapping.transformation(value) 
          : value;
        
        // Remove original parameter if it's not in schema
        if (!schemaProperties.includes(sourceName)) {
          delete targetParams[sourceName];
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
    
    return targetParams;
  }

  /**
   * Find appropriate mapping for a source parameter
   */
  private static findMapping(
    toolName: string,
    sourceName: string,
    targetSchemaProperties: string[]
  ): ParameterMapping | null {
    // First, check if sourceName directly matches any target property
    if (targetSchemaProperties.includes(sourceName)) {
      return null; // No mapping needed
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
    // The universal rule has pattern /.*/ and priority 5
    const universalRule = this.DEFAULT_MAPPINGS.find(r => r.priority === 5);
    if (universalRule) {
      const mapping = universalRule.mappings.find(m => m.sourceName === sourceName);
      if (mapping && targetSchemaProperties.includes(mapping.targetName)) {
        return mapping;
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
    sourceParamNames: string[]
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
    params: Record<string, any>
  ): { normalized: Record<string, any>; warnings: string[] } {
    const warnings: string[] = [];
    const normalized = this.mapParameters(toolName, toolSchema, params);
    
    // Check for unknown parameters based on validation level
    const schemaProperties = Object.keys(toolSchema.properties || {});
    
    if (toolSchema.additionalProperties === false) {
      for (const paramName of Object.keys(normalized)) {
        if (!schemaProperties.includes(paramName)) {
          const isCompatibilityParam = this.isCompatibilityParameter(paramName, schemaProperties);
          
          // Handle based on validation level
          switch (this.config.validationLevel) {
            case ValidationLevel.STRICT:
              // Strict: reject all unknown parameters
              warnings.push(`Unknown parameter "${paramName}" for tool "${toolName}"`);
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
    toolSchema: Tool['inputSchema']
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
    schemaProperties: string[]
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
      { schemaParams: ['result', 'output'], compatibilityParams: ['result', 'output', 'response', 'return'] }
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
    toolName: string,
    toolSchema: Tool['inputSchema'],
    params: Record<string, any>
  ): Record<string, any> {
    const result = { ...params };
    const schemaProperties = Object.keys(toolSchema.properties || {});
    
    // Common parameter alias patterns that often cause issues
    const commonAliases = [
      { primary: 'path', aliases: ['name', 'filename', 'file', 'directory', 'folder'] },
      { primary: 'name', aliases: ['path', 'filename', 'file'] },
      { primary: 'query', aliases: ['search', 'q', 'filter', 'term'] },
      { primary: 'id', aliases: ['identifier', 'uuid', 'guid'] },
      { primary: 'data', aliases: ['content', 'body', 'text'] }
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
        
        // Also ensure common aliases are present if they're commonly validated
        // This helps with servers that validate wrong parameters
        if (primary in result) {
          // For path/name confusion (common issue)
          if (primary === 'path') {
            // Ensure 'name' is also present if it's a common validation target
            if (!('name' in result)) {
              result.name = result.path;
            }
          }
          // For name/path confusion
          else if (primary === 'name') {
            // Ensure 'path' is also present if it's a common validation target
            if (!('path' in result)) {
              result.path = result.name;
            }
          }
        }
      }
    }
    
    return result;
  }
}
