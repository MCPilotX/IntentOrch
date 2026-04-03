import { spawn, type ChildProcess, execSync } from 'child_process';
import * as path from 'path';

export interface AdapterOptions {
  name: string;
  cwd: string;
  env?: Record<string, string>;
  args?: string[];
  runtime?: 'bun' | 'node'; // Optional runtime preference
}

export class NodeAdapter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, (res: any) => void>();
  private runtime: 'bun' | 'node' = 'bun';

  constructor(private options: AdapterOptions) {
    // Determine which runtime to use
    if (options.runtime) {
      this.runtime = options.runtime;
    } else {
      // Auto-detect: try bun first, fallback to node
      try {
        execSync('which bun', { stdio: 'ignore' });
        // 进一步验证 bun 是否可执行
        execSync('bun --version', { stdio: 'ignore' });
        this.runtime = 'bun';
      } catch {
        this.runtime = 'node';
      }
    }
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[RAL] Starting Node.js service: ${this.options.name} (using ${this.runtime})`);

      const command = this.runtime === 'bun' ? 'bun' : 'node';
      const args = this.runtime === 'bun' ? ['run', 'index.js'] : ['index.js'];

      this.process = spawn(command, args, {
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
          // Ignore non-JSON output (such as regular logs)
          console.log(`[${this.options.name}] ${raw}`);
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[${this.options.name}] ERR: ${data.toString()}`);
      });

      this.process.on('spawn', () => resolve());
      this.process.on('error', (err) => reject(err));
    });
  }

  // Send MCP JSON-RPC request
  async call(method: string, params: any = {}): Promise<any> {
    if (!this.process) throw new Error(`Service ${this.options.name} is not running.`);

    const id = ++this.requestId;
    const request = {
      jsonrpc: '2.0',
      id,
      method,
      params
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
