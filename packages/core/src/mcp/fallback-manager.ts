/**
 * Fallback Manager
 * Provides intelligent fallback and degradation mechanisms for tool execution
 */

import { ToolCall, ToolResult } from './types';
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
      condition: (error, _toolCall, attemptCount) => {
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
          context.availableTools,
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
      condition: (error, _toolCall, _attemptCount) => {
        return error?.message?.includes('validation') ||
               error?.message?.includes('parameter') ||
               error?.message?.includes('invalid');
      },
      action: async (toolCall, _context) => {
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
      condition: (error, _toolCall, attemptCount) => {
        return error?.message?.includes('timeout') ||
               error?.message?.includes('timed out') ||
               error?.message?.includes('Request timed out') ||
               (attemptCount < 2 && error?.message?.includes('network'));
      },
      action: async (toolCall, _context) => {
        // Add or increase timeout parameter
        const newArgs = { ...toolCall.arguments };
        const currentTimeout = newArgs.timeout || newArgs.Timeout || 5000;
        newArgs.timeout = currentTimeout * 2; // Double the timeout
        // Also update Timeout if it exists
        if (newArgs.Timeout !== undefined) {
          newArgs.Timeout = currentTimeout * 2;
        }

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
      condition: (error, _toolCall, attemptCount) => {
        return (attemptCount >= 2 || error?.message?.includes('Search failed') || error?.message?.includes('Analysis failed')) && this.options.enableDegradation;
      },
      action: async (toolCall, _context) => {
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
      condition: (_error, _toolCall, attemptCount) => {
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
   * Extract intent from tool name using generic patterns
   * This is a more flexible approach that can handle various tool naming conventions
   */
  private extractIntentFromToolName(toolName: string): { action: string; target: string } | null {
    // Convert to lowercase for case-insensitive matching
    const lowerName = toolName.toLowerCase();

    // Generic intent extraction patterns
    // These patterns are designed to be extensible and cover common tool naming conventions

    // Action patterns - extract the main action from tool name
    const actionPatterns = [
      { pattern: /^(get|fetch|retrieve|obtain|acquire)/, action: 'get' },
      { pattern: /^(search|find|lookup|query)/, action: 'search' },
      { pattern: /^(create|make|generate|build)/, action: 'create' },
      { pattern: /^(update|modify|edit|change)/, action: 'update' },
      { pattern: /^(delete|remove|erase|destroy)/, action: 'delete' },
      { pattern: /^(list|show|display|enumerate)/, action: 'list' },
      { pattern: /^(start|launch|initiate|begin)/, action: 'start' },
      { pattern: /^(stop|halt|terminate|end)/, action: 'stop' },
      { pattern: /^(analyze|process|compute|calculate)/, action: 'analyze' },
      { pattern: /^(validate|verify|check|test)/, action: 'validate' },
    ];

    // Target patterns - extract the target/resource from tool name
    const targetPatterns = [
      { pattern: /(ticket|train|flight|bus)/, target: 'tickets' },
      { pattern: /(file|document|text)/, target: 'files' },
      { pattern: /(directory|folder|path)/, target: 'directories' },
      { pattern: /(weather|temperature|forecast)/, target: 'weather' },
      { pattern: /(date|time|calendar|schedule)/, target: 'time' },
      { pattern: /(network|connection|ping|host)/, target: 'network' },
      { pattern: /(process|service|daemon|application)/, target: 'processes' },
      { pattern: /(database|db|table|record)/, target: 'database' },
      { pattern: /(api|endpoint|service|resource)/, target: 'api' },
      { pattern: /(user|account|profile|person)/, target: 'users' },
    ];

    // Extract action
    let extractedAction = 'execute'; // Default action
    for (const { pattern, action } of actionPatterns) {
      if (pattern.test(lowerName)) {
        extractedAction = action;
        break;
      }
    }

    // Extract target
    let extractedTarget = 'resource'; // Default target
    for (const { pattern, target } of targetPatterns) {
      if (pattern.test(lowerName)) {
        extractedTarget = target;
        break;
      }
    }

    // Special handling for common compound patterns
    const compoundPatterns = [
      { regex: /get.*ticket/i, action: 'get', target: 'tickets' },
      { regex: /search.*ticket/i, action: 'search', target: 'tickets' },
      { regex: /query.*ticket/i, action: 'query', target: 'tickets' },
      { regex: /list.*file/i, action: 'list', target: 'files' },
      { regex: /read.*file/i, action: 'read', target: 'file' },
      { regex: /write.*file/i, action: 'write', target: 'file' },
    ];

    for (const { regex, action, target } of compoundPatterns) {
      if (regex.test(toolName)) {
        return { action, target };
      }
    }

    // Fallback to generic extraction
    return { action: extractedAction, target: extractedTarget };
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
   * Degrade complex operation to simpler one using generic patterns
   * This approach is more flexible and can handle various tool types
   */
  private degradeOperation(toolCall: ToolCall): ToolCall {
    const toolName = toolCall.name.toLowerCase();
    const args = toolCall.arguments;

    // Extract intent to guide degradation
    const intent = this.extractIntentFromToolName(toolCall.name);

    // Generic degradation patterns based on intent
    if (intent) {
      const { action, target } = intent;

      // Degrade based on action-target combination
      switch (action) {
        case 'search':
        case 'query':
        case 'find':
          // Degrade search operations to listing
          return this.degradeSearchOperation(toolCall, target);

        case 'analyze':
        case 'process':
        case 'compute':
          // Degrade analysis operations to reading
          return this.degradeAnalysisOperation(toolCall, target);

        case 'batch':
        case 'multiple':
          // Degrade batch operations to single
          return this.degradeBatchOperation(toolCall);

        case 'complex':
        case 'advanced':
          // Degrade complex operations to basic
          return this.degradeComplexOperation(toolCall, target);
      }
    }

    // Generic degradation based on tool name patterns
    // No service-specific logic - works for ANY MCP service
    if (toolName.includes('search') || toolName.includes('filter')) {
      // Generic search degradation
      return {
        name: 'list',
        arguments: { limit: 10, offset: 0 },
      };
    }

    if (toolName.includes('analyze') || toolName.includes('process')) {
      // Generic analysis degradation
      return {
        name: 'read',
        arguments: { format: 'text', limit: 1000 },
      };
    }

    if (toolName.includes('batch') || toolName.includes('multiple')) {
      // Generic batch degradation
      const singleArgs = { ...args };
      // Remove batch-related parameters
      delete singleArgs.batch;
      delete singleArgs.multiple;
      delete singleArgs.concurrent;
      delete singleArgs.parallel;

      return {
        name: toolCall.name.replace(/batch|multiple|concurrent|parallel/gi, '').trim() || toolCall.name,
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
   * Degrade search operation based on target
   */
  private degradeSearchOperation(toolCall: ToolCall, target: string): ToolCall {
    const args = toolCall.arguments;

    switch (target) {
      case 'tickets':
      case 'flights':
      case 'trains':
        // Degrade ticket search to date query
        return {
          name: 'get-current-date',
          arguments: {},
        };

      case 'files':
      case 'documents':
        // Degrade file search to directory listing
        return {
          name: 'filesystem.list_directory',
          arguments: { path: args.path || '.', recursive: false },
        };

      case 'users':
      case 'accounts':
        // Degrade user search to user listing
        return {
          name: 'list-users',
          arguments: { limit: 10 },
        };

      default:
        // Generic search degradation
        return {
          name: 'list',
          arguments: { limit: 10, offset: 0 },
        };
    }
  }

  /**
   * Degrade analysis operation based on target
   */
  private degradeAnalysisOperation(toolCall: ToolCall, target: string): ToolCall {
    const args = toolCall.arguments;

    switch (target) {
      case 'files':
      case 'documents':
        // Degrade file analysis to file reading
        return {
          name: 'filesystem.read_file',
          arguments: { path: args.path || 'README.md' },
        };

      case 'data':
      case 'database':
        // Degrade data analysis to data query
        return {
          name: 'query-data',
          arguments: { query: 'SELECT * FROM data LIMIT 10' },
        };

      default:
        // Generic analysis degradation
        return {
          name: 'read',
          arguments: { format: 'text', limit: 1000 },
        };
    }
  }

  /**
   * Degrade batch operation
   */
  private degradeBatchOperation(toolCall: ToolCall): ToolCall {
    const singleArgs = { ...toolCall.arguments };

    // Remove batch-related parameters
    const batchParams = ['batch', 'multiple', 'concurrent', 'parallel', 'bulk'];
    batchParams.forEach(param => {
      delete singleArgs[param];
      delete singleArgs[param.toLowerCase()];
      delete singleArgs[param.toUpperCase()];
    });

    // Simplify the tool name
    const simplifiedName = toolCall.name.replace(
      /batch|multiple|concurrent|parallel|bulk/gi,
      '',
    ).trim() || toolCall.name;

    return {
      name: simplifiedName,
      arguments: singleArgs,
    };
  }

  /**
   * Degrade complex operation
   */
  private degradeComplexOperation(toolCall: ToolCall, target: string): ToolCall {
    // For complex operations, simplify parameters and potentially change tool
    const simplifiedArgs = this.simplifyParameters(toolCall.arguments);

    // Try to find a simpler tool based on target
    const simplerTools: Record<string, string> = {
      'tickets': 'get-current-date',
      'files': 'filesystem.read_file',
      'database': 'query-data',
      'api': 'http-get',
      'network': 'ping',
      'processes': 'list-processes',
    };

    const simplerTool = simplerTools[target];
    if (simplerTool) {
      return {
        name: simplerTool,
        arguments: simplifiedArgs,
      };
    }

    // Default: keep same tool with simplified parameters
    return {
      name: toolCall.name,
      arguments: simplifiedArgs,
    };
  }

  /**
   * Execute tool with intelligent fallback mechanisms
   */
  async executeWithFallback(
    toolCall: ToolCall,
    executeFn: (toolCall: ToolCall) => Promise<ToolResult>,
    availableTools: string[] = [],
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
      lastError = new Error(result.content[0]?.text || 'Tool execution returned error');
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

            // Update tool call if strategy modified it
            if (fallbackResult.toolCall) {
              currentToolCall = fallbackResult.toolCall;
            }

            // Try execution with the new/modified tool call
            try {
              const result = await executeFn(currentToolCall);
              if (!result.isError) {
                return result;
              }
              lastError = new Error(result.content[0]?.text || 'Tool execution returned error');
              context.errors.push(lastError);
            } catch (error) {
              lastError = error;
              context.errors.push(error);
            }

            context.attemptCount++;
            continue; // Try next strategy
          } else {
            if (this.options.logFallbacks) {
              console.log(`Fallback strategy "${strategy.name}" failed: ${fallbackResult.message}`);
            }
            lastError = fallbackResult.message;
            context.errors.push(fallbackResult.message);

            // Only update tool call if strategy succeeded
            // Don't update for failed strategies

            // Increment attempt count for failed strategy
            context.attemptCount++;
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
  private generateComprehensiveFailureMessage(context: FallbackContext, _lastResult: ToolResult | null): string {
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
  private generateSuggestions(_toolCall: ToolCall, errors: any[]): string {
    const suggestions: string[] = [];

    // Analyze errors for specific suggestions
    const errorText = errors.map(e => String(e)).join(' ').toLowerCase();

    if (errorText.includes('not found') || errorText.includes('not available') || errorText.includes('cannot extract intent')) {
      suggestions.push('• Check if the tool is properly registered');
      suggestions.push('• Verify tool name spelling');
      suggestions.push('• Try alternative tool names');
    }

    if (errorText.includes('parameter') || errorText.includes('argument') || errorText.includes('validation')) {
      suggestions.push('• Check parameter names and types');
      suggestions.push('• Provide required parameters');
      suggestions.push('• Simplify complex parameters');
    }

    if (errorText.includes('timeout') || errorText.includes('timed out') || errorText.includes('network')) {
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
