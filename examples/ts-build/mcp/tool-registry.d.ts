/**
 * MCP Tool Registration and Management
 * Focuses on MCP tool management, providing tool registration, discovery, execution and other functions
 */
import { Tool, ToolCall, ToolResult } from './types';
export interface ToolExecutor {
    (args: Record<string, any>): Promise<ToolResult>;
}
export interface RegisteredTool {
    tool: Tool;
    executor: ToolExecutor;
    metadata: {
        serverId: string;
        serverName?: string;
        discoveredAt: number;
        lastUsed?: number;
        usageCount?: number;
    };
}
/**
 * MCP Tool Registry
 * Focuses on managing tools discovered from MCP servers
 */
export declare class ToolRegistry {
    private tools;
    private serverTools;
    /**
     * Register tool
     */
    registerTool(tool: Tool, executor: ToolExecutor, serverId: string, serverName?: string): void;
    /**
     * Batch register tools
     */
    registerTools(tools: Tool[], executorFactory: (toolName: string) => ToolExecutor, serverId: string, serverName?: string): void;
    /**
     * Unregister tool
     */
    unregisterTool(toolName: string): boolean;
    /**
     * Unregister all tools for specified server
     */
    unregisterServerTools(serverId: string): boolean;
    /**
     * Execute tool
     */
    executeTool(toolCall: ToolCall): Promise<ToolResult>;
    getTool(name: string): RegisteredTool | undefined;
    getAllTools(): RegisteredTool[];
    getToolsByServer(serverId: string): RegisteredTool[];
    getServerIds(): string[];
    /**
     * Get connected servers with their names
     */
    getConnectedServers(): string[];
    searchTools(query: string): RegisteredTool[];
    private validateToolArguments;
    getToolStatistics(): {
        totalTools: number;
        byServer: Record<string, number>;
        mostUsed: {
            name: string;
            serverId: string;
            serverName: string;
            usageCount: number;
            lastUsed: number;
        }[];
    };
    private emitToolUpdate;
    clear(): void;
}
//# sourceMappingURL=tool-registry.d.ts.map