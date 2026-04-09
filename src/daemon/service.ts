import * as fs from 'fs';
import * as path from 'path';
import { spawn, type ChildProcess } from 'child_process';
import { CONFIG_PATH, SERVERS_DIR, LOGS_DIR } from '../core/constants';
import { logger } from '../core/logger';
import { ServiceConfig } from '../core/types';

export interface ServiceInfo {
  name: string;
  path: string;
  runtime: string;
  status: 'installed' | 'running' | 'stopped' | 'error';
  pid?: number;
  port?: number;
  installedAt: string;
  startedAt?: string;
  stoppedAt?: string;
  config: ServiceConfig;
}

export class ServiceManager {
  private services: Map<string, ServiceInfo> = new Map();
  private processes: Map<string, ChildProcess> = new Map();

  constructor() {
    this.loadServices();
  }

  private loadServices() {
    if (!fs.existsSync(CONFIG_PATH)) {
      return;
    }

    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    const serviceInstances = config.services?.instances || [];

    for (const service of serviceInstances) {
      this.services.set(service.name, {
        ...service,
        status: service.status || 'installed',
      });
    }
  }

  private saveServices() {
    const config = fs.existsSync(CONFIG_PATH)
      ? JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'))
      : { services: {} };

    config.services.instances = Array.from(this.services.values());
    fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
  }

  async installService(servicePath: string, name?: string): Promise<ServiceInfo> {
    const resolvedPath = path.resolve(servicePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Service path not found: ${resolvedPath}`);
    }

    const serviceName = name || path.basename(resolvedPath);

    // Check if service is already installed
    if (this.services.has(serviceName)) {
      throw new Error(`Service ${serviceName} is already installed`);
    }

    // Create service configuration
    const serviceConfig: ServiceConfig = {
      name: serviceName,
      path: resolvedPath,
      runtime: 'node', // Default, should actually be obtained from detector
      entry: this.detectEntryPoint(resolvedPath),
    };

    const serviceInfo: ServiceInfo = {
      name: serviceName,
      path: resolvedPath,
      runtime: serviceConfig.runtime,
      status: 'installed',
      installedAt: new Date().toISOString(),
      config: serviceConfig,
    };

    this.services.set(serviceName, serviceInfo);
    this.saveServices();

    logger.info(`Service installed: ${serviceName} at ${resolvedPath}`);
    return serviceInfo;
  }

  async startService(name: string): Promise<ServiceInfo> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} is not installed`);
    }

    if (service.status === 'running') {
      logger.warn(`Service ${name} is already running`);
      return service;
    }

    try {
      // Create log directory
      const logDir = path.join(LOGS_DIR, name);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const stdoutLog = path.join(logDir, 'stdout.log');
      const stderrLog = path.join(logDir, 'stderr.log');

      const stdout = fs.openSync(stdoutLog, 'a');
      const stderr = fs.openSync(stderrLog, 'a');

      // Start service based on runtime
      const process = this.spawnService(service);

      process.stdout?.pipe(fs.createWriteStream(stdoutLog, { flags: 'a' }));
      process.stderr?.pipe(fs.createWriteStream(stderrLog, { flags: 'a' }));

      this.processes.set(name, process);

      // Update service status
      service.status = 'running';
      service.startedAt = new Date().toISOString();
      service.stoppedAt = undefined;
      service.pid = process.pid;

      this.saveServices();

      logger.info(`Service started: ${name} (PID: ${process.pid})`);
      return service;
    } catch (error: any) {
      service.status = 'error';
      this.saveServices();
      throw new Error(`Failed to start service ${name}: ${error.message}`, { cause: error });
    }
  }

  async stopService(name: string): Promise<ServiceInfo> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} is not installed`);
    }

    if (service.status !== 'running') {
      logger.warn(`Service ${name} is not running`);
      return service;
    }

    const process = this.processes.get(name);
    if (process) {
      process.kill();
      this.processes.delete(name);
    }

    service.status = 'stopped';
    service.stoppedAt = new Date().toISOString();
    service.pid = undefined;

    this.saveServices();

    logger.info(`Service stopped: ${name}`);
    return service;
  }

  async restartService(name: string): Promise<ServiceInfo> {
    await this.stopService(name);
    // Wait for a while to ensure process is completely stopped
    await new Promise(resolve => setTimeout(resolve, 1000));
    return await this.startService(name);
  }

  async uninstallService(name: string): Promise<void> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} is not installed`);
    }

    // If service is running, stop it first
    if (service.status === 'running') {
      await this.stopService(name);
    }

    // Remove from configuration
    this.services.delete(name);
    this.saveServices();

    logger.info(`Service uninstalled: ${name}`);
  }

  getService(name: string): ServiceInfo | undefined {
    return this.services.get(name);
  }

  getAllServices(): ServiceInfo[] {
    return Array.from(this.services.values());
  }

  getRunningServices(): ServiceInfo[] {
    return Array.from(this.services.values()).filter(s => s.status === 'running');
  }

  async getServiceLogs(name: string, lines: number = 50): Promise<string> {
    const logDir = path.join(LOGS_DIR, name);
    const logFile = path.join(logDir, 'stdout.log');

    if (!fs.existsSync(logFile)) {
      return `No logs found for service ${name}`;
    }

    try {
      const content = fs.readFileSync(logFile, 'utf-8');
      const linesArray = content.split('\n');
      return linesArray.slice(-lines).join('\n');
    } catch (error: any) {
      return `Failed to read logs: ${error.message}`;
    }
  }

  async getServiceStats(name: string): Promise<any> {
    const service = this.services.get(name);
    if (!service) {
      throw new Error(`Service ${name} not found`);
    }

    const process = this.processes.get(name);

    return {
      name: service.name,
      status: service.status,
      pid: service.pid,
      port: service.port,
      runtime: service.runtime,
      installedAt: service.installedAt,
      startedAt: service.startedAt,
      stoppedAt: service.stoppedAt,
      isProcessAlive: process ? !process.exitCode : false,
      memoryUsage: this.getProcessMemoryUsage(process),
      uptime: service.startedAt
        ? Date.now() - new Date(service.startedAt).getTime()
        : 0,
    };
  }

  private spawnService(service: ServiceInfo): ChildProcess {
    const { config } = service;
    const cwd = config.path || '.';

    let command: string;
    let args: string[] = [];

    switch (service.runtime) {
      case 'node':
        command = 'node';
        args = [config.entry, ...(config.args || [])];
        break;
      case 'python':
        command = 'python3';
        args = [config.entry, ...(config.args || [])];
        break;
      case 'docker':
        command = 'docker';
        args = ['run', '-d', '--rm', '--name', `mcp-${service.name}`, config.image || service.name];
        if (config.args) {args.push(...config.args);}
        break;
      default:
        command = config.entry;
        args = config.args || [];
    }

    logger.debug(`Spawning service: ${command} ${args.join(' ')}`);

    return spawn(command, args, {
      cwd,
      env: {
        ...process.env,
        ...config.env,
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });
  }

  private detectEntryPoint(servicePath: string): string {
    const possibleEntries = [
      'index.js', 'main.js', 'app.js', 'server.js',
      'index.ts', 'main.ts', 'app.ts', 'server.ts',
      'main.py', 'app.py', 'server.py',
      'main.go', 'server.go',
      'main.rs', 'lib.rs',
    ];

    for (const entry of possibleEntries) {
      const entryPath = path.join(servicePath, entry);
      if (fs.existsSync(entryPath)) {
        return entry;
      }
    }

    // If no standard entry point found, return the first file
    const files = fs.readdirSync(servicePath);
    const firstFile = files.find(f =>
      f.endsWith('.js') || f.endsWith('.ts') || f.endsWith('.py') ||
      f.endsWith('.go') || f.endsWith('.rs'),
    );

    return firstFile || 'index.js';
  }

  private getProcessMemoryUsage(process?: ChildProcess): number | undefined {
    if (!process || !process.pid) {
      return undefined;
    }

    try {
      // This is a simplified implementation, should actually use system-specific methods
      // For example, reading /proc/[pid]/status on Linux
      return 0;
    } catch {
      return undefined;
    }
  }

  async healthCheck(name: string): Promise<boolean> {
    const service = this.services.get(name);
    if (!service || service.status !== 'running') {
      return false;
    }

    const process = this.processes.get(name);
    if (!process || process.exitCode !== null) {
      return false;
    }

    // More complex health check logic can be added here
    // For example, checking HTTP endpoints, TCP ports, etc.
    return true;
  }

  async cleanup(): Promise<void> {
    // Stop all running services
    for (const [name, service] of this.services) {
      if (service.status === 'running') {
        await this.stopService(name);
      }
    }
  }
}
