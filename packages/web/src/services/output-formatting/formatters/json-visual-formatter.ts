/**
 * JSON Visual Formatter
 * 
 * Formats JSON data with integration to json-beautiful-render for visual rendering
 */

import { BaseFormatter } from './base-formatter';
import type { FormatContext, VisualRenderingMetadata } from '../types';
import { RenderingType } from '../types';

export class JSONVisualFormatter extends BaseFormatter {
  id = 'json-visual-formatter';
  name = 'JSON Visual Formatter';
  description = 'Formats JSON data with visual rendering using json-beautiful-render';
  priority = 20; // Higher priority than plain JSON formatter for visual contexts
  
  supportedTypes = ['application/json'];
  supportedTools?: RegExp[] = [];

  canFormat(data: any, context?: FormatContext): boolean {
    if (!data) {
      return false;
    }
    
    // Check if data is JSON-like
    if (typeof data === 'string') {
      try {
        JSON.parse(data);
        return true;
      } catch {
        return false;
      }
    }
    
    // Check if data is an object (including arrays)
    if (typeof data === 'object') {
      return true;
    }
    
    return false;
  }

  getConfidence(data: any, context?: FormatContext): number {
    let confidence = 0.4;
    
    // Boost confidence for valid JSON strings
    if (typeof data === 'string') {
      try {
        JSON.parse(data);
        confidence += 0.3;
      } catch {
        // Not valid JSON
      }
    }
    
    // Boost confidence for objects
    if (typeof data === 'object' && data !== null) {
      confidence += 0.2;
    }
    
    // Boost confidence if context prefers visual rendering
    const userPreferences = context?.userPreferences;
    if (userPreferences?.format === 'html') {
      confidence += 0.1;
    }
    
    // Boost confidence for complex JSON structures that benefit from visual rendering
    if (this.isComplexJson(data)) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  format(data: any, context?: FormatContext): string {
    this.logActivity('Formatting JSON data for visual rendering', { dataType: typeof data });
    
    let parsedData: any;
    
    // Parse if data is a string
    if (typeof data === 'string') {
      try {
        parsedData = JSON.parse(data);
      } catch (error) {
        // If not valid JSON, return as plain text
        return `**Invalid JSON Data**\n\n\`\`\`\n${data.substring(0, 500)}${data.length > 500 ? '...' : ''}\n\`\`\``;
      }
    } else {
      parsedData = data;
    }
    
    // Create visual rendering metadata for summary
    const summary = this.createJsonSummary(parsedData);
    
    // Encode data for the visual renderer marker
    // We use btoa for base64 encoding as expected by MessageContentRenderer
    let encodedData = '';
    try {
      encodedData = btoa(JSON.stringify(parsedData));
    } catch (e) {
      console.error('Failed to encode JSON for visual rendering:', e);
      return `${summary}\n\n*(Error: Could not encode data for visual rendering)*`;
    }

    return `${summary}\n\n<!-- JSON_RENDERER_START:${encodedData} -->\n<!-- JSON_RENDERER_END -->`;
  }

  /**
   * Check if JSON is complex enough to benefit from visual rendering
   */
  private isComplexJson(data: any): boolean {
    if (!data || typeof data !== 'object') {
      return false;
    }
    
    const jsonString = JSON.stringify(data);
    
    // Check size
    if (jsonString.length > 500) {
      return true;
    }
    
    // Check depth
    const maxDepth = this.getJsonDepth(data);
    if (maxDepth > 3) {
      return true;
    }
    
    // Check if it has nested objects or arrays
    if (typeof data === 'object') {
      if (Array.isArray(data)) {
        return data.length > 5 || data.some(item => typeof item === 'object');
      } else {
        const keys = Object.keys(data);
        return keys.length > 5 || Object.values(data).some(value => typeof value === 'object');
      }
    }
    
    return false;
  }

  /**
   * Get maximum depth of JSON structure
   */
  private getJsonDepth(obj: any, currentDepth: number = 0): number {
    if (!obj || typeof obj !== 'object') {
      return currentDepth;
    }
    
    let maxDepth = currentDepth;
    
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const depth = this.getJsonDepth(item, currentDepth + 1);
        maxDepth = Math.max(maxDepth, depth);
      }
    } else {
      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const depth = this.getJsonDepth(obj[key], currentDepth + 1);
          maxDepth = Math.max(maxDepth, depth);
        }
      }
    }
    
    return maxDepth;
  }

  /**
   * Get options for visual rendering
   */
  private getVisualRenderingOptions(context?: FormatContext): Record<string, any> {
    const options: Record<string, any> = {
      showControls: true,
      maxHeight: '400px'
    };
    
    // Apply user preferences
    const userPreferences = context?.userPreferences;
    if (userPreferences) {
      if (userPreferences.detailLevel === 'minimal') {
        options.showControls = false;
        options.maxHeight = '200px';
      } else if (userPreferences.detailLevel === 'detailed') {
        options.maxHeight = '600px';
      }
    }
    
    // Apply device-specific options
    const deviceType = context?.deviceType;
    if (deviceType === 'mobile') {
      options.maxHeight = '300px';
    }
    
    return options;
  }

  /**
   * Create JSON summary for text output
   */
  private createJsonSummary(data: any): string {
    if (!data || typeof data !== 'object') {
      return 'Empty data';
    }
    
    const isArray = Array.isArray(data);
    const size = isArray ? data.length : Object.keys(data).length;
    const jsonString = JSON.stringify(data);
    
    let summary = `**JSON ${isArray ? 'Array' : 'Object'}**\n\n`;
    summary += `• **Type:** ${isArray ? 'Array' : 'Object'}\n`;
    summary += `• **Size:** ${size} ${isArray ? 'items' : 'properties'}\n`;
    summary += `• **Data size:** ${jsonString.length} characters\n`;
    
    if (isArray) {
      if (data.length > 0) {
        const firstItem = data[0];
        const firstItemType = typeof firstItem;
        
        summary += `• **First item type:** ${firstItemType}\n`;
        
        if (firstItemType === 'object') {
          const keys = Object.keys(firstItem);
          summary += `• **First item keys:** ${keys.slice(0, 3).join(', ')}${keys.length > 3 ? `... (${keys.length} total)` : ''}\n`;
        }
      }
    } else {
      const keys = Object.keys(data);
      if (keys.length > 0) {
        summary += `• **Properties:** ${keys.slice(0, 5).join(', ')}${keys.length > 5 ? `... (${keys.length} total)` : ''}\n`;
      }
    }
    
    return summary;
  }
}

export default JSONVisualFormatter;