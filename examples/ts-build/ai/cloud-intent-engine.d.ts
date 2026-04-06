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
import { type SimpleAIConfig } from './ai';
import type { Tool } from '../mcp/types';
/**
 * Atomic intent
 */
export interface AtomicIntent {
    id: string;
    type: string;
    description: string;
    parameters: Record<string, any>;
}
/**
 * Dependency edge
 */
export interface DependencyEdge {
    from: string;
    to: string;
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
    results: Map<string, any>;
    variables: Map<string, any>;
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
    parsedIntents: AtomicIntent[];
    dependencies: DependencyEdge[];
    toolSelections: ToolSelectionResult[];
    executionSteps: EnhancedExecutionStep[];
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
export interface CloudIntentEngineConfig {
    llm: {
        provider: SimpleAIConfig['provider'];
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
}
export declare class CloudIntentEngine {
    private ai;
    private config;
    private availableTools;
    private toolCache;
    constructor(config: CloudIntentEngineConfig);
    /**
     * Initialize the engine
     */
    initialize(): Promise<void>;
    /**
     * Set available tools list
     */
    setAvailableTools(tools: Tool[]): void;
    /**
     * Parse natural language instruction into atomic intents and dependencies
     */
    parseIntent(query: string): Promise<IntentParseResult>;
    /**
     * Select the most appropriate tool for each intent
     */
    selectTools(intents: AtomicIntent[]): Promise<ToolSelectionResult[]>;
    /**
     * Execute workflow
     */
    executeWorkflow(intents: AtomicIntent[], toolSelections: ToolSelectionResult[], edges: DependencyEdge[], toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>): Promise<ExecutionResult>;
    /**
     * Parse and plan workflow (without execution)
     */
    parseAndPlan(query: string): Promise<WorkflowPlan>;
    /**
     * Execute workflow with enhanced tracking
     */
    executeWorkflowWithTracking(intents: AtomicIntent[], toolSelections: ToolSelectionResult[], edges: DependencyEdge[], toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>, callbacks?: {
        onStepStarted?: (step: {
            intentId: string;
            toolName: string;
            intentDescription: string;
        }) => void;
        onStepCompleted?: (step: EnhancedExecutionStep) => void;
        onStepFailed?: (step: EnhancedExecutionStep) => void;
    }): Promise<EnhancedExecutionResult>;
    /**
     * Preview workflow plan (parse and select tools only)
     */
    previewPlan(query: string): Promise<WorkflowPlan>;
    /**
     * Confirm and execute workflow plan
     */
    confirmAndExecute(plan: WorkflowPlan, toolExecutor: (toolName: string, params: Record<string, any>) => Promise<any>, callbacks?: {
        onStepStarted?: (step: {
            intentId: string;
            toolName: string;
            intentDescription: string;
        }) => void;
        onStepCompleted?: (step: EnhancedExecutionStep) => void;
        onStepFailed?: (step: EnhancedExecutionStep) => void;
    }): Promise<EnhancedExecutionResult>;
    /**
     * Build intent parsing prompt
     */
    private buildIntentParsePrompt;
    /**
     * Call LLM
     */
    private callLLM;
    /**
     * Parse intent response
     */
    private parseIntentResponse;
    /**
     * Fallback: use simple rule-based intent parsing
     */
    private fallbackIntentParse;
    /**
     * Select tool for a single intent
     */
    private selectToolForIntent;
    /**
     * Build tool selection prompt
     */
    private buildToolSelectionPrompt;
    /**
     * Parse tool selection response
     */
    private parseToolSelectionResponse;
    /**
     * Fallback tool selection using keyword matching
     */
    private fallbackToolSelection;
    /**
     * Enhanced parameter mapping with better handling of parameter name mismatches
     */
    private simpleParameterMapping;
    /**
     * Extract URL from query
     */
    private extractUrl;
    /**
     * Extract keyword from query
     */
    private extractKeyword;
    /**
     * Build dependency graph
     */
    private buildDependencyGraph;
    /**
     * Topological sort (Kahn's algorithm)
     */
    private topologicalSort;
    /**
     * Resolve parameters with variable substitution
     */
    private resolveParameters;
    /**
     * Get engine status
     */
    getStatus(): {
        initialized: boolean;
        toolsCount: number;
        llmProvider: string;
        llmConfigured: boolean;
    };
}
//# sourceMappingURL=cloud-intent-engine.d.ts.map