import * as fs from 'fs';
import { EventEmitter } from 'events';
import { CONFIG_PATH } from '../core/constants';
import { NodeAdapter } from '../runtime/node';
import { PythonAdapter } from '../runtime/python';
import { DockerAdapter } from '../runtime/docker';
export class ProcessManager extends EventEmitter {
    instances = new Map();
    constructor() {
        super();
        this.loadFromConfig();
    }
    loadFromConfig() {
        if (!fs.existsSync(CONFIG_PATH)) {
            return;
        }
        const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
        const services = config.services?.instances || [];
        services.forEach((s) => {
            if (!this.instances.has(s.name)) {
                this.instances.set(s.name, { ...s, adapter: null, status: 'stopped', tools: [] });
            }
        });
    }
    async startService(name) {
        const instance = this.instances.get(name);
        if (!instance) {
            throw new Error(`Service ${name} not found`);
        }
        if (instance.status === 'running') {
            return;
        }
        try {
            if (instance.runtime === 'node') {
                const adapter = new NodeAdapter({ name: instance.name, cwd: instance.path });
                await adapter.start();
                instance.adapter = adapter;
            }
            else if (instance.runtime === 'python') {
                const adapter = new PythonAdapter({ name: instance.name, cwd: instance.path });
                await adapter.start();
                instance.adapter = adapter;
            }
            else if (instance.runtime === 'docker') {
                const adapter = new DockerAdapter({ name: instance.name, image: instance.image });
                await adapter.start();
                instance.adapter = adapter;
            }
            else {
                throw new Error(`Runtime ${instance.runtime} not supported yet.`);
            }
            instance.status = 'running';
            console.log(`[PM] Service ${name} (${instance.runtime}) is now running.`);
            await this.discoverTools(name);
        }
        catch (err) {
            instance.status = 'error';
            instance.error = err.message;
            throw err;
        }
    }
    async discoverTools(name) {
        const instance = this.instances.get(name);
        if (!instance || !instance.adapter) {
            return;
        }
        console.log(`[PM] Discovering tools for ${name}...`);
        try {
            // Send tools/list request according to MCP protocol
            const response = await instance.adapter.call('tools/list', {});
            instance.tools = response.result?.tools || [];
            console.log(`[PM] Discovered ${instance.tools?.length} tools from ${name}.`);
            // Trigger event to notify Orchestrator for vector indexing
            this.emit('tools_discovered', { service: name, tools: instance.tools });
        }
        catch (e) {
            console.error(`[PM] Failed to discover tools for ${name}: ${e.message}`);
        }
    }
    async callService(name, method, params = {}) {
        const instance = this.instances.get(name);
        if (!instance) {
            throw new Error(`Service ${name} not found`);
        }
        if (instance.status !== 'running') {
            await this.startService(name);
        }
        if (!instance.adapter) {
            throw new Error(`Adapter for ${name} not initialized.`);
        }
        // Use MCP protocol format for tool calls
        return await instance.adapter.call('tools/call', {
            name: method,
            arguments: params,
        });
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
    getRunningServices() {
        this.loadFromConfig();
        return Array.from(this.instances.values())
            .filter(i => i.status === 'running')
            .map(i => i.name);
    }
    getServiceTools(serviceName) {
        const instance = this.instances.get(serviceName);
        return instance?.tools || [];
    }
    stopService(name) {
        const instance = this.instances.get(name);
        if (instance && instance.status === 'running') {
            instance.adapter?.stop();
            instance.adapter = null;
            instance.status = 'stopped';
            console.log(`[PM] Service ${name} stopped.`);
        }
    }
}
//# sourceMappingURL=pm.js.map