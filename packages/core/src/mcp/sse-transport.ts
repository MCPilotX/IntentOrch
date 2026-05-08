import { EventEmitter } from "events";
import axios from "axios";
import { EventSource } from "eventsource";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

export class SseTransport extends EventEmitter implements MCPTransport {
  private eventSource: EventSource | null = null;
  private postUrl: string | null = null;
  private _connected: boolean = false;

  constructor(
    private config: {
      url: string;
      headers?: Record<string, string>;
    },
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    return new Promise((resolve, reject) => {
      try {
        this.eventSource = new EventSource(this.config.url, {
          headers: this.config.headers,
        } as any);

        if (!this.eventSource) {
          reject(new Error("Failed to create EventSource"));
          return;
        }

        this.eventSource.onerror = (error: any) => {
          logger.error(`[SseTransport] SSE error:`, error);
          if (!this._connected) {
            reject(new Error("Failed to connect to SSE endpoint"));
          } else {
            this.emit("error", new Error("SSE connection error"));
          }
        };

        this.eventSource.onmessage = (event: any) => {
          try {
            const message = JSON.parse(event.data);
            this.emit("message", message);
          } catch (error) {
            logger.warn(`[SseTransport] Failed to parse message:`, event.data);
          }
        };

        // Standard MCP SSE 'endpoint' event to tell client where to post
        this.eventSource.addEventListener("endpoint", (event: any) => {
          this.postUrl = event.data;
          logger.debug(`[SseTransport] Outbound endpoint received: ${this.postUrl}`);
          
          // Mark as connected and resolve only after receiving the endpoint event
          // This ensures postUrl is available before any send() calls
          if (!this._connected) {
            this._connected = true;
            this.emit("connected");
            resolve();
          }
        });

        // Also handle the case where the server sends the endpoint in the initial connection
        // Some servers send endpoint as the first event before onopen
        this.eventSource.onopen = () => {
          // If endpoint already received, we're good
          if (this.postUrl) {
            if (!this._connected) {
              this._connected = true;
              this.emit("connected");
              resolve();
            }
          }
          // Otherwise, wait for endpoint event (handled above)
        };

      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
    this._connected = false;
    this.emit("disconnected");
  }

  async send(message: JSONRPCRequest): Promise<void> {
    if (!this._connected) {
      throw new Error("Transport not connected");
    }

    // Resolve the post URL: if it's a relative path, resolve it against the base URL
    let url = this.postUrl || this.config.url;
    if (this.postUrl && this.postUrl.startsWith('/')) {
      try {
        const baseUrl = new URL(this.config.url);
        url = `${baseUrl.origin}${this.postUrl}`;
      } catch {
        // If base URL is invalid, fall back to original behavior
        logger.warn(`[SseTransport] Could not resolve base URL from ${this.config.url}, using postUrl as-is`);
      }
    }

    try {
      const response = await axios.post(url, message, {
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
      });
      
      // If the server returns a JSON-RPC response directly in the HTTP response,
      // emit it as a message for the MCPClient to process
      if (response.data && typeof response.data === 'object' && response.data.jsonrpc === '2.0') {
        this.emit("message", response.data);
      }
    } catch (error: any) {
      logger.error(`[SseTransport] POST failed: ${error.message}`);
      this.emit("error", error);
    }
  }

  isConnected(): boolean {
    return this._connected;
  }
}
