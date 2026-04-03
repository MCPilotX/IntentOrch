import { spawn, type ChildProcess } from 'child_process';

export interface AdapterOptions {
  name: string;
  image: string; // Docker image name
  env?: Record<string, string>;
}

export class DockerAdapter {
  private process: ChildProcess | null = null;
  private requestId = 0;
  private pendingRequests = new Map<number, (res: any) => void>();

  constructor(private options: AdapterOptions) {}

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log(`[RAL] Starting Docker service: ${this.options.name} (${this.options.image})`);

      // Core command: docker run -i (interactive mode) --rm (remove after running)
      // Map container stdio to host process
      const args = ['run', '-i', '--rm', '--name', `mcp-${this.options.name}`];
      
      // Inject environment variables
      if (this.options.env) {
        Object.entries(this.options.env).forEach(([k, v]) => {
          args.push('-e', `${k}=${v}`);
        });
      }

      args.push(this.options.image);

      this.process = spawn('docker', args, {
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
          console.log(`[Docker:${this.options.name}] ${raw}`);
        }
      });

      this.process.stderr?.on('data', (data) => {
        console.error(`[Docker:${this.options.name}] ERR: ${data.toString()}`);
      });

      // Listen for successful startup
      this.process.on('spawn', () => resolve());
      this.process.on('error', (err) => reject(new Error(`Docker start failed: ${err.message}`)));
    });
  }

  async call(method: string, params: any = {}): Promise<any> {
    if (!this.process) throw new Error(`Docker service ${this.options.name} is not running.`);

    const id = ++this.requestId;
    const request = { jsonrpc: '2.0', id, method, params };

    return new Promise((resolve) => {
      this.pendingRequests.set(id, resolve);
      this.process?.stdin?.write(JSON.stringify(request) + '\n');
    });
  }

  stop() {
    if (this.process) {
      // Force stop container
      spawn('docker', ['stop', `mcp-${this.options.name}`]);
      this.process.kill();
      this.process = null;
    }
  }

  isRunning() {
    return this.process !== null;
  }
}
