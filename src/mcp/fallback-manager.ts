/**
 * Fallback Manager
 * Provides intelligent fallback and degradation mechanisms for tool execution
 */

import { Tool, ToolCall, ToolResult } from './types';
import { toolMappingManager } from '../ai/tool-mappings';

export interface FallbackStrategy {
  name: string;
  description: string;
  priority: number;
  condition: (error: any, toolCall: ToolCall, attemptCount: number) => boolean;
  action: (toolCall: ToolCall, context: FallbackContext) => Promise<FallbackResult>;
}

export interface FallbackContext {
  originalToolCall: ToolCall;
  attemptCount: number;
  errors: any[];
  availableTools: string[];
  toolRegistry: any; // Reference to ToolRegistry
}

export interface FallbackResult {
  success: boolean;
  result?: ToolResult;
  toolCall?: ToolCall;
  strategyUsed: string;
  message: string;
  degraded: boolean;
}

export interface FallbackOptions {
  maxAttempts?: number;
  enableDegradation?: boolean;
  logFallbacks?: boolean;
  timeout?: number;
}

/**
 * Fallback Manager
 * Manages intelligent fallback and degradation strategies
 */
export class FallbackManager {
  private strategies: FallbackStrategy[] = [];
  private options: FallbackOptions;

  constructor(options: FallbackOptions = {}) {
    this.options = {
      maxAttempts: 3,
      enableDegradation: true,
      logFallbacks: true,
      timeout: 30000,
      ...options,
    };

    this.initializeDefaultStrategies();
  }

  /**
   * Initialize default fallback strategies
   */
  private initializeDefaultStrategies(): void {
    // Strategy 1: Try alternative tool names
    this.strategies.push({
      name: 'alternative_tool',
      description: 'Try alternative tool names when primary tool fails',
      priority: 10,
      condition: (error, toolCall, attemptCount) => {
        return error?.message?.includes('not found') || 
               error?.message?.includes('not available') ||
               attemptCount === 1;
      },
      action: async (toolCall, context) => {
        const toolName = toolCall.name;
        
        // Extract intent from tool name (simplified)
        const intent = this.extractIntentFromToolName(toolName);
        if (!intent) {
          return {
            success: false,
            strategyUsed: 'alternative_tool',
            message: 'Cannot extract intent from tool name',
            degraded: false,
          };
        }

        // Find alternative tool
        const alternative = toolMappingManager.findAlternativeTool(
          intent.action,
          intent.target,
          context.availableTools
        );

        if (!alternative) {
          return {
            success: false,
            strategyUsed: 'alternative_tool',
            message: 'No alternative tool found',
            degraded: false,
          };
        }

        // Create new tool call with alternative tool
        const newToolCall: ToolCall = {
          name: alternative.toolName,
          arguments: toolCall.arguments,
        };

        // Map parameters if needed
        const mappedArgs = toolMappingManager.mapParameters(alternative.mapping, toolCall.arguments);
        newToolCall.arguments = mappedArgs;

        if (this.options.logFallbacks) {
          console.log(`Fallback: Using alternative tool "${alternative.toolName}" instead of "${toolName}"`);
        }

        return {
          success: true,
          toolCall: newToolCall,
          strategyUsed: 'alternative_tool',
          message: `Using alternative tool: ${alternative.toolName}`,
          degraded: false,
        };
      },
    });

    // Strategy 2: Simplify parameters
    this.strategies.push({
      name: 'simplify_parameters',
      description: 'Simplify complex parameters when tool execution fails',
      priority: 8,
      condition: (error, toolCall, attemptCount) => {
        return error?.message?.includes('validation') ||
               error?.message?.includes('parameter') ||
               error?.message?.includes('invalid');
      },
      action: async (toolCall, context) => {
        const simplifiedArgs = this.simplifyParameters(toolCall.arguments);
        
        const newToolCall: ToolCall = {
          name: toolCall.name,
          arguments: simplifiedArgs,
        };

        if (this.options.logFallbacks) {
          console.log(`Fallback: Simplified parameters for tool "${toolCall.name}"`);
        }

        return {
          success: true,
          toolCall: newToolCall,
          strategyUsed: 'simplify_parameters',
          message: 'Simplified tool parameters',
          degraded: true,
        };
      },
    });

    // Strategy 3: Retry with timeout
    this.strategies.push({
      name: 'retry_with_timeout',
      description: 'Retry tool execution with increased timeout',
      priority: 6,
      condition: (error, toolCall, attemptCount) => {
        return error?.message?.includes('timeout') ||
               error?.message?.includes('timed out') ||
               (attemptCount < 2 && error?.message?.includes('network'));
      },
      action: async (toolCall, context) => {
        // Add or increase timeout parameter
        const newArgs = { ...toolCall.arguments };
        const currentTimeout = newArgs.timeout || newArgs.Timeout || 5000;
        newArgs.timeout = currentTimeout * 2; // Double the timeout

        const newToolCall: ToolCall = {
          name: toolCall.name,
          arguments: newArgs,
        };

        if (this.options.logFallbacks) {
          console.log(`Fallback: Increased timeout to ${newArgs.timeout}ms for tool "${toolCall.name}"`);
        }

        return {
          success: true,
          toolCall: newToolCall,
          strategyUsed: 'retry_with_timeout',
          message: `Increased timeout to ${newArgs.timeout}ms`,
          degraded: false,
        };
      },
    });

    // Strategy 4: Degrade to simpler operation
    this.strategies.push({
      name: 'degrade_operation',
      description: 'Degrade complex operation to simpler one',
      priority: 4,
      condition: (error, toolCall, attemptCount) => {
        return attemptCount >= 2 && this.options.enableDegradation;
      },
      action: async (toolCall, context) => {
        const degradedToolCall = this.degradeOperation(toolCall);
        
        if (this.options.logFallbacks) {
          console.log(`Fallback: Degraded operation for tool "${toolCall.name}"`);
        }

        return {
          success: true,
          toolCall: degradedToolCall,
          strategyUsed: 'degrade_operation',
          message: 'Degraded to simpler operation',
          degraded: true,
        };
      },
    });

    // Strategy 5: Provide helpful suggestions
    this.strategies.push({
      name: 'provide_suggestions',
      description: 'Provide helpful suggestions when all else fails',
      priority: 2,
      condition: (error, toolCall, attemptCount) => {
        return attemptCount >= this.options.maxAttempts!;
      },
      action: async (toolCall, context) => {
        const suggestions = this.generateSuggestions(toolCall, context.errors);
        
        const result: ToolResult = {
          content: [{
            type: 'text',
            text: `Tool execution failed after ${context.attemptCount} attempts.\n\nSuggestions:\n${suggestions}`,
          }],
          isError: true,
        };

        if (this.options.logFallbacks) {
          console.log(`Fallback: Providing suggestions for failed tool "${toolCall.name}"`);
        }

        return {
          success: false,
          result,
          strategyUsed: 'provide_suggestions',
          message: 'Provided failure suggestions',
          degraded: true,
        };
      },
    });
  }

  /**
   * Extract intent from tool name
   */
  private extractIntentFromToolName(toolName: string): { action: string; target: string } | null {
    // Simple pattern matching for common tool names
    const patterns = [
      { regex: /(list|read|write|create|delete).*(file|directory)/i, action: 'list', target: 'files' },
      { regex: /read.*file/i, action: 'read', target: 'file' },
      { regex: /write.*file/i, action: 'write', target: 'file' },
      { regex: /ping.*host/i, action: 'ping', target: 'network' },
      { regex: /start.*service/i, action: 'start', target: 'process' },
      { regex: /stop.*service/i, action: 'stop', target: 'process' },
      { regex: /status.*service/i, action: 'status', target: 'process' },
    ];

    for (const pattern of patterns) {
      if (pattern.regex.test(toolName)) {
        return { action: pattern.action, target: pattern.target };
      }
    }

    return null;
  }

  /**
   * Simplify complex parameters
   */
  private simplifyParameters(args: Record<string, any>): Record<string, any> {
    const simplified: Record<string, any> = {};

    for (const [key, value] of Object.entries(args)) {
      // Skip complex objects and arrays for simplification
      if (value === null || value === undefined) {
        continue;
      }

      if (typeof value === 'object') {
        if (Array.isArray(value)) {
          // Take first few elements if array is too long
          simplified[key] = value.slice(0, 3);
        } else {
          // For objects, take only simple properties
          const simpleProps: Record<string, any> = {};
          for (const [subKey, subValue] of Object.entries(value)) {
            if (typeof subValue !== 'object' || subValue === null) {
              simpleProps[subKey] = subValue;
            }
          }
          if (Object.keys(simpleProps).length > 0) {
            simplified[key] = simpleProps;
          }
        }
      } else {
        simplified[key] = value;
      }
    }

    return simplified;
  }

  /**
   * Degrade complex operation to simpler one
   */
  private degradeOperation(toolCall: ToolCall): ToolCall {
    const toolName = toolCall.name.toLowerCase();
    const args = toolCall.arguments;

    // Map complex operations to simpler ones
    if (toolName.includes('search') || toolName.includes('filter')) {
      // Degrade search to simple list
      return {
        name: 'filesystem.list_directory',
        arguments: { path: args.path || '.', recursive: false },
      };
    } else if (toolName.includes('analyze') || toolName.includes('process')) {
      // Degrade analysis to simple read
      return {
        name: 'filesystem.read_file',
        arguments: { path: args.path || 'README.md' },
      };
    } else if (toolName.includes('batch') || toolName.includes('multiple')) {
      // Degrade batch operation to single operation
      const singleArgs = { ...args };
      // Remove batch-related parameters
      delete singleArgs.batch;
      delete singleArgs.multiple;
      delete singleArgs.concurrent;
      
      return {
        name: toolCall.name.replace(/batch|multiple|concurrent/gi, '').trim() || toolCall.name,
        arguments: singleArgs,
      };
    }

    // Default: return original with simplified parameters
    return {
      name: toolCall.name,
      arguments: this.simplifyParameters(args),
    };
  }

  /**
   * Execute tool with intelligent fallback mechanisms
   */
  async executeWithFallback(
    toolCall: ToolCall,
    executeFn: (toolCall: ToolCall) => Promise<ToolResult>,
    availableTools: string[] = []
  ): Promise<ToolResult> {
    const context: FallbackContext = {
      originalToolCall: toolCall,
      attemptCount: 0,
      errors: [],
      availableTools,
      toolRegistry: null, // Will be set if needed
    };

    let currentToolCall = { ...toolCall };
    let lastError: any = null;
    let lastResult: ToolResult | null = null;

    // Try primary execution
    try {
      const result = await executeFn(currentToolCall);
      lastResult = result;
      
      if (!result.isError) {
        return result;
      }
      lastError = result.content[0]?.text || 'Tool execution returned error';
      context.errors.push(lastError);
    } catch (error) {
      lastError = error;
      context.errors.push(error);
    }

    context.attemptCount++;

    // Apply fallback strategies in priority order
    const sortedStrategies = this.getSortedStrategies();
    
    for (const strategy of sortedStrategies) {
      if (strategy.condition(lastError, currentToolCall, context.attemptCount)) {
        try {
          const fallbackResult = await strategy.action(currentToolCall, context);
          
          if (fallbackResult.success) {
            if (this.options.logFallbacks) {
              console.log(`Fallback strategy "${strategy.name}" succeeded: ${fallbackResult.message}`);
            }
            
            // Record degradation if applicable
            if (fallbackResult.degraded) {
              console.log(`Operation degraded: ${fallbackResult.message}`);
            }
            
            return fallbackResult.result!;
          } else {
            if (this.options.logFallbacks) {
              console.log(`Fallback strategy "${strategy.name}" failed: ${fallbackResult.message}`);
            }
            lastError = fallbackResult.message;
            context.errors.push(fallbackResult.message);
            
            // Update tool call if strategy modified it
            if (fallbackResult.toolCall) {
              currentToolCall = fallbackResult.toolCall;
            }
          }
        } catch (error) {
          lastError = error;
          context.errors.push(error);
        }
      }
      
      // Check if we've exceeded max attempts
      if (context.attemptCount >= (this.options.maxAttempts || 3)) {
        break;
      }
    }

    // All strategies failed - provide comprehensive suggestions
    return {
      content: [
        {
          type: 'text' as const,
          text: this.generateComprehensiveFailureMessage(context, lastResult),
        },
      ],
      isError: true,
    };
  }

  /**
   * Generate comprehensive failure message
   */
  private generateComprehensiveFailureMessage(context: FallbackContext, lastResult: ToolResult | null): string {
    const errors = context.errors.map((e, i) => `  ${i + 1}. ${e instanceof Error ? e.message : String(e)}`);
    const suggestions = this.generateSuggestions(context.originalToolCall, context.errors);
    
    return `Tool execution failed after ${context.attemptCount} attempts.

Errors encountered:
${errors.join('\n')}

${suggestions}`;
  }

  /**
   * Generate helpful suggestions
   */
  private generateSuggestions(toolCall: ToolCall, errors: any[]): string {
    const suggestions: string[] = [];
    
    // Analyze errors for specific suggestions
    const errorText = errors.map(e => String(e)).join(' ').toLowerCase();
    
    if (errorText.includes('not found') || errorText.includes('not available')) {
      suggestions.push('• Check if the tool is properly registered');
      suggestions.push('• Verify tool name spelling');
      suggestions.push('• Try alternative tool names');
    }
    
    if (errorText.includes('parameter') || errorText.includes('argument')) {
      suggestions.push('• Check parameter names and types');
      suggestions.push('• Provide required parameters');
      suggestions.push('• Simplify complex parameters');
    }
    
    if (errorText.includes('timeout') || errorText.includes('network')) {
      suggestions.push('• Check network connectivity');
      suggestions.push('• Increase timeout value');
      suggestions.push('• Try again later');
    }
    
    if (errorText.includes('permission') || errorText.includes('access')) {
      suggestions.push('• Check file permissions');
      suggestions.push('• Run with appropriate privileges');
      suggestions.push('• Verify access rights');
    }
    
    // General suggestions
    suggestions.push('• Use --help to see tool documentation');
    suggestions.push('• Try a simpler version of the operation');
    suggestions.push('• Check system resources and dependencies');
    
    return `Suggestions:\n${suggestions.join('\n')}`;
  }

  /**
   * Get sorted strategies by priority
   */
  private getSortedStrategies(): FallbackStrategy[] {
    return [...this.strategies].sort((a, b) => b.priority - a.priority);
  }

  /**
   * Add custom fallback strategy
   */
  addStrategy(strategy: FallbackStrategy): void {
    this.strategies.push(strategy);
    // Re-sort strategies by priority
    this.strategies.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Remove fallback strategy by name
   */
  removeStrategy(strategyName: string): boolean {
    const initialLength = this.strategies.length;
    this.strategies = this.strategies.filter(s => s.name !== strategyName);
    return this.strategies.length !== initialLength;
  }

  /**
   * Get all strategies
   */
  getStrategies(): FallbackStrategy[] {
    return [...this.strategies];
  }

  /**
   * Configure fallback options
   */
  configure(options: Partial<FallbackOptions>): void {
    this.options = { ...this.options, ...options };
  }

  /**
   * Get current configuration
   */
  getConfig(): FallbackOptions {
    return { ...this.options };
  }
}

// Default fallback manager instance
export const defaultFallbackManager = new FallbackManager();