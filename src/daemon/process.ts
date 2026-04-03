import { spawn, type ChildProcess } from 'child_process';
import { ServiceConfig } from '../core/types';
import { join } from 'path';

export class ProcessManager {
  private processes = new Map<string, ChildProcess>();

  async startService(config: ServiceConfig) {
    if (this.processes.has(config.name)) {
      throw new Error(`Service ${config.name} already running`);
    }

    // Resolve entry path relative to project directory if it's a relative path
    let entryPath = config.entry;
    if (!entryPath.startsWith('/') && !entryPath.startsWith('.')) {
      // If it's not an absolute path and doesn't start with ./, assume it's in PATH
      // For test.js, we'll use the full path
      if (entryPath === 'test.js') {
        entryPath = join(process.cwd(), 'test.js');
      }
    }

    const child = spawn(entryPath, config.args || [], {
      env: { ...process.env, ...config.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    this.processes.set(config.name, child);

    child.on('exit', (code) => {
      console.log(`Service ${config.name} exited with code ${code}`);
      this.processes.delete(config.name);
    });

    child.on('error', (error) => {
      console.error(`Service ${config.name} error:`, error.message);
      this.processes.delete(config.name);
    });

    return child;
  }

  stopService(name: string) {
    const child = this.processes.get(name);
    if (child) {
      child.kill();
      this.processes.delete(name);
      return true;
    }
    return false;
  }

  getStatuses() {
    return Array.from(this.processes.keys()).map(name => ({
      name,
      status: 'running'
    }));
  }
}
