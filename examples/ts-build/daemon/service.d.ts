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
export declare class ServiceManager {
    private services;
    private processes;
    constructor();
    private loadServices;
    private saveServices;
    installService(servicePath: string, name?: string): Promise<ServiceInfo>;
    startService(name: string): Promise<ServiceInfo>;
    stopService(name: string): Promise<ServiceInfo>;
    restartService(name: string): Promise<ServiceInfo>;
    uninstallService(name: string): Promise<void>;
    getService(name: string): ServiceInfo | undefined;
    getAllServices(): ServiceInfo[];
    getRunningServices(): ServiceInfo[];
    getServiceLogs(name: string, lines?: number): Promise<string>;
    getServiceStats(name: string): Promise<any>;
    private spawnService;
    private detectEntryPoint;
    private getProcessMemoryUsage;
    healthCheck(name: string): Promise<boolean>;
    cleanup(): Promise<void>;
}
//# sourceMappingURL=service.d.ts.map