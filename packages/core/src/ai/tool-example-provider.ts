/**
 * Tool Example Provider
 *
 * Reads tool usage examples from Tool.examples field (provided in mcp.json by tool authors)
 * and formats them as prompt content for LLM tool selection.
 *
 * This replaces hardcoded examples in buildToolSelectionPrompt with
 * dynamically loaded examples from the actual available tools.
 */

import { logger } from '../core/logger';
import type { Tool, ToolExample } from '../mcp/types';

// ==================== Type Definitions ====================

export interface FormattedExample {
  description: string;
  toolName: string;
  arguments: Record<string, any>;
}

export interface ExampleFormatOptions {
  /** Maximum number of examples to include in prompt */
  maxExamples?: number;
  /** Whether to include multilingual examples */
  includeMultilingual?: boolean;
}

// ==================== Main Provider Class ====================

export class ToolExampleProvider {
  /**
   * Collect all examples from available tools
   * Each tool may have multiple examples in its examples array
   */
  static collectExamples(tools: Tool[]): FormattedExample[] {
    if (!tools || tools.length === 0) {
      return [];
    }

    const examples: FormattedExample[] = [];

    for (const tool of tools) {
      if (tool.examples && Array.isArray(tool.examples) && tool.examples.length > 0) {
        for (const example of tool.examples) {
          examples.push({
            description: example.description,
            toolName: tool.name,
            arguments: example.input,
          });
        }
      }
    }

    return examples;
  }

  /**
   * Select representative examples, preferring tools with examples
   * and limiting to maxExamples count
   */
  static selectExamples(
    examples: FormattedExample[],
    maxExamples: number = 4,
  ): FormattedExample[] {
    if (examples.length <= maxExamples) {
      return examples;
    }

    // Try to pick examples from different tools for diversity
    const toolGroups = new Map<string, FormattedExample[]>();
    for (const example of examples) {
      const group = toolGroups.get(example.toolName) || [];
      group.push(example);
      toolGroups.set(example.toolName, group);
    }

    const selected: FormattedExample[] = [];
    const toolNames = Array.from(toolGroups.keys());

    // Round-robin selection from different tools
    let toolIndex = 0;
    while (selected.length < maxExamples) {
      const toolName = toolNames[toolIndex % toolNames.length];
      const group = toolGroups.get(toolName)!;
      const remaining = group.filter(e => !selected.includes(e));

      if (remaining.length > 0) {
        selected.push(remaining[0]);
      }

      toolIndex++;
      if (toolIndex >= toolNames.length * Math.max(...Array.from(toolGroups.values()).map(g => g.length))) {
        break; // Safety: prevent infinite loop
      }
    }

    return selected.slice(0, maxExamples);
  }

  /**
   * Format examples as prompt string for LLM
   */
  static formatExamplesAsPromptString(
    examples: FormattedExample[],
  ): string {
    if (examples.length === 0) {
      return '';
    }

    const parts: string[] = [];

    examples.forEach((example, index) => {
      const argsStr = Object.keys(example.arguments).length > 0
        ? JSON.stringify(example.arguments, null, 2)
        : '{}';

      parts.push(`Example ${index + 1}: ${example.description}
Selected Tool: ${example.toolName}
Arguments:
${argsStr}`);
    });

    return parts.join('\n\n');
  }

  /**
   * Generate the complete examples section for the tool selection prompt
   * Returns empty string if no examples available
   */
  static generateExamplesSection(
    tools: Tool[],
    maxExamples: number = 4,
  ): string {
    const allExamples = ToolExampleProvider.collectExamples(tools);

    if (allExamples.length === 0) {
      return '';
    }

    const selectedExamples = ToolExampleProvider.selectExamples(allExamples, maxExamples);
    return ToolExampleProvider.formatExamplesAsPromptString(selectedExamples);
  }

  /**
   * Check if any tools have examples
   */
  static hasExamples(tools: Tool[]): boolean {
    if (!tools || tools.length === 0) return false;
    return tools.some(tool => tool.examples && tool.examples.length > 0);
  }

  /**
   * Get example count statistics
   */
  static getExampleStats(tools: Tool[]): { totalExamples: number; toolsWithExamples: number; totalTools: number } {
    const totalTools = tools.length;
    const toolsWithExamples = tools.filter(t => t.examples && t.examples.length > 0).length;
    const totalExamples = tools.reduce((sum, t) => sum + (t.examples?.length || 0), 0);

    return { totalExamples, toolsWithExamples, totalTools };
  }
}
