import { EventEmitter } from 'events';
import { NodeAdapter } from '../runtime/node';
import { PythonAdapter } from '../runtime/python';
import { DockerAdapter } from '../runtime/docker';
export interface ServiceInstance {
    name: string;
    runtime: string;
    path: string;
    image?: string;
    adapter: NodeAdapter | PythonAdapter | DockerAdapter | null;
    status: 'stopped' | 'running' | 'error';
    error?: string;
    tools?: any[];
}
export declare class ProcessManager extends EventEmitter {
    private instances;
    constructor();
    loadFromConfig(): void;
    startService(name: string): Promise<void>;
    discoverTools(name: string): Promise<void>;
    callService(name: string, method: string, params?: any): Promise<any>;
    getStatuses(): {
        name: string;
        runtime: string;
        status: "running" | "stopped" | "error";
        error: string;
        toolsCount: number;
    }[];
    getRunningServices(): string[];
    getServiceTools(serviceName: string): any[];
    stopService(name: string): void;
}
//# sourceMappingURL=pm.d.ts.map