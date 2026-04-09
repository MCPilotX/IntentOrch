/**
 * Pre-execution Validator
 * Provides comprehensive validation before tool execution
 */

import { Tool } from './types';
import { ParameterMapper, ValidationLevel } from './parameter-mapper';

export interface ValidationResult {
  success: boolean;
  normalizedArgs: Record<string, any>;
  warnings: string[];
  errors: string[];
  suggestions: string[];
}

export interface ValidationOptions {
  validationLevel?: ValidationLevel;
  enforceRequired?: boolean;
  autoFillMissing?: boolean;
  typeConversion?: boolean;
  logWarnings?: boolean;
}

/**
 * Pre-execution Validator
 * Validates tool arguments before execution with comprehensive checks
 */
export class PreExecutionValidator {
  private options: ValidationOptions;

  constructor(options: ValidationOptions = {}) {
    this.options = {
      validationLevel: ValidationLevel.COMPATIBLE,
      enforceRequired: true,
      autoFillMissing: true,
      typeConversion: true,
      logWarnings: true,
      ...options,
    };
  }

  /**
   * Validate tool arguments before execution
   */
  validate(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    args: Record<string, any>
  ): ValidationResult {
    const warnings: string[] = [];
    const errors: string[] = [];
    const suggestions: string[] = [];

    try {
      // Step 1: Use ParameterMapper for basic validation and normalization
      const { normalized, warnings: paramWarnings } = ParameterMapper.validateAndNormalize(
        toolName,
        toolSchema,
        args
      );

      warnings.push(...paramWarnings);

      // Step 2: Type checking and conversion
      const typedArgs = this.typeCheckAndConvert(toolName, toolSchema, normalized, warnings);

      // Step 3: Check for missing required parameters
      const filledArgs = this.checkAndFillMissing(toolName, toolSchema, typedArgs, warnings, suggestions);

      // Step 4: Validate parameter constraints
      const constrainedArgs = this.validateConstraints(toolName, toolSchema, filledArgs, warnings, errors);

      // Step 5: Generate suggestions for improvement
      this.generateSuggestions(toolName, toolSchema, constrainedArgs, suggestions);

      return {
        success: errors.length === 0,
        normalizedArgs: constrainedArgs,
        warnings,
        errors,
        suggestions,
      };

    } catch (error) {
      // If validation fails, provide detailed error information
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Validation failed: ${errorMessage}`);

      // Add helpful suggestions
      suggestions.push('Check tool schema for required parameters');
      suggestions.push('Verify parameter types match expected types');
      suggestions.push('Use --help to see tool documentation');

      return {
        success: false,
        normalizedArgs: args,
        warnings,
        errors,
        suggestions,
      };
    }
  }

  /**
   * Type checking and conversion with enhanced validation
   */
  private typeCheckAndConvert(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    args: Record<string, any>,
    warnings: string[]
  ): Record<string, any> {
    const result: Record<string, any> = { ...args };
    const properties = toolSchema.properties || {};

    for (const [paramName, paramValue] of Object.entries(args)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) {
        continue; // Unknown parameter, already handled by ParameterMapper
      }

      const paramType = paramSchema.type;
      if (!paramType) {
        continue; // No type specified in schema
      }

      try {
        // Convert value to expected type
        const convertedValue = this.convertToType(paramValue, paramType, paramSchema);
        if (convertedValue !== paramValue) {
          result[paramName] = convertedValue;
          if (this.options.logWarnings) {
            warnings.push(`Converted parameter "${paramName}" from ${typeof paramValue} to ${paramType}`);
          }
        }

        // Additional type-specific validation
        this.validateTypeSpecific(paramName, convertedValue, paramType, paramSchema, warnings);

        // Validate constraints
        this.validateParameterConstraints(paramName, convertedValue, paramSchema, warnings);

        // Validate dependencies between parameters
        this.validateParameterDependencies(paramName, convertedValue, args, paramSchema, toolSchema, warnings);

      } catch (error) {
        warnings.push(`Type conversion failed for parameter "${paramName}": ${error}`);
      }
    }

    return result;
  }

  /**
   * Validate parameter constraints (for individual parameters)
   */
  private validateParameterConstraints(
    paramName: string,
    value: any,
    paramSchema: any,
    warnings: string[]
  ): void {
    // Validate minimum/maximum for numbers
    if (typeof value === 'number') {
      if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
        warnings.push(`Parameter "${paramName}" value ${value} is below minimum ${paramSchema.minimum}`);
      }
      if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
        warnings.push(`Parameter "${paramName}" value ${value} is above maximum ${paramSchema.maximum}`);
      }
    }

    // Validate minLength/maxLength for strings
    if (typeof value === 'string') {
      if (paramSchema.minLength !== undefined && value.length < paramSchema.minLength) {
        warnings.push(`Parameter "${paramName}" length ${value.length} is below minimum ${paramSchema.minLength}`);
      }
      if (paramSchema.maxLength !== undefined && value.length > paramSchema.maxLength) {
        warnings.push(`Parameter "${paramName}" length ${value.length} is above maximum ${paramSchema.maxLength}`);
      }
      if (paramSchema.pattern !== undefined && !new RegExp(paramSchema.pattern).test(value)) {
        warnings.push(`Parameter "${paramName}" does not match pattern ${paramSchema.pattern}`);
      }
    }

    // Validate enum values - Note: enum validation is handled in validateTypeSpecific method
    // This method only handles warnings, errors are handled elsewhere
  }

  /**
   * Validate dependencies between parameters (for individual parameters)
   */
  private validateParameterDependencies(
    paramName: string,
    value: any,
    allArgs: Record<string, any>,
    paramSchema: any,
    toolSchema: Tool['inputSchema'],
    warnings: string[]
  ): void {
    // Check if this parameter requires other parameters
    if (paramSchema.requires) {
      const requiredParams = Array.isArray(paramSchema.requires) 
        ? paramSchema.requires 
        : [paramSchema.requires];
      
      for (const requiredParam of requiredParams) {
        if (!allArgs[requiredParam]) {
          warnings.push(`Parameter "${paramName}" requires parameter "${requiredParam}" to be set`);
        }
      }
    }

    // Check if this parameter conflicts with other parameters
    if (paramSchema.conflicts) {
      const conflictingParams = Array.isArray(paramSchema.conflicts)
        ? paramSchema.conflicts
        : [paramSchema.conflicts];
      
      for (const conflictingParam of conflictingParams) {
        if (allArgs[conflictingParam]) {
          warnings.push(`Parameter "${paramName}" conflicts with parameter "${conflictingParam}"`);
        }
      }
    }
  }

  /**
   * Convert value to expected type
   */
  private convertToType(value: any, targetType: string, schema: any): any {
    if (value === undefined || value === null) {
      return value;
    }

    switch (targetType) {
      case 'string':
        return String(value);

      case 'number':
      case 'integer':
        const num = Number(value);
        if (isNaN(num)) {
          throw new Error(`Cannot convert "${value}" to number`);
        }
        return targetType === 'integer' ? Math.floor(num) : num;

      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (lower === 'true' || lower === 'yes' || lower === '1') return true;
          if (lower === 'false' || lower === 'no' || lower === '0') return false;
        }
        return Boolean(value);

      case 'array':
        if (Array.isArray(value)) {
          return value;
        }
        if (typeof value === 'string') {
          // Try to parse as JSON array
          try {
            const parsed = JSON.parse(value);
            if (Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // If not JSON, treat as comma-separated list
            return value.split(',').map((item: string) => item.trim());
          }
        }
        return [value];

      case 'object':
        if (typeof value === 'object' && value !== null) {
          return value;
        }
        if (typeof value === 'string') {
          try {
            return JSON.parse(value);
          } catch {
            throw new Error(`Cannot convert string to object: ${value}`);
          }
        }
        return { value };

      default:
        return value;
    }
  }

  /**
   * Validate type-specific constraints
   */
  private validateTypeSpecific(
    paramName: string,
    value: any,
    type: string,
    schema: any,
    warnings: string[]
  ): void {
    switch (type) {
      case 'number':
      case 'integer':
        if (schema.minimum !== undefined && value < schema.minimum) {
          warnings.push(`Parameter "${paramName}" value ${value} is below minimum ${schema.minimum}`);
        }
        if (schema.maximum !== undefined && value > schema.maximum) {
          warnings.push(`Parameter "${paramName}" value ${value} is above maximum ${schema.maximum}`);
        }
        break;

      case 'string':
        if (schema.minLength !== undefined && value.length < schema.minLength) {
          warnings.push(`Parameter "${paramName}" length ${value.length} is below minimum ${schema.minLength}`);
        }
        if (schema.maxLength !== undefined && value.length > schema.maxLength) {
          warnings.push(`Parameter "${paramName}" length ${value.length} is above maximum ${schema.maxLength}`);
        }
        if (schema.pattern && !new RegExp(schema.pattern).test(value)) {
          warnings.push(`Parameter "${paramName}" does not match pattern ${schema.pattern}`);
        }
        if (schema.enum && !schema.enum.includes(value)) {
          // Generate warning for invalid enum values (not an error)
          warnings.push(`Parameter "${paramName}" value "${value}" is not valid. Allowed values: ${schema.enum.join(', ')}`);
        }
        break;

      case 'array':
        if (schema.minItems !== undefined && value.length < schema.minItems) {
          warnings.push(`Parameter "${paramName}" array length ${value.length} is below minimum ${schema.minItems}`);
        }
        if (schema.maxItems !== undefined && value.length > schema.maxItems) {
          warnings.push(`Parameter "${paramName}" array length ${value.length} is above maximum ${schema.maxItems}`);
        }
        if (schema.uniqueItems && new Set(value).size !== value.length) {
          warnings.push(`Parameter "${paramName}" array contains duplicate items`);
        }
        break;
    }
  }

  /**
   * Check and fill missing required parameters
   */
  private checkAndFillMissing(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    args: Record<string, any>,
    warnings: string[],
    suggestions: string[]
  ): Record<string, any> {
    const result = { ...args };
    const requiredParams = toolSchema.required || [];
    const errors: string[] = [];

    for (const requiredParam of requiredParams) {
      if (!(requiredParam in result)) {
        if (this.options.autoFillMissing) {
          // Try to provide default value based on parameter name and type
          const defaultValue = this.getDefaultValue(requiredParam, toolSchema.properties?.[requiredParam]);
          if (defaultValue !== undefined) {
            result[requiredParam] = defaultValue;
            warnings.push(`Auto-filled missing required parameter "${requiredParam}" with default value`);
          } else {
            errors.push(`Missing required parameter: "${requiredParam}"`);
            suggestions.push(`Provide value for required parameter: "${requiredParam}"`);
          }
        } else {
          errors.push(`Missing required parameter: "${requiredParam}"`);
          suggestions.push(`Provide value for required parameter: "${requiredParam}"`);
        }
      }
    }

    // If there are errors, throw an exception
    if (errors.length > 0 && this.options.enforceRequired) {
      throw new Error(errors.join('; '));
    }

    return result;
  }

  /**
   * Get default value for parameter
   */
  private getDefaultValue(paramName: string, paramSchema: any): any {
    // Check if schema has default value
    if (paramSchema?.default !== undefined) {
      return paramSchema.default;
    }

    // Provide intelligent defaults based on parameter name
    const lowerName = paramName.toLowerCase();

    if (lowerName.includes('path') || lowerName.includes('file')) {
      return '.';
    }

    if (lowerName.includes('host') || lowerName.includes('url')) {
      return 'localhost';
    }

    if (lowerName.includes('port')) {
      return 8080;
    }

    if (lowerName.includes('timeout')) {
      return 5000;
    }

    if (lowerName.includes('count')) {
      return 1;
    }

    if (lowerName.includes('limit')) {
      return 10;
    }

    if (lowerName.includes('enabled') || lowerName.includes('active')) {
      return true;
    }

    if (lowerName.includes('recursive') || lowerName.includes('force')) {
      return false;
    }

    return undefined;
  }

  /**
   * Validate parameter constraints
   */
  private validateConstraints(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    args: Record<string, any>,
    warnings: string[],
    errors: string[]
  ): Record<string, any> {
    const result = { ...args };
    const properties = toolSchema.properties || {};

    // Validate dependencies between parameters
    this.validateDependencies(toolName, properties, args, warnings, errors);

    // Validate mutual exclusivity
    this.validateMutualExclusivity(toolName, properties, args, warnings);

    return result;
  }

  /**
   * Validate parameter dependencies
   */
  private validateDependencies(
    toolName: string,
    properties: Record<string, any>,
    args: Record<string, any>,
    warnings: string[],
    errors: string[]
  ): void {
    // Example: If parameter A is provided, parameter B must also be provided
    // This is a simple implementation - in real system, dependencies would be defined in schema
    const commonDependencies = [
      { if: 'username', then: 'password', message: 'If username is provided, password is also required' },
      { if: 'source', then: 'destination', message: 'If source is provided, destination is also required' },
      { if: 'startDate', then: 'endDate', message: 'If start date is provided, end date is also required' },
    ];

    for (const dep of commonDependencies) {
      if (dep.if in args && !(dep.then in args)) {
        warnings.push(`Parameter dependency: ${dep.message}`);
      }
    }
  }

  /**
   * Validate mutual exclusivity
   */
  private validateMutualExclusivity(
    toolName: string,
    properties: Record<string, any>,
    args: Record<string, any>,
    warnings: string[]
  ): void {
    // Example: Parameters A and B cannot be used together
    const exclusiveGroups = [
      ['path', 'name', 'filename'], // Path-related parameters
      ['query', 'search', 'filter'], // Search-related parameters
      ['start', 'stop', 'restart'], // Action-related parameters
    ];

    for (const group of exclusiveGroups) {
      const provided = group.filter(param => param in args);
      if (provided.length > 1) {
        warnings.push(`Mutually exclusive parameters provided: ${provided.join(', ')}. Using: ${provided[0]}`);
      }
    }
  }

  /**
   * Generate suggestions for improvement
   */
  private generateSuggestions(
    toolName: string,
    toolSchema: Tool['inputSchema'],
    args: Record<string, any>,
    suggestions: string[]
  ): void {
    const properties = toolSchema.properties || {};

    // Suggest better parameter values based on common patterns
    for (const [paramName, paramValue] of Object.entries(args)) {
      const paramSchema = properties[paramName];
      if (!paramSchema) continue;

      // Suggest enum values if parameter doesn't match any
      if (paramSchema.enum && !paramSchema.enum.includes(paramValue)) {
        suggestions.push(`Consider using one of these values for "${paramName}": ${paramSchema.enum.join(', ')}`);
      }

      // Suggest format improvements for strings
      if (paramSchema.type === 'string' && paramSchema.format) {
        switch (paramSchema.format) {
          case 'email':
            if (!paramValue.includes('@')) {
              suggestions.push(`Parameter "${paramName}" should be a valid email address`);
            }
            break;
          case 'uri':
            if (!paramValue.includes('://')) {
              suggestions.push(`Parameter "${paramName}" should be a valid URI (include protocol)`);
            }
            break;
          case 'date-time':
            if (isNaN(Date.parse(paramValue))) {
              suggestions.push(`Parameter "${paramName}" should be a valid date-time string`);
            }
            break;
        }
      }
    }

    // Suggest additional useful parameters
    const missingUsefulParams = this.getUsefulMissingParameters(toolName, properties, args);
    if (missingUsefulParams.length > 0) {
      suggestions.push(`Consider adding these parameters for better results: ${missingUsefulParams.join(', ')}`);
    }
  }

  /**
   * Get useful missing parameters
   */
  private getUsefulMissingParameters(
    toolName: string,
    properties: Record<string, any>,
    args: Record<string, any>
  ): string[] {
    const usefulParams: string[] = [];

    // Suggest parameters based on tool name patterns
    if (toolName.includes('list') || toolName.includes('search')) {
      if (!('limit' in args) && 'limit' in properties) usefulParams.push('limit');
      if (!('offset' in args) && 'offset' in properties) usefulParams.push('offset');
      if (!('sort' in args) && 'sort' in properties) usefulParams.push('sort');
    }

    if (toolName.includes('file') || toolName.includes('directory')) {
      if (!('recursive' in args) && 'recursive' in properties) usefulParams.push('recursive');
      if (!('showHidden' in args) && 'showHidden' in properties) usefulParams.push('showHidden');
    }

    if (toolName.includes('network') || toolName.includes('http')) {
      if (!('timeout' in args) && 'timeout' in properties) usefulParams.push('timeout');
      if (!('retry' in args) && 'retry' in properties) usefulParams.push('retry');
    }

    return usefulParams;
  }

  /**
   * Configure validator options
   */
  configure(options: Partial<ValidationOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current configuration
   */
  getConfig(): ValidationOptions {
    return { ...this.options };
  }
}

// Default validator instance
export const defaultValidator = new PreExecutionValidator();