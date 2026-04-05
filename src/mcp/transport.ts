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
  private jsonBuffer: string = '';
  private bufferTimeout: NodeJS.Timeout | null = null;
  private lastBufferUpdate: number = 0;

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

  /**
   * Clear the JSON buffer and any associated timeout
   */
  private clearBuffer(): void {
    this.jsonBuffer = '';
    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
      this.bufferTimeout = null;
    }
    this.lastBufferUpdate = 0;
  }

  /**
   * Check if a string looks like it could be part of a JSON object
   */
  private looksLikeJsonChunk(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {return false;}

    // Check for JSON-like patterns (more flexible matching)
    const jsonLikePatterns = [
      /^\{/, // Starts with {
      /^\}/, // Starts with }
      /^\[/, // Starts with [
      /^\]/, // Starts with ]
      /^\s*"[^"]*"\s*:/, // Key-value pair with optional whitespace
      /^\s*\d+\s*,?\s*$/, // Number with optional comma and whitespace
      /^\s*"[^"]*"\s*,?\s*$/, // String with optional comma and whitespace
      /^\s*(true|false|null)\s*,?\s*$/i, // Boolean or null with optional comma
      /^[\[\]{},:]$/, // Single JSON structure characters
      /^\s*"\w+"\s*:/, // Alternative key pattern
    ];

    return jsonLikePatterns.some(pattern => pattern.test(trimmed));
  }

  /**
   * Try to parse buffer as JSON, returns parsed object or null
   */
  private tryParseBuffer(): any | null {
    if (!this.jsonBuffer.trim()) {
      return null;
    }

    try {
      const parsed = JSON.parse(this.jsonBuffer);
      // Return any valid JSON, not just JSONRPC messages
      return parsed;
    } catch (error) {
      // Not valid JSON yet
      return null;
    }
  }

  /**
   * Process a line of text, handling JSON that may span multiple lines
   */
  private processLine(line: string): Array<{type: 'json' | 'log', data?: any, content?: string}> {
    const results: Array<{type: 'json' | 'log', data?: any, content?: string}> = [];
    const trimmed = line.trim();

    if (!trimmed) {
      return results;
    }

    // Update buffer timeout
    this.lastBufferUpdate = Date.now();
    const bufferTimeoutMs = this.config.logFilter?.timeout || 1000; // Default 1 second

    if (this.bufferTimeout) {
      clearTimeout(this.bufferTimeout);
    }

    this.bufferTimeout = setTimeout(() => {
      if (this.jsonBuffer) {
        console.warn(`[MCP Transport] JSON buffer timeout, clearing buffer: ${this.jsonBuffer.substring(0, 100)}...`);
        this.clearBuffer();
      }
    }, bufferTimeoutMs);

    // Check if this looks like JSON or could be part of JSON
    const looksLikeJsonChunk = this.looksLikeJsonChunk(trimmed);
    const looksLikeCompleteJson = this.looksLikeJsonMessage(trimmed);

    if (looksLikeJsonChunk || looksLikeCompleteJson) {
      // Add to buffer
      this.jsonBuffer += (this.jsonBuffer ? '\n' : '') + trimmed;

      // Try to parse the buffer
      const parsed = this.tryParseBuffer();
      if (parsed) {
        results.push({ type: 'json', data: parsed });
        this.clearBuffer();
      } else if (looksLikeCompleteJson) {
        // Looks like complete JSON but can't parse, might be malformed
        // Clear buffer to avoid infinite accumulation
        console.warn(`[MCP Transport] JSON-like message but cannot parse, clearing buffer: ${trimmed.substring(0, 100)}...`);
        this.clearBuffer();
      }
      // If not parsable yet, wait for more data
      return results;
    }

    // Not JSON-like, clear any existing buffer (incomplete JSON)
    if (this.jsonBuffer) {
      console.warn(`[MCP Transport] Incomplete JSON in buffer, clearing: ${this.jsonBuffer.substring(0, 100)}...`);
      this.clearBuffer();
    }

    // Check if it's a log message
    const isLogMessage = this.isLogMessage(trimmed);
    if (isLogMessage) {
      results.push({ type: 'log', content: trimmed });
    } else {
      // Try one more time to parse as complete JSON (single line)
      try {
        const jsonData = JSON.parse(trimmed);
        if (jsonData && typeof jsonData === 'object' && jsonData.jsonrpc === '2.0') {
          results.push({ type: 'json', data: jsonData });
        } else {
          // Valid JSON but not JSONRPC
          results.push({ type: 'log', content: trimmed });
        }
      } catch {
        // Not valid JSON, treat as unrecognized log
        console.warn(`[MCP Server] Unrecognized message: ${trimmed}`);
        results.push({ type: 'log', content: `[Unrecognized] ${trimmed}` });
      }
    }

    return results;
  }

  protected handleMessage(data: string): void {
    // Use improved message processor
    const messages = this.processStdioOutput(data);

    for (const message of messages) {
      if (message.type === 'json') {
        this.emit('message', message.data);
      } else if (message.type === 'log') {
        // Log but don't treat as error
        console.log(`[MCP Server stdout] ${message.content}`);
      }
    }
  }

  /**
   * Process stdio output, intelligently separate JSON messages and logs
   */
  private processStdioOutput(data: string): Array<{type: 'json' | 'log', data?: any, content?: string}> {
    const results: Array<{type: 'json' | 'log', data?: any, content?: string}> = [];
    const lines = data.split('\n');

    for (const line of lines) {
      const lineResults = this.processLine(line);
      results.push(...lineResults);
    }

    return results;
  }

  /**
   * Check if a message looks like JSON (more comprehensive check)
   */
  private looksLikeJsonMessage(message: string): boolean {
    const trimmed = message.trim();

    // Quick checks for common JSON structures
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      return true;
    }
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      return true;
    }

    // Check for JSON-like content (more strict)
    const jsonIndicators = [
      /^\s*\{.*\}\s*$/, // Object with content
      /^\s*\[.*\]\s*$/, // Array with content
      /^\s*\{\s*\}\s*$/, // Empty object
      /^\s*\[\s*\]\s*$/, // Empty array
      /^\s*\d+(\.\d+)?\s*$/, // Number (integer or float)
      /^\s*"(?:[^"\\]|\\.)*"\s*$/, // String
      /^\s*(?:true|false|null)\s*$/, // Primitive
    ];

    // Additional check: must have at least some content between braces/brackets
    // or be a primitive value
    const hasJsonStructure = jsonIndicators.some(pattern => pattern.test(trimmed));

    if (hasJsonStructure) {
      // For objects/arrays, ensure they have proper structure
      if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
        // Check if it has at least a key-value pair or is empty
        const content = trimmed.slice(1, -1).trim();
        return content === '' || content.includes(':');
      }
      if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
        // Arrays are simpler
        return true;
      }
      // For other JSON types (numbers, strings, primitives)
      return true;
    }

    return false;
  }

  /**
   * Determine if a message is a log message using multiple detection strategies
   */
  private isLogMessage(message: string): boolean {
    const trimmed = message.trim();

    // Empty message is not a log
    if (!trimmed) {
      return false;
    }

    // Get configured patterns
    const configPatterns = this.config.logFilter?.ignorePatterns || [];
    const keepPatterns = this.config.logFilter?.keepPatterns || [];

    // Strategy 1: Check keep patterns (highest priority)
    for (const patternStr of keepPatterns) {
      try {
        const pattern = new RegExp(patternStr);
        if (pattern.test(trimmed)) {
          return true;
        }
      } catch (error) {
        console.warn(`[MCP Transport] Invalid keep pattern regex: ${patternStr}`, error);
      }
    }

    // Strategy 2: Check ignore patterns (second priority)
    for (const patternStr of configPatterns) {
      try {
        const pattern = new RegExp(patternStr);
        if (pattern.test(trimmed)) {
          return false;
        }
      } catch (error) {
        console.warn(`[MCP Transport] Invalid ignore pattern regex: ${patternStr}`, error);
      }
    }

    // Strategy 3: Check if it looks like JSON (not a log)
    if (this.looksLikeJsonMessage(trimmed)) {
      return false;
    }

    // Strategy 4: Check common log patterns
    const commonLogPatterns = [
      // Timestamp patterns
      /^\[\d{4}-\d{2}-\d{2}/,
      /^\[\d{2}:\d{2}:\d{2}/,
      /^\d{4}\/\d{2}\/\d{2}/,
      /^\d{2}:\d{2}:\d{2}/,
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,

      // Log level patterns
      /^\[?(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE)\]?/i,
      /^(DEBUG|INFO|WARN|WARNING|ERROR|FATAL|TRACE):/i,

      // Common server messages
      /^Secure MCP/,
      /^Server (running|started|listening)/i,
      /^Listening on/,
      /^Started/,
      /^Allowed directories:/,
      /^Connected to/,
      /^Disconnected from/,

      // Structured log formats
      /^\[.*\]\s+\w+:/, // [context] level:
      /^\w+\s+\d{1,2},\s+\d{4}/, // Month day, year

      // Common prefixes
      /^>>>/,
      /^<<</,
      /^---/,
      /^===/,

      // Error-like patterns (but not JSON errors)
      /error/i,
      /warning/i,
      /failed/i,
      /exception/i,
      /stack trace/i,
    ];

    // Check if it matches any common log pattern
    const matchesCommonPattern = commonLogPatterns.some(pattern => pattern.test(trimmed));

    // Strategy 5: Heuristic analysis
    if (!matchesCommonPattern) {
      // Check for other indicators
      const hasLogIndicators =
        trimmed.includes(': ') || // Common log separator
        (trimmed.split(' ').length <= 5 && trimmed.length < 100) || // Short messages
        /^[A-Z][a-z]+:/.test(trimmed) || // Capitalized word followed by colon
        trimmed.includes('...') || // Ellipsis
        /^\d+\.\d+s$/.test(trimmed); // Time duration

      return hasLogIndicators;
    }

    return matchesCommonPattern;
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
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      // Set up stdout reader
      this.process.stdout?.on('data', (data: Buffer) => {
        this.handleMessage(data.toString());
      });

      // Set up stderr reader
      this.process.stderr?.on('data', (data: Buffer) => {
        const stderrOutput = data.toString().trim();

        // Log stderr output for debugging
        console.log(`[MCP Server stderr] ${stderrOutput}`);

        // Only emit error for actual error messages, not normal server startup messages
        // Check if this looks like a normal server startup message
        const isNormalStartupMessage =
          stderrOutput.includes('Secure MCP') ||
          stderrOutput.includes('Server running on') ||
          stderrOutput.includes('Listening on') ||
          stderrOutput.includes('Started') ||
          stderrOutput.match(/^\[.*\]/); // Common log format

        if (!isNormalStartupMessage &&
            (stderrOutput.toLowerCase().includes('error') ||
             stderrOutput.toLowerCase().includes('failed') ||
             stderrOutput.toLowerCase().includes('fatal'))) {
          this.emit('error', new Error(`Process stderr: ${stderrOutput}`));
        }
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
      throw new Error(`Failed to start process: ${error}`, { cause: error });
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
      throw new Error(`Failed to connect SSE: ${error}`, { cause: error });
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
