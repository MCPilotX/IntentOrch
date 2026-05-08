import { EventEmitter } from "events";
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

    logger.info(`[SseTransport] Connecting to SSE endpoint: ${this.config.url}`);

    return new Promise((resolve, reject) => {
      try {
        const headers = {
          "Accept": "text/event-stream",
          ...this.config.headers,
        };
        
        this.eventSource = new EventSource(this.config.url, {
          headers: headers,
        } as any);

        if (!this.eventSource) {
          reject(new Error("Failed to create EventSource"));
          return;
        }

        this.eventSource.onerror = (error: any) => {
          const errorMsg = error && typeof error === 'object' ? JSON.stringify(error) : String(error);
          logger.error(`[SseTransport] SSE error: ${errorMsg}`);
          if (!this._connected) {
            reject(new Error(`Failed to connect to SSE endpoint: ${errorMsg}`));
          } else {
            this.emit("error", new Error(`SSE connection error: ${errorMsg}`));
          }
        };

        this.eventSource.onmessage = (event: any) => {
          logger.info(`[SseTransport] Message received: ${event.data.substring(0, 500)}${event.data.length > 500 ? '...' : ''}`);
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
          logger.info(`[SseTransport] Outbound endpoint received: ${this.postUrl}`);
          
          // Mark as connected and resolve only after receiving the endpoint event
          // This ensures postUrl is available before any send() calls
          if (!this._connected) {
            this._connected = true;
            this.emit("connected");
            
            // Small delay to ensure server-side setup is complete before first POST
            setTimeout(() => {
              resolve();
            }, 500);
          }
        });

        // Also handle the case where the server sends the endpoint in the initial connection
        // Some servers send endpoint as the first event before onopen
        this.eventSource.onopen = () => {
          logger.info(`[SseTransport] SSE connection opened for ${this.config.url}`);
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
    try {
      const baseUrl = new URL(this.config.url);
      if (this.postUrl) {
        // If postUrl is absolute, URL constructor handles it; if relative, it resolves against baseUrl
        url = new URL(this.postUrl, baseUrl.href).href;
      }
    } catch (e) {
      logger.warn(`[SseTransport] URL resolution failed, using fallback: ${e}`);
    }

    logger.debug(`[SseTransport] POSTing to ${url}: ${JSON.stringify(message).substring(0, 200)}`);

    try {
      const response = await axios.post(url, message, {
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        timeout: 10000,
        // Don't validate status here, handle it below
        validateStatus: () => true,
      });

      if (response.status >= 400) {
        logger.error(`[SseTransport] POST failed with status ${response.status}: ${JSON.stringify(response.data)}`);
        this.emit("error", new Error(`POST failed with status ${response.status}`));
        return;
      }

      // If the server returns a JSON-RPC response directly in the HTTP response
      if (response.data && typeof response.data === 'object' && response.data.jsonrpc === '2.0') {
        logger.debug(`[SseTransport] Received direct response from POST`);
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
