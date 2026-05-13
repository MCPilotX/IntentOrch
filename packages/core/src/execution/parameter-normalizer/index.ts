/**
 * Parameter Normalizer
 *
 * Lightweight parameter normalization extracted from ExecuteService.
 * Handles:
 * 1. Schema-based type conversion (string <-> number <-> boolean)
 * 2. Date string normalization (relative dates -> YYYY-MM-DD)
 * 3. Enum fuzzy matching
 * 4. Number range clipping
 *
 * Replaces the old IntentService.adaptParameters() (3-layer fallback) and
 * ParameterPostProcessor.process() pipeline with a single, focused helper.
 */

export class ParameterNormalizer {
  /**
   * Normalize parameters according to JSON schema.
   */
  normalize(
    params: Record<string, unknown>,
    schema?: Record<string, unknown>,
  ): Record<string, unknown> {
    if (!schema || !schema.properties) {
      return { ...params };
    }

    const properties = schema.properties as Record<string, Record<string, unknown>>;
    const result: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(params)) {
      const propSchema = properties[key];
      if (!propSchema) {
        result[key] = value;
        continue;
      }

      let processed = value;

      // 1. Type conversion
      processed = this.convertType(processed, propSchema);

      // 2. Date normalization
      if (
        typeof processed === "string" &&
        this.isDateParameter(key, propSchema)
      ) {
        const normalized = this.normalizeDateString(processed);
        if (normalized !== null) {
          processed = normalized;
        }
      }

      // 3. Enum fuzzy matching
      if (propSchema.enum && Array.isArray(propSchema.enum)) {
        processed = this.fuzzyMatchEnum(processed, propSchema.enum);
      }

      // 4. Number range clipping
      if (typeof processed === "number") {
        processed = this.clipNumber(processed, propSchema);
      }

      result[key] = processed;
    }

    return result;
  }

  /**
   * Convert a value to the expected schema type.
   */
  private convertType(value: unknown, schema: Record<string, unknown>): unknown {
    const targetType = (schema.type as string) || "string";

    if (typeof value === targetType) {
      return value;
    }

    switch (targetType) {
      case "string":
        if (typeof value === "number" || typeof value === "boolean") {
          return String(value);
        }
        if (typeof value === "object" && value !== null) {
          return JSON.stringify(value);
        }
        return value;

      case "number":
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.endsWith("%")) {
            const parsed = parseFloat(trimmed);
            return isNaN(parsed) ? value : parsed / 100;
          }
          const parsed = Number(trimmed);
          return isNaN(parsed) ? value : parsed;
        }
        if (typeof value === "boolean") {
          return value ? 1 : 0;
        }
        return value;

      case "boolean":
        if (typeof value === "string") {
          const lower = value.toLowerCase().trim();
          if (["true", "1", "yes", "on", "y"].includes(lower)) return true;
          if (["false", "0", "no", "off", "n"].includes(lower)) return false;
        }
        if (typeof value === "number") {
          return value !== 0;
        }
        return value;

      case "array":
        if (!Array.isArray(value)) {
          return [value];
        }
        return value;

      case "object":
        if (typeof value === "string") {
          try {
            const parsed = JSON.parse(value);
            if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
              return parsed;
            }
          } catch {
            // Not valid JSON
          }
        }
        return value;

      default:
        return value;
    }
  }

  /**
   * Check if a parameter is a date/time parameter.
   */
  private isDateParameter(key: string, schema: Record<string, unknown>): boolean {
    const keyLower = key.toLowerCase();
    const isDateParam =
      keyLower.includes("date") ||
      keyLower.includes("time") ||
      keyLower.includes("day") ||
      keyLower.includes("schedule") ||
      keyLower.includes("deadline");

    if (!isDateParam) return false;

    if (typeof schema.format === "string" && ["date", "date-time", "time"].includes(schema.format)) {
      return true;
    }

    return true;
  }

  /**
   * Normalize a date string to YYYY-MM-DD format.
   */
  normalizeDateString(value: string): string | null {
    const trimmed = value.trim().toLowerCase();
    const now = new Date();

    if (trimmed === "today") {
      return this.formatDate(now);
    }

    if (trimmed === "tomorrow") {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      return this.formatDate(tomorrow);
    }

    if (trimmed === "yesterday") {
      const yesterday = new Date(now);
      yesterday.setDate(yesterday.getDate() - 1);
      return this.formatDate(yesterday);
    }

    const nextMatch = trimmed.match(/^next\s+(.+)$/i);
    if (nextMatch) {
      const target = nextMatch[1].toLowerCase();
      const dayMap: Record<string, number> = {
        monday: 1, tuesday: 2, wednesday: 3, thursday: 4,
        friday: 5, saturday: 6, sunday: 0,
      };

      if (target === "week") {
        const nextWeek = new Date(now);
        nextWeek.setDate(nextWeek.getDate() + ((7 - nextWeek.getDay() + 1) % 7) + 7);
        return this.formatDate(nextWeek);
      }

      if (target === "month") {
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return this.formatDate(nextMonth);
      }

      if (target === "year") {
        return `${now.getFullYear() + 1}-01-01`;
      }

      if (dayMap[target] !== undefined) {
        const targetDay = dayMap[target];
        const currentDay = now.getDay();
        let daysUntil = targetDay - currentDay;
        if (daysUntil <= 0) daysUntil += 7;
        const nextDate = new Date(now);
        nextDate.setDate(nextDate.getDate() + daysUntil);
        return this.formatDate(nextDate);
      }
    }

    const fromNowMatch = trimmed.match(
      /(?:in\s+)?(\d+)\s+(day|days|week|weeks|month|months|year|years)(?:\s+(from\s+now|later))?/i,
    );
    if (fromNowMatch) {
      const amount = parseInt(fromNowMatch[1]);
      const unit = fromNowMatch[2].toLowerCase();
      const future = new Date(now);
      if (unit.startsWith("day")) future.setDate(future.getDate() + amount);
      else if (unit.startsWith("week")) future.setDate(future.getDate() + amount * 7);
      else if (unit.startsWith("month")) future.setMonth(future.getMonth() + amount);
      else if (unit.startsWith("year")) future.setFullYear(future.getFullYear() + amount);
      return this.formatDate(future);
    }

    const agoMatch = trimmed.match(
      /(\d+)\s+(day|days|week|weeks|month|months|year|years)\s+ago/i,
    );
    if (agoMatch) {
      const amount = parseInt(agoMatch[1]);
      const unit = agoMatch[2].toLowerCase();
      const past = new Date(now);
      if (unit.startsWith("day")) past.setDate(past.getDate() - amount);
      else if (unit.startsWith("week")) past.setDate(past.getDate() - amount * 7);
      else if (unit.startsWith("month")) past.setMonth(past.getMonth() - amount);
      else if (unit.startsWith("year")) past.setFullYear(past.getFullYear() - amount);
      return this.formatDate(past);
    }

    const ymdMatch = trimmed.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
    if (ymdMatch) {
      return `${ymdMatch[1]}-${String(ymdMatch[2]).padStart(2, "0")}-${String(ymdMatch[3]).padStart(2, "0")}`;
    }

    return null;
  }

  /**
   * Format a Date object as YYYY-MM-DD.
   */
  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * Fuzzy match a value against enum values.
   */
  private fuzzyMatchEnum(value: unknown, enumValues: unknown[]): unknown {
    if (enumValues.includes(value)) {
      return value;
    }

    const strValue = String(value).toLowerCase().trim();

    const caseInsensitive = enumValues.find(
      (v) => String(v).toLowerCase() === strValue,
    );
    if (caseInsensitive !== undefined) {
      return caseInsensitive;
    }

    const substringMatch = enumValues.find(
      (v) =>
        String(v).toLowerCase().includes(strValue) ||
        strValue.includes(String(v).toLowerCase()),
    );
    if (substringMatch !== undefined) {
      return substringMatch;
    }

    return value;
  }

  /**
   * Clip a number to valid range.
   */
  private clipNumber(value: number, schema: Record<string, unknown>): number {
    let result = value;
    const min = schema.minimum as number | undefined;
    const max = schema.maximum as number | undefined;
    if (min !== undefined && result < min) {
      result = min;
    }
    if (max !== undefined && result > max) {
      result = max;
    }
    return result;
  }
}

// Singleton
let normalizerInstance: ParameterNormalizer | null = null;

export function getParameterNormalizer(): ParameterNormalizer {
  if (!normalizerInstance) {
    normalizerInstance = new ParameterNormalizer();
  }
  return normalizerInstance;
}
