import { EventEmitter } from "events";
import axios from "axios";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

/**
 * HTTP Transport - Custom implementation using Axios
 * Note: The official MCP SDK does not currently provide a standard HttpClientTransport
 */
export class HttpTransport extends EventEmitter implements MCPTransport {
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
    // HTTP is technically stateless, but we mark as connected to satisfy interface
    this._connected = true;
    this.emit("connected");
  }

  async disconnect(): Promise<void> {
    this._connected = false;
    this.emit("disconnected");
  }

  async send(message: JSONRPCRequest): Promise<void> {
    if (!this._connected) {
      throw new Error("Transport not connected");
    }

    try {
      // Use axios for standard HTTP POST tool calls
      const response = await axios.post(this.config.url, message, {
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
        timeout: 30000,
        proxy: false
      });

      // Emit response message for MCPClient to process
      if (response.data) {
        this.emit("message", response.data);
      }
    } catch (error: unknown) {
      const axiosError = error as { response?: { status: number } };
      const errorMsg = axiosError.response ? `HTTP ${axiosError.response.status}` : (error instanceof Error ? error.message : String(error));
      logger.error(`[HttpTransport] request failed: ${errorMsg}`);
      this.emit("error", error);
    }
  }

  isConnected(): boolean {
    return this._connected;
  }
}
