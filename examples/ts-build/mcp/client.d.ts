/**
 * MCP Client Core Class
 * Provides complete MCP protocol client functionality
 */
import { EventEmitter } from 'events';
import { MCPClientConfig, Tool, ToolResult, Resource, Prompt } from './types';
export declare class MCPClient extends EventEmitter {
    private config;
    private transport;
    private connected;
    private requestId;
    private pendingRequests;
    private tools;
    private resources;
    private prompts;
    private sessionId?;
    constructor(config: MCPClientConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    isConnected(): boolean;
    listTools(): Promise<Tool[]>;
    callTool(toolName: string, arguments_: Record<string, any>): Promise<ToolResult>;
    refreshTools(): Promise<void>;
    getTools(): Tool[];
    findTool(name: string): Tool | undefined;
    listResources(): Promise<Resource[]>;
    readResource(uri: string): Promise<any>;
    refreshResources(): Promise<void>;
    getResources(): Resource[];
    listPrompts(): Promise<Prompt[]>;
    getPrompt(name: string, arguments_?: Record<string, any>): Promise<any>;
    refreshPrompts(): Promise<void>;
    getPrompts(): Prompt[];
    private sendRequest;
    private generateRequestId;
    private setupTransportListeners;
    private handleTransportMessage;
    private handleTransportError;
    private handleNotification;
    private emitEvent;
    withRetry<T>(operation: () => Promise<T>): Promise<T>;
    getStatus(): {
        connected: boolean;
        toolsCount: number;
        resourcesCount: number;
        promptsCount: number;
        sessionId: string;
    };
    destroy(): void;
}
//# sourceMappingURL=client.d.ts.map