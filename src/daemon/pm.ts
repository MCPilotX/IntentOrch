import { ChildProcess, spawn } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import { CONFIG_PATH } from '../core/constants';
import { NodeAdapter } from '../runtime/node';
import { PythonAdapter } from '../runtime/python';
import { DockerAdapter } from '../runtime/docker';

export interface ServiceInstance {
  name: string;
  runtime: string;
  path: string;
  image?: string; // Docker image name
  adapter: NodeAdapter | PythonAdapter | DockerAdapter | null;
  status: 'stopped' | 'running' | 'error';
  error?: string;
  tools?: any[];
}

export class ProcessManager extends EventEmitter {
  private instances = new Map<string, ServiceInstance>();

  constructor() {
    super();
    this.loadFromConfig();
  }

  loadFromConfig() {
    if (!fs.existsSync(CONFIG_PATH)) {
      this.instances.clear();
      return;
    }
    
    try {
      const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
      // Support both formats: config.services array or config.services.instances array
      let services: any[] = [];
      if (Array.isArray(config.services)) {
        services = config.services;
      } else if (config.services?.instances && Array.isArray(config.services.instances)) {
        services = config.services.instances;
      }
      
      // Create a set of service names from the config
      const configServiceNames = new Set(services.map((s: any) => s.name));
      
      // Remove services that are no longer in the config
      for (const [name, instance] of this.instances.entries()) {
        if (!configServiceNames.has(name)) {
          // Stop the service if it's running
          if (instance.status === 'running') {
            instance.adapter?.stop();
          }
          this.instances.delete(name);
        }
      }
      
      // Add or update services from config
      services.forEach((s: any) => {
        if (this.instances.has(s.name)) {
          // Update existing service (keep runtime state)
          const existing = this.instances.get(s.name)!;
          // Only update non-runtime properties
          existing.runtime = s.runtime;
          existing.path = s.path;
          if (s.image !== undefined) existing.image = s.image;
        } else {
          // Add new service
          this.instances.set(s.name, { ...s, adapter: null, status: 'stopped', tools: [] });
        }
      });
    } catch (error) {
      // If config is invalid, clear all instances
      console.error(`[PM] Failed to load config: ${error}`);
      this.instances.clear();
    }
  }

  async startService(name: string): Promise<void> {
    const instance = this.instances.get(name);
    if (!instance) {throw new Error(`Service ${name} not found`);}
    if (instance.status === 'running') {return;}

    try {
      if (instance.runtime === 'node') {
        const adapter = new NodeAdapter({ name: instance.name, cwd: instance.path });
        await adapter.start();
        instance.adapter = adapter;
      } else if (instance.runtime === 'python') {
        const adapter = new PythonAdapter({ name: instance.name, cwd: instance.path });
        await adapter.start();
        instance.adapter = adapter;
      } else if (instance.runtime === 'docker') {
        const adapter = new DockerAdapter({ name: instance.name, image: instance.image! });
        await adapter.start();
        instance.adapter = adapter;
      } else {
        throw new Error(`Runtime ${instance.runtime} not supported yet.`);
      }

      instance.status = 'running';
      instance.error = undefined; // Clear any previous error
      console.log(`[PM] Service ${name} (${instance.runtime}) is now running.`);
      await this.discoverTools(name);

      // Emit service-started event
      this.emit('service-started', name);

    } catch (err: any) {
      instance.status = 'error';
      instance.error = err.message;
      // Emit service-error event
      this.emit('service-error', name, err.message);
      throw err;
    }
  }

  async discoverTools(name: string) {
    const instance = this.instances.get(name);
    if (!instance) {
      throw new Error(`Service ${name} not found`);
    }
    if (instance.status !== 'running' || !instance.adapter) {
      throw new Error(`Service ${name} is not running`);
    }

    console.log(`[PM] Discovering tools for ${name}...`);
    try {
      // Send tools/list request according to MCP protocol
      const response = await instance.adapter.call('tools/list', {});
      instance.tools = response.result?.tools || [];
      console.log(`[PM] Discovered ${instance.tools?.length} tools from ${name}.`);

      // Trigger event to notify Orchestrator for vector indexing
      this.emit('tools_discovered', { service: name, tools: instance.tools });
    } catch (e: any) {
      console.error(`[PM] Failed to discover tools for ${name}: ${e.message}`);
      instance.tools = [];
    }
  }

  async callService(name: string, method: string, params: any = {}): Promise<any> {
    const instance = this.instances.get(name);
    if (!instance) {throw new Error(`Service ${name} not found`);}
    if (instance.status !== 'running') {await this.startService(name);}
    if (!instance.adapter) {throw new Error(`Adapter for ${name} not initialized.`);}

    // Check if service has tools
    if (!instance.tools || instance.tools.length === 0) {
      throw new Error(`No tools available for service ${name}`);
    }

    // Find the tool by name
    const tool = instance.tools.find((t: any) => t.name === method);
    if (!tool) {
      throw new Error(`Tool ${method} not found in service ${name}`);
    }

    // Check if tool has a handler
    if (!tool.handler || typeof tool.handler !== 'function') {
      throw new Error(`Tool ${method} does not have a handler`);
    }

    // Call the tool handler
    return await tool.handler(params);
  }

  getStatuses() {
    this.loadFromConfig();
    return Array.from(this.instances.values()).map(i => ({
      name: i.name,
      runtime: i.runtime,
      status: i.status,
      error: i.error,
      toolsCount: i.tools?.length || 0,
    }));
  }

  getRunningServices(): string[] {
    this.loadFromConfig();
    return Array.from(this.instances.values())
      .filter(i => i.status === 'running')
      .map(i => i.name);
  }

  getServiceTools(serviceName: string): any[] {
    const instance = this.instances.get(serviceName);
    return instance?.tools || [];
  }

  stopService(name: string) {
    const instance = this.instances.get(name);
    if (instance && instance.status === 'running') {
      instance.adapter?.stop();
      instance.adapter = null;
      instance.status = 'stopped';
      console.log(`[PM] Service ${name} stopped.`);
    }
  }
}
