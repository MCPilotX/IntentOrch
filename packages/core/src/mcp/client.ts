import { logger } from "../core/logger.js";
/**
 * MCP Client Core Class
 * Provides complete MCP protocol client functionality
 *
 * Simplified version without TransportFactory and CircuitBreaker dependencies.
 * Uses a simple stdio-based transport implementation.
 */

import { EventEmitter } from "events";
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
} from "./types.js";
import { ParameterMapper } from "./parameter-mapper.js";
import {
  ErrorBoundary,
  globalErrorBoundary,
} from "../kernel/error-boundary.js";
import { StdioTransport } from "./stdio-transport.js";
import { HttpTransport } from "./http-transport.js";
import { SseTransport } from "./sse-transport.js";
import { MCPTransport } from "./transport.js";

// ==================== MCP Client ====================

export class MCPClient extends EventEmitter {
  private config: MCPClientConfig;
  private transport: MCPTransport;
  private connected: boolean = false;
  private requestId: number = 0;
  private pendingRequests: Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  > = new Map();

  // State
  private tools: Tool[] = [];
  private resources: Resource[] = [];
  private prompts: Prompt[] = [];
  private sessionId?: string;

  constructor(config: MCPClientConfig) {
    super();
    this.config = {
      autoConnect: false,
      timeout: 60000,
      maxRetries: 3,
      ...config,
    };

    if (config.transport.type === "stdio") {
      this.transport = new StdioTransport({
        command: config.transport.command || "npx",
        args: config.transport.args || [],
        env: config.transport.env as Record<string, string> | undefined,
        existingProcess: config.transport.existingProcess,
      });
    } else if (config.transport.type === "http") {
      this.transport = new HttpTransport({
        url: config.transport.url!,
        headers: config.transport.headers,
      });
    } else if (config.transport.type === "sse") {
      this.transport = new SseTransport({
        url: config.transport.url!,
        headers: config.transport.headers,
      });
    } else {
      throw new Error(
        `Transport type ${config.transport.type} is not supported yet`,
      );
    }
    this.setupTransportListeners();
  }

  // ==================== Connection Management ====================

  async connect(): Promise<void> {
    if (this.connected) return;

    const result = await globalErrorBoundary.execute(
      async () => {
        await this.transport.connect();

        // 1. Send mandatory initialize request
        logger.info(`[MCPClient] Sending initialize request to ${this.config.serverName}...`);
        const initResult = await this.sendRequest(MCP_METHODS.INITIALIZE, {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "IntentOrch", version: "0.8.0" }
        });

        const initResultAny = initResult as { serverInfo?: { name?: string; version?: string } };
        logger.info(`[MCPClient] Server initialized: ${initResultAny?.serverInfo?.name} ${initResultAny?.serverInfo?.version}`);

        // 2. Send mandatory initialized notification (BARE-BONES - NO PARAMS)
        // Many Java/Spring servers require this specific notification to "unlock" the session
        logger.info(`[MCPClient] Sending initialized notification...`);
        await this.sendNotification(MCP_METHODS.NOTIFICATIONS_INITIALIZED);

        // 3. Set logging level (Follows Inspector's sequence for Java servers)
        try {
          logger.info(`[MCPClient] Setting logging level to info...`);
          await this.sendRequest(MCP_METHODS.LOGGING_SET_LEVEL, { level: "info" });
        } catch (e) {
          logger.warn(`[MCPClient] logging/setLevel failed (ignoring):`, e);
        }

        this.connected = true;
        this.emitEvent("connected");

        if (this.config.autoConnect) {
          await this.refreshTools();
        }
      },
      {
        serverName: this.config.serverName,
        operationName: "connect",
      },
    );

    if (!result.success) {
      this.emitEvent("error", result.error);
      throw result.error || new Error("Connection failed");
    }
  }

  /**
   * Send a JSON-RPC notification (MUST NOT have an ID or empty PARAMS)
   */
  private async sendNotification(method: string, params?: Record<string, unknown>): Promise<void> {
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id: null,
      method,
    };
    // CRITICAL: Only add params if they are non-empty. 
    // Java servers often fail if an empty {} is provided for notification methods that expect nothing.
    if (params && Object.keys(params).length > 0) {
      request.params = params;
    }
    await this.transport.send(request);
  }
  async disconnect(): Promise<void> {
    if (!this.connected) return;

    try {
      await this.transport.disconnect();
    } catch (error) {
      logger.warn(`[MCPClient] Transport disconnect error for "${this.config.serverName}" (non-fatal):`, error);
      this.emitEvent("error", error);
      // IMPORTANT: Do NOT re-throw. Transport disconnect can fail with EPIPE
      // when the remote side has already closed the connection. The caller
      // (disconnectServer / cleanupConnections) must still be able to clean up
      // its internal state (connectedServers Map). Re-throwing here would
      // prevent the finally block from running — but even with finally,
      // the error would propagate to the caller and potentially leave the
      // cleanup incomplete.
    } finally {
      this.connected = false;
      this.pendingRequests.forEach(({ reject, timeout }) => {
        clearTimeout(timeout);
        reject(new Error("Disconnected"));
      });
      this.pendingRequests.clear();
      this.emitEvent("disconnected");
    }
  }

  isConnected(): boolean {
    return this.connected && this.transport.isConnected();
  }

  // ==================== Tool Related Methods ====================

  async listTools(): Promise<Tool[]> {
    const result = await globalErrorBoundary.execute(
      async () => {
        const response = await this.sendRequest(MCP_METHODS.TOOLS_LIST);
        const toolList = response as ToolList;
        this.tools = toolList.tools;
        this.emitEvent("tools_updated", this.tools);
        return this.tools;
      },
      {
        serverName: this.config.serverName,
        operationName: "listTools",
      },
    );

    if (!result.success) {
      throw result.error || new Error("Failed to list tools");
    }

    return result.result!;
  }

  async callTool(
    toolName: string,
    arguments_: Record<string, unknown>,
  ): Promise<ToolResult> {
    const tool = this.findTool(toolName);
    let mappedArguments = arguments_;

    if (tool) {
      try {
        const { normalized } = ParameterMapper.validateAndNormalize(
          toolName,
          tool.inputSchema,
          arguments_,
        );
        mappedArguments = normalized;
      } catch (error) {
        logger.warn(
          `Parameter mapping failed for tool "${toolName}":`,
          error instanceof Error ? (error instanceof Error ? error.message : String(error)) : String(error),
        );
      }
    }

    // Clean up null values
    if (tool && tool.inputSchema && tool.inputSchema.properties) {
      for (const [paramName, paramValue] of Object.entries(mappedArguments)) {
        if (paramValue === null || paramValue === undefined) {
          const paramSchema = tool.inputSchema.properties[paramName];
          if (paramSchema) {
            if (paramSchema.default !== undefined) {
              mappedArguments[paramName] = paramSchema.default;
            } else {
              delete mappedArguments[paramName];
            }
          } else {
            delete mappedArguments[paramName];
          }
        }
      }
    }

    const result = await globalErrorBoundary.execute(
      async () => {
        let lastError: Error | null = null;
        const maxRetries = this.config.maxRetries || 3;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
          try {
            const response = await this.sendRequest(MCP_METHODS.TOOLS_CALL, {
              name: toolName,
              arguments: mappedArguments,
            });

            if (response === undefined || response === null) {
              lastError = new Error(
                `Tool "${toolName}" execution failed: MCP server returned empty response`,
              );
              if (attempt < maxRetries) {
                await this.delay(1000 * attempt);
                continue;
              }
              throw lastError;
            }

            const toolResult = response as ToolResult;

            if (typeof toolResult !== "object" || toolResult === null) {
              lastError = new Error(
                `Tool "${toolName}" execution failed: invalid response format`,
              );
              if (attempt < maxRetries) {
                await this.delay(1000 * attempt);
                continue;
              }
              throw lastError;
            }

            if (toolResult.isError) {
              const errorMessage =
                toolResult.content?.[0]?.text || "Tool execution failed";
              if (this.isRetryableError(errorMessage) && attempt < maxRetries) {
                lastError = new Error(
                  `Tool "${toolName}" execution failed: ${errorMessage}`,
                );
                await this.delay(1000 * attempt);
                continue;
              }
              throw new Error(
                `Tool "${toolName}" execution failed: ${errorMessage}`,
              );
            }

            return toolResult;
          } catch (error) {
            lastError = error as Error;
            if (attempt < maxRetries) {
              await this.delay(1000 * attempt);
            }
          }
        }

        throw (
          lastError ||
          new Error(
            `Tool "${toolName}" execution failed after ${maxRetries} attempts`,
          )
        );
      },
      {
        serverName: this.config.serverName,
        toolName,
        operationName: `callTool:${toolName}`,
      },
    );

    if (!result.success) {
      throw result.error || new Error(`Tool "${toolName}" execution failed`);
    }

    return result.result!;
  }

  async refreshTools(): Promise<void> {
    await this.listTools();
  }

  getTools(): Tool[] {
    return [...this.tools];
  }

  findTool(name: string): Tool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }

  // ==================== Resource Related Methods ====================

  async listResources(): Promise<Resource[]> {
    const result = await globalErrorBoundary.execute(
      async () => {
        const response = await this.sendRequest(MCP_METHODS.RESOURCES_LIST);
        const resourceList = response as ResourceList;
        this.resources = resourceList.resources;
        this.emitEvent("resources_updated", this.resources);
        return this.resources;
      },
      {
        serverName: this.config.serverName,
        operationName: "listResources",
      },
    );

    if (!result.success) {
      throw result.error || new Error("Failed to list resources");
    }

    return result.result!;
  }

  async readResource(uri: string): Promise<unknown> {
    const result = await globalErrorBoundary.execute(
      async () => {
        const response = await this.sendRequest(MCP_METHODS.RESOURCES_READ, {
          uri,
        });
        return response;
      },
      {
        serverName: this.config.serverName,
        operationName: `readResource:${uri}`,
      },
    );

    if (!result.success) {
      throw result.error || new Error(`Failed to read resource: ${uri}`);
    }

    return result.result;
  }

  async refreshResources(): Promise<void> {
    await this.listResources();
  }

  getResources(): Resource[] {
    return [...this.resources];
  }

  // ==================== Prompt Related Methods ====================

  async listPrompts(): Promise<Prompt[]> {
    const result = await globalErrorBoundary.execute(
      async () => {
        const response = await this.sendRequest(MCP_METHODS.PROMPTS_LIST);
        const promptList = response as PromptList;
        this.prompts = promptList.prompts;
        this.emitEvent("prompts_updated", this.prompts);
        return this.prompts;
      },
      {
        serverName: this.config.serverName,
        operationName: "listPrompts",
      },
    );

    if (!result.success) {
      throw result.error || new Error("Failed to list prompts");
    }

    return result.result!;
  }

  async getPrompt(
    name: string,
    arguments_?: Record<string, unknown>,
  ): Promise<unknown> {
    const result = await globalErrorBoundary.execute(
      async () => {
        const response = await this.sendRequest(MCP_METHODS.PROMPTS_GET, {
          name,
          arguments: arguments_,
        });
        return response;
      },
      {
        serverName: this.config.serverName,
        operationName: `getPrompt:${name}`,
      },
    );

    if (!result.success) {
      throw result.error || new Error(`Failed to get prompt: ${name}`);
    }

    return result.result;
  }

  async refreshPrompts(): Promise<void> {
    await this.listPrompts();
  }

  getPrompts(): Prompt[] {
    return [...this.prompts];
  }

  // ==================== Core Request Methods ====================

  private async sendRequest(method: string, params?: Record<string, unknown>): Promise<unknown> {
    if (!this.isConnected()) {
      throw new Error("Not connected to MCP server");
    }

    const requestId = this.generateRequestId();
    // Ensure params is at least an empty object, never undefined
    const normalizedParams = params || {};
    
    const request: JSONRPCRequest = {
      jsonrpc: "2.0",
      id: requestId,
      method,
      params: normalizedParams,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(requestId);
        this.pendingRequests.delete(String(requestId)); // Cleanup both variants
        reject(new Error(`Request timeout after ${this.config.timeout}ms`));
      }, this.config.timeout);

      // Store with both original ID and string ID for maximum lookup compatibility
      this.pendingRequests.set(requestId, { resolve, reject, timeout });
      this.pendingRequests.set(String(requestId), { resolve, reject, timeout });

      this.transport.send(request).catch((error) => {
        this.pendingRequests.delete(requestId);
        this.pendingRequests.delete(String(requestId));
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  private generateRequestId(): number {
    return ++this.requestId;
  }

  // ==================== Transport Layer Event Handling ====================

  private setupTransportListeners(): void {
    this.transport.on("message", this.handleTransportMessage.bind(this));
    this.transport.on("error", this.handleTransportError.bind(this));
    this.transport.on("connected", () => {
      this.connected = true;
      this.emitEvent("connected");
    });
    this.transport.on("disconnected", () => {
      this.connected = false;
      this.emitEvent("disconnected");
    });
  }

  private handleTransportMessage(message: unknown): void {
    try {
      const response = message as JSONRPCResponse;

      if (!response || typeof response !== "object") {
        logger.error("[MCPClient] Invalid response received:", message);
        return;
      }

      // Check if ID matches, handling both number and string representations
      const id = response.id;
      if (id !== undefined && id !== null && this.pendingRequests.has(id)) {
        const { resolve, reject, timeout } = this.pendingRequests.get(id)!;
        clearTimeout(timeout);
        
        // Cleanup all variants of this ID from the map
        this.pendingRequests.delete(id);
        this.pendingRequests.delete(String(id));
        this.pendingRequests.delete(Number(id));

        if (response.error) {
          const errorMessage = response.error.message || "Unknown error";
          const error = new Error(errorMessage);
          (error as { code?: number; data?: unknown }).code = response.error.code;
          (error as { code?: number; data?: unknown }).data = response.error.data;
          reject(error);
        } else {
          resolve(response.result !== undefined ? response.result : null);
        }
      } else if (id === undefined || id === null) {
        this.handleNotification(response);
      }
    } catch (error) {
      this.emitEvent("error", error);
    }
  }

  private handleTransportError(error: unknown): void {
    // Only log if it's a real error, avoid flooding with empty {} from SDK
    if (error && Object.keys(error).length > 0) {
      logger.error(`[MCPClient] Transport error for "${this.config.serverName}":`, error);
    }
    this.emitEvent("error", error);
  }

  private handleNotification(response: JSONRPCResponse): void {
    if (response.result) {
      logger.debug("Received notification:", response);
    }
  }

  // ==================== Event Emission ====================

  private emitEvent(type: MCPEventType, data?: unknown): void {
    const event: MCPEvent = {
      type,
      data,
      timestamp: Date.now(),
    };
    
    // Safely emit 'error' to avoid ERR_UNHANDLED_ERROR if no listeners are attached
    if (type === "error") {
      if (this.listenerCount("error") > 0) {
        this.emit("error", event);
      } else if (data && Object.keys(data).length > 0) {
        // Only log non-empty unhandled errors
        logger.error(`[MCPClient] Unhandled error in "${this.config.serverName}":`, data);
      }
    } else {
      this.emit(type, event);
    }
    
    this.emit("event", event);
  }

  // ==================== Utility Methods ====================

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  private isRetryableError(errorMessage: string): boolean {
    const retryablePatterns = [
      /timeout/i,
      /network/i,
      /connection/i,
      /temporarily/i,
      /busy/i,
      /rate limit/i,
      /too many requests/i,
      /server error/i,
      /internal error/i,
    ];
    return retryablePatterns.some((pattern) => pattern.test(errorMessage));
  }

  async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error;
    for (let attempt = 1; attempt <= this.config.maxRetries!; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;
        if (attempt < this.config.maxRetries!) {
          await new Promise((resolve) =>
            setTimeout(
              resolve,
              Math.min(1000 * Math.pow(2, attempt - 1), 10000),
            ),
          );
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
    this.disconnect().catch(() => {});
    this.removeAllListeners();
    this.pendingRequests.clear();
    this.tools = [];
    this.resources = [];
    this.prompts = [];
  }
}
