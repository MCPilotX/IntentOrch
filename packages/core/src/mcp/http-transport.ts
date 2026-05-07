import { EventEmitter } from "events";
import axios, { AxiosInstance } from "axios";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

export class HttpTransport extends EventEmitter implements MCPTransport {
  private _connected: boolean = false;
  private axiosInstance: AxiosInstance;

  constructor(
    private config: {
      url: string;
      headers?: Record<string, string>;
    },
  ) {
    super();
    this.axiosInstance = axios.create({
      baseURL: config.url,
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
    });
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
      const response = await this.axiosInstance.post("/", message);
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
