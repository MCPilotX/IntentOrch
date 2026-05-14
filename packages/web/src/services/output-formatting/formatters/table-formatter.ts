/**
 * Table Formatter
 * 
 * Formats table-like data into readable tables
 */

import { BaseFormatter } from './base-formatter';
import type { FormatContext } from '../types';

export class TableFormatter extends BaseFormatter {
  id = 'table-formatter';
  name = 'Table Formatter';
  description = 'Formats table-like data into readable tables';
  priority = 60;
  
  supportedTypes = ['text/plain', 'text/csv'];
  supportedTools = [/table/i, /csv/i, /data/i];

  canFormat(data: any, context?: FormatContext): boolean {
    if (!data) {
      return false;
    }
    
    // Check if data is a string that looks like a table
    if (typeof data === 'string') {
      return this.isTableLike(data);
    }
    
    // Check if data is an array of objects (tabular data)
    if (Array.isArray(data) && data.length > 0) {
      const firstItem = data[0];
      return typeof firstItem === 'object' && firstItem !== null;
    }
    
    return false;
  }

  getConfidence(data: any, context?: FormatContext): number {
    let confidence = 0.3;
    
    // Boost confidence for table-like strings
    if (typeof data === 'string' && this.isTableLike(data)) {
      confidence += 0.4;
    }
    
    // Boost confidence for array of objects
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
      confidence += 0.3;
    }
    
    // Boost confidence if tool name suggests table data
    const toolName = this.getToolName(context);
    if (toolName && this.matchesToolPattern(toolName)) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 1.0);
  }

  format(data: any, context?: FormatContext): string {
    this.logActivity('Formatting table data', { dataType: typeof data });
    
    if (typeof data === 'string') {
      return this.formatTableString(data, context);
    }
    
    if (Array.isArray(data)) {
      return this.formatArrayTable(data, context);
    }
    
    // Fallback
    return `**Table Data**\n\n${JSON.stringify(data, null, 2)}`;
  }

  /**
   * Check if string looks like a table
   */
  private isTableLike(text: string): boolean {
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length < 2) {
      return false;
    }
    
    // Check for pipe tables (Markdown)
    const hasPipeTable = lines.some(line => line.includes('|') && line.trim().startsWith('|'));
    if (hasPipeTable) {
      return true;
    }
    
    // Check for CSV-like data
    const firstLine = lines[0];
    const commaCount = (firstLine.match(/,/g) || []).length;
    const tabCount = (firstLine.match(/\t/g) || []).length;
    
    if (commaCount > 1 || tabCount > 1) {
      return true;
    }
    
    // Check for fixed-width columns (multiple spaces)
    const spaceGroups = firstLine.split(/\s{2,}/).filter(group => group.trim());
    if (spaceGroups.length > 2) {
      return true;
    }
    
    return false;
  }

  /**
   * Format table string
   */
  private formatTableString(text: string, context?: FormatContext): string {
    const lines = text.split('\n').filter(line => line.trim());
    
    if (lines.length === 0) {
      return 'Empty table data';
    }
    
    // Try to detect table type
    if (lines[0].includes('|')) {
      return this.formatPipeTable(lines);
    }
    
    if (lines[0].includes(',')) {
      return this.formatCsvTable(lines);
    }
    
    if (lines[0].includes('\t')) {
      return this.formatTsvTable(lines);
    }
    
    // Assume fixed-width columns
    return this.formatFixedWidthTable(lines);
  }

  /**
   * Format pipe table (Markdown)
   */
  private formatPipeTable(lines: string[]): string {
    let formatted = `**Table Data** (${lines.length} rows)\n\n`;
    
    // Add the table as-is
    formatted += lines.join('\n');
    formatted += '\n';
    
    return formatted;
  }

  /**
   * Format CSV table
   */
  private formatCsvTable(lines: string[]): string {
    const rows = lines.map(line => line.split(',').map(cell => cell.trim()));
    
    if (rows.length === 0) {
      return 'Empty CSV data';
    }
    
    const columnCount = rows[0].length;
    let formatted = `**CSV Data** (${rows.length} rows × ${columnCount} columns)\n\n`;
    
    // Convert to Markdown table
    formatted += '| ' + rows[0].join(' | ') + ' |\n';
    formatted += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    
    const displayRows = Math.min(rows.length, 20);
    for (let i = 1; i < displayRows; i++) {
      formatted += '| ' + rows[i].join(' | ') + ' |\n';
    }
    
    if (rows.length > displayRows) {
      formatted += `\n*... and ${rows.length - displayRows} more rows*\n`;
    }
    
    return formatted;
  }

  /**
   * Format TSV table
   */
  private formatTsvTable(lines: string[]): string {
    const rows = lines.map(line => line.split('\t').map(cell => cell.trim()));
    
    if (rows.length === 0) {
      return 'Empty TSV data';
    }
    
    const columnCount = rows[0].length;
    let formatted = `**TSV Data** (${rows.length} rows × ${columnCount} columns)\n\n`;
    
    // Convert to Markdown table
    formatted += '| ' + rows[0].join(' | ') + ' |\n';
    formatted += '| ' + rows[0].map(() => '---').join(' | ') + ' |\n';
    
    const displayRows = Math.min(rows.length, 20);
    for (let i = 1; i < displayRows; i++) {
      formatted += '| ' + rows[i].join(' | ') + ' |\n';
    }
    
    if (rows.length > displayRows) {
      formatted += `\n*... and ${rows.length - displayRows} more rows*\n`;
    }
    
    return formatted;
  }

  /**
   * Format fixed-width table
   */
  private formatFixedWidthTable(lines: string[]): string {
    let formatted = `**Table Data** (${lines.length} rows)\n\n`;
    
    // Fixed-width is hard to convert to MD table without knowing column widths
    // So we keep it as a code block but ensure it's marked as text
    const displayLines = Math.min(lines.length, 10);
    formatted += '```text\n';
    for (let i = 0; i < displayLines; i++) {
      formatted += lines[i] + '\n';
    }
    if (lines.length > displayLines) {
      formatted += `... ${lines.length - displayLines} more lines\n`;
    }
    formatted += '```\n';
    
    return formatted;
  }

  /**
   * Format array of objects as table
   */
  private formatArrayTable(data: any[], context?: FormatContext): string {
    if (data.length === 0) {
      return 'Empty table data';
    }
    
    const firstItem = data[0];
    const columns = Object.keys(firstItem);
    const columnCount = columns.length;
    
    let formatted = `**Table Data** (${data.length} rows × ${columnCount} columns)\n\n`;
    
    // Create markdown table
    formatted += '| ' + columns.join(' | ') + ' |\n';
    formatted += '| ' + columns.map(() => '---').join(' | ') + ' |\n';
    
    const displayRows = Math.min(data.length, 6);
    for (let i = 0; i < displayRows; i++) {
      const row = data[i];
      const cells = columns.map(col => {
        const value = row[col];
        if (value === null || value === undefined) {
          return '';
        }
        return String(value).substring(0, 30).replace(/\n/g, ' ');
      });
      formatted += '| ' + cells.join(' | ') + ' |\n';
    }
    
    if (data.length > displayRows) {
      formatted += `| ... ${data.length - displayRows} more rows |\n`;
    }
    
    // Add column descriptions
    formatted += `\n**Columns:** ${columns.join(', ')}\n`;
    
    return formatted;
  }
}

export default TableFormatter;