/**
 * Cloud LLM Intent Engine
 * Cloud LLM-based intent parsing and MCP capability auto-mapping engine
 *
 * Core capabilities:
 * 1. Plan: Generate a tool execution plan (DAG) from a user query using LLM function calling
 * 2. Confirm: Validate and confirm the plan with user interaction
 * 3. Execute: Execute steps in dependency order with variable substitution
 *
 * This replaces the old parseIntent + selectTools + executeWorkflowWithTracking pipeline.
 * - Old: 2 LLM calls (text prompt parseIntent + text prompt selectTools) + 5-layer fallback
 * - New: 1 LLM call (function calling) directly generates the plan with tool + params
 */

import { logger } from '../core/logger';
import { LLMClient, getLLMClient } from './llm-client';
import type { AIConfig } from '../core/types';
import type { Tool } from '../mcp/types';
import { ParameterMapper, ValidationLevel } from '../mcp/parameter-mapper';

// ==================== Plan-then-Execute Types ====================

/**
 * A single step in a tool execution plan
 */
export interface PlanStep {
  /** Unique step ID (e.g., "step_1", "step_2") */
  id: string;
  /** Tool name to execute */
  toolName: string;
  /** Human-readable description of what this step does */
  description: string;
  /** Parameters for the tool call */
  arguments: Record<string, any>;
  /** IDs of steps that this step depends on */
  dependsOn: string[];
}

/**
 * A complete tool execution plan (DAG)
 */
export interface ToolExecutionPlan {
  /** Unique plan ID */
  id: string;
  /** Original user query */
  query: string;
  /** Steps to execute in order */
  steps: PlanStep[];
  /** Whether the plan was confirmed by the user */
  confirmed: boolean;
  /** Timestamp when the plan was created */
  createdAt: Date;
  /** Timestamp when the plan was confirmed (if confirmed) */
  confirmedAt?: Date;
  /** Human-readable summary of the plan */
  summary: string;
}

/**
 * Plan execution result
 */
export interface PlanExecutionResult {
  /** Whether all steps executed successfully */
  success: boolean;
  /** Plan that was executed */
  plan: ToolExecutionPlan;
  /** Results for each step */
  stepResults: Array<{
    stepId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
    duration: number;
  }>;
  /** Final result (output of the last step) */
  finalResult?: any;
  /** Total execution duration */
  totalDuration: number;
}

/**
 * Plan confirmation callback
 */
export interface PlanConfirmationCallback {
  (plan: ToolExecutionPlan): Promise<{
    confirmed: boolean;
    modifiedPlan?: ToolExecutionPlan;
    feedback?: string;
  }>;
}

// ==================== Configuration Interface ====================

export interface CloudIntentEngineConfig {
  llm: {
    provider: AIConfig['provider'];
    apiKey?: string;
    endpoint?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
    timeout?: number;
    maxRetries?: number;
  };
  execution: {
    maxConcurrentTools?: number;
    timeout?: number;
    retryAttempts?: number;
    retryDelay?: number;
  };
  fallback: {
    enableKeywordMatching?: boolean;
    askUserOnFailure?: boolean;
    defaultTools?: Record<string, string>;
  };
  parameterMapping?: {
    validationLevel?: ValidationLevel;
    enableCompatibilityMappings?: boolean;
    logWarnings?: boolean;
    enforceRequired?: boolean;
  };
}

// ==================== Execution Context ====================

interface ExecutionContext {
  results: Map<string, any>;
  variables: Map<string, any>;
}

// ==================== Function Calling Result Type ====================

/**
 * Result of a function calling query
 */
export interface FunctionCallingResult {
  hasToolCall: boolean;
  toolCalls: Array<{
    toolName: string;
    arguments: Record<string, any>;
  }>;
  raw: any;
  provider: string;
  model: string;
}

// ==================== Main Engine Class ====================

export class CloudIntentEngine {
  private llmClient: LLMClient;
  private config: CloudIntentEngineConfig;
  private availableTools: Tool[] = [];
  private toolCache: Map<string, Tool> = new Map();
  private initialized: boolean = false;

  constructor(config: CloudIntentEngineConfig) {
    this.llmClient = getLLMClient();
    this.config = {
      llm: {
        temperature: 0.1,
        maxTokens: 2048,
        timeout: 30000,
        maxRetries: 3,
        ...config.llm,
        provider: config.llm.provider || 'openai',
      },
      execution: {
        maxConcurrentTools: 10,
        timeout: 60000,
        retryAttempts: 2,
        retryDelay: 1000,
        ...config.execution,
      },
      fallback: {
        enableKeywordMatching: true,
        askUserOnFailure: false,
        defaultTools: {},
        ...config.fallback,
      },
      parameterMapping: config.parameterMapping,
    };

    // Auto-initialize LLM configuration
    this.initialize().catch(error => {
      logger.error(`[CloudIntentEngine] Auto-initialization failed: ${error}`);
    });
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    try {
      // Configure LLM client
      this.llmClient.configure({
        provider: this.config.llm.provider,
        apiKey: this.config.llm.apiKey,
        apiEndpoint: this.config.llm.endpoint,
        model: this.config.llm.model || 'gpt-3.5-turbo',
      });

      // Configure ParameterMapper if configuration is provided
      if (this.config.parameterMapping) {
        const config: any = {};

        if (this.config.parameterMapping.validationLevel !== undefined) {
          config.validationLevel = this.config.parameterMapping.validationLevel;
        }

        if (this.config.parameterMapping.logWarnings !== undefined) {
          config.logWarnings = this.config.parameterMapping.logWarnings;
        }

        if (this.config.parameterMapping.enforceRequired !== undefined) {
          config.enforceRequired = this.config.parameterMapping.enforceRequired;
        }

        ParameterMapper.configure(config);
        logger.debug('[CloudIntentEngine] ParameterMapper configured successfully');
      }

      this.initialized = true;
      logger.debug('[CloudIntentEngine] Engine initialized successfully');
    } catch (error) {
      logger.error(`[CloudIntentEngine] Failed to initialize: ${error}`);
      throw error;
    }
  }

  /**
   * Set available tools list
   */
  setAvailableTools(tools: Tool[]): void {
    this.availableTools = tools;
    this.toolCache.clear();

    // Build tool cache
    tools.forEach(tool => {
      this.toolCache.set(tool.name, tool);
    });

    logger.debug(`[CloudIntentEngine] Set ${tools.length} available tools`);
  }

  // ==================== Helper: Convert MCP Tools to LLM Tools Format ====================

  /**
   * Convert MCP Tool[] to LLM tools format
   */
  private toLLMTools(): Array<{
    type: 'function';
    function: {
      name: string;
      description: string;
      parameters: Record<string, any>;
    };
  }> {
    return this.availableTools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.inputSchema || { type: 'object', properties: {} },
      },
    }));
  }

  /**
   * Parse LLM response tool calls into our format
   */
  private parseToolCalls(response: any): Array<{
    toolName: string;
    arguments: Record<string, any>;
  }> {
    const toolCalls: Array<{
      toolName: string;
      arguments: Record<string, any>;
    }> = [];

    if (!response?.toolCalls || !Array.isArray(response.toolCalls)) {
      return toolCalls;
    }

    for (const tc of response.toolCalls) {
      try {
        const args = typeof tc.function.arguments === 'string'
          ? JSON.parse(tc.function.arguments)
          : tc.function.arguments;
        toolCalls.push({
          toolName: tc.function.name,
          arguments: args || {},
        });
      } catch (e) {
        logger.warn(`[CloudIntentEngine] Failed to parse tool call arguments: ${e}`);
      }
    }

    return toolCalls;
  }

  // ==================== LLM Function Calling (Single Query) ====================

  /**
   * Process a user query using LLM function calling.
   *
   * This is the simplest entry point. It uses LLM's native function calling API
   * to directly select the appropriate tool and extract parameters in a single call.
   *
   * Example:
   *   const result = await engine.processQuery('search for files containing "test"');
   *   // result.toolCalls[0] = { toolName: 'search_files', arguments: { pattern: 'test' } }
   */
  async processQuery(
    query: string,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
      toolChoice?: 'auto' | 'none' | 'required';
    },
  ): Promise<FunctionCallingResult> {
    logger.debug(`[CloudIntentEngine] processQuery called: "${query}"`);

    if (this.availableTools.length === 0) {
      logger.warn('[CloudIntentEngine] No tools available for processQuery');
      return {
        hasToolCall: false,
        toolCalls: [],
        raw: null,
        provider: this.config.llm.provider,
        model: this.config.llm.model || 'unknown',
      };
    }

    try {
      const response = await this.llmClient.chat({
        messages: [
          {
            role: 'system',
            content: options?.systemPrompt || 'You are a helpful assistant. Use the available tools to fulfill the user\'s request. Select the most appropriate tool and extract all parameters from the query.',
          },
          { role: 'user', content: query },
        ],
        tools: this.toLLMTools(),
        toolChoice: options?.toolChoice || 'auto',
        temperature: options?.temperature ?? 0.1,
        maxTokens: options?.maxTokens ?? 2048,
      });

      const toolCalls = this.parseToolCalls(response);

      logger.debug(`[CloudIntentEngine] processQuery result: ${toolCalls.length > 0 ? toolCalls.length + ' tool call(s)' : 'no tool call'}`);

      return {
        hasToolCall: toolCalls.length > 0,
        toolCalls,
        raw: response.raw,
        provider: response.provider,
        model: response.model,
      };
    } catch (error: any) {
      logger.error(`[CloudIntentEngine] processQuery failed: ${error.message}`);
      return {
        hasToolCall: false,
        toolCalls: [],
        raw: null,
        provider: this.config.llm.provider,
        model: this.config.llm.model || 'unknown',
      };
    }
  }

  /**
   * Process a conversation history using LLM function calling (multi-turn).
   *
   * This is used for multi-turn tool calling where the LLM can call tools,
   * see results, and decide if more calls are needed.
   *
   * The conversation history should include system prompt, user messages,
   * and assistant messages with tool results.
   */
  async processQueryWithHistory(
    messages: Array<{ role: string; content: string }>,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      toolChoice?: 'auto' | 'none' | 'required';
    },
  ): Promise<FunctionCallingResult & { text?: string }> {
    logger.debug(`[CloudIntentEngine] processQueryWithHistory called with ${messages.length} messages`);

    if (this.availableTools.length === 0) {
      logger.warn('[CloudIntentEngine] No tools available for processQueryWithHistory');
      return {
        hasToolCall: false,
        toolCalls: [],
        text: '',
        raw: null,
        provider: this.config.llm.provider,
        model: this.config.llm.model || 'unknown',
      };
    }

    try {
      const response = await this.llmClient.chat({
        messages: messages as any,
        tools: this.toLLMTools(),
        toolChoice: options?.toolChoice || 'auto',
        temperature: options?.temperature ?? 0.1,
        maxTokens: options?.maxTokens ?? 2048,
      });

      const toolCalls = this.parseToolCalls(response);

      logger.debug(`[CloudIntentEngine] processQueryWithHistory result: ${toolCalls.length > 0 ? toolCalls.length + ' tool call(s)' : 'no tool call, text response'}`);

      return {
        hasToolCall: toolCalls.length > 0,
        toolCalls,
        text: response.text,
        raw: response.raw,
        provider: response.provider,
        model: response.model,
      };
    } catch (error: any) {
      logger.error(`[CloudIntentEngine] processQueryWithHistory failed: ${error.message}`);
      return {
        hasToolCall: false,
        toolCalls: [],
        text: '',
        raw: null,
        provider: this.config.llm.provider,
        model: this.config.llm.model || 'unknown',
      };
    }
  }

  // ==================== Plan-then-Execute Methods ====================

  /**
   * Step 1: Plan — Generate a tool execution plan (DAG) from a user query.
   *
   * Uses LLM function calling to analyze the query against available MCP tools
   * and generate a structured plan with multiple steps and their dependencies.
   *
   * The plan is returned WITHOUT executing any tools. The caller should:
   * 1. Present the plan to the user for confirmation
   * 2. Call executePlan() with the confirmed plan
   *
   * Example:
   *   const plan = await engine.planQuery('先查上海到北京的高铁，再截图保存');
   *   // plan.steps = [
   *   //   { id: 'step_1', toolName: 'get-tickets', arguments: { from: '上海', to: '北京' }, dependsOn: [] },
   *   //   { id: 'step_2', toolName: 'screenshot', arguments: {}, dependsOn: ['step_1'] },
   *   // ]
   */
  async planQuery(
    query: string,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
      maxTokens?: number;
    },
  ): Promise<ToolExecutionPlan> {
    logger.info(`[CloudIntentEngine] planQuery called: "${query}"`);

    const planId = `plan_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

    if (this.availableTools.length === 0) {
      logger.warn('[CloudIntentEngine] No tools available for planQuery');
      return {
        id: planId,
        query,
        steps: [],
        confirmed: false,
        createdAt: new Date(),
        summary: 'No MCP tools available. Please install MCP services first.',
      };
    }

    const systemPrompt = options?.systemPrompt || this.buildPlanSystemPrompt();

    try {
      // First attempt: try with toolChoice 'auto' (allows LLM to decide)
      let response = await this.llmClient.chat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query },
        ],
        tools: this.toLLMTools(),
        toolChoice: 'auto',
        temperature: options?.temperature ?? 0.2,
        maxTokens: options?.maxTokens ?? 4096,
      });

      let toolCalls = this.parseToolCalls(response);

      // If no tool calls were made, retry with toolChoice 'auto' and lower temperature
      if (toolCalls.length === 0) {
        logger.debug('[CloudIntentEngine] No tool calls in first attempt, retrying with lower temperature');
        response = await this.llmClient.chat({
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: query },
          ],
          tools: this.toLLMTools(),
          toolChoice: 'auto',
          temperature: 0.1,
          maxTokens: options?.maxTokens ?? 4096,
        });
        toolCalls = this.parseToolCalls(response);
      }
      
      // If still no tool calls, try with a more explicit prompt
      if (toolCalls.length === 0) {
        logger.debug('[CloudIntentEngine] No tool calls in second attempt, retrying with explicit prompt');
        response = await this.llmClient.chat({
          messages: [
            { role: 'system', content: systemPrompt + '\n\nYou MUST select one of the available tools above to fulfill the user\'s request. Pick the tool that directly produces the answer.' },
            { role: 'user', content: query },
          ],
          tools: this.toLLMTools(),
          toolChoice: 'auto',
          temperature: 0.1,
          maxTokens: options?.maxTokens ?? 4096,
        });
        toolCalls = this.parseToolCalls(response);
      }
      
      // Convert LLM tool calls into a plan
      // Note: No post-processing needed — LLM function calling already selects the correct tool
      // and extracts the right parameters. We fully trust the LLM's tool selection.
      const steps: PlanStep[] = toolCalls.map((tc, index) => ({
        id: `step_${index + 1}`,
        toolName: tc.toolName,
        description: this.describeToolCall(tc.toolName, tc.arguments),
        arguments: tc.arguments,
        dependsOn: index > 0 ? [`step_${index}`] : [],
      }));

      // Build summary
      const summary = this.buildPlanSummary(query, steps);

      const plan: ToolExecutionPlan = {
        id: planId,
        query,
        steps,
        confirmed: false,
        createdAt: new Date(),
        summary,
      };

      logger.info(`[CloudIntentEngine] planQuery generated ${steps.length} steps: ${summary}`);
      return plan;
    } catch (error: any) {
      logger.error(`[CloudIntentEngine] planQuery failed: ${error.message}`);
      return {
        id: planId,
        query,
        steps: [],
        confirmed: false,
        createdAt: new Date(),
        summary: `Failed to generate plan: ${error.message}`,
      };
    }
  }

  /**
   * Step 2: Confirm — Validate and confirm a tool execution plan.
   *
   * This method:
   * 1. Validates the plan structure (no circular deps, valid tool names, etc.)
   * 2. Calls the confirmation callback for user interaction
   * 3. Returns the confirmed (or modified) plan
   */
  async confirmPlan(
    plan: ToolExecutionPlan,
    confirmationCallback?: PlanConfirmationCallback,
  ): Promise<ToolExecutionPlan> {
    logger.info(`[CloudIntentEngine] confirmPlan called for plan ${plan.id}`);

    // Validate plan structure
    const validationErrors = this.validatePlan(plan);
    if (validationErrors.length > 0) {
      logger.warn(`[CloudIntentEngine] Plan validation failed: ${validationErrors.join('; ')}`);
      return {
        ...plan,
        summary: `Plan validation failed: ${validationErrors.join('; ')}`,
      };
    }

    // If no callback provided, auto-confirm
    if (!confirmationCallback) {
      logger.info('[CloudIntentEngine] No confirmation callback, auto-confirming plan');
      return {
        ...plan,
        confirmed: true,
        confirmedAt: new Date(),
      };
    }

    // Call the confirmation callback
    try {
      const response = await confirmationCallback(plan);

      if (response.confirmed) {
        const confirmedPlan: ToolExecutionPlan = {
          ...(response.modifiedPlan || plan),
          confirmed: true,
          confirmedAt: new Date(),
        };
        logger.info(`[CloudIntentEngine] Plan ${plan.id} confirmed by user`);
        return confirmedPlan;
      } else {
        logger.info(`[CloudIntentEngine] Plan ${plan.id} rejected by user: ${response.feedback || 'no feedback'}`);
        return {
          ...plan,
          confirmed: false,
          summary: `User cancelled the plan: ${response.feedback || 'User did not provide feedback'}`,
        };
      }
    } catch (error: any) {
      logger.error(`[CloudIntentEngine] Confirmation callback failed: ${error.message}`);
      return {
        ...plan,
        confirmed: false,
        summary: `Confirmation process error: ${error.message}`,
      };
    }
  }

  /**
   * Step 3: Execute — Execute a confirmed tool execution plan.
   *
   * Executes steps in dependency order with:
   * - Variable substitution ({{step_1.result}})
   * - Error handling per step
   * - Duration tracking
   */
  async executePlan(
    plan: ToolExecutionPlan,
    toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>,
  ): Promise<PlanExecutionResult> {
    logger.info(`[CloudIntentEngine] executePlan called for plan ${plan.id} with ${plan.steps.length} steps`);

    const startTime = Date.now();

    if (!plan.confirmed) {
      logger.warn('[CloudIntentEngine] Plan not confirmed, refusing to execute');
      return {
        success: false,
        plan,
        stepResults: [],
        totalDuration: 0,
        finalResult: 'Plan has not been confirmed. Call confirmPlan() first.',
      };
    }

    if (plan.steps.length === 0) {
      logger.warn('[CloudIntentEngine] Plan has no steps');
      return {
        success: true,
        plan,
        stepResults: [],
        totalDuration: 0,
        finalResult: 'No steps to execute.',
      };
    }

    // Build execution context for variable substitution
    const context: ExecutionContext = {
      results: new Map(),
      variables: new Map(),
    };

    const stepResults: PlanExecutionResult['stepResults'] = [];

    // Topological sort to determine execution order
    const executionOrder = this.topologicalSortPlan(plan.steps);

    if (!executionOrder) {
      return {
        success: false,
        plan,
        stepResults: [],
        totalDuration: Date.now() - startTime,
        finalResult: 'Circular dependency detected in plan',
      };
    }

    // Execute steps in order
    for (const stepId of executionOrder) {
      const step = plan.steps.find(s => s.id === stepId);
      if (!step) {
        stepResults.push({
          stepId,
          toolName: 'unknown',
          success: false,
          error: `Step ${stepId} not found in plan`,
          duration: 0,
        });
        continue;
      }

      const stepStartTime = Date.now();

      try {
        // Resolve parameters with variable substitution
        const resolvedArgs = this.resolvePlanParameters(step.arguments, context);

        // Execute the tool
        const result = await toolExecutor(step.toolName, resolvedArgs);

        // Store result in context
        context.results.set(step.id, result);

        const duration = Date.now() - stepStartTime;

        stepResults.push({
          stepId: step.id,
          toolName: step.toolName,
          success: true,
          result,
          duration,
        });

        logger.info(`[CloudIntentEngine] Step ${step.id} (${step.toolName}) completed in ${duration}ms`);
      } catch (error: any) {
        const duration = Date.now() - stepStartTime;
        const errorMessage = error.message || String(error);

        stepResults.push({
          stepId: step.id,
          toolName: step.toolName,
          success: false,
          error: errorMessage,
          duration,
        });

        logger.error(`[CloudIntentEngine] Step ${step.id} (${step.toolName}) failed: ${errorMessage}`);

        // Stop execution on first failure
        break;
      }
    }

    const totalDuration = Date.now() - startTime;
    const success = stepResults.every(sr => sr.success);
    const finalResult = success
      ? stepResults[stepResults.length - 1]?.result
      : undefined;

    return {
      success,
      plan,
      stepResults,
      finalResult,
      totalDuration,
    };
  }

  /**
   * Convenience method: Plan → Confirm → Execute in one call.
   *
   * This is the recommended entry point for the Plan-then-Execute flow.
   */
  async planAndExecute(
    query: string,
    confirmationCallback: PlanConfirmationCallback,
    toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>,
    options?: {
      systemPrompt?: string;
      model?: string;
      temperature?: number;
    },
  ): Promise<PlanExecutionResult> {
    logger.info(`[CloudIntentEngine] planAndExecute called: "${query}"`);

    // Step 1: Plan
    const plan = await this.planQuery(query, options);
    if (plan.steps.length === 0) {
      return {
        success: false,
        plan,
        stepResults: [],
        totalDuration: 0,
        finalResult: plan.summary,
      };
    }

    // Step 2: Confirm
    const confirmedPlan = await this.confirmPlan(plan, confirmationCallback);
    if (!confirmedPlan.confirmed) {
      return {
        success: false,
        plan: confirmedPlan,
        stepResults: [],
        totalDuration: 0,
        finalResult: confirmedPlan.summary,
      };
    }

    // Step 3: Execute
    return await this.executePlan(confirmedPlan, toolExecutor);
  }

  // ==================== Plan-then-Execute Private Helpers ====================

  /**
   * Build the system prompt for plan generation
   */
  private buildPlanSystemPrompt(): string {
    return `You are an intelligent tool orchestration planner. Your job is to select the EXACT tool that fulfills the user's request.

AVAILABLE TOOLS:
${this.availableTools.map(t => `- ${t.name}: ${t.description || 'No description'}`).join('\n')}

RULES:
1. Select the tool that DIRECTLY produces the answer the user wants — the tool whose description best matches the user's intent
2. Extract ALL parameters from the user's query and pass them to the tool
3. For simple queries (a single action), use EXACTLY ONE tool call
4. DO NOT call helper/intermediate tools unless the user explicitly asks for them — pick the tool that directly fulfills the request
5. If the user asks for data or information, pick the tool that retrieves that data directly
6. When a user asks to "query" or "search" for something, look for a tool whose name or description contains words like "query", "search", "get", "list", "find" that match the subject of the query

IMPORTANT: Call the tool that directly fulfills the user's request. Each tool call becomes a step in the execution plan.

CRITICAL: Some tools are "helper" or "intermediate" tools that only prepare data for other tools. For example:
- A tool that looks up codes or IDs is a helper tool — it does NOT produce the final answer
- A tool that retrieves the actual data (tickets, files, weather, etc.) is the FINAL tool
- If you need a helper tool AND a final tool, you MUST call BOTH in sequence
- NEVER select a helper tool as the only tool — it won't produce the answer the user wants`;
  }

  /**
   * Build a human-readable summary of the plan
   */
  private buildPlanSummary(query: string, steps: PlanStep[]): string {
    if (steps.length === 0) {
      return 'No execution steps were generated.';
    }

    const stepDescriptions = steps.map((step, i) => {
      const deps = step.dependsOn.length > 0
        ? ` (depends on: ${step.dependsOn.join(', ')})`
        : '';
      return `${i + 1}. ${step.description}${deps}`;
    });

    return `Will execute ${steps.length} steps:\n${stepDescriptions.join('\n')}`;
  }

  /**
   * Describe a tool call in human-readable form
   */
  private describeToolCall(toolName: string, args: Record<string, any>): string {
    const tool = this.toolCache.get(toolName);
    const toolDesc = tool?.description || toolName;

    // Try to extract key parameters for a more descriptive summary
    const keyParams = Object.entries(args)
      .filter(([key]) => !['query', 'text', 'input'].includes(key))
      .slice(0, 3)
      .map(([key, value]) => {
        const strValue = typeof value === 'string' ? value : JSON.stringify(value);
        return `${key}=${strValue}`;
      });

    if (keyParams.length > 0) {
      return `${toolDesc} (${keyParams.join(', ')})`;
    }

    return toolDesc;
  }

  /**
   * Validate a plan's structure
   */
  private validatePlan(plan: ToolExecutionPlan): string[] {
    const errors: string[] = [];

    if (!plan.id) errors.push('Plan ID is required');
    if (!plan.query) errors.push('Plan query is required');

    // Validate each step
    const stepIds = new Set<string>();
    for (const step of plan.steps) {
      if (!step.id) errors.push('Step ID is required');
      if (stepIds.has(step.id)) errors.push(`Duplicate step ID: ${step.id}`);
      stepIds.add(step.id);

      if (!step.toolName) errors.push(`Step ${step.id}: toolName is required`);

      // Validate dependencies reference existing steps
      for (const dep of step.dependsOn) {
        if (!plan.steps.find(s => s.id === dep)) {
          errors.push(`Step ${step.id}: dependency ${dep} not found`);
        }
      }
    }

    return errors;
  }

  /**
   * Topological sort of plan steps
   */
  private topologicalSortPlan(steps: PlanStep[]): string[] | null {
    const visited = new Set<string>();
    const visiting = new Set<string>();
    const order: string[] = [];

    function visit(stepId: string, stepMap: Map<string, PlanStep>): boolean {
      if (visited.has(stepId)) return true;
      if (visiting.has(stepId)) return false; // Circular dependency

      visiting.add(stepId);

      const step = stepMap.get(stepId);
      if (step) {
        for (const dep of step.dependsOn) {
          if (!visit(dep, stepMap)) return false;
        }
      }

      visiting.delete(stepId);
      visited.add(stepId);
      order.push(stepId);
      return true;
    }

    const stepMap = new Map(steps.map(s => [s.id, s]));

    for (const step of steps) {
      if (!visit(step.id, stepMap)) return null; // Circular dependency
    }

    return order;
  }

  /**
   * Resolve plan parameters with variable substitution
   */
  private resolvePlanParameters(
    args: Record<string, any>,
    context: ExecutionContext,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(args)) {
      if (typeof value === 'string') {
        // Replace {{step_X.result}} or {{step_X.result.field}} patterns
        resolved[key] = value.replace(/\{\{step_(\d+)\.result(?:(?:\.(\w+)))?\}\}/g, (match, stepNum, field) => {
          const stepId = `step_${stepNum}`;
          const result = context.results.get(stepId);
          if (result === undefined) return match;
          if (field && result && typeof result === 'object') return result[field] ?? match;
          return result ?? match;
        });
      } else if (Array.isArray(value)) {
        resolved[key] = value.map(v =>
          typeof v === 'string' ? this.resolvePlanParameters({ _: v }, context)._
            : v
        );
      } else if (value && typeof value === 'object') {
        resolved[key] = this.resolvePlanParameters(value, context);
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

}
