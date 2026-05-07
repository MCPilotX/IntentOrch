import { EventEmitter } from "events";
import { spawn, ChildProcess } from "child_process";
import { MCPTransport } from "./transport.js";
import { JSONRPCRequest } from "./types.js";

export class StdioTransport extends EventEmitter implements MCPTransport {
  private process: ChildProcess | null = null;
  private buffer: string = "";
  private _connected: boolean = false;
  private _existingProcess: ChildProcess | null = null;

  constructor(
    private config: {
      command: string;
      args?: string[];
      env?: Record<string, string>;
      existingProcess?: ChildProcess;
    },
  ) {
    super();
    this._existingProcess = config.existingProcess || null;
  }

  async connect(): Promise<void> {
    if (this._connected) return;

    const setupProcessListeners = (child: ChildProcess) => {
      child.stdout?.on("data", (data: Buffer) => {
        this.buffer += data.toString();
        this.processBuffer();
      });

      child.stderr?.on("data", (data: Buffer) => {
        const msg = data.toString().trim();
        if (msg) {
          this.emit("stderr", msg);
        }
      });

      child.on("error", (error: Error) => {
        this._connected = false;
        this.emit("error", error);
      });

      child.on("exit", (code: number | null) => {
        this._connected = false;
        this.emit("disconnected");
        if (code !== 0 && code !== null) {
          this.emit("error", new Error(`Process exited with code ${code}`));
        }
      });

      child.on("close", () => {
        this._connected = false;
        this.emit("disconnected");
      });
    };

    if (this._existingProcess) {
      this.process = this._existingProcess;
      setupProcessListeners(this.process);
      this._connected = true;
      this.emit("connected");
      return;
    }

    return new Promise((resolve, reject) => {
      try {
        const child = spawn(this.config.command, this.config.args || [], {
          stdio: ["pipe", "pipe", "pipe"],
          env: this.config.env || (process.env as Record<string, string>),
          shell: false,
        });

        this.process = child;
        setupProcessListeners(child);

        setTimeout(() => {
          if (child.exitCode === null) {
            this._connected = true;
            this.emit("connected");
            resolve();
          } else {
            reject(new Error(`Process exited immediately with code ${child.exitCode}`));
          }
        }, 500);
      } catch (error) {
        reject(error);
      }
    });
  }

  async disconnect(): Promise<void> {
    if (this.process) {
      if (this._existingProcess) {
        this.process = null;
        this._connected = false;
        return;
      }
      this.process.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 500));
      if (this.process.exitCode === null) {
        this.process.kill("SIGKILL");
      }
      this.process = null;
    }
    this._connected = false;
  }

  isConnected(): boolean {
    return this._connected && this.process !== null && this.process.exitCode === null;
  }

  async send(message: JSONRPCRequest): Promise<void> {
    if (!this.process?.stdin) {
      throw new Error("Transport not connected");
    }
    const data = JSON.stringify(message) + "\n";
    this.process.stdin.write(data);
  }

  private processBuffer(): void {
    const lines = this.buffer.split("\n");
    this.buffer = lines.pop() || "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const message = JSON.parse(trimmed);
        this.emit("message", message);
      } catch (error) {
        this.emit("stderr", trimmed);
      }
    }
  }
}
