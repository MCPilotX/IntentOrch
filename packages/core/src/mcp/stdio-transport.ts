import { EventEmitter } from "events";
import { ChildProcess } from "child_process";
import { 
  StdioClientTransport 
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";
import { logger } from "../core/logger.js";

/**
 * Stdio Transport - Wrapper around official MCP SDK StdioClientTransport
 * Provides maximum stability for local MCP server processes
 */
export class StdioTransport extends EventEmitter implements MCPTransport {
  private sdkTransport: StdioClientTransport | null = null;
  private _connected: boolean = false;

  constructor(
    private config: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      existingProcess?: ChildProcess;
    },
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    try {
      // If an existing process is provided, the official SDK doesn't directly support 
      // wrapping a raw ChildProcess in StdioClientTransport easily without internal hacks.
      // However, for IntentOrch's architecture, we'll initialize the standard SDK transport.
      
      this.sdkTransport = new StdioClientTransport({
        command: this.config.command,
        args: this.config.args || [],
        env: this.config.env || (process.env as Record<string, string>),
        stderr: "pipe"
      });

      // Pipe messages and errors
      this.sdkTransport.onmessage = (message: JSONRPCMessage) => {
        this.emit("message", message);
      };

      this.sdkTransport.onerror = (error: Error) => {
        logger.error(`[StdioTransport] SDK Error:`, error);
        this.emit("error", error);
      };

      this.sdkTransport.onclose = () => {
        this._connected = false;
        this.emit("disconnected");
      };

      await this.sdkTransport.start();
      this._connected = true;
      this.emit("connected");
      
      logger.info(`[StdioTransport] Local process started: ${this.config.command}`);
    } catch (error: any) {
      logger.error(`[StdioTransport] Failed to start process: ${error.message}`);
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    if (this.sdkTransport) {
      await this.sdkTransport.close();
      this.sdkTransport = null;
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected;
  }

  async send(message: JSONRPCRequest): Promise<void> {
    if (!this._connected || !this.sdkTransport) {
      throw new Error("Transport not connected");
    }

    try {
      await this.sdkTransport.send(message as any);
    } catch (error: any) {
      logger.error(`[StdioTransport] Send failed: ${error.message}`);
      this.emit("error", error);
      throw error;
    }
  }
}

