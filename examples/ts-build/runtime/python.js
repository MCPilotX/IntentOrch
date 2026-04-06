import { spawn } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
export class PythonAdapter {
    options;
    process = null;
    requestId = 0;
    pendingRequests = new Map();
    constructor(options) {
        this.options = options;
    }
    async start() {
        return new Promise((resolve, reject) => {
            console.log(`[RAL] Starting Python service: ${this.options.name}`);
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
                }
                catch (e) {
                    console.log(`[Python:${this.options.name}] ${raw}`);
                }
            });
            this.process.stderr?.on('data', (data) => {
                console.error(`[Python:${this.options.name}] ERR: ${data.toString()}`);
            });
            this.process.on('spawn', () => resolve());
            this.process.on('error', (err) => reject(err));
        });
    }
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
//# sourceMappingURL=python.js.map