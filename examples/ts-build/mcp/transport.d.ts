/**
 * MCP Transport Layer Abstraction
 * Supports stdio, HTTP, SSE and other transport methods
 */
import { EventEmitter } from 'events';
import { TransportConfig, JSONRPCRequest } from './types';
export interface Transport extends EventEmitter {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: JSONRPCRequest): Promise<void>;
    isConnected(): boolean;
}
export declare abstract class BaseTransport extends EventEmitter implements Transport {
    protected config: TransportConfig;
    protected connected: boolean;
    private jsonBuffer;
    private bufferTimeout;
    private lastBufferUpdate;
    constructor(config: TransportConfig);
    abstract connect(): Promise<void>;
    abstract disconnect(): Promise<void>;
    abstract send(request: JSONRPCRequest): Promise<void>;
    isConnected(): boolean;
    /**
     * Clear the JSON buffer and any associated timeout
     */
    private clearBuffer;
    /**
     * Check if a string looks like it could be part of a JSON object
     */
    private looksLikeJsonChunk;
    /**
     * Try to parse buffer as JSON, returns parsed object or null
     */
    private tryParseBuffer;
    /**
     * Process a line of text, handling JSON that may span multiple lines
     */
    private processLine;
    protected handleMessage(data: string): void;
    /**
     * Process stdio output, intelligently separate JSON messages and logs
     */
    private processStdioOutput;
    /**
     * Check if a message looks like JSON (more comprehensive check)
     */
    private looksLikeJsonMessage;
    /**
     * Determine if a message is a log message using multiple detection strategies
     */
    private isLogMessage;
    protected handleError(error: Error): void;
}
export declare class StdioTransport extends BaseTransport {
    private process?;
    private reader?;
    private writer?;
    constructor(config: TransportConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: JSONRPCRequest): Promise<void>;
}
export declare class HTTPTransport extends BaseTransport {
    private abortController?;
    constructor(config: TransportConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: JSONRPCRequest): Promise<void>;
}
export declare class SSETransport extends BaseTransport {
    private eventSource?;
    private pendingRequests;
    constructor(config: TransportConfig);
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(request: JSONRPCRequest): Promise<void>;
    private httpTransport?;
}
export declare class TransportFactory {
    static create(config: TransportConfig): Transport;
}
//# sourceMappingURL=transport.d.ts.map