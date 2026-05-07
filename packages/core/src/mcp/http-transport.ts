import { EventEmitter } from "events";
import axios from "axios";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

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
    // HTTP is technically stateless for simple requests, 
    // but we mark as connected.
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
      const response = await axios.post(this.config.url, message, {
        headers: {
          "Content-Type": "application/json",
          ...this.config.headers,
        },
      });
      this.emit("message", response.data);
    } catch (error: any) {
      logger.error(`[HttpTransport] request failed: ${error.message}`);
      this.emit("error", error);
    }
  }

  isConnected(): boolean {
    return this._connected;
  }
}
