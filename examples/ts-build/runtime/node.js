import { spawn, execSync } from 'child_process';
export class NodeAdapter {
    options;
    process = null;
    requestId = 0;
    pendingRequests = new Map();
    runtime = 'bun';
    constructor(options) {
        this.options = options;
        // Determine which runtime to use
        if (options.runtime) {
            this.runtime = options.runtime;
        }
        else {
            // Auto-detect: try bun first, fallback to node
            try {
                execSync('which bun', { stdio: 'ignore' });
                // Further verify that bun is executable
                execSync('bun --version', { stdio: 'ignore' });
                this.runtime = 'bun';
            }
            catch {
                this.runtime = 'node';
            }
        }
    }
    async start() {
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
                }
                catch (e) {
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
    async call(method, params = {}) {
        if (!this.process) {
            throw new Error(`Service ${this.options.name} is not running.`);
        }
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
//# sourceMappingURL=node.js.map