import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { type ChildProcess } from 'child_process';
export declare class DockerAdapter implements RuntimeAdapter {
    private process;
    private containerName;
    constructor();
    getSpawnArgs(config: ServiceConfig): {
        command: string;
        args: string[];
    };
    setup(config: ServiceConfig): Promise<void>;
    startContainer(config: ServiceConfig): Promise<ChildProcess>;
    stopContainer(): Promise<void>;
    getContainerStatus(): Promise<string>;
    getContainerLogs(tail?: number): Promise<string>;
}
//# sourceMappingURL=docker-adapter.d.ts.map