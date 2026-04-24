/**
 * Parameter Post Processor
 *
 * Post-processing pipeline for extracted parameters.
 * Handles type conversion, format normalization, enum matching, and value range clipping.
 */

import { logger } from '../core/logger';

// ==================== Type Definitions ====================

export interface ProcessedParameters {
  params: Record<string, any>;
  transformations: ParameterTransformation[];
  warnings: string[];
}

export interface ParameterTransformation {
  parameter: string;
  from: any;
  to: any;
  reason: string;
}

export interface DateParseResult {
  date: string;
  format: string;
  confidence: number;
}

// ==================== Main Processor Class ====================

export class ParameterPostProcessor {
  /**
   * Process parameters through the post-processing pipeline
   */
  static process(
    params: Record<string, any>,
    schema: any,
  ): ProcessedParameters {
    const transformations: ParameterTransformation[] = [];
    const warnings: string[] = [];
    const result: Record<string, any> = {};
    const properties = schema?.properties || {};

    for (const [paramName, paramValue] of Object.entries(params)) {
      const paramSchema = properties[paramName];
      let processedValue = paramValue;

      // Pipeline step 1: Type conversion
      if (paramSchema) {
        const typeResult = ParameterPostProcessor.convertType(processedValue, paramSchema);
        if (typeResult.transformed) {
          transformations.push({
            parameter: paramName,
            from: processedValue,
            to: typeResult.value,
            reason: typeResult.reason,
          });
          processedValue = typeResult.value;
        }
      }

      // Pipeline step 2: Date normalization
      if (typeof processedValue === 'string' && ParameterPostProcessor.looksLikeDate(paramName, processedValue)) {
        const dateResult = ParameterPostProcessor.normalizeDate(processedValue);
        if (dateResult) {
          transformations.push({
            parameter: paramName,
            from: processedValue,
            to: dateResult,
            reason: `Normalized date from "${processedValue}" to "${dateResult}"`,
          });
          processedValue = dateResult;
        }
      }

      // Pipeline step 3: Enum matching
      if (paramSchema?.enum && Array.isArray(paramSchema.enum)) {
        const enumResult = ParameterPostProcessor.fuzzyMatchEnum(processedValue, paramSchema.enum);
        if (enumResult.matched && enumResult.value !== processedValue) {
          transformations.push({
            parameter: paramName,
            from: processedValue,
            to: enumResult.value,
            reason: `Fuzzy matched enum from "${processedValue}" to "${enumResult.value}"`,
          });
          processedValue = enumResult.value;
        } else if (!enumResult.matched) {
          warnings.push(`Parameter "${paramName}" value "${processedValue}" does not match any enum value: [${paramSchema.enum.join(', ')}]`);
        }
      }

      // Pipeline step 4: Number range clipping
      if (typeof processedValue === 'number' && paramSchema) {
        const clipped = ParameterPostProcessor.clipNumberRange(processedValue, paramSchema);
        if (clipped !== processedValue) {
          transformations.push({
            parameter: paramName,
            from: processedValue,
            to: clipped,
            reason: `Clipped number from ${processedValue} to ${clipped}`,
          });
          processedValue = clipped;
        }
      }

      // Pipeline step 5: String normalization
      if (typeof processedValue === 'string' && paramSchema) {
        const normalized = ParameterPostProcessor.normalizeString(processedValue, paramSchema);
        if (normalized !== processedValue) {
          transformations.push({
            parameter: paramName,
            from: processedValue,
            to: normalized,
            reason: `Normalized string from "${processedValue}" to "${normalized}"`,
          });
          processedValue = normalized;
        }
      }

      result[paramName] = processedValue;
    }

    return { params: result, transformations, warnings };
  }

  /**
   * Convert parameter value to the expected type
   */
  static convertType(
    value: any,
    paramSchema: any,
  ): { value: any; transformed: boolean; reason: string } {
    const targetType = paramSchema.type || 'string';

    // Already correct type
    if (typeof value === targetType) {
      return { value, transformed: false, reason: '' };
    }

    switch (targetType) {
      case 'string':
        if (typeof value === 'number') {
          return { value: String(value), transformed: true, reason: `Converted number to string` };
        }
        if (typeof value === 'boolean') {
          return { value: String(value), transformed: true, reason: `Converted boolean to string` };
        }
        if (typeof value === 'object' && value !== null) {
          // New: Intelligent Object-to-String extraction for cross-tool data flow
          const extracted = ParameterPostProcessor.extractCoreValue(value, paramSchema);
          if (extracted !== null) {
            return { value: extracted, transformed: true, reason: `Extracted core value from object for parameter ${paramSchema.title || 'unnamed'}` };
          }
          return { value: JSON.stringify(value), transformed: true, reason: `Converted object to JSON string` };
        }
        break;

      case 'number':
        if (typeof value === 'string') {
          const trimmed = value.trim();
          // Handle percentage
          if (trimmed.endsWith('%')) {
            const parsed = parseFloat(trimmed);
            if (!isNaN(parsed)) {
              return { value: parsed / 100, transformed: true, reason: `Parsed percentage "${trimmed}" to ${parsed / 100}` };
            }
          }
          const parsed = Number(trimmed);
          if (!isNaN(parsed)) {
            return { value: parsed, transformed: true, reason: `Parsed string "${trimmed}" to number ${parsed}` };
          }
        }
        if (typeof value === 'boolean') {
          return { value: value ? 1 : 0, transformed: true, reason: `Converted boolean to number` };
        }
        break;

      case 'boolean':
        if (typeof value === 'string') {
          const lower = value.toLowerCase().trim();
          if (['true', '1', 'yes', 'on', 'y'].includes(lower)) {
            return { value: true, transformed: true, reason: `Parsed "${value}" as true` };
          }
          if (['false', '0', 'no', 'off', 'n'].includes(lower)) {
            return { value: false, transformed: true, reason: `Parsed "${value}" as false` };
          }
        }
        if (typeof value === 'number') {
          return { value: value !== 0, transformed: true, reason: `Converted number ${value} to boolean` };
        }
        break;

      case 'array':
        if (!Array.isArray(value)) {
          return { value: [value], transformed: true, reason: `Wrapped non-array value in array` };
        }
        break;

      case 'object':
        if (typeof value === 'string') {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
              return { value: parsed, transformed: true, reason: `Parsed JSON string to object` };
            }
          } catch {
            // Not valid JSON
          }
        }
        break;
    }

    return { value, transformed: false, reason: '' };
  }

  /**
   * Extract a core string value from an object (e.g., code, id, name)
   */
  private static extractCoreValue(obj: any, _paramSchema: any): string | null {
    if (!obj || typeof obj !== 'object') return null;

    // Common keys that usually represent the "core" identifier in various services
    const coreKeys = [
      'station_code', 'stationCode', 'station_id', 'stationId',
      'code', 'id', 'identifier', 'uuid', 'uid',
      'name', 'title', 'value', 'key'
    ];

    // 1. Check direct keys
    for (const key of coreKeys) {
      if (typeof obj[key] === 'string' && obj[key].length > 0) {
        return obj[key];
      }
    }

    // 2. Handle nested objects (like {"广州": {"station_code": "GZQ"}})
    const values = Object.values(obj);
    if (values.length === 1 && typeof values[0] === 'object' && values[0] !== null) {
      return ParameterPostProcessor.extractCoreValue(values[0], _paramSchema);
    }

    // 3. Search for any key that ends with "code" or "id"
    for (const key of Object.keys(obj)) {
      if ((key.toLowerCase().endsWith('code') || key.toLowerCase().endsWith('id')) && 
          typeof obj[key] === 'string') {
        return obj[key];
      }
    }

    return null;
  }

  /**
   * Check if a parameter looks like it should contain a date
   */
  static looksLikeDate(paramName: string, value: string): boolean {
    const paramNameLower = paramName.toLowerCase();
    const isDateParam = (
      paramNameLower.includes('date') ||
      paramNameLower.includes('time') ||
      paramNameLower.includes('day') ||
      paramNameLower.includes('schedule') ||
      paramNameLower.includes('deadline')
    );

    if (!isDateParam) {
      return false;
    }

    // Check if value contains date-like patterns
    const datePatterns = [
      /^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/,           // 2024-12-25, 2024/12/25
      /^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/,           // 12-25-2024, 12/25/2024
      /^(today|tomorrow|yesterday)$/i,
      /^next\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
      /^last\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
      /^this\s+(week|month|year|monday|tuesday|wednesday|thursday|friday|saturday|sunday)$/i,
      /^\d{1,2}\s+(days?|weeks?|months?|years?)\s+(ago|from\s+now|later)$/i,
      /^(in\s+)?\d{1,2}\s+(days?|weeks?|months?|years?)$/i,
    ];

    return datePatterns.some(p => p.test(value.trim()));
  }

  /**
   * Normalize date string to YYYY-MM-DD format
   */
  static normalizeDate(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Relative dates
    if (trimmed === 'today') return today;

    if (trimmed === 'tomorrow') {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;
    }

    if (trimmed === 'yesterday') {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, '0')}-${String(yesterday.getDate()).padStart(2, '0')}`;
    }

    // "next monday", "next week", etc.
    const nextMatch = trimmed.match(/^next\s+(.+)$/i);
    if (nextMatch) {
      const target = nextMatch[1].toLowerCase();
      const dayMap: Record<string, number> = {
        'monday': 1, 'tuesday': 2, 'wednesday': 3, 'thursday': 4,
        'friday': 5, 'saturday': 6, 'sunday': 0,
      };

      if (target === 'week') {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + (7 - nextWeek.getDay() + 1) % 7 + 7);
        return `${nextWeek.getFullYear()}-${String(nextWeek.getMonth() + 1).padStart(2, '0')}-${String(nextWeek.getDate()).padStart(2, '0')}`;
      }

      if (target === 'month') {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-${String(nextMonth.getDate()).padStart(2, '0')}`;
      }

      if (target === 'year') {
        return `${now.getFullYear() + 1}-01-01`;
      }

      if (dayMap[target] !== undefined) {
        const targetDay = dayMap[target];
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        const nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + daysUntil);
        return `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}`;
      }
    }

    // "X days/weeks/months from now" or "in X days/weeks/months"
    const fromNowMatch = trimmed.match(/(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months|year|years)(?:\s+(from\s+now|later))?/i);
    if (fromNowMatch) {
      const amount = parseInt(fromNowMatch[1]);
      const unit = fromNowMatch[2].toLowerCase();
      const future = new Date(now);

      if (unit.startsWith('day')) future.setDate(future.getDate() + amount);
      else if (unit.startsWith('week')) future.setDate(future.getDate() + amount * 7);
      else if (unit.startsWith('month')) future.setMonth(future.getMonth() + amount);
      else if (unit.startsWith('year')) future.setFullYear(future.getFullYear() + amount);

      return `${future.getFullYear()}-${String(future.getMonth() + 1).padStart(2, '0')}-${String(future.getDate()).padStart(2, '0')}`;
    }

    // "X days/weeks/months ago"
    const agoMatch = trimmed.match(/(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago/i);
    if (agoMatch) {
      const amount = parseInt(agoMatch[1]);
      const unit = agoMatch[2].toLowerCase();
      const past = new Date(now);

      if (unit.startsWith('day')) past.setDate(past.getDate() - amount);
      else if (unit.startsWith('week')) past.setDate(past.getDate() - amount * 7);
      else if (unit.startsWith('month')) past.setMonth(past.getMonth() - amount);
      else if (unit.startsWith('year')) past.setFullYear(past.getFullYear() - amount);

      return `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, '0')}-${String(past.getDate()).padStart(2, '0')}`;
    }

    // YYYY-MM-DD or YYYY/MM/DD
    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, '0')}-${String(ymdMatch[3]).padStart(2, '0')}`;
    }

    // MM/DD/YYYY or DD/MM/YYYY
    const mdyMatch = trimmed.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
    if (mdyMatch) {
      // Assume MM/DD/YYYY for simplicity
      return `${mdyMatch[3]}-${String(mdyMatch[1]).padStart(2, '0')}-${String(mdyMatch[2]).padStart(2, '0')}`;
    }

    return null;
  }

  /**
   * Fuzzy match a value against enum values
   */
  static fuzzyMatchEnum(
    value: any,
    enumValues: any[],
  ): { value: any; matched: boolean; confidence: number } {
    // Exact match
    if (enumValues.includes(value)) {
      return { value, matched: true, confidence: 1.0 };
    }

    const strValue = String(value).toLowerCase().trim();

    // Case-insensitive match
    const caseInsensitive = enumValues.find(
      v => String(v).toLowerCase() === strValue,
    );
    if (caseInsensitive !== undefined) {
      return { value: caseInsensitive, matched: true, confidence: 0.95 };
    }

    // Substring match (enum contains value or value contains enum)
    const substringMatch = enumValues.find(
      v => String(v).toLowerCase().includes(strValue) || strValue.includes(String(v).toLowerCase()),
    );
    if (substringMatch !== undefined) {
      return { value: substringMatch, matched: true, confidence: 0.8 };
    }

    // Levenshtein distance match (within 2 edits)
    const levenshteinMatch = enumValues
      .map(v => ({
        value: v,
        distance: ParameterPostProcessor.levenshteinDistance(strValue, String(v).toLowerCase()),
      }))
      .filter(m => m.distance <= 2)
      .sort((a, b) => a.distance - b.distance);

    if (levenshteinMatch.length > 0) {
      return {
        value: levenshteinMatch[0].value,
        matched: true,
        confidence: 0.7 - levenshteinMatch[0].distance * 0.1,
      };
    }

    return { value, matched: false, confidence: 0 };
  }

  /**
   * Clip number to valid range
   */
  static clipNumberRange(
    value: number,
    paramSchema: any,
  ): number {
    let result = value;

    if (paramSchema.minimum !== undefined && result < paramSchema.minimum) {
      result = paramSchema.minimum;
    }
    if (paramSchema.maximum !== undefined && result > paramSchema.maximum) {
      result = paramSchema.maximum;
    }

    return result;
  }

  /**
   * Normalize string value
   */
  static normalizeString(
    value: string,
    paramSchema: any,
  ): string {
    let result = value.trim();

    // Truncate to max length
    if (paramSchema.maxLength !== undefined && result.length > paramSchema.maxLength) {
      result = result.substring(0, paramSchema.maxLength);
    }

    return result;
  }

  /**
   * Calculate Levenshtein distance between two strings
   */
  static levenshteinDistance(a: string, b: string): number {
    const matrix: number[][] = [];

    for (let i = 0; i <= b.length; i++) {
      matrix[i] = [i];
    }
    for (let j = 0; j <= a.length; j++) {
      matrix[0][j] = j;
    }

    for (let i = 1; i <= b.length; i++) {
      for (let j = 1; j <= a.length; j++) {
        if (b.charAt(i - 1) === a.charAt(j - 1)) {
          matrix[i][j] = matrix[i - 1][j - 1];
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j - 1] + 1, // substitution
            matrix[i][j - 1] + 1,     // insertion
            matrix[i - 1][j] + 1,     // deletion
          );
        }
      }
    }

    return matrix[b.length][a.length];
  }
}
