/**
 * MCPilot SDK - Minimalist Core Class
 * Designed for developers, pursuing minimalist style
 */
import { ServiceConfig, Config } from './core/types';
import { type CloudIntentEngineConfig } from './ai/cloud-intent-engine';
import { MCPClient } from './mcp';
import type { ToolResult, MCPClientConfig } from './mcp/types';
export interface SDKOptions {
    configPath?: string;
    autoInit?: boolean;
    logger?: {
        info: (message: string) => void;
        error: (message: string) => void;
        debug: (message: string) => void;
    };
    mcp?: {
        autoDiscover?: boolean;
        servers?: MCPClientConfig[];
    };
}
export interface MCPConnectionConfig {
    servers: Array<{
        name?: string;
        transport: {
            type: 'stdio' | 'http' | 'sse';
            command?: string;
            args?: string[];
            url?: string;
        };
    }>;
}
export interface ServiceStatus {
    name: string;
    status: 'running' | 'stopped' | 'error' | 'unknown';
    pid?: number;
    uptime?: number;
    memory?: number;
    cpu?: number;
}
export interface AskOptions {
    provider?: string;
    model?: string;
    temperature?: number;
    maxTokens?: number;
}
export interface AskResult {
    answer: string;
    toolCalls?: Array<{
        service: string;
        tool: string;
        params: Record<string, any>;
    }>;
    confidence: number;
}
/**
 * MCPilot SDK Core Class
 * Provides unified API interface, designed for developers
 */
export declare class MCPilotSDK {
    private configManager;
    private initialized;
    private logger;
    private ai;
    private cloudIntentEngine?;
    private mcpClients;
    private toolRegistry;
    private mcpOptions;
    constructor(options?: SDKOptions);
    /**
     * Initialize SDK
     */
    init(): void;
    /**
     * Add service
     */
    addService(config: ServiceConfig): Promise<string>;
    /**
     * Start service
     */
    startService(name: string): Promise<void>;
    /**
     * Stop service
     */
    stopService(name: string): Promise<void>;
    /**
     * List all services
     */
    listServices(): string[];
    /**
     * Get service status
     */
    getServiceStatus(name: string): Promise<ServiceStatus>;
    /**
     * Get configuration
     */
    getConfig(): Config;
    /**
     * Update configuration
     */
    updateConfig(updates: Partial<Config>): Promise<void>;
    /**
     * AI Q&A functionality (optional)
     */
    ask(query: string, options?: AskOptions): Promise<AskResult>;
    /**
     * Configure AI
     */
    configureAI(config: Partial<Config['ai']>): Promise<void>;
    /**
     * Get AI status
     */
    getAIStatus(): {
        enabled: boolean;
        provider: string;
        configured: boolean;
        model?: string;
    };
    /**
     * Test AI connection
     */
    testAIConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Register runtime adapter factories
     */
    private registerRuntimeAdapters;
    /**
     * Ensure SDK is initialized
     */
    private ensureInitialized;
    /**
     * Initialize MCP functionality
     */
    initMCP(): Promise<void>;
    /**
     * Discover MCP servers
     */
    discoverMCPServers(): Promise<Array<{
        name: string;
        transport: any;
    }>>;
    /**
     * Connect MCP server
     */
    connectMCPServer(config: MCPClientConfig, name?: string): Promise<MCPClient>;
    /**
     * Disconnect MCP server
     */
    disconnectMCPServer(name: string): Promise<void>;
    /**
     * Connect multiple MCP servers from configuration
     */
    connectAllFromConfig(config: MCPConnectionConfig): Promise<Array<{
        name: string;
        success: boolean;
        toolsCount?: number;
        error?: string;
    }>>;
    /**
     * Disconnect all MCP servers
     */
    disconnectAll(): Promise<Array<{
        name: string;
        success: boolean;
        error?: string;
    }>>;
    /**
     * List all MCP servers
     */
    listMCPServers(): string[];
    /**
     * Get MCP server status
     */
    getMCPServerStatus(name: string): {
        connected: boolean;
        toolsCount: number;
    } | undefined;
    /**
     * List all available tools
     */
    listTools(): Array<{
        name: string;
        description: string;
        serverName?: string;
    }>;
    /**
     * Execute tool
     */
    executeTool(toolName: string, args: Record<string, any>): Promise<ToolResult>;
    /**
     * Search tools
     */
    searchTools(query: string): Array<{
        name: string;
        description: string;
        serverName?: string;
    }>;
    /**
     * Register MCP server tools
     */
    private registerMCPServerTools;
    /**
     * Remove MCP server tools
     */
    private removeMCPServerTools;
    /**
     * Get tool statistics
     */
    getToolStatistics(): any;
    /**
     * Initialize Cloud Intent Engine
     */
    initCloudIntentEngine(config?: CloudIntentEngineConfig): Promise<void>;
    /**
     * Create Cloud Intent Engine config from SDK config
     */
    private createCloudIntentEngineConfig;
    /**
     * Process natural language workflow
     */
    processWorkflow(query: string): Promise<{
        success: boolean;
        result?: any;
        steps?: Array<{
            intentId: string;
            toolName: string;
            success: boolean;
            result?: any;
            error?: string;
        }>;
        error?: string;
    }>;
    /**
     * Parse and plan workflow (without execution)
     * Returns detailed plan with intents, tool selections, and dependencies
     */
    parseAndPlanWorkflow(query: string): Promise<{
        success: boolean;
        plan?: {
            query: string;
            parsedIntents: Array<{
                id: string;
                type: string;
                description: string;
                parameters: Record<string, any>;
            }>;
            dependencies: Array<{
                from: string;
                to: string;
            }>;
            toolSelections: Array<{
                intentId: string;
                toolName: string;
                toolDescription: string;
                mappedParameters: Record<string, any>;
                confidence: number;
            }>;
            executionOrder: string[];
            estimatedSteps: number;
            createdAt: Date;
        };
        error?: string;
    }>;
    /**
     * Execute workflow with enhanced tracking and detailed reporting
     */
    executeWorkflowWithTracking(query: string, callbacks?: {
        onStepStarted?: (step: {
            intentId: string;
            toolName: string;
            intentDescription: string;
        }) => void;
        onStepCompleted?: (step: {
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
        }) => void;
        onStepFailed?: (step: {
            intentId: string;
            intentDescription: string;
            intentType: string;
            intentParameters: Record<string, any>;
            toolName: string;
            toolDescription: string;
            mappedParameters: Record<string, any>;
            confidence: number;
            success: boolean;
            error?: string;
            duration?: number;
            startedAt?: Date;
            completedAt?: Date;
        }) => void;
    }): Promise<{
        success: boolean;
        result?: any;
        parsedIntents?: Array<{
            id: string;
            type: string;
            description: string;
            parameters: Record<string, any>;
        }>;
        dependencies?: Array<{
            from: string;
            to: string;
        }>;
        toolSelections?: Array<{
            intentId: string;
            toolName: string;
            toolDescription: string;
            mappedParameters: Record<string, any>;
            confidence: number;
        }>;
        executionSteps?: Array<{
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
        }>;
        statistics?: {
            totalSteps: number;
            successfulSteps: number;
            failedSteps: number;
            totalDuration: number;
            averageStepDuration: number;
            llmCalls: number;
        };
        error?: string;
    }>;
    /**
     * Preview workflow plan (parse and select tools only)
     */
    previewWorkflowPlan(query: string): Promise<{
        success: boolean;
        plan?: {
            query: string;
            parsedIntents: Array<{
                id: string;
                type: string;
                description: string;
                parameters: Record<string, any>;
            }>;
            dependencies: Array<{
                from: string;
                to: string;
            }>;
            toolSelections: Array<{
                intentId: string;
                toolName: string;
                toolDescription: string;
                mappedParameters: Record<string, any>;
                confidence: number;
            }>;
            executionOrder: string[];
            estimatedSteps: number;
            createdAt: Date;
        };
        error?: string;
    }>;
    /**
     * Confirm and execute a workflow plan
     */
    confirmAndExecuteWorkflow(plan: {
        query: string;
        parsedIntents: Array<{
            id: string;
            type: string;
            description: string;
            parameters: Record<string, any>;
        }>;
        dependencies: Array<{
            from: string;
            to: string;
        }>;
        toolSelections: Array<{
            intentId: string;
            toolName: string;
            toolDescription: string;
            mappedParameters: Record<string, any>;
            confidence: number;
        }>;
        executionOrder: string[];
        estimatedSteps: number;
        createdAt: Date;
    }, callbacks?: {
        onStepStarted?: (step: {
            intentId: string;
            toolName: string;
            intentDescription: string;
        }) => void;
        onStepCompleted?: (step: {
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
        }) => void;
        onStepFailed?: (step: {
            intentId: string;
            intentDescription: string;
            intentType: string;
            intentParameters: Record<string, any>;
            toolName: string;
            toolDescription: string;
            mappedParameters: Record<string, any>;
            confidence: number;
            success: boolean;
            error?: string;
            duration?: number;
            startedAt?: Date;
            completedAt?: Date;
        }) => void;
    }): Promise<{
        success: boolean;
        result?: any;
        executionSteps?: Array<{
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
        }>;
        statistics?: {
            totalSteps: number;
            successfulSteps: number;
            failedSteps: number;
            totalDuration: number;
            averageStepDuration: number;
            llmCalls: number;
        };
        error?: string;
    }>;
    /**
     * Get Cloud Intent Engine status
     */
    getCloudIntentEngineStatus(): {
        initialized: boolean;
        toolsCount: number;
        llmProvider: string;
        llmConfigured: boolean;
    };
    /**
     * Update available tools for Cloud Intent Engine
     */
    updateCloudIntentEngineTools(): void;
}
export declare const mcpilot: MCPilotSDK;
export type { ServiceConfig, RuntimeType, Config } from './core/types';
//# sourceMappingURL=sdk.d.ts.map