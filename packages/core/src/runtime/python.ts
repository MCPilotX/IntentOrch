import { logger } from "../core/logger";
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export interface AdapterOptions {
  name: string;
  cwd: string;
  env?: Record<string, string>;
}

export class PythonAdapter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, (res: any) => void>();

  constructor(private options: AdapterOptions) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      logger.info(`[RAL] Starting Python service: ${this.options.name}`);

      // Automatically find python interpreter in virtual environment
      const venvPath = path.join(this.options.cwd, 'venv', 'bin', 'python');
      const pythonPath = fs.existsSync(venvPath) ? venvPath : 'python3';

      // Start command, usually MCP Python services are started via main.py or -m module
      // Here we assume entry is main.py (will be read from configuration later)
      this.process = spawn(pythonPath, ['main.py'], {
        cwd: this.options.cwd,
        env: { ...process.env, ...this.options.env },
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      this.process.stdout?.on('data', (data) => {
        const raw = data.toString().trim();
        try {
          const json = JSON.parse(raw);
          if (json.id !== undefined && this.pendingRequests.has(json.id)) {
            const resolver = this.pendingRequests.get(json.id);
            resolver?.(json);
            this.pendingRequests.delete(json.id);
          }
        } catch (e) {
          logger.info(`[Python:${this.options.name}] ${raw}`);
        }
      });

      this.process.stderr?.on('data', (data) => {
        logger.error(`[Python:${this.options.name}] ERR: ${data.toString()}`);
      });

      this.process.on('spawn', () => resolve());
      this.process.on('error', (err) => reject(err));
    });
  }

  async call(method: string, params: any = {}): Promise<any> {
    if (!this.process) {throw new Error(`Service ${this.options.name} is not running.`);}

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.process?.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  stop() {
    if (this.process) {
      this.process.kill();
      this.process = null;
    }
  }

  isRunning() {
    return this.process !== null;
  }
}
