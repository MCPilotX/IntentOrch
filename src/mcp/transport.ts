/**
 * MCP Transport Layer Abstraction
 * Supports stdio, HTTP, SSE and other transport methods
 */

import { EventEmitter } from 'events';
import { TransportConfig, TransportType, JSONRPCRequest, JSONRPCResponse } from './types';

export interface Transport extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(request: JSONRPCRequest): Promise<void>;
  isConnected(): boolean;
}

export abstract class BaseTransport extends EventEmitter implements Transport {
  protected config: TransportConfig;
  protected connected: boolean = false;

  constructor(config: TransportConfig) {
    super();
    this.config = config;
  }

  abstract connect(): Promise<void>;
  abstract disconnect(): Promise<void>;
  abstract send(request: JSONRPCRequest): Promise<void>;

  isConnected(): boolean {
    return this.connected;
  }

  protected handleMessage(data: string): void {
    try {
      const message = JSON.parse(data);
      this.emit('message', message);
    } catch (error) {
      this.emit('error', new Error(`Failed to parse message: ${error}`));
    }
  }

  protected handleError(error: Error): void {
    this.emit('error', error);
  }
}

// ==================== Stdio Transport ====================

export class StdioTransport extends BaseTransport {
  private process?: any;
  private reader?: any;
  private writer?: any;

  constructor(config: TransportConfig) {
    super(config);
    if (!config.command) {
      throw new Error('Stdio transport requires a command');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Dynamically import child_process to avoid errors in non-Node.js environments
      const { spawn } = await import('child_process');
      
      this.process = spawn(this.config.command!, this.config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe']
      });

      // Set up stdout reader
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      // Set up stderr reader
      this.process.stderr?.on('data', (data: Buffer) => {
        this.emit('error', new Error(`Process stderr: ${data.toString()}`));
      });

      // Handle process exit
      this.process.on('close', (code: number) => {
        this.connected = false;
        this.emit('disconnected', { code });
      });

      this.process.on('error', (error: Error) => {
        this.handleError(error);
      });

      this.connected = true;
      this.emit('connected');
    } catch (error) {
      throw new Error(`Failed to start process: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected || !this.process) {
      return;
    }

    this.process.kill();
    this.process = undefined;
    this.connected = false;
    this.emit('disconnected');
  }

  async send(request: JSONRPCRequest): Promise<void> {
    if (!this.connected || !this.process) {
      throw new Error('Not connected');
    }

    return new Promise((resolve, reject) => {
      const data = JSON.stringify(request) + '\n';
      
      this.process.stdin.write(data, (error?: Error) => {
        if (error) {
          reject(error);
        } else {
          resolve();
        }
      });
    });
  }
}

// ==================== HTTP Transport ====================

export class HTTPTransport extends BaseTransport {
  private abortController?: AbortController;

  constructor(config: TransportConfig) {
    super(config);
    if (!config.url) {
      throw new Error('HTTP transport requires a URL');
    }
  }

  async connect(): Promise<void> {
    // HTTP transport establishes connection when sending requests, here we just mark as connected
    this.connected = true;
    this.emit('connected');
  }

  async disconnect(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = undefined;
    }
    this.connected = false;
    this.emit('disconnected');
  }

  async send(request: JSONRPCRequest): Promise<void> {
    if (!this.connected) {
      throw new Error('Not connected');
    }

    this.abortController = new AbortController();
    
    try {
      const response = await fetch(this.config.url!, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...this.config.headers,
        },
        body: JSON.stringify(request),
        signal: this.abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error: ${response.status} ${response.statusText}`);
      }

      const data = await response.text();
      this.handleMessage(data);
    } catch (error) {
      this.handleError(error as Error);
      throw error;
    }
  }
}

// ==================== SSE Transport ====================

export class SSETransport extends BaseTransport {
  private eventSource?: EventSource;
  private pendingRequests: Map<string | number, (response: JSONRPCResponse) => void> = new Map();

  constructor(config: TransportConfig) {
    super(config);
    if (!config.url) {
      throw new Error('SSE transport requires a URL');
    }
  }

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      // Note: SSE is typically used for server-to-client push, client requests still need HTTP
      // Here we only establish SSE connection for receiving server push
      this.eventSource = new EventSource(this.config.url!);
      
      this.eventSource.onmessage = (event) => {
        this.handleMessage(event.data);
      };

      this.eventSource.onerror = (error) => {
        this.handleError(new Error(`SSE error: ${error}`));
      };

      this.eventSource.onopen = () => {
        this.connected = true;
        this.emit('connected');
      };

      // Also create an HTTP transport for sending requests
      this.httpTransport = new HTTPTransport(this.config);
      await this.httpTransport.connect();
    } catch (error) {
      throw new Error(`Failed to connect SSE: ${error}`);
    }
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = undefined;
    }
    
    if (this.httpTransport) {
      await this.httpTransport.disconnect();
      this.httpTransport = undefined;
    }
    
    this.connected = false;
    this.emit('disconnected');
  }

  async send(request: JSONRPCRequest): Promise<void> {
    if (!this.connected || !this.httpTransport) {
      throw new Error('Not connected');
    }

    // Use HTTP transport to send request
    await this.httpTransport.send(request);
  }

  private httpTransport?: HTTPTransport;
}

// ==================== Transport Factory ====================

export class TransportFactory {
  static create(config: TransportConfig): Transport {
    switch (config.type) {
      case 'stdio':
        return new StdioTransport(config);
      case 'http':
        return new HTTPTransport(config);
      case 'sse':
        return new SSETransport(config);
      default:
        throw new Error(`Unsupported transport type: ${config.type}`);
    }
  }
}