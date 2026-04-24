/**
 * Schema Analyzer
 *
 * Analyzes tool inputSchema to generate parameter extraction templates,
 * validates extracted parameters, and provides smart value correction.
 */

import { logger } from '../core/logger';

// ==================== Type Definitions ====================

export interface ParameterExtractionField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
  format?: string;
  pattern?: string;
  enumValues?: any[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  defaultValue?: any;
  example?: any;
  nestedFields?: ParameterExtractionField[];
}

export interface ParameterExtractionTemplate {
  toolName: string;
  fields: ParameterExtractionField[];
  requiredFields: string[];
  hasNestedStructure: boolean;

  toPromptString(): string;
}

export interface ValidationIssue {
  field: string;
  severity: 'error' | 'warning' | 'info';
  message: string;
  suggestedValue?: any;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  correctedParams: Record<string, any>;
}

export interface CorrectionResult {
  corrected: any;
  correctionNote?: string;
  wasCorrected: boolean;
}

// ==================== Main Analyzer Class ====================

export class SchemaAnalyzer {
  /**
   * Build a parameter extraction template from tool inputSchema
   */
  static buildParameterExtractionTemplate(
    toolName: string,
    inputSchema: any,
  ): ParameterExtractionTemplate {
    const properties = inputSchema?.properties || {};
    const required = inputSchema?.required || [];
    const fields: ParameterExtractionField[] = [];

    for (const [paramName, paramSchema] of Object.entries(properties)) {
      const schema = paramSchema as any;
      const field = SchemaAnalyzer.parseSchemaField(
        paramName,
        schema,
        required.includes(paramName),
      );
      fields.push(field);
    }

    const template: ParameterExtractionTemplate = {
      toolName,
      fields,
      requiredFields: required,
      hasNestedStructure: fields.some(f => f.type === 'object' && (f.nestedFields?.length ?? 0) > 0),

      toPromptString(): string {
        return SchemaAnalyzer.templateToPromptString(this);
      },
    };

    return template;
  }

  /**
   * Parse a single schema property into an extraction field
   */
  private static parseSchemaField(
    name: string,
    schema: any,
    isRequired: boolean,
  ): ParameterExtractionField {
    const field: ParameterExtractionField = {
      name,
      type: schema.type || 'string',
      required: isRequired,
      description: schema.description || '',
      format: schema.format,
      pattern: schema.pattern,
      enumValues: schema.enum,
      minimum: schema.minimum,
      maximum: schema.maximum,
      minLength: schema.minLength,
      maxLength: schema.maxLength,
      defaultValue: schema.default,
      example: schema.example,
    };

    // Parse nested object properties
    if (field.type === 'object' && schema.properties) {
      const nestedRequired = schema.required || [];
      field.nestedFields = [];
      for (const [nestedName, nestedSchema] of Object.entries(schema.properties)) {
        const nested = SchemaAnalyzer.parseSchemaField(
          nestedName,
          nestedSchema as any,
          nestedRequired.includes(nestedName),
        );
        field.nestedFields.push(nested);
      }
    }

    // Parse array item schema
    if (field.type === 'array' && schema.items) {
      const items = schema.items as any;
      if (items.type === 'object' && items.properties) {
        const itemRequired = items.required || [];
        field.nestedFields = [];
        for (const [itemName, itemSchema] of Object.entries(items.properties)) {
          const nested = SchemaAnalyzer.parseSchemaField(
            itemName,
            itemSchema as any,
            itemRequired.includes(itemName),
          );
          field.nestedFields.push(nested);
        }
      }
    }

    return field;
  }

  /**
   * Convert template to a prompt-friendly string
   */
  static templateToPromptString(template: ParameterExtractionTemplate): string {
    const lines: string[] = [];

    for (const field of template.fields) {
      const constraints: string[] = [];

      // Type constraint
      constraints.push(`type: ${field.type}`);

      // Required constraint
      if (field.required) {
        constraints.push('required');
      }

      // Format constraint
      if (field.format) {
        constraints.push(`format: ${field.format}`);
      }

      // Enum constraint
      if (field.enumValues && field.enumValues.length > 0) {
        const enumStr = field.enumValues.map(v => `"${v}"`).join(', ');
        constraints.push(`allowed values: [${enumStr}]`);
      }

      // Range constraints
      if (field.minimum !== undefined) {
        constraints.push(`min: ${field.minimum}`);
      }
      if (field.maximum !== undefined) {
        constraints.push(`max: ${field.maximum}`);
      }
      if (field.minLength !== undefined) {
        constraints.push(`min length: ${field.minLength}`);
      }
      if (field.maxLength !== undefined) {
        constraints.push(`max length: ${field.maxLength}`);
      }

      // Pattern constraint
      if (field.pattern) {
        constraints.push(`pattern: ${field.pattern}`);
      }

      // Default value
      if (field.defaultValue !== undefined) {
        constraints.push(`default: ${JSON.stringify(field.defaultValue)}`);
      }

      // Description
      const desc = field.description ? ` - ${field.description}` : '';

      // Build field line
      let fieldLine = `  - ${field.name} (${constraints.join(', ')})${desc}`;

      // Add nested fields
      if (field.nestedFields && field.nestedFields.length > 0) {
        fieldLine += ':';
        lines.push(fieldLine);
        for (const nested of field.nestedFields) {
          const nestedConstraints: string[] = [nested.type];
          if (nested.required) nestedConstraints.push('required');
          if (nested.description) {
            lines.push(`    - ${nested.name} (${nestedConstraints.join(', ')}) - ${nested.description}`);
          } else {
            lines.push(`    - ${nested.name} (${nestedConstraints.join(', ')})`);
          }
        }
      } else {
        lines.push(fieldLine);
      }
    }

    return lines.join('\n');
  }

  /**
   * Validate extracted parameters against schema template
   */
  static validateExtractedParameters(
    template: ParameterExtractionTemplate,
    extractedParams: Record<string, any>,
  ): ValidationResult {
    const issues: ValidationIssue[] = [];
    const correctedParams = { ...extractedParams };

    for (const field of template.fields) {
      const value = extractedParams[field.name];

      // Check required fields
      if (field.required && (value === null || value === undefined || value === '')) {
        issues.push({
          field: field.name,
          severity: 'error',
          message: `Required parameter "${field.name}" is missing`,
          suggestedValue: field.defaultValue,
        });
        continue;
      }

      // Skip validation for null/undefined optional fields
      if (value === null || value === undefined) {
        continue;
      }

      // Type validation and correction
      const typeResult = SchemaAnalyzer.validateAndCorrectType(value, field);
      if (typeResult.wasCorrected) {
        correctedParams[field.name] = typeResult.corrected;
        issues.push({
          field: field.name,
          severity: 'warning',
          message: `Parameter "${field.name}" was corrected: ${typeResult.correctionNote}`,
          suggestedValue: typeResult.corrected,
        });
      }

      // Enum validation
      if (field.enumValues && field.enumValues.length > 0) {
        const enumResult = SchemaAnalyzer.matchEnumValue(
          correctedParams[field.name],
          field.enumValues,
        );
        if (enumResult.wasCorrected) {
          correctedParams[field.name] = enumResult.corrected;
          issues.push({
            field: field.name,
            severity: 'info',
            message: `Parameter "${field.name}" matched to enum value: ${enumResult.correctionNote}`,
            suggestedValue: enumResult.corrected,
          });
        } else if (!field.enumValues.includes(correctedParams[field.name])) {
          issues.push({
            field: field.name,
            severity: 'error',
            message: `Parameter "${field.name}" value "${correctedParams[field.name]}" is not in allowed values: [${field.enumValues.join(', ')}]`,
            suggestedValue: field.enumValues[0],
          });
        }
      }

      // Range validation
      if (typeof correctedParams[field.name] === 'number') {
        const numValue = correctedParams[field.name] as number;
        if (field.minimum !== undefined && numValue < field.minimum) {
          correctedParams[field.name] = field.minimum;
          issues.push({
            field: field.name,
            severity: 'warning',
            message: `Parameter "${field.name}" value ${numValue} is below minimum ${field.minimum}, corrected to ${field.minimum}`,
            suggestedValue: field.minimum,
          });
        }
        if (field.maximum !== undefined && numValue > field.maximum) {
          correctedParams[field.name] = field.maximum;
          issues.push({
            field: field.name,
            severity: 'warning',
            message: `Parameter "${field.name}" value ${numValue} exceeds maximum ${field.maximum}, corrected to ${field.maximum}`,
            suggestedValue: field.maximum,
          });
        }
      }

      // String length validation
      if (typeof correctedParams[field.name] === 'string') {
        const strValue = correctedParams[field.name] as string;
        if (field.minLength !== undefined && strValue.length < field.minLength) {
          issues.push({
            field: field.name,
            severity: 'error',
            message: `Parameter "${field.name}" length ${strValue.length} is below minimum ${field.minLength}`,
          });
        }
        if (field.maxLength !== undefined && strValue.length > field.maxLength) {
          correctedParams[field.name] = strValue.substring(0, field.maxLength);
          issues.push({
            field: field.name,
            severity: 'warning',
            message: `Parameter "${field.name}" truncated from ${strValue.length} to ${field.maxLength} characters`,
            suggestedValue: correctedParams[field.name],
          });
        }

        // Pattern validation
        if (field.pattern) {
          try {
            const regex = new RegExp(field.pattern);
            if (!regex.test(strValue)) {
              issues.push({
                field: field.name,
                severity: 'error',
                message: `Parameter "${field.name}" value "${strValue}" does not match pattern: ${field.pattern}`,
              });
            }
          } catch {
            // Invalid regex pattern, skip
          }
        }
      }
    }

    return {
      valid: issues.filter(i => i.severity === 'error').length === 0,
      issues,
      correctedParams,
    };
  }

  /**
   * Validate and correct parameter type
   */
  static validateAndCorrectType(
    value: any,
    field: ParameterExtractionField,
  ): CorrectionResult {
    const targetType = field.type;

    // If already correct type
    if (typeof value === targetType) {
      return { corrected: value, wasCorrected: false };
    }

    // Type conversion attempts
    switch (targetType) {
      case 'string':
        if (typeof value === 'number' || typeof value === 'boolean') {
          return {
            corrected: String(value),
            correctionNote: `Converted ${typeof value} to string: "${value}"`,
            wasCorrected: true,
          };
        }
        break;

      case 'number':
        if (typeof value === 'string') {
          const parsed = Number(value);
          if (!isNaN(parsed)) {
            return {
              corrected: parsed,
              correctionNote: `Converted string "${value}" to number: ${parsed}`,
              wasCorrected: true,
            };
          }
        }
        if (typeof value === 'boolean') {
          return {
            corrected: value ? 1 : 0,
            correctionNote: `Converted boolean to number: ${value ? 1 : 0}`,
            wasCorrected: true,
          };
        }
        break;

      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase();
          if (['true', '1', 'yes', 'on'].includes(lower)) {
            return { corrected: true, correctionNote: `Converted string "${value}" to boolean: true`, wasCorrected: true };
          }
          if (['false', '0', 'no', 'off'].includes(lower)) {
            return { corrected: false, correctionNote: `Converted string "${value}" to boolean: false`, wasCorrected: true };
          }
        }
        if (typeof value === 'number') {
          return {
            corrected: value !== 0,
            correctionNote: `Converted number ${value} to boolean: ${value !== 0}`,
            wasCorrected: true,
          };
        }
        break;

      case 'array':
        if (!Array.isArray(value) && typeof value === 'string') {
          return {
            corrected: [value],
            correctionNote: `Wrapped string "${value}" in array`,
            wasCorrected: true,
          };
        }
        if (!Array.isArray(value) && typeof value === 'object' && value !== null) {
          return {
            corrected: [value],
            correctionNote: `Wrapped object in array`,
            wasCorrected: true,
          };
        }
        break;

      case 'object':
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null) {
              return {
                corrected: parsed,
                correctionNote: `Parsed JSON string to object`,
                wasCorrected: true,
              };
            }
          } catch {
            // Not valid JSON, keep original
          }
        }
        break;
    }

    return { corrected: value, wasCorrected: false };
  }

  /**
   * Fuzzy match a value against enum values
   */
  static matchEnumValue(
    value: any,
    enumValues: any[],
  ): CorrectionResult {
    if (enumValues.includes(value)) {
      return { corrected: value, wasCorrected: false };
    }

    const strValue = String(value).toLowerCase().trim();

    // Try exact case-insensitive match
    const caseInsensitive = enumValues.find(
      v => String(v).toLowerCase() === strValue,
    );
    if (caseInsensitive !== undefined) {
      return {
        corrected: caseInsensitive,
        correctionNote: `Case-insensitive match: "${value}" -> "${caseInsensitive}"`,
        wasCorrected: true,
      };
    }

    // Try substring match
    const substringMatch = enumValues.find(
      v => String(v).toLowerCase().includes(strValue) || strValue.includes(String(v).toLowerCase()),
    );
    if (substringMatch !== undefined) {
      return {
        corrected: substringMatch,
        correctionNote: `Fuzzy match: "${value}" -> "${substringMatch}"`,
        wasCorrected: true,
      };
    }

    // Try common boolean/truthy alias mapping
    const truthyValues = ['true', '1', 'yes', 'on', 'y'];
    const falsyValues = ['false', '0', 'no', 'off', 'n'];

    if (truthyValues.includes(strValue)) {
      const truthyMatch = enumValues.find(
        v => String(v).toLowerCase() === 'true' || v === true || v === 1,
      );
      if (truthyMatch !== undefined) {
        return {
          corrected: truthyMatch,
          correctionNote: `Boolean alias match: "${value}" -> "${truthyMatch}"`,
          wasCorrected: true,
        };
      }
    }

    if (falsyValues.includes(strValue)) {
      const falsyMatch = enumValues.find(
        v => String(v).toLowerCase() === 'false' || v === false || v === 0,
      );
      if (falsyMatch !== undefined) {
        return {
          corrected: falsyMatch,
          correctionNote: `Boolean alias match: "${value}" -> "${falsyMatch}"`,
          wasCorrected: true,
        };
      }
    }

    return { corrected: value, wasCorrected: false };
  }

  /**
   * Smart correct a parameter value based on its schema
   */
  static smartCorrectValue(
    value: any,
    paramSchema: any,
  ): CorrectionResult {
    if (!paramSchema || typeof paramSchema !== 'object') {
      return { corrected: value, wasCorrected: false };
    }

    const type = paramSchema.type || 'string';

    // Type correction
    const typeResult = SchemaAnalyzer.validateAndCorrectType(
      value,
      { name: '', type, required: false, description: '' },
    );
    if (typeResult.wasCorrected) {
      return typeResult;
    }

    // Enum correction
    if (paramSchema.enum && Array.isArray(paramSchema.enum)) {
      const enumResult = SchemaAnalyzer.matchEnumValue(value, paramSchema.enum);
      if (enumResult.wasCorrected) {
        return enumResult;
      }
    }

    // Number range correction
    if (typeof value === 'number') {
      let corrected = value;
      let note: string | undefined;

      if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
        corrected = paramSchema.minimum;
        note = `Value ${value} below minimum ${paramSchema.minimum}, set to ${paramSchema.minimum}`;
      }
      if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
        corrected = paramSchema.maximum;
        note = `Value ${value} exceeds maximum ${paramSchema.maximum}, set to ${paramSchema.maximum}`;
      }

      if (note) {
        return { corrected, correctionNote: note, wasCorrected: true };
      }
    }

    // String length correction
    if (typeof value === 'string') {
      let corrected = value;
      let note: string | undefined;

      if (paramSchema.maxLength !== undefined && value.length > paramSchema.maxLength) {
        corrected = value.substring(0, paramSchema.maxLength);
        note = `String truncated from ${value.length} to ${paramSchema.maxLength} characters`;
      }

      if (note) {
        return { corrected, correctionNote: note, wasCorrected: true };
      }
    }

    return { corrected: value, wasCorrected: false };
  }

  /**
   * Get mapping suggestions for a tool based on its schema
   */
  static getMappingSuggestions(
    inputSchema: any,
  ): Array<{ sourceName: string; targetName: string; reason: string }> {
    const suggestions: Array<{ sourceName: string; targetName: string; reason: string }> = [];
    const properties = inputSchema?.properties || {};

    const commonAliases: Record<string, string[]> = {
      'path': ['name', 'filename', 'file', 'directory', 'folder', 'filepath', 'location'],
      'name': ['path', 'filename', 'title', 'label'],
      'query': ['search', 'q', 'filter', 'term', 'keyword'],
      'id': ['identifier', 'uuid', 'guid', 'uid', 'key'],
      'content': ['data', 'text', 'body', 'message', 'value'],
      'date': ['time', 'datetime', 'timestamp'],
      'limit': ['count', 'number', 'size', 'max'],
      'active': ['enabled', 'disabled', 'on', 'off'],
    };

    for (const [paramName] of Object.entries(properties)) {
      for (const [targetName, aliases] of Object.entries(commonAliases)) {
        if (paramName === targetName) {
          for (const alias of aliases) {
            if (!(alias in properties)) {
              suggestions.push({
                sourceName: alias,
                targetName: paramName,
                reason: `Common alias for "${paramName}"`,
              });
            }
          }
        }
      }
    }

    return suggestions;
  }
}
