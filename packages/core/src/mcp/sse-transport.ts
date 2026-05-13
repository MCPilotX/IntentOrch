import { EventEmitter } from "events";
import { 
  SSEClientTransport 
} from "@modelcontextprotocol/sdk/client/sse.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

/**
 * SSE Transport - Wrapper around official MCP SDK SSEClientTransport
 * Provides maximum compatibility with official MCP tools and servers
 */
export class SseTransport extends EventEmitter implements MCPTransport {
  private sdkTransport: SSEClientTransport;
  private _connected: boolean = false;

  constructor(
    private config: {
      url: string;
      headers?: Record<string, string>;
    },
  ) {
    super();
    // Initialize official SDK transport
    this.sdkTransport = new SSEClientTransport(new URL(this.config.url), {
      eventSourceInit: {
        headers: this.config.headers
      } as Record<string, unknown>,
      requestInit: {
        headers: this.config.headers
      }
    });

    // Pipe events from SDK transport to our interface
    this.sdkTransport.onmessage = (message: JSONRPCMessage) => {
      this.emit("message", message);
    };

    this.sdkTransport.onerror = (error: Error) => {
      logger.error(`[SseTransport] SDK Error:`, error);
      this.emit("error", error);
    };

    this.sdkTransport.onclose = () => {
      this._connected = false;
      this.emit("disconnected");
    };
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    logger.info(`[SseTransport] Connecting via Official SDK: ${this.config.url}`);
    
    try {
      await this.sdkTransport.start();
      this._connected = true;
      this.emit("connected");
      logger.info(`[SseTransport] Official SDK connection established`);
    } catch (error: unknown) {
      logger.error(`[SseTransport] SDK Connection failed: ${(error instanceof Error ? error.message : String(error))}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.sdkTransport.close();
    } catch (error: unknown) {
      logger.warn(`[SseTransport] Error during SDK close (non-fatal): ${(error instanceof Error ? error.message : String(error))}`);
      // EPIPE / connection reset during close is expected. We still need to
      // update state to avoid FD leaks.
    }
    this._connected = false;
  }

  async send(message: JSONRPCRequest): Promise<void> {
    if (!this._connected) {
      throw new Error("Transport not connected");
    }

    try {
      // SDK handles endpoint resolution and POSTing internally
      await this.sdkTransport.send(message as unknown as JSONRPCMessage);
    } catch (error: unknown) {
      logger.error(`[SseTransport] SDK Send failed: ${(error instanceof Error ? error.message : String(error))}`);
      this.emit("error", error);
      throw error;
    }
  }

  isConnected(): boolean {
    return this._connected;
  }
}

