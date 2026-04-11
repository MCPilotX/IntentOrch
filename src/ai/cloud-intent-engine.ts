/**
 * Cloud LLM Intent Engine
 * Cloud LLM-based intent parsing and MCP capability auto-mapping engine
 *
 * Core capabilities:
 * 1. Decompose natural language instructions into atomic intents (with parameters)
 * 2. Infer dependencies between atomic intents (generate DAG)
 * 3. Select the most appropriate tool from MCP tools for each atomic intent
 * 4. Map intent parameters to tool input parameters
 * 5. Execute tool calls in dependency order
 */

import { logger } from '../core/logger';
import { AI, AIError, type AIConfig } from './ai';
import type { Tool } from '../mcp/types';
import { ParameterMapper, ValidationLevel, type ParameterMappingRule } from '../mcp/parameter-mapper';
import { intentorchDirectiveProcessor, type DirectiveProcessingResult } from './intentorch-directive-processor';

// ==================== Type Definitions ====================

/**
 * Atomic intent
 */
export interface AtomicIntent {
  id: string;           // Unique identifier, e.g., A1, A2
  type: string;         // Short action name, e.g., open_web, search, screenshot
  description: string;  // Human-readable step description
  parameters: Record<string, any>;  // Parameters extracted from instruction
}

/**
 * Dependency edge
 */
export interface DependencyEdge {
  from: string;  // Source intent ID
  to: string;    // Target intent ID
}

/**
 * Intent parsing result
 */
export interface IntentParseResult {
  intents: AtomicIntent[];
  edges: DependencyEdge[];
}

/**
 * Tool selection result
 */
export interface ToolSelectionResult {
  intentId: string;
  toolName: string;
  toolDescription: string;
  mappedParameters: Record<string, any>;
  confidence: number;
  serverId?: string;
  serverName?: string;
}

/**
 * Execution context
 */
export interface ExecutionContext {
  results: Map<string, any>;  // Intent ID -> execution result
  variables: Map<string, any>; // Variable storage
}

/**
 * Enhanced execution step result
 */
export interface EnhancedExecutionStep {
  intentId: string;
  intentDescription: string;
  intentType: string;
  intentParameters: Record<string, any>;
  toolName: string;
  toolDescription: string;
  mappedParameters: Record<string, any>;
  confidence: number;
  success: boolean;
  result?: any;
  error?: string;
  duration?: number;
  startedAt?: Date;
  completedAt?: Date;
}

/**
 * Workflow plan (pre-execution)
 */
export interface WorkflowPlan {
  query: string;
  parsedIntents: AtomicIntent[];
  dependencies: DependencyEdge[];
  toolSelections: ToolSelectionResult[];
  executionOrder: string[];
  estimatedSteps: number;
  createdAt: Date;
}

/**
 * Enhanced execution result
 */
export interface EnhancedExecutionResult {
  success: boolean;
  finalResult?: any;

  // Parsing phase information
  parsedIntents: AtomicIntent[];
  dependencies: DependencyEdge[];

  // Tool selection information
  toolSelections: ToolSelectionResult[];

  // Execution results
  executionSteps: EnhancedExecutionStep[];

  // Statistics
  statistics: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    totalDuration: number;
    averageStepDuration: number;
    llmCalls: number;
    parsingTime?: number;
    toolSelectionTime?: number;
    executionTime?: number;
  };
}

/**
 * Execution result (legacy)
 */
export interface ExecutionResult {
  success: boolean;
  finalResult?: any;
  stepResults: Array<{
    intentId: string;
    toolName: string;
    success: boolean;
    result?: any;
    error?: string;
  }>;
}

// ==================== Interactive Feedback Types ====================

/**
 * User confirmation option
 */
export interface ConfirmationOption {
  id: string;
  description: string;
  suggestedAction: 'proceed' | 'reparse' | 'abort' | 'modify';
  confidence?: number;
  parsedIntents?: AtomicIntent[];
  reason?: string;
}

/**
 * User confirmation request
 */
export interface UserConfirmationRequest {
  query: string;
  parsedIntents: AtomicIntent[];
  confidence: number;
  reason: string;
  options: ConfirmationOption[];
  analysis?: {
    isLikelySimpleQuery: boolean;
    hasMultipleActions: boolean;
    hasTemporalMarkers: boolean;
    likelySingleToolMatch: string | null;
    complexityScore: number;
  };
  timestamp: Date;
}

/**
 * User confirmation response
 */
export interface UserConfirmationResponse {
  selectedOptionId: string;
  feedback?: string;
  timestamp: Date;
  userModifiedIntents?: AtomicIntent[]; // Optional: user can modify intents
}

/**
 * Feedback learning record
 */
export interface FeedbackLearningRecord {
  query: string;
  originalIntents: AtomicIntent[];
  userResponse: UserConfirmationResponse;
  confidence: number;
  success: boolean;
  timestamp: Date;
  learnedPattern?: string;
}

/**
 * Confirmation configuration
 */
export interface ConfirmationConfig {
  enabled: boolean;
  confidenceThreshold: number; // Below this threshold, confirmation is required
  autoProceedThreshold: number; // Above this threshold, auto proceed
  maxOptions: number;
  learnFromFeedback: boolean;
  feedbackHistorySize: number;
}

/**
 * Parse intent options with confirmation support
 */
export interface ParseIntentOptions {
  requireConfirmation?: boolean;
  confirmationCallback?: (request: UserConfirmationRequest) => Promise<UserConfirmationResponse>;
  autoProceedOnHighConfidence?: boolean;
  learningEnabled?: boolean;
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
    defaultTools?: Record<string, string>;  // Intent type -> default tool name
  };
  parameterMapping?: {
    validationLevel?: ValidationLevel;
    enableCompatibilityMappings?: boolean;
    logWarnings?: boolean;
    enforceRequired?: boolean;
  };
}

// ==================== Main Engine Class ====================

export class CloudIntentEngine {
  private ai: AI;
  private config: CloudIntentEngineConfig;
  private availableTools: Tool[] = [];
  private toolCache: Map<string, Tool> = new Map();

  constructor(config: CloudIntentEngineConfig) {
    this.config = {
      llm: {
        provider: 'openai',
        temperature: 0.1,
        maxTokens: 2048,
        timeout: 30000,
        maxRetries: 3,
        ...config.llm,
      },
      execution: {
        maxConcurrentTools: 10, // Increased from 3 to allow more concurrent tools
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
    };

    this.ai = new AI();
  }

  /**
   * Initialize the engine
   */
  async initialize(): Promise<void> {
    try {
      // Configure AI service
      await this.ai.configure({
        provider: this.config.llm.provider,
        apiKey: this.config.llm.apiKey,
        endpoint: this.config.llm.endpoint,
        model: this.config.llm.model,
      });

      // Configure ParameterMapper if configuration is provided
      if (this.config.parameterMapping) {
        ParameterMapper.configure({
          validationLevel: this.config.parameterMapping.validationLevel,
          logWarnings: this.config.parameterMapping.logWarnings !== false,
          enforceRequired: this.config.parameterMapping.enforceRequired !== false,
        });
        logger.info('[CloudIntentEngine] ParameterMapper configured successfully');
      }

      logger.info('[CloudIntentEngine] Engine initialized successfully');
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

    logger.info(`[CloudIntentEngine] Set ${tools.length} available tools`);
  }

  /**
   * Parse natural language instruction into atomic intents and dependencies
   * Enhanced with minimal decomposition principle and confidence assessment
   */
  async parseIntent(query: string): Promise<IntentParseResult>;
  
  /**
   * Parse natural language instruction with interactive feedback confirmation
   */
  async parseIntent(query: string, options?: ParseIntentOptions): Promise<IntentParseResult>;
  
  async parseIntent(query: string, options?: ParseIntentOptions): Promise<IntentParseResult> {
    logger.info(`[CloudIntentEngine] Parsing intent: "${query}"`);

    try {
      // Step 1: Process @intentorch directives
      const directiveResult = intentorchDirectiveProcessor.processQuery(query);

      // Step 2: Pre-analyze query for minimal decomposition
      const preAnalysis = this.preAnalyzeQuery(directiveResult.cleanedQuery);
      
      // Step 3: Parse cleaned query with LLM (using enhanced prompt)
      const prompt = this.buildIntentParsePrompt(directiveResult.cleanedQuery);
      const llmResponse = await this.callLLM(prompt, {
        temperature: 0.1,
        maxTokens: 1024,
      });

      // Step 4: Parse LLM response
      const baseResult = this.parseIntentResponse(llmResponse);

      // Step 5: Apply minimal decomposition correction if needed
      const correctedResult = this.applyMinimalDecompositionCorrection(
        baseResult, 
        directiveResult.cleanedQuery,
        preAnalysis
      );

      // Step 6: Assess confidence and log analysis
      const confidence = this.assessParsingConfidence(correctedResult, directiveResult.cleanedQuery);
      logger.info(`[CloudIntentEngine] Parsed ${correctedResult.intents.length} intents with ${correctedResult.edges.length} dependencies (confidence: ${confidence.toFixed(2)})`);

      // Step 7: Enhance workflow with @intentorch directives if present
      let finalResult: IntentParseResult;
      if (directiveResult.hasDirectives) {
        logger.info(`[CloudIntentEngine] Enhancing workflow with ${directiveResult.directives.length} @intentorch directives`);
        finalResult = intentorchDirectiveProcessor.enhanceWorkflowWithDirectives(
          correctedResult,
          directiveResult.directives,
        );
      } else {
        finalResult = correctedResult;
      }

      // Step 8: Check if interactive feedback confirmation is needed
      if (options?.confirmationCallback && this.shouldRequestConfirmation(confidence, options)) {
        logger.info(`[CloudIntentEngine] Low confidence (${confidence.toFixed(2)}), requesting user confirmation`);
        
        const confirmationRequest = this.buildConfirmationRequest(
          query,
          finalResult,
          confidence,
          preAnalysis,
          options
        );
        
        const userResponse = await options.confirmationCallback(confirmationRequest);
        
        // Handle user response
        return this.handleConfirmationResponse(userResponse, finalResult, query, preAnalysis);
      }

      // Step 9: Log final result with confidence
      if (directiveResult.hasDirectives) {
        logger.info(`[CloudIntentEngine] Includes ${directiveResult.directives.length} AI summary steps from @intentorch directives`);
      }

      // Step 10: Log decomposition decision for debugging
      this.logDecompositionDecision(
        directiveResult.cleanedQuery,
        baseResult.intents.length,
        correctedResult.intents.length,
        confidence
      );

      // Step 11: Record feedback for learning if enabled
      if (options?.learningEnabled !== false) {
        this.recordFeedbackForLearning(query, finalResult, confidence, null, true);
      }

      return finalResult;
    } catch (error) {
      logger.error(`[CloudIntentEngine] Intent parsing failed: ${error}`);

      // Fallback: use simple rule-based parsing
      return this.fallbackIntentParse(query);
    }
  }

  /**
   * Select the most appropriate tool for each intent
   */
  async selectTools(intents: AtomicIntent[]): Promise<ToolSelectionResult[]> {
    logger.info(`[CloudIntentEngine] Selecting tools for ${intents.length} intents`);

    const results: ToolSelectionResult[] = [];

    // Process intents in parallel (limited by concurrency)
    const batchSize = this.config.execution.maxConcurrentTools || 3;
    for (let i = 0; i < intents.length; i += batchSize) {
      const batch = intents.slice(i, i + batchSize);
      const batchPromises = batch.map(intent => this.selectToolForIntent(intent));
      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    // Count selection results
    const successfulSelections = results.filter(r => r.confidence > 0.5).length;
    logger.info(`[CloudIntentEngine] Tool selection completed: ${successfulSelections}/${intents.length} successful`);

    return results;
  }

  /**
   * Execute workflow
   */
  async executeWorkflow(
    intents: AtomicIntent[],
    toolSelections: ToolSelectionResult[],
    edges: DependencyEdge[],
    toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>,
  ): Promise<ExecutionResult> {
    logger.info(`[CloudIntentEngine] Executing workflow with ${intents.length} steps`);

    const context: ExecutionContext = {
      results: new Map(),
      variables: new Map(),
    };

    const stepResults: ExecutionResult['stepResults'] = [];

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(intents, edges);

    // Topological sort
    const executionOrder = this.topologicalSort(dependencyGraph);

    if (!executionOrder) {
      return {
        success: false,
        stepResults: [],
        finalResult: 'Circular dependency detected in workflow',
      };
    }

    // Execute in order
    for (const intentId of executionOrder) {
      const intent = intents.find(i => i.id === intentId);
      const toolSelection = toolSelections.find(s => s.intentId === intentId);

      if (!intent || !toolSelection) {
        stepResults.push({
          intentId,
          toolName: 'unknown',
          success: false,
          error: 'Intent or tool selection not found',
        });
        continue;
      }

      try {
        // Prepare parameters (support variable substitution)
        const resolvedParams = this.resolveParameters(
          toolSelection.mappedParameters,
          context,
        );

        // Execute tool
        const result = await toolExecutor(toolSelection.toolName, resolvedParams);

        // Save result to context
        context.results.set(intentId, result);

        stepResults.push({
          intentId,
          toolName: toolSelection.toolName,
          success: true,
          result,
        });

        logger.info(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) completed successfully`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        stepResults.push({
          intentId,
          toolName: toolSelection.toolName,
          success: false,
          error: errorMessage,
        });

        logger.error(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) failed: ${errorMessage}`);

        // Decide whether to continue based on configuration
        if (this.config.execution.retryAttempts) {
          // Retry logic can be added here
        }
      }
    }

    // Calculate final result
    const success = stepResults.every(step => step.success);
    const finalResult = success ? context.results.get(executionOrder[executionOrder.length - 1]) : undefined;

    return {
      success,
      finalResult,
      stepResults,
    };
  }

  /**
   * Parse and plan workflow (without execution)
   */
  async parseAndPlan(query: string): Promise<WorkflowPlan> {
    logger.info(`[CloudIntentEngine] Parsing and planning workflow: "${query}"`);

    const startTime = Date.now();

    try {
      // Parse intent
      const intentResult = await this.parseIntent(query);

      // Select tools
      const toolSelections = await this.selectTools(intentResult.intents);

      // Build dependency graph and get execution order
      const dependencyGraph = this.buildDependencyGraph(intentResult.intents, intentResult.edges);
      const executionOrder = this.topologicalSort(dependencyGraph);

      if (!executionOrder) {
        throw new Error('Circular dependency detected in workflow');
      }

      const plan: WorkflowPlan = {
        query,
        parsedIntents: intentResult.intents,
        dependencies: intentResult.edges,
        toolSelections,
        executionOrder,
        estimatedSteps: intentResult.intents.length,
        createdAt: new Date(),
      };

      const duration = Date.now() - startTime;
      logger.info(`[CloudIntentEngine] Workflow plan created in ${duration}ms with ${intentResult.intents.length} steps`);

      return plan;
    } catch (error) {
      logger.error(`[CloudIntentEngine] Failed to parse and plan workflow: ${error}`);
      throw error;
    }
  }

  /**
   * Execute workflow with enhanced tracking
   */
  async executeWorkflowWithTracking(
    intents: AtomicIntent[],
    toolSelections: ToolSelectionResult[],
    edges: DependencyEdge[],
    toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>,
    callbacks?: {
      onStepStarted?: (step: { intentId: string; toolName: string; intentDescription: string }) => void;
      onStepCompleted?: (step: EnhancedExecutionStep) => void;
      onStepFailed?: (step: EnhancedExecutionStep) => void;
    },
  ): Promise<EnhancedExecutionResult> {
    logger.info(`[CloudIntentEngine] Executing workflow with enhanced tracking for ${intents.length} steps`);

    const startTime = Date.now();
    const context: ExecutionContext = {
      results: new Map(),
      variables: new Map(),
    };

    const executionSteps: EnhancedExecutionStep[] = [];

    // Build dependency graph
    const dependencyGraph = this.buildDependencyGraph(intents, edges);

    // Topological sort
    const executionOrder = this.topologicalSort(dependencyGraph);

    if (!executionOrder) {
      return {
        success: false,
        parsedIntents: intents,
        dependencies: edges,
        toolSelections,
        executionSteps: [],
        statistics: {
          totalSteps: intents.length,
          successfulSteps: 0,
          failedSteps: intents.length,
          totalDuration: Date.now() - startTime,
          averageStepDuration: 0,
          llmCalls: 0,
        },
        finalResult: 'Circular dependency detected in workflow',
      };
    }

    let successfulSteps = 0;
    let failedSteps = 0;
    let totalStepDuration = 0;

    // Execute in order
    for (const intentId of executionOrder) {
      const intent = intents.find(i => i.id === intentId);
      const toolSelection = toolSelections.find(s => s.intentId === intentId);

      if (!intent || !toolSelection) {
        const errorStep: EnhancedExecutionStep = {
          intentId,
          intentDescription: 'Unknown intent',
          intentType: 'unknown',
          intentParameters: {},
          toolName: 'unknown',
          toolDescription: 'No tool selected',
          mappedParameters: {},
          confidence: 0,
          success: false,
          error: 'Intent or tool selection not found',
          startedAt: new Date(),
          completedAt: new Date(),
          duration: 0,
        };

        executionSteps.push(errorStep);
        failedSteps++;
        continue;
      }

      const stepStartTime = Date.now();
      const stepStartedAt = new Date();

      // Notify step started
      if (callbacks?.onStepStarted) {
        callbacks.onStepStarted({
          intentId,
          toolName: toolSelection.toolName,
          intentDescription: intent.description,
        });
      }

      try {
        // Prepare parameters (support variable substitution)
        const resolvedParams = this.resolveParameters(
          toolSelection.mappedParameters,
          context,
        );

        // Execute tool
        const result = await toolExecutor(toolSelection.toolName, resolvedParams);

        // Save result to context
        context.results.set(intentId, result);

        const stepDuration = Date.now() - stepStartTime;
        totalStepDuration += stepDuration;

        const successStep: EnhancedExecutionStep = {
          intentId,
          intentDescription: intent.description,
          intentType: intent.type,
          intentParameters: intent.parameters,
          toolName: toolSelection.toolName,
          toolDescription: toolSelection.toolDescription,
          mappedParameters: toolSelection.mappedParameters,
          confidence: toolSelection.confidence,
          success: true,
          result,
          startedAt: stepStartedAt,
          completedAt: new Date(),
          duration: stepDuration,
        };

        executionSteps.push(successStep);
        successfulSteps++;

        // Notify step completed
        if (callbacks?.onStepCompleted) {
          callbacks.onStepCompleted(successStep);
        }

        logger.info(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) completed in ${stepDuration}ms`);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        const stepDuration = Date.now() - stepStartTime;
        totalStepDuration += stepDuration;

        const failedStep: EnhancedExecutionStep = {
          intentId,
          intentDescription: intent.description,
          intentType: intent.type,
          intentParameters: intent.parameters,
          toolName: toolSelection.toolName,
          toolDescription: toolSelection.toolDescription,
          mappedParameters: toolSelection.mappedParameters,
          confidence: toolSelection.confidence,
          success: false,
          error: errorMessage,
          startedAt: stepStartedAt,
          completedAt: new Date(),
          duration: stepDuration,
        };

        executionSteps.push(failedStep);
        failedSteps++;

        // Notify step failed
        if (callbacks?.onStepFailed) {
          callbacks.onStepFailed(failedStep);
        }

        logger.error(`[CloudIntentEngine] Step ${intentId} (${toolSelection.toolName}) failed in ${stepDuration}ms: ${errorMessage}`);

        // Decide whether to continue based on configuration
        if (this.config.execution.retryAttempts) {
          // Retry logic can be added here
        }
      }
    }

    const totalDuration = Date.now() - startTime;
    const averageStepDuration = executionSteps.length > 0 ? totalStepDuration / executionSteps.length : 0;

    // Calculate final result
    const success = executionSteps.every(step => step.success);
    const finalResult = success ? context.results.get(executionOrder[executionOrder.length - 1]) : undefined;

    return {
      success,
      finalResult,
      parsedIntents: intents,
      dependencies: edges,
      toolSelections,
      executionSteps,
      statistics: {
        totalSteps: intents.length,
        successfulSteps,
        failedSteps,
        totalDuration,
        averageStepDuration,
        llmCalls: 0, // This would need to be tracked during parsing and tool selection
      },
    };
  }

  /**
   * Preview workflow plan (parse and select tools only)
   */
  async previewPlan(query: string): Promise<WorkflowPlan> {
    return await this.parseAndPlan(query);
  }

  /**
   * Confirm and execute workflow plan
   */
  async confirmAndExecute(
    plan: WorkflowPlan,
    toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>,
    callbacks?: {
      onStepStarted?: (step: { intentId: string; toolName: string; intentDescription: string }) => void;
      onStepCompleted?: (step: EnhancedExecutionStep) => void;
      onStepFailed?: (step: EnhancedExecutionStep) => void;
    },
  ): Promise<EnhancedExecutionResult> {
    logger.info(`[CloudIntentEngine] Confirming and executing workflow plan with ${plan.estimatedSteps} steps`);

    return await this.executeWorkflowWithTracking(
      plan.parsedIntents,
      plan.toolSelections,
      plan.dependencies,
      toolExecutor,
      callbacks,
    );
  }

  // ==================== Private Methods ====================

  /**
   * Build intent parsing prompt with minimal decomposition principle
   * Generic SDK approach - no domain-specific hardcoding
   */
  private buildIntentParsePrompt(query: string): string {
    // Get available tools information for context
    const toolContext = this.generateToolContextForPrompt();
    
    return `You are an intelligent workflow analyzer. Please analyze the following user query and decide whether it needs to be decomposed into multiple steps.

## User Query
"${query}"

## Available Tools Context
${toolContext}

## Analysis Principles (IMPORTANT)

### 1. MINIMAL DECOMPOSITION PRINCIPLE
- **Default: Single Intent** - Most queries should be kept as a single intent
- **Only decompose when explicitly needed** - Only if the query clearly requires multiple independent steps
- **Single tool priority** - If a single tool can handle the entire query, use a single intent

### 2. WHEN TO DECOMPOSE (Only in these cases):
- Query contains explicit sequence markers: "then", "next", "after that", "and then", "first...then..."
- Query describes multiple independent actions: "analyze X and send to Y", "fetch data and process it"
- No single tool can handle all requirements

### 3. WHEN TO KEEP SINGLE INTENT (Most cases):
- Simple queries: "search for X", "get information about Y", "query data"
- Single action queries: "open website", "take screenshot", "send message"
- Tool-specific queries: queries that match a specific tool's purpose
- Queries that a single tool can handle completely

### 4. GENERAL GUIDELINES:
- Simple data retrieval queries → SINGLE intent
- Information search queries → SINGLE intent
- Complex workflows with multiple actions → MAY need decomposition
- Queries with temporal sequence → MAY need decomposition

## Output Format
Please output JSON with the following structure:

{
  "intents": [
    {
      "id": "A1",
      "type": "action_type",
      "description": "Step description",
      "parameters": {}
    }
  ],
  "edges": []
}

## Important Notes:
1. Most queries should have only ONE intent in the "intents" array
2. Only add multiple intents if decomposition is absolutely necessary
3. For single intents, use the most appropriate tool name as the "type"
4. For parameters, extract relevant information from the query
5. Consider tool capabilities when deciding decomposition

## Example Outputs:

Example 1 (Single intent - simple query):
{
  "intents": [
    {
      "id": "A1",
      "type": "search",
      "description": "Search for information",
      "parameters": {
        "query": "latest AI developments"
      }
    }
  ],
  "edges": []
}

Example 2 (Single intent - data retrieval):
{
  "intents": [
    {
      "id": "A1",
      "type": "get_data",
      "description": "Retrieve data",
      "parameters": {
        "query": "customer information"
      }
    }
  ],
  "edges": []
}

Example 3 (Multiple intents - only when explicitly needed):
{
  "intents": [
    {
      "id": "A1",
      "type": "fetch_details",
      "description": "Get details from source",
      "parameters": {
        "source": "database",
        "id": 123
      }
    },
    {
      "id": "A2",
      "type": "analyze_content",
      "description": "Analyze content",
      "parameters": {
        "content": "{{A1}}"
      }
    },
    {
      "id": "A3",
      "type": "send_message",
      "description": "Send analysis report",
      "parameters": {
        "channel": "#reports",
        "message": "{{A2}}"
      }
    }
  ],
  "edges": [
    {"from": "A1", "to": "A2"},
    {"from": "A2", "to": "A3"}
  ]
}

Output only JSON, no other content.`;
  }

  /**
   * Generate tool context for prompt
   */
  private generateToolContextForPrompt(): string {
    if (!this.availableTools || this.availableTools.length === 0) {
      return "No tools available.";
    }

    // Group tools by likely capability
    const singleStepTools = this.availableTools.filter(tool => 
      this.isLikelySingleStepTool(tool)
    );
    
    const multiStepTools = this.availableTools.filter(tool => 
      !this.isLikelySingleStepTool(tool)
    );

    let context = "Available tools:\n";

    if (singleStepTools.length > 0) {
      context += "\nSingle-step tools (can handle complete queries):\n";
      singleStepTools.forEach(tool => {
        context += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    if (multiStepTools.length > 0) {
      context += "\nMulti-step tools (may need decomposition):\n";
      multiStepTools.forEach(tool => {
        context += `- ${tool.name}: ${tool.description}\n`;
      });
    }

    return context;
  }

  /**
   * Check if a tool is likely single-step
   */
  private isLikelySingleStepTool(tool: Tool): boolean {
    const toolName = tool.name.toLowerCase();
    
    // Single-step tool patterns
    const singleStepPatterns = [
      /^get-/, /^fetch-/, /^query-/, /^search-/, /^find-/, /^lookup-/,
      /^read-/, /^retrieve-/, /^open-/, /^close-/, /^start-/, /^stop-/,
      /^create-/, /^delete-/, /^update-/, /^send-/, /^post-/, /^notify-/
    ];

    // Multi-step tool patterns
    const multiStepPatterns = [
      /^analyze-/, /^process-/, /^transform-/, /^pipeline-/,
      /^workflow-/, /^orchestrate-/, /^coordinate-/
    ];

    // Check patterns
    if (singleStepPatterns.some(pattern => pattern.test(toolName))) {
      return true;
    }

    if (multiStepPatterns.some(pattern => pattern.test(toolName))) {
      return false;
    }

    // Default: assume single-step for simplicity
    return true;
  }

  /**
   * Call LLM
   */
  private async callLLM(prompt: string, options?: {
    temperature?: number;
    maxTokens?: number;
  }): Promise<string> {
    try {
      // Use AI's raw API call
      const response = await this.ai.callRawAPI({
        messages: [
          {
            role: 'system',
            content: 'You are a workflow parser, please output strictly in JSON format as required.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: options?.temperature || 0.1,
        maxTokens: options?.maxTokens || 1024,
        responseFormat: { type: 'json_object' },
      });

      // Extract text content from response based on provider
      let text = '';

      if (response.choices && response.choices[0]?.message?.content) {
        // OpenAI, Azure, DeepSeek format
        text = response.choices[0].message.content;
      } else if (response.content && response.content[0]?.text) {
        // Anthropic format
        text = response.content[0].text;
      } else if (response.candidates && response.candidates[0]?.content?.parts?.[0]?.text) {
        // Google format
        text = response.candidates[0].content.parts[0].text;
      } else if (response.response) {
        // Ollama format
        text = response.response;
      } else if (response.text) {
        // Generic format
        text = response.text;
      }

      if (!text) {
        throw new Error('Empty response from LLM');
      }

      return text;
    } catch (error) {
      logger.error(`[CloudIntentEngine] LLM call failed: ${error}`);
      throw error;
    }
  }

  /**
   * Parse intent response
   */
  private parseIntentResponse(response: string): IntentParseResult {
    try {
      // Extract JSON part (handle possible extra text)
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!Array.isArray(parsed.intents) || !Array.isArray(parsed.edges)) {
        throw new Error('Invalid response structure');
      }

      return {
        intents: parsed.intents,
        edges: parsed.edges,
      };
    } catch (error) {
      logger.error(`[CloudIntentEngine] Failed to parse intent response: ${error}`);
      throw error;
    }
  }

  /**
   * Fallback: use simple rule-based intent parsing
   */
  private fallbackIntentParse(query: string): IntentParseResult {
    const queryLower = query.toLowerCase();
    const intents: AtomicIntent[] = [];
    const edges: DependencyEdge[] = [];

    let intentCounter = 1;

    // Simple rule matching
    if (queryLower.includes('open') && queryLower.includes('web')) {
      intents.push({
        id: `A${intentCounter++}`,
        type: 'open_web',
        description: 'Open webpage',
        parameters: { url: this.extractUrl(query) || 'https://www.example.com' },
      });
    }

    if (queryLower.includes('search')) {
      intents.push({
        id: `A${intentCounter++}`,
        type: 'search',
        description: 'Search content',
        parameters: { keyword: this.extractKeyword(query) || 'default' },
      });

      // Add dependency if there's an open web intent
      if (intents.some(i => i.type === 'open_web')) {
        edges.push({ from: 'A1', to: 'A2' });
      }
    }

    if (queryLower.includes('screenshot') || queryLower.includes('capture')) {
      intents.push({
        id: `A${intentCounter++}`,
        type: 'screenshot',
        description: 'Take screenshot',
        parameters: {},
      });

      // Add dependency if there's a search intent
      if (intents.some(i => i.type === 'search')) {
        const searchIntent = intents.find(i => i.type === 'search');
        const screenshotIntent = intents.find(i => i.type === 'screenshot');
        if (searchIntent && screenshotIntent) {
          edges.push({ from: searchIntent.id, to: screenshotIntent.id });
        }
      }
    }

    // If no intent matched, create a generic intent
    if (intents.length === 0) {
      intents.push({
        id: 'A1',
        type: 'process',
        description: 'Process query',
        parameters: { query },
      });
    }

    return { intents, edges };
  }

  /**
   * Select tool for a single intent with enhanced error handling and fallback strategies
   */
  private async selectToolForIntent(intent: AtomicIntent): Promise<ToolSelectionResult> {
    // If tool list is empty, return default result
    if (this.availableTools.length === 0) {
      logger.warn(`[CloudIntentEngine] No tools available for intent ${intent.id}: ${intent.description}`);
      return {
        intentId: intent.id,
        toolName: 'unknown',
        toolDescription: 'No tools available',
        mappedParameters: intent.parameters,
        confidence: 0,
      };
    }

    // Strategy 1: Try LLM-based tool selection first
    try {
      logger.debug(`[CloudIntentEngine] Attempting LLM-based tool selection for intent ${intent.id}`);

      // Build tool selection prompt
      const prompt = this.buildToolSelectionPrompt(intent);

      // Call LLM to select tool
      const llmResponse = await this.callLLM(prompt, {
        temperature: 0.1,
        maxTokens: 512,
      });

      // Parse tool selection result
      const selection = this.parseToolSelectionResponse(llmResponse, intent);

      // Validate the selected tool exists
      const toolExists = this.availableTools.some(tool => tool.name === selection.toolName);
      if (!toolExists) {
        logger.warn(`[CloudIntentEngine] LLM selected non-existent tool '${selection.toolName}', falling back to keyword matching`);
        throw new Error(`Tool '${selection.toolName}' not found in available tools`);
      }

      logger.info(`[CloudIntentEngine] LLM selected tool '${selection.toolName}' for intent ${intent.id} with confidence ${selection.confidence}`);
      return selection;
    } catch (error) {
      logger.warn(`[CloudIntentEngine] LLM tool selection failed for intent ${intent.id}: ${error}`);

      // Strategy 2: Try semantic keyword matching with improved heuristics
      try {
        logger.debug(`[CloudIntentEngine] Attempting semantic keyword matching for intent ${intent.id}`);
        const semanticMatch = this.semanticToolSelection(intent);
        if (semanticMatch.confidence > 0.5) {
          logger.info(`[CloudIntentEngine] Semantic matching selected tool '${semanticMatch.toolName}' for intent ${intent.id} with confidence ${semanticMatch.confidence}`);
          return semanticMatch;
        }
      } catch (semanticError) {
        logger.debug(`[CloudIntentEngine] Semantic matching failed: ${semanticError}`);
      }

      // Strategy 3: Fallback to basic keyword matching
      logger.debug(`[CloudIntentEngine] Falling back to basic keyword matching for intent ${intent.id}`);
      const fallbackMatch = this.fallbackToolSelection(intent);

      if (fallbackMatch.confidence > 0.3) {
        logger.info(`[CloudIntentEngine] Keyword matching selected tool '${fallbackMatch.toolName}' for intent ${intent.id} with confidence ${fallbackMatch.confidence}`);
        return fallbackMatch;
      }

      // Strategy 4: Try to find any tool that can handle the intent type
      logger.debug(`[CloudIntentEngine] Attempting intent-type based matching for intent ${intent.id}`);
      const typeBasedMatch = this.intentTypeBasedToolSelection(intent);
      if (typeBasedMatch && typeBasedMatch.confidence > 0.2) {
        logger.info(`[CloudIntentEngine] Type-based matching selected tool '${typeBasedMatch.toolName}' for intent ${intent.id} with confidence ${typeBasedMatch.confidence}`);
        return typeBasedMatch;
      }

      // Last resort: Return unknown tool with intent parameters
      logger.warn(`[CloudIntentEngine] No suitable tool found for intent ${intent.id}: ${intent.description}`);
      return {
        intentId: intent.id,
        toolName: 'unknown',
        toolDescription: 'No suitable tool found for this intent',
        mappedParameters: intent.parameters,
        confidence: 0,
      };
    }
  }

  /**
   * Build tool selection prompt
   */
  private buildToolSelectionPrompt(intent: AtomicIntent): string {
    // Format tool list as string
    const toolsDescription = this.availableTools.map(tool => {
      return `- ${tool.name}: ${tool.description}\n  Input parameters: ${JSON.stringify(tool.inputSchema)}`;
    }).join('\n\n');

    return `Please select the most appropriate tool for the following intent:

Intent description: ${intent.description}
Intent type: ${intent.type}
Intent parameters: ${JSON.stringify(intent.parameters, null, 2)}

Available tools:
${toolsDescription}

Please select the best matching tool and map intent parameters to tool parameters.
Output JSON format:
{
  "tool_name": "selected_tool_name",
  "arguments": {
    // Map intent parameters to tool parameters
  },
  "confidence": 0.9 // Matching confidence (0-1)
}

Output only JSON, no other content.`;
  }

  /**
   * Parse tool selection response
   */
  private parseToolSelectionResponse(response: string, intent: AtomicIntent): ToolSelectionResult {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate structure
      if (!parsed.tool_name || !parsed.arguments || typeof parsed.confidence !== 'number') {
        throw new Error('Invalid tool selection response structure');
      }

      // Get tool details from cache
      const tool = this.toolCache.get(parsed.tool_name);

      return {
        intentId: intent.id,
        toolName: parsed.tool_name,
        toolDescription: tool?.description || 'No description available',
        mappedParameters: parsed.arguments,
        confidence: parsed.confidence,
      };
    } catch (error) {
      logger.error(`[CloudIntentEngine] Failed to parse tool selection response: ${error}`);
      throw error;
    }
  }

  /**
   * Fallback tool selection using keyword matching
   */
  private fallbackToolSelection(intent: AtomicIntent): ToolSelectionResult {
    // Simple keyword matching
    const intentLower = intent.description.toLowerCase();
    let bestMatch: { tool: Tool; score: number } | null = null;

    for (const tool of this.availableTools) {
      let score = 0;

      // Check tool name
      if (tool.name.toLowerCase().includes(intent.type.toLowerCase())) {
        score += 3;
      }

      // Check tool description
      if (tool.description.toLowerCase().includes(intent.type.toLowerCase())) {
        score += 2;
      }

      // Check for keyword matches
      const keywords = ['open', 'search', 'read', 'write', 'create', 'delete', 'list', 'get'];
      for (const keyword of keywords) {
        if (intentLower.includes(keyword) && tool.description.toLowerCase().includes(keyword)) {
          score += 1;
        }
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { tool, score };
      }
    }

    if (bestMatch) {
      return {
        intentId: intent.id,
        toolName: bestMatch.tool.name,
        toolDescription: bestMatch.tool.description,
        mappedParameters: this.simpleParameterMapping(intent.parameters, bestMatch.tool),
        confidence: Math.min(bestMatch.score / 5, 0.7), // Normalize to 0-0.7 range
      };
    }

    // Use default tool if configured
    const defaultToolName = this.config.fallback.defaultTools?.[intent.type];
    if (defaultToolName) {
      const defaultTool = this.availableTools.find(t => t.name === defaultToolName);
      if (defaultTool) {
        return {
          intentId: intent.id,
          toolName: defaultTool.name,
          toolDescription: defaultTool.description,
          mappedParameters: intent.parameters,
          confidence: 0.3,
        };
      }
    }

    // Return unknown tool
    return {
      intentId: intent.id,
      toolName: 'unknown',
      toolDescription: 'No matching tool found',
      mappedParameters: intent.parameters,
      confidence: 0,
    };
  }

  /**
   * Semantic tool selection with improved heuristics (Generic version)
   */
  private semanticToolSelection(intent: AtomicIntent): ToolSelectionResult {
    const intentLower = intent.description.toLowerCase();
    const intentTypeLower = intent.type.toLowerCase();

    // Generic semantic categories - no service-specific logic
    const genericSemanticCategories: Record<string, string[]> = {
      // Generic operation categories
      'data_retrieval': ['get', 'fetch', 'retrieve', 'read', 'obtain', 'acquire'],
      'data_creation': ['create', 'make', 'generate', 'write', 'add', 'insert'],
      'data_update': ['update', 'modify', 'edit', 'change', 'adjust'],
      'data_deletion': ['delete', 'remove', 'erase', 'clear', 'drop'],
      'data_listing': ['list', 'show', 'display', 'enumerate', 'browse'],
      'communication': ['send', 'post', 'message', 'notify', 'alert', 'share'],
      'analysis': ['analyze', 'review', 'evaluate', 'assess', 'check', 'examine'],
      'search': ['search', 'find', 'lookup', 'query', 'discover'],
      'file_operations': ['file', 'document', 'content', 'text', 'data'],
      'network_operations': ['url', 'web', 'http', 'network', 'connect'],
    };

    // Generic action verbs
    const genericActionVerbs = [
      'get', 'list', 'create', 'update', 'delete', 'send', 'post',
      'analyze', 'generate', 'read', 'write', 'open', 'close', 'start',
      'stop', 'run', 'execute', 'call', 'invoke', 'fetch', 'retrieve',
    ];

    let bestMatch: { tool: Tool; score: number } | null = null;

    for (const tool of this.availableTools) {
      let score = 0;
      const toolNameLower = tool.name.toLowerCase();
      const toolDescLower = tool.description.toLowerCase();

      // 1. Check if intent type is in tool name or description
      if (toolNameLower.includes(intentTypeLower) || toolDescLower.includes(intentTypeLower)) {
        score += 4;
      }

      // 2. Check generic semantic category matches
      for (const [category, keywords] of Object.entries(genericSemanticCategories)) {
        const hasIntentKeyword = keywords.some(keyword => intentLower.includes(keyword));
        const hasToolKeyword = keywords.some(keyword =>
          toolNameLower.includes(keyword) || toolDescLower.includes(keyword),
        );

        if (hasIntentKeyword && hasToolKeyword) {
          score += 3;
        }
      }

      // 3. Check generic action verb matches
      for (const verb of genericActionVerbs) {
        if (intentLower.includes(verb) && (toolNameLower.includes(verb) || toolDescLower.includes(verb))) {
          score += 2;
        }
      }

      // 4. Check parameter compatibility (using generic parameter mapping)
      const intentParamKeys = Object.keys(intent.parameters);
      if (tool.inputSchema?.properties) {
        const toolParamKeys = Object.keys(tool.inputSchema.properties);
        const matchingParams = intentParamKeys.filter(param =>
          toolParamKeys.some(toolParam =>
            param.toLowerCase() === toolParam.toLowerCase() ||
            this.areParametersCompatibleGeneric(param, toolParam),
          ),
        );

        if (matchingParams.length > 0) {
          score += matchingParams.length;
        }
      }

      // 5. Check semantic overlap between tool description and intent description
      const intentWords = new Set(intentLower.split(/\W+/).filter(w => w.length > 2));
      const toolDescWords = new Set(toolDescLower.split(/\W+/).filter(w => w.length > 2));
      const overlappingWords = [...intentWords].filter(word => toolDescWords.has(word));
      if (overlappingWords.length > 0) {
        score += overlappingWords.length;
      }

      if (score > 0 && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { tool, score };
      }
    }

    if (bestMatch) {
      const normalizedScore = Math.min(bestMatch.score / 15, 0.8); // Adjust normalization factor
      return {
        intentId: intent.id,
        toolName: bestMatch.tool.name,
        toolDescription: bestMatch.tool.description,
        mappedParameters: this.simpleParameterMapping(intent.parameters, bestMatch.tool),
        confidence: normalizedScore,
      };
    }

    // No semantic match found
    throw new Error('No semantic match found');
  }

  /**
   * Generic parameter compatibility check (Generic version)
   */
  private areParametersCompatibleGeneric(intentParam: string, toolParam: string): boolean {
    const intentParamLower = intentParam.toLowerCase();
    const toolParamLower = toolParam.toLowerCase();

    // 1. Direct match
    if (intentParamLower === toolParamLower) {
      return true;
    }

    // 2. Generic parameter mappings
    const genericParamMappings: Record<string, string[]> = {
      // Data identifiers
      'id': ['id', 'identifier', 'uid', 'uuid', 'key'],
      'name': ['name', 'title', 'label', 'display_name'],
      'description': ['description', 'desc', 'info', 'details'],

      // Data content
      'content': ['content', 'text', 'body', 'data', 'message', 'value'],
      'text': ['text', 'content', 'message', 'body', 'data'],
      'data': ['data', 'content', 'payload', 'body', 'value'],

      // File operations
      'file': ['file', 'path', 'filename', 'filepath', 'location'],
      'path': ['path', 'filepath', 'directory', 'folder', 'location'],
      'directory': ['directory', 'folder', 'path', 'location'],

      // Network operations
      'url': ['url', 'uri', 'link', 'address', 'endpoint'],
      'address': ['address', 'url', 'uri', 'endpoint', 'location'],

      // Search operations
      'query': ['query', 'search', 'q', 'filter', 'term', 'keyword'],
      'search': ['search', 'query', 'q', 'filter', 'term', 'keyword'],

      // Time related
      'time': ['time', 'timestamp', 'date', 'datetime', 'when'],
      'date': ['date', 'datetime', 'timestamp', 'time'],

      // Quantity related
      'count': ['count', 'number', 'amount', 'quantity', 'total'],
      'limit': ['limit', 'max', 'maximum', 'count', 'size'],
    };

    // 3. Check generic mappings
    if (genericParamMappings[intentParamLower]) {
      return genericParamMappings[intentParamLower].includes(toolParamLower);
    }

    // 4. Check reverse mappings
    for (const [key, values] of Object.entries(genericParamMappings)) {
      if (values.includes(intentParamLower) && values.includes(toolParamLower)) {
        return true;
      }
    }

    // 5. Fuzzy matching
    const normalizedIntentParam = intentParamLower.replace(/_/g, '').replace(/-/g, '');
    const normalizedToolParam = toolParamLower.replace(/_/g, '').replace(/-/g, '');

    return (
      // Contains relationship
      normalizedIntentParam.includes(normalizedToolParam) ||
      normalizedToolParam.includes(normalizedIntentParam) ||
      // Simple edit distance
      this.calculateSimpleSimilarity(intentParamLower, toolParamLower) > 0.7 ||
      // Common prefix/suffix
      intentParamLower.startsWith(toolParamLower.substring(0, 3)) ||
      toolParamLower.startsWith(intentParamLower.substring(0, 3))
    );
  }

  /**
   * Calculate simple string similarity (0-1)
   */
  private calculateSimpleSimilarity(str1: string, str2: string): number {
    if (str1 === str2) {return 1.0;}

    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    // If length difference is too large, similarity is low
    if (longer.length - shorter.length > 3) {
      return 0.0;
    }

    // Calculate common characters
    let commonChars = 0;
    for (let i = 0; i < shorter.length; i++) {
      if (longer.includes(shorter[i])) {
        commonChars++;
      }
    }

    return commonChars / longer.length;
  }

  /**
   * Generic intent type based tool selection
   */
  private intentTypeBasedToolSelection(intent: AtomicIntent): ToolSelectionResult {
    // Generic intent type to tool pattern mappings
    const genericIntentTypeToToolPatterns: Record<string, string[]> = {
      // Data retrieval patterns
      'get_data': ['get', 'fetch', 'retrieve', 'read', 'obtain'],
      'list_data': ['list', 'show', 'display', 'enumerate', 'browse'],
      'create_data': ['create', 'make', 'generate', 'write', 'add'],
      'update_data': ['update', 'modify', 'edit', 'change', 'adjust'],
      'delete_data': ['delete', 'remove', 'erase', 'clear', 'drop'],

      // Communication patterns
      'send_message': ['send', 'post', 'message', 'notify', 'alert'],
      'receive_message': ['receive', 'get_message', 'read_message', 'fetch_message'],

      // Analysis patterns
      'analyze_content': ['analyze', 'review', 'evaluate', 'assess', 'check'],
      'summarize_content': ['summarize', 'abstract', 'condense', 'extract'],
      'generate_content': ['generate', 'create', 'write', 'compose'],

      // File operations
      'read_file': ['read', 'get', 'fetch', 'open', 'load'],
      'write_file': ['write', 'create', 'save', 'update', 'modify'],
      'list_files': ['list', 'show', 'display', 'browse', 'enumerate'],

      // Network operations
      'open_url': ['open', 'browse', 'navigate', 'visit', 'go'],
      'fetch_url': ['fetch', 'get', 'retrieve', 'download', 'load'],
      'search_web': ['search', 'find', 'lookup', 'query', 'discover'],

      // System operations
      'execute_command': ['execute', 'run', 'call', 'invoke', 'start'],
      'check_status': ['status', 'check', 'verify', 'validate', 'test'],
    };

    // Extract base intent type (remove suffixes like _with_ai, _to_slack, etc.)
    const baseIntentType = intent.type.replace(/_with_[a-z]+$/, '').replace(/_to_[a-z]+$/, '');

    // Get patterns for the base intent type
    const patterns = genericIntentTypeToToolPatterns[baseIntentType] || [];

    // Also try the full intent type
    const fullPatterns = genericIntentTypeToToolPatterns[intent.type] || [];
    const allPatterns = [...new Set([...patterns, ...fullPatterns])];

    for (const pattern of allPatterns) {
      const matchingTool = this.availableTools.find(tool =>
        tool.name.toLowerCase().includes(pattern.toLowerCase()) ||
        tool.description.toLowerCase().includes(pattern.toLowerCase()),
      );

      if (matchingTool) {
        return {
          intentId: intent.id,
          toolName: matchingTool.name,
          toolDescription: matchingTool.description,
          mappedParameters: this.simpleParameterMapping(intent.parameters, matchingTool),
          confidence: 0.4, // Lower confidence for type-based matching
        };
      }
    }

    // Try to find any tool that mentions the intent type or base type
    for (const tool of this.availableTools) {
      const toolNameLower = tool.name.toLowerCase();
      const toolDescLower = tool.description.toLowerCase();

      if (toolNameLower.includes(intent.type.toLowerCase()) ||
          toolDescLower.includes(intent.type.toLowerCase()) ||
          toolNameLower.includes(baseIntentType.toLowerCase()) ||
          toolDescLower.includes(baseIntentType.toLowerCase())) {
        return {
          intentId: intent.id,
          toolName: tool.name,
          toolDescription: tool.description,
          mappedParameters: this.simpleParameterMapping(intent.parameters, tool),
          confidence: 0.3,
        };
      }
    }

    // No type-based match found - return null to allow semantic-based or fallback selection
    return null;
  }

  /**
   * Enhanced parameter mapping using ParameterMapper
   */
  private simpleParameterMapping(intentParams: Record<string, any>, tool: Tool): Record<string, any> {
    // Use ParameterMapper for intelligent parameter mapping
    return ParameterMapper.mapParameters(
      tool.name,
      tool.inputSchema,
      intentParams,
    );
  }

  /**
   * Extract URL from query
   */
  private extractUrl(query: string): string | null {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    const match = query.match(urlRegex);
    return match ? match[0] : null;
  }

  /**
   * Extract keyword from query
   */
  private extractKeyword(query: string): string | null {
    // Simple extraction: look for content after "search for" or similar phrases
    const patterns = [
      /search\s+for\s+["']?([^"'\s]+)["']?/i,
      /search\s+["']?([^"'\s]+)["']?/i,
      /find\s+["']?([^"'\s]+)["']?/i,
      /look\s+for\s+["']?([^"'\s]+)["']?/i,
    ];

    for (const pattern of patterns) {
      const match = query.match(pattern);
      if (match && match[1]) {
        return match[1];
      }
    }

    return null;
  }

  /**
   * Build dependency graph
   */
  private buildDependencyGraph(intents: AtomicIntent[], edges: DependencyEdge[]): Map<string, Set<string>> {
    const graph = new Map<string, Set<string>>();

    // Initialize graph with all intents
    intents.forEach(intent => {
      graph.set(intent.id, new Set());
    });

    // Add edges
    edges.forEach(edge => {
      const dependencies = graph.get(edge.to);
      if (dependencies) {
        dependencies.add(edge.from);
      }
    });

    return graph;
  }

  /**
   * Topological sort (Kahn's algorithm)
   */
  private topologicalSort(graph: Map<string, Set<string>>): string[] | null {
    const sorted: string[] = [];
    const indegree = new Map<string, number>();
    const queue: string[] = [];

    // Calculate indegree for each node
    graph.forEach((dependencies, node) => {
      indegree.set(node, dependencies.size);
      if (dependencies.size === 0) {
        queue.push(node);
      }
    });

    // Process nodes with zero indegree
    while (queue.length > 0) {
      const node = queue.shift()!;
      sorted.push(node);

      // Decrease indegree of neighbors
      graph.forEach((dependencies, neighbor) => {
        if (dependencies.has(node)) {
          const newIndegree = (indegree.get(neighbor) || 0) - 1;
          indegree.set(neighbor, newIndegree);

          if (newIndegree === 0) {
            queue.push(neighbor);
          }
        }
      });
    }

    // Check for cycles
    if (sorted.length !== graph.size) {
      return null; // Cycle detected
    }

    return sorted;
  }

  /**
   * Resolve parameters with variable substitution
   */
  private resolveParameters(
    parameters: Record<string, any>,
    context: ExecutionContext,
  ): Record<string, any> {
    const resolved: Record<string, any> = {};

    for (const [key, value] of Object.entries(parameters)) {
      if (typeof value === 'string') {
        // Enhanced variable substitution with multiple formats
        // Format 1: {{intentId.field}} - direct field access
        // Format 2: {{intentId}} - get the entire result object
        // Format 3: {{intentId.workflowResult}} - get workflow result
        const varMatch = value.match(/\{\{([A-Za-z0-9_]+)(?:\.([A-Za-z0-9_]+))?\}\}/);
        if (varMatch) {
          const [, intentId, field] = varMatch;
          const result = context.results.get(intentId);

          if (result) {
            if (!field) {
              // If no field specified, extract the most useful content from the result
              resolved[key] = this.extractUsefulContent(result, intentId);
            } else if (typeof result === 'object' && field in result) {
              // If field exists in result, return it
              resolved[key] = result[field];
            } else {
              // Try to find the field in nested structures
              const nestedValue = this.findNestedValue(result, field);
              if (nestedValue !== undefined) {
                resolved[key] = nestedValue;
              } else {
                // Keep original if substitution fails
                resolved[key] = value;
              }
            }
          } else {
            // Keep original if intent result not found
            resolved[key] = value;
          }
        } else {
          resolved[key] = value;
        }
      } else {
        resolved[key] = value;
      }
    }

    return resolved;
  }

  /**
   * Find nested value in object using dot notation or common field names
   */
  private findNestedValue(obj: any, field: string): any {
    if (!obj || typeof obj !== 'object') {
      return undefined;
    }

    // Try direct access first
    if (field in obj) {
      return obj[field];
    }

    // Try common aliases for AI results
    const commonAliases: Record<string, string[]> = {
      'content': ['summary', 'markdown', 'text', 'result', 'output'],
      'summary': ['content', 'markdown', 'text', 'result'],
      'result': ['content', 'summary', 'output', 'workflowResult'],
      'output': ['content', 'summary', 'result'],
    };

    // Check if field has aliases
    if (field in commonAliases) {
      for (const alias of commonAliases[field]) {
        if (alias in obj) {
          return obj[alias];
        }
      }
    }

    // Try dot notation for nested access
    if (field.includes('.')) {
      const parts = field.split('.');
      let current = obj;
      for (const part of parts) {
        if (current && typeof current === 'object' && part in current) {
          current = current[part];
        } else {
          return undefined;
        }
      }
      return current;
    }

    return undefined;
  }

  /**
   * Get available tools
   */
  getAvailableTools(): any[] {
    return [...this.availableTools];
  }

  /**
   * Extract useful content from result object for variable substitution
   * This method intelligently extracts the most relevant content from different types of tool results
   */
  private extractUsefulContent(result: any, intentId: string): any {
    logger.debug(`[CloudIntentEngine] extractUsefulContent called for intent ${intentId}, result type: ${typeof result}`);

    if (!result) {
      logger.debug('[CloudIntentEngine] Result is null or undefined');
      return result;
    }

    // If result is already a string, return it
    if (typeof result === 'string') {
      logger.debug(`[CloudIntentEngine] Result is string, length: ${result.length}`);
      return result;
    }

    // If result is an object, try to extract the most useful content
    if (typeof result === 'object') {
      logger.debug(`[CloudIntentEngine] Result is object, keys: ${Object.keys(result).join(', ')}`);

      // Check for common result structures

      // 1. GitHub MCP tool results (content array with text)
      if (Array.isArray(result.content) && result.content.length > 0) {
        logger.debug(`[CloudIntentEngine] Found content array with ${result.content.length} items`);
        const firstContent = result.content[0];
        if (firstContent && firstContent.text) {
          logger.debug(`[CloudIntentEngine] First content has text property, length: ${firstContent.text.length}`);
          try {
            // Try to parse JSON text
            const parsed = JSON.parse(firstContent.text);
            logger.debug('[CloudIntentEngine] Successfully parsed JSON from text');
            // Return the parsed JSON object for AI analysis
            return parsed;
          } catch (error) {
            logger.debug(`[CloudIntentEngine] Failed to parse JSON: ${error}`);
            // If not JSON, return the text as-is
            return firstContent.text;
          }
        }
      }

      // 2. AI tool results (with summary or content field)
      if (result.summary) {
        logger.debug('[CloudIntentEngine] Found summary field');
        return result.summary;
      }
      if (result.content && typeof result.content === 'string') {
        logger.debug(`[CloudIntentEngine] Found string content field, length: ${result.content.length}`);
        return result.content;
      }
      if (result.markdown) {
        logger.debug('[CloudIntentEngine] Found markdown field');
        return result.markdown;
      }
      if (result.text) {
        logger.debug('[CloudIntentEngine] Found text field');
        return result.text;
      }

      // 3. Standardized workflow result format
      if (result.workflowResult && result.workflowResult.content) {
        logger.debug('[CloudIntentEngine] Found workflowResult.content');
        return result.workflowResult.content;
      }

      // 4. For other objects, return the object as-is (will be JSON.stringify'd by AI tool)
      logger.debug('[CloudIntentEngine] No specific content found, returning object as-is');
      return result;
    }

    // For any other type, return as-is
    logger.debug(`[CloudIntentEngine] Result is other type: ${typeof result}`);
    return result;
  }

  /**
   * Get engine status
   */
  getStatus(): {
    initialized: boolean;
    toolsCount: number;
    llmProvider: string;
    llmConfigured: boolean;
    } {
    return {
      initialized: this.ai.getStatus().enabled,
      toolsCount: this.availableTools.length,
      llmProvider: this.config.llm.provider,
      llmConfigured: !!this.config.llm.apiKey,
    };
  }

  // ==================== Minimal Decomposition Helper Methods ====================

  /**
   * Pre-analyze query for minimal decomposition decision
   */
  private preAnalyzeQuery(query: string): QueryPreAnalysis {
    const queryLower = query.toLowerCase();
    
    return {
      query,
      isLikelySimpleQuery: this.isLikelySimpleQuery(queryLower),
      isLikelyDataRetrievalQuery: this.isLikelyDataRetrievalQuery(queryLower),
      hasMultipleActions: this.hasMultipleActions(queryLower),
      hasTemporalMarkers: this.hasTemporalMarkers(queryLower),
      likelySingleToolMatch: this.findLikelySingleToolMatch(queryLower),
      complexityScore: this.calculateQueryComplexity(queryLower)
    };
  }

  /**
   * Check if query is likely simple (should be single intent)
   */
  private isLikelySimpleQuery(queryLower: string): boolean {
    // Generic simple query patterns - no domain-specific logic
    const simplePatterns = [
      /^(search|find|lookup|query|get|fetch|retrieve)\s+/,
      /^open\s+/,
      /^close\s+/,
      /^start\s+/,
      /^stop\s+/,
      /^send\s+/,
      /^create\s+/,
      /^delete\s+/,
      /^read\s+/,
      /^write\s+/,
      /^list\s+/,
      /^show\s+/
    ];

    return simplePatterns.some(pattern => pattern.test(queryLower));
  }

  /**
   * Check if query is likely a simple data retrieval query
   */
  private isLikelyDataRetrievalQuery(queryLower: string): boolean {
    // Generic data retrieval patterns
    const dataRetrievalPatterns = [
      /^(get|fetch|retrieve|read|obtain)\s+/,
      /data\s+(from|about)/,
      /information\s+(about|on)/,
      /query\s+(data|information)/
    ];

    return dataRetrievalPatterns.some(pattern => pattern.test(queryLower));
  }

  /**
   * Check if query has multiple actions
   */
  private hasMultipleActions(queryLower: string): boolean {
    const actionVerbs = [
      'search', 'find', 'get', 'fetch', 'retrieve',
      'analyze', 'process', 'send', 'post', 'create',
      'update', 'delete', 'open', 'close', 'start', 'stop'
    ];

    const verbCount = actionVerbs.filter(verb => queryLower.includes(verb)).length;
    return verbCount > 1;
  }

  /**
   * Check if query has temporal markers indicating sequence
   */
  private hasTemporalMarkers(queryLower: string): boolean {
    const temporalMarkers = [
      'then', 'next', 'after', 'after that', 'and then',
      'first', 'second', 'third', 'finally',
      'step 1', 'step 2', 'step 3'
    ];

    return temporalMarkers.some(marker => queryLower.includes(marker));
  }

  /**
   * Find likely single tool match for query
   */
  private findLikelySingleToolMatch(queryLower: string): string | null {
    if (!this.availableTools || this.availableTools.length === 0) {
      return null;
    }

    // Check for direct tool name matches
    for (const tool of this.availableTools) {
      const toolNameLower = tool.name.toLowerCase();
      
      // Check if tool name appears in query
      if (queryLower.includes(toolNameLower)) {
        return tool.name;
      }

      // Check for common tool patterns (generic)
      if (toolNameLower.includes('search') && queryLower.includes('search')) {
        return tool.name;
      }

      if (toolNameLower.includes('get') && queryLower.includes('get')) {
        return tool.name;
      }

      if (toolNameLower.includes('fetch') && queryLower.includes('fetch')) {
        return tool.name;
      }

      if (toolNameLower.includes('query') && queryLower.includes('query')) {
        return tool.name;
      }
    }

    return null;
  }

  /**
   * Calculate query complexity score (0-1)
   */
  private calculateQueryComplexity(queryLower: string): number {
    let score = 0;

    // Factor 1: Length
    if (queryLower.length > 100) score += 0.3;
    else if (queryLower.length > 50) score += 0.2;
    else if (queryLower.length > 20) score += 0.1;

    // Factor 2: Multiple actions
    if (this.hasMultipleActions(queryLower)) score += 0.3;

    // Factor 3: Temporal markers
    if (this.hasTemporalMarkers(queryLower)) score += 0.3;

    // Factor 4: Complex patterns
    if (queryLower.includes('analyze') && queryLower.includes('send')) score += 0.2;
    if (queryLower.includes('fetch') && queryLower.includes('process')) score += 0.2;

    return Math.min(1, score);
  }

  /**
   * Apply minimal decomposition correction
   */
  private applyMinimalDecompositionCorrection(
    result: IntentParseResult,
    query: string,
    preAnalysis: QueryPreAnalysis
  ): IntentParseResult {
    // Rule 1: If it's a simple query but was decomposed, consider merging
    if (preAnalysis.isLikelySimpleQuery && result.intents.length > 1 && preAnalysis.complexityScore < 0.5) {
      logger.info(`[CloudIntentEngine] Simple query was decomposed into ${result.intents.length} intents, considering merge`);
      
      // If there's a likely single tool match, use it
      if (preAnalysis.likelySingleToolMatch) {
        return {
          intents: [{
            id: 'A1',
            type: preAnalysis.likelySingleToolMatch,
            description: `Execute: ${query}`,
            parameters: { query }
          }],
          edges: []
        };
      }
    }

    // Rule 2: If AI returned single intent but pre-analysis suggests it might need decomposition,
    // trust the AI (but log it)
    if (result.intents.length === 1 && preAnalysis.complexityScore > 0.7) {
      logger.info(`[CloudIntentEngine] Complex query kept as single intent by AI, trusting AI decision`);
    }

    // Rule 3: If too many intents were generated, try to merge
    if (result.intents.length > 3 && preAnalysis.complexityScore < 0.6) {
      logger.info(`[CloudIntentEngine] Query decomposed into ${result.intents.length} intents, which seems excessive. Attempting to merge.`);
      
      // Find the most appropriate single tool
      const singleTool = preAnalysis.likelySingleToolMatch 
        ? this.availableTools.find(t => t.name === preAnalysis.likelySingleToolMatch)
        : this.findMostAppropriateToolForQuery(query);
      
      if (singleTool) {
        return {
          intents: [{
            id: 'A1',
            type: singleTool.name,
            description: `Execute: ${query}`,
            parameters: { query }
          }],
          edges: []
        };
      }
    }

    // Return original result if no correction needed
    return result;
  }

  /**
   * Assess parsing confidence
   */
  private assessParsingConfidence(result: IntentParseResult, query: string): number {
    let confidence = 0.7; // Base confidence

    const queryLower = query.toLowerCase();
    
    // Factor 1: Simple query check
    const isSimpleQuery = this.isLikelySimpleQuery(queryLower);
    if (isSimpleQuery && result.intents.length === 1) {
      confidence += 0.1; // Simple queries should be single intent
    } else if (isSimpleQuery && result.intents.length > 1) {
      confidence -= 0.2; // Simple queries decomposed = lower confidence
    }

    // Factor 2: Tool existence check
    const allToolsExist = result.intents.every(intent => {
      return this.availableTools.some(tool => 
        tool.name.toLowerCase().includes(intent.type.toLowerCase()) ||
        intent.type.toLowerCase().includes(tool.name.toLowerCase())
      );
    });

    if (allToolsExist) {
      confidence += 0.1;
    } else {
      confidence -= 0.2;
    }

    // Factor 3: Parameter completeness
    const hasParameters = result.intents.every(intent => 
      intent.parameters && Object.keys(intent.parameters).length > 0
    );

    if (hasParameters) {
      confidence += 0.1;
    }

    // Factor 4: Edge consistency
    const validEdges = result.edges.every(edge => 
      result.intents.some(i => i.id === edge.from) &&
      result.intents.some(i => i.id === edge.to)
    );

    if (validEdges) {
      confidence += 0.1;
    }

    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Log decomposition decision for debugging
   */
  private logDecompositionDecision(
    query: string,
    originalIntentCount: number,
    correctedIntentCount: number,
    confidence: number
  ): void {
    const queryLower = query.toLowerCase();
    
    logger.debug(`[CloudIntentEngine] Decomposition decision for: "${query}"`);
    logger.debug(`  - Original intents: ${originalIntentCount}`);
    logger.debug(`  - Corrected intents: ${correctedIntentCount}`);
    logger.debug(`  - Confidence: ${confidence.toFixed(2)}`);
    
    if (originalIntentCount !== correctedIntentCount) {
      logger.debug(`  - Correction applied: ${originalIntentCount} → ${correctedIntentCount} intents`);
    }
  }

  /**
   * Find most appropriate tool for query
   */
  private findMostAppropriateToolForQuery(query: string): Tool | null {
    if (!this.availableTools || this.availableTools.length === 0) {
      return null;
    }

    const queryLower = query.toLowerCase();
    let bestTool = null;
    let bestScore = 0;

    for (const tool of this.availableTools) {
      let score = 0;
      const toolNameLower = tool.name.toLowerCase();
      const toolDescLower = tool.description.toLowerCase();

      // Score based on name match
      if (queryLower.includes(toolNameLower)) {
        score += 3;
      }

      // Score based on common verbs
      const commonVerbs = ['get', 'fetch', 'search', 'find', 'query', 'read', 'write'];
      for (const verb of commonVerbs) {
        if (queryLower.includes(verb) && (toolNameLower.includes(verb) || toolDescLower.includes(verb))) {
          score += 2;
        }
      }

      // Score based on description relevance
      const queryWords = queryLower.split(/\W+/).filter(w => w.length > 2);
      const toolDescWords = toolDescLower.split(/\W+/).filter(w => w.length > 2);
      const overlappingWords = queryWords.filter(word => toolDescWords.includes(word));
      score += overlappingWords.length;

      if (score > bestScore) {
        bestScore = score;
        bestTool = tool;
      }
    }

    return bestScore > 0 ? bestTool : null;
  }

  // ==================== Interactive Feedback Methods ====================

  /**
   * Check if confirmation should be requested
   */
  private shouldRequestConfirmation(confidence: number, options?: ParseIntentOptions): boolean {
    // Default thresholds
    const confidenceThreshold = 0.6;
    const autoProceedThreshold = 0.8;

    // If confidence is very high, auto proceed
    if (confidence >= autoProceedThreshold && options?.autoProceedOnHighConfidence !== false) {
      return false;
    }

    // If confidence is below threshold, request confirmation
    if (confidence < confidenceThreshold) {
      return true;
    }

    // If requireConfirmation is explicitly set to true
    if (options?.requireConfirmation === true) {
      return true;
    }

    return false;
  }

  /**
   * Build confirmation request with intelligent options
   */
  private buildConfirmationRequest(
    query: string,
    parsedIntents: IntentParseResult,
    confidence: number,
    preAnalysis: QueryPreAnalysis,
    options?: ParseIntentOptions
  ): UserConfirmationRequest {
    const reason = this.generateConfirmationReason(confidence, preAnalysis, parsedIntents);
    const confirmationOptions = this.generateConfirmationOptions(query, parsedIntents, preAnalysis, options);

    return {
      query,
      parsedIntents: parsedIntents.intents,
      confidence,
      reason,
      options: confirmationOptions,
      analysis: {
        isLikelySimpleQuery: preAnalysis.isLikelySimpleQuery,
        hasMultipleActions: preAnalysis.hasMultipleActions,
        hasTemporalMarkers: preAnalysis.hasTemporalMarkers,
        likelySingleToolMatch: preAnalysis.likelySingleToolMatch,
        complexityScore: preAnalysis.complexityScore
      },
      timestamp: new Date()
    };
  }

  /**
   * Generate confirmation reason based on analysis
   */
  private generateConfirmationReason(
    confidence: number,
    preAnalysis: QueryPreAnalysis,
    parsedIntents: IntentParseResult
  ): string {
    const reasons: string[] = [];

    if (confidence < 0.5) {
      reasons.push('Low parsing confidence');
    }

    if (preAnalysis.isLikelySimpleQuery && parsedIntents.intents.length > 1) {
      reasons.push('Simple query was decomposed into multiple intents');
    }

    if (preAnalysis.hasTemporalMarkers && parsedIntents.intents.length === 1) {
      reasons.push('Query contains sequence markers but was kept as single intent');
    }

    if (parsedIntents.intents.length > 3) {
      reasons.push('Query was decomposed into many intents');
    }

    if (reasons.length === 0) {
      return `Confidence level is ${confidence.toFixed(2)}`;
    }

    return reasons.join('; ');
  }

  /**
   * Generate intelligent confirmation options
   */
  private generateConfirmationOptions(
    query: string,
    parsedIntents: IntentParseResult,
    preAnalysis: QueryPreAnalysis,
    options?: ParseIntentOptions
  ): ConfirmationOption[] {
    const optionsList: ConfirmationOption[] = [];
    const maxOptions = options?.requireConfirmation ? 3 : 2;

    // Option 1: Proceed as-is
    optionsList.push({
      id: 'proceed',
      description: `Proceed with ${parsedIntents.intents.length} intent(s) as parsed`,
      suggestedAction: 'proceed',
      confidence: this.assessParsingConfidence(parsedIntents, query),
      parsedIntents: parsedIntents.intents,
      reason: 'Trust the AI parsing result'
    });

    // Option 2: Try to merge to single intent (if applicable)
    if (preAnalysis.isLikelySimpleQuery && parsedIntents.intents.length > 1) {
      const singleIntent = this.createSingleIntentFromQuery(query, preAnalysis);
      optionsList.push({
        id: 'merge',
        description: 'Merge to single intent (simpler approach)',
        suggestedAction: 'modify',
        confidence: 0.7,
        parsedIntents: [singleIntent],
        reason: 'Query appears to be simple and should be single intent'
      });
    }

    // Option 3: Reparse with different parameters
    optionsList.push({
      id: 'reparse',
      description: 'Reparse query with different approach',
      suggestedAction: 'reparse',
      confidence: 0.5,
      reason: 'Try parsing again with adjusted parameters'
    });

    // Option 4: Abort (only if explicitly requested)
    if (options?.requireConfirmation) {
      optionsList.push({
        id: 'abort',
        description: 'Cancel this operation',
        suggestedAction: 'abort',
        reason: 'User decided to cancel'
      });
    }

    // Limit options to maxOptions
    return optionsList.slice(0, maxOptions);
  }

  /**
   * Create single intent from query for merging option
   */
  private createSingleIntentFromQuery(query: string, preAnalysis: QueryPreAnalysis): AtomicIntent {
    // Find the most appropriate tool
    const toolName = preAnalysis.likelySingleToolMatch || 'process';
    
    return {
      id: 'A1',
      type: toolName,
      description: `Execute: ${query}`,
      parameters: { query }
    };
  }

  /**
   * Handle user confirmation response
   */
  private handleConfirmationResponse(
    response: UserConfirmationResponse,
    originalResult: IntentParseResult,
    query: string,
    preAnalysis: QueryPreAnalysis
  ): IntentParseResult {
    const selectedOption = response.selectedOptionId;

    switch (selectedOption) {
      case 'proceed':
        // Use original result, possibly with user modifications
        if (response.userModifiedIntents && response.userModifiedIntents.length > 0) {
          logger.info(`[CloudIntentEngine] User modified intents, using modified version`);
          return {
            intents: response.userModifiedIntents,
            edges: this.generateEdgesForIntents(response.userModifiedIntents)
          };
        }
        logger.info(`[CloudIntentEngine] User confirmed to proceed with original parsing`);
        return originalResult;

      case 'merge':
        // Merge to single intent
        logger.info(`[CloudIntentEngine] User selected to merge to single intent`);
        const singleIntent = this.createSingleIntentFromQuery(query, preAnalysis);
        return {
          intents: [singleIntent],
          edges: []
        };

      case 'reparse':
        // Reparse with adjusted parameters
        logger.info(`[CloudIntentEngine] User selected to reparse query`);
        // For now, return original result (in real implementation, would reparse)
        return originalResult;

      case 'abort':
        // Return empty result to indicate abortion
        logger.info(`[CloudIntentEngine] User aborted the operation`);
        return {
          intents: [],
          edges: []
        };

      default:
        logger.warn(`[CloudIntentEngine] Unknown option selected: ${selectedOption}, proceeding with original`);
        return originalResult;
    }
  }

  /**
   * Generate edges for modified intents
   */
  private generateEdgesForIntents(intents: AtomicIntent[]): DependencyEdge[] {
    const edges: DependencyEdge[] = [];
    
    // Simple linear dependency for multiple intents
    for (let i = 0; i < intents.length - 1; i++) {
      edges.push({
        from: intents[i].id,
        to: intents[i + 1].id
      });
    }
    
    return edges;
  }

  /**
   * Record feedback for learning system
   */
  private recordFeedbackForLearning(
    query: string,
    parsedIntents: IntentParseResult,
    confidence: number,
    userResponse: UserConfirmationResponse | null,
    success: boolean
  ): void {
    // In a real implementation, this would store feedback in a database or file
    // For now, just log it
    logger.info(`[CloudIntentEngine] Feedback recorded for query: "${query}"`);
    logger.info(`  - Confidence: ${confidence.toFixed(2)}`);
    logger.info(`  - Intents: ${parsedIntents.intents.length}`);
    logger.info(`  - User response: ${userResponse ? userResponse.selectedOptionId : 'auto-proceed'}`);
    logger.info(`  - Success: ${success}`);
    
    // Simple learning: adjust confidence thresholds based on success
    if (success && confidence < 0.6) {
      logger.debug(`[CloudIntentEngine] Learning: Successful execution with low confidence, consider lowering threshold`);
    } else if (!success && confidence > 0.7) {
      logger.debug(`[CloudIntentEngine] Learning: Failed execution with high confidence, consider raising threshold`);
    }
  }

  /**
   * Get confirmation configuration (for external use)
   */
  getConfirmationConfig(): ConfirmationConfig {
    return {
      enabled: true,
      confidenceThreshold: 0.6,
      autoProceedThreshold: 0.8,
      maxOptions: 3,
      learnFromFeedback: true,
      feedbackHistorySize: 100
    };
  }

  /**
   * Update confirmation configuration
   */
  updateConfirmationConfig(config: Partial<ConfirmationConfig>): void {
    logger.info(`[CloudIntentEngine] Updating confirmation configuration`);
    // In a real implementation, this would update the configuration
    // For now, just log it
    logger.debug(`[CloudIntentEngine] New config: ${JSON.stringify(config, null, 2)}`);
  }
}

// ==================== Helper Type Definitions ====================

interface QueryPreAnalysis {
  query: string;
  isLikelySimpleQuery: boolean;
  isLikelyDataRetrievalQuery: boolean;
  hasMultipleActions: boolean;
  hasTemporalMarkers: boolean;
  likelySingleToolMatch: string | null;
  complexityScore: number;
}
