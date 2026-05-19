import { EventEmitter } from "events";
import { JSONRPCRequest } from "./types.js";

export interface MCPTransport extends EventEmitter {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  send(message: JSONRPCRequest): Promise<void>;
  isConnected(): boolean;
}
