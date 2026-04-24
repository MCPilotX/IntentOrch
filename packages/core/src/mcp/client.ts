/**
 * MCP Client Core Class
 * Provides complete MCP protocol client functionality
 */

import { EventEmitter } from 'events';
import {
  MCPClientConfig,
  JSONRPCRequest,
  JSONRPCResponse,
  Tool,
  ToolList,
  ToolResult,
  Resource,
  ResourceList,
  Prompt,
  PromptList,
  MCPEvent,
  MCPEventType,
  MCP_METHODS,
} from './types';
import { Transport, TransportFactory } from './transport';
import { ParameterMapper } from './parameter-mapper';

export class MCPClient extends EventEmitter {
  private config: MCPClientConfig;
  private transport: Transport;
  private connected: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<string | number, {
    resolve: (value: any) => void;
    reject: (error: Error) => void;
    timeout: NodeJS.Timeout;
  }> = new Map();

  // State
  private tools: Tool[] = [];
  private resources: Resource[] = [];
  private prompts: Prompt[] = [];
  private sessionId?: string;

  constructor(config: MCPClientConfig) {
    super();
    this.config = {
      autoConnect: false, // Default disable auto-connect requests to avoid server not being ready
      timeout: 60000,
      maxRetries: 3,
      ...config,
    };

    this.transport = TransportFactory.create(config.transport);
    this.setupTransportListeners();
  }

  // ==================== Connection Management ====================

  async connect(): Promise<void> {
    if (this.connected) {
      return;
    }

    try {
      await this.transport.connect();
      this.connected = true;
      this.emitEvent('connected');

      // Automatically fetch tool list after connection
      if (this.config.autoConnect) {
        await this.refreshTools();
        await this.refreshResources();
        await this.refreshPrompts();
      }
    } catch (error) {
      this.emitEvent('error', error);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (!this.connected) {
      return;
    }

    try {
      await this.transport.disconnect();
    } catch (error) {
      this.emitEvent('error', error);
      throw error;
    } finally {
      this.connected = false;

      // Clean up all pending requests
      this.pendingRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error('Disconnected'));
      });
      this.pendingRequests.clear();

      this.emitEvent('disconnected');
    }
  }

  isConnected(): boolean {
    return this.connected && this.transport.isConnected();
  }

  // ==================== Tool Related Methods ====================

  async listTools(): Promise<Tool[]> {
    const response = await this.sendRequest(MCP_METHODS.TOOLS_LIST);
    const toolList = response as ToolList;
    this.tools = toolList.tools;
    this.emitEvent('tools_updated', this.tools);
    return this.tools;
  }

  async callTool(toolName: string, arguments_: Record<string, any>): Promise<ToolResult> {
    // Get tool definition to understand parameter schema
    const tool = this.findTool(toolName);

    let mappedArguments = arguments_;

    // If tool definition is available, use ParameterMapper to normalize parameters
    if (tool) {
      try {
        const { normalized } = ParameterMapper.validateAndNormalize(toolName, tool.inputSchema, arguments_);
        mappedArguments = normalized;
      } catch (error) {
        // If parameter mapping fails, still try with original arguments
        // but log the warning
        console.warn(`Parameter mapping failed for tool "${toolName}":`, error instanceof Error ? error.message : String(error));
      }
    }

    // Clean up null values that have defaults in the schema
    // This prevents MCP servers from rejecting parameters like sortFlag: null
    // when the schema expects a string type
    if (tool && tool.inputSchema && tool.inputSchema.properties) {
      for (const [paramName, paramValue] of Object.entries(mappedArguments)) {
        if (paramValue === null || paramValue === undefined) {
          const paramSchema = tool.inputSchema.properties[paramName];
          if (paramSchema) {
            // If the parameter has a default value in schema, use it
            if (paramSchema.default !== undefined) {
              console.debug(`[MCPClient] Replacing null/undefined parameter "${paramName}" with default value:`, paramSchema.default);
              mappedArguments[paramName] = paramSchema.default;
            } else {
              // Otherwise, remove the null/undefined parameter
              // to let the server use its own default
              console.debug(`[MCPClient] Removing null/undefined parameter "${paramName}" (no default in schema)`);
              delete mappedArguments[paramName];
            }
          } else {
            // Parameter not in schema, remove it
            console.debug(`[MCPClient] Removing null/undefined parameter "${paramName}" (not in schema)`);
            delete mappedArguments[paramName];
          }
        }
      }
    }
    
    console.debug(`[MCPClient] Final arguments for tool "${toolName}":`, JSON.stringify(mappedArguments));

    // Try with retry mechanism
    let lastError: Error | null = null;
    const maxRetries = this.config.maxRetries || 3;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const response = await this.sendRequest(MCP_METHODS.TOOLS_CALL, {
          name: toolName,
          arguments: mappedArguments,
        });

        // Check if response is undefined or null
        if (response === undefined || response === null) {
          console.warn(`[MCPClient] Attempt ${attempt}/${maxRetries}: Tool "${toolName}" execution failed: MCP server returned empty response`);
          lastError = new Error(`Tool "${toolName}" execution failed: MCP server returned empty response`);
          if (attempt < maxRetries) {
            await this.delay(1000 * attempt); // Exponential backoff
            continue;
          }
          throw lastError;
        }

        // Log the raw response for debugging
        console.debug(`[MCPClient] Raw response for tool "${toolName}":`, JSON.stringify(response, null, 2));

        // Ensure response is a valid ToolResult
        const toolResult = response as ToolResult;

        // Check if toolResult is a valid object
        if (typeof toolResult !== 'object' || toolResult === null) {
          console.warn(`[MCPClient] Attempt ${attempt}/${maxRetries}: Tool "${toolName}" execution failed: MCP server returned invalid response format:`, response);
          lastError = new Error(`Tool "${toolName}" execution failed: MCP server returned invalid response format`);
          if (attempt < maxRetries) {
            await this.delay(1000 * attempt);
            continue;
          }
          throw lastError;
        }

        // Check if the tool execution failed (isError flag)
        if (toolResult.isError) {
          // Create a proper error from the tool result content
          const errorMessage = toolResult.content?.[0]?.text || 'Tool execution failed';
          console.warn(`[MCPClient] Attempt ${attempt}/${maxRetries}: Tool "${toolName}" execution failed with error:`, errorMessage);
          
          // Check if this is a retryable error
          if (this.isRetryableError(errorMessage) && attempt < maxRetries) {
            lastError = new Error(`Tool "${toolName}" execution failed: ${errorMessage}`);
            await this.delay(1000 * attempt);
            continue;
          }
          
          // For non-retryable errors or after max retries, throw with enhanced message
          let enhancedErrorMessage = errorMessage;
          if (errorMessage.includes('Cannot read properties of undefined')) {
            enhancedErrorMessage = `MCP server internal error (${errorMessage}). Please check server implementation or try alternative tools.`;
          }
          
          throw new Error(`Tool "${toolName}" execution failed: ${enhancedErrorMessage}`);
        }

        console.debug(`[MCPClient] Tool "${toolName}" execution succeeded on attempt ${attempt}`);
        return toolResult;
      } catch (error: any) {
        lastError = error;
        if (attempt < maxRetries) {
          console.warn(`[MCPClient] Attempt ${attempt}/${maxRetries} failed for tool "${toolName}":`, error.message);
          await this.delay(1000 * attempt);
        }
      }
    }

    // If we get here, all retries failed
    console.error(`[MCPClient] Tool "${toolName}" execution failed after ${maxRetries} attempts`);
    throw lastError || new Error(`Tool "${toolName}" execution failed after ${maxRetries} attempts`);
  }

  async refreshTools(): Promise<void> {
    await this.listTools();
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  findTool(name: string): Tool | undefined {
    return this.tools.find(tool => tool.name === name);
  }

  // ==================== Resource Related Methods ====================

  async listResources(): Promise<Resource[]> {
    const response = await this.sendRequest(MCP_METHODS.RESOURCES_LIST);
    const resourceList = response as ResourceList;
    this.resources = resourceList.resources;
    this.emitEvent('resources_updated', this.resources);
    return this.resources;
  }

  async readResource(uri: string): Promise<any> {
    const response = await this.sendRequest(MCP_METHODS.RESOURCES_READ, { uri });
    return response;
  }

  async refreshResources(): Promise<void> {
    await this.listResources();
  }

  getResources(): Resource[] {
    return [...this.resources];
  }

  // ==================== Prompt Related Methods ====================

  async listPrompts(): Promise<Prompt[]> {
    const response = await this.sendRequest(MCP_METHODS.PROMPTS_LIST);
    const promptList = response as PromptList;
    this.prompts = promptList.prompts;
    this.emitEvent('prompts_updated', this.prompts);
    return this.prompts;
  }

  async getPrompt(name: string, arguments_?: Record<string, any>): Promise<any> {
    const response = await this.sendRequest(MCP_METHODS.PROMPTS_GET, {
      name,
      arguments: arguments_,
    });
    return response;
  }

  async refreshPrompts(): Promise<void> {
    await this.listPrompts();
  }

  getPrompts(): Prompt[] {
    return [...this.prompts];
  }

  // ==================== Core Request Methods ====================

  private async sendRequest(method: string, params?: any): Promise<any> {
    if (!this.isConnected()) {
      throw new Error('Not connected to MCP server');
    }

    const requestId = this.generateRequestId();
    const request: JSONRPCRequest = {
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout });

      this.transport.send(request).catch(error => {
        this.pendingRequests.delete(requestId);
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private generateRequestId(): string {
    return `req_${++this.requestId}_${Date.now()}`;
  }

  // ==================== Transport Layer Event Handling ====================

  private setupTransportListeners(): void {
    this.transport.on('message', this.handleTransportMessage.bind(this));
    this.transport.on('error', this.handleTransportError.bind(this));
    this.transport.on('connected', () => {
      this.connected = true;
      this.emitEvent('connected');
    });
    this.transport.on('disconnected', () => {
      this.connected = false;
      this.emitEvent('disconnected');
    });
  }

  private handleTransportMessage(message: any): void {
    try {
      const response = message as JSONRPCResponse;

      // Check if response is valid
      if (!response || typeof response !== 'object') {
        console.error('[MCPClient] Invalid response received:', message);
        return;
      }

      // Handle request response
      if (response.id && this.pendingRequests.has(response.id)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(response.id)!;
        clearTimeout(timeout);
        this.pendingRequests.delete(response.id);

        if (response.error) {
          const errorMessage = response.error.message || 'Unknown error';
          const error = new Error(errorMessage);
          (error as any).code = response.error.code;
          (error as any).data = response.error.data;
          reject(error);
        } else {
          // Check if result is undefined (should not happen per JSON-RPC spec)
          if (response.result === undefined) {
            console.warn('[MCPClient] Response result is undefined, resolving with null');
            resolve(null);
          } else {
            resolve(response.result);
          }
        }
      }

      // Handle server-pushed notifications (messages without id)
      else if (!response.id) {
        this.handleNotification(response);
      }
    } catch (error) {
      this.emitEvent('error', error);
    }
  }

  private handleTransportError(error: Error): void {
    this.emitEvent('error', error);
  }

  private handleNotification(response: JSONRPCResponse): void {
    // Handle server-pushed notifications
    // For example: tools/changed, resources/changed, etc.
    if (response.result) {
      // Can handle different types of notifications based on method field
      console.log('Received notification:', response);
    }
  }

  // ==================== Event Emission ====================

  private emitEvent(type: MCPEventType, data?: any): void {
    const event: MCPEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    this.emit(type, event);
    this.emit('event', event);
  }

  // ==================== Utility Methods ====================

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private isRetryableError(errorMessage: string): boolean {
    // Define which errors are retryable
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporarily/i,
      /busy/i,
      /rate limit/i,
      /too many requests/i,
      /server error/i,
      /internal error/i
    ];

    // Check if error matches any retryable pattern
    for (const pattern of retryablePatterns) {
      if (pattern.test(errorMessage)) {
        return true;
      }
    }

    // Default to non-retryable for specific server bugs
    if (errorMessage.includes('Cannot read properties of undefined')) {
      return false; // Server bug, retrying won't help
    }

    return false; // Default to non-retryable
  }

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt < this.config.maxRetries!) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000);
          await new Promise(resolve => setTimeout(resolve, delay));
          continue;
        }
      }
    }

    throw lastError!;
  }

  // ==================== Status Query ====================

  getStatus() {
    return {
      connected: this.connected,
      toolsCount: this.tools.length,
      resourcesCount: this.resources.length,
      promptsCount: this.prompts.length,
      sessionId: this.sessionId,
    };
  }

  // ==================== Cleanup ====================

  destroy(): void {
    this.disconnect().catch(() => {
      // Ignore errors when disconnecting
    });

    this.removeAllListeners();
    this.pendingRequests.clear();
    this.tools = [];
    this.resources = [];
    this.prompts = [];
  }
}
