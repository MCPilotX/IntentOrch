import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { type ChildProcess } from 'child_process';
export declare class GoAdapter implements RuntimeAdapter {
    private process;
    getSpawnArgs(config: ServiceConfig): {
        command: string;
        args: string[];
    };
    setup(config: ServiceConfig): Promise<void>;
    private findGoBinary;
    private isExecutable;
    startService(config: ServiceConfig): Promise<ChildProcess>;
    stopService(): Promise<void>;
    getServiceStatus(): Promise<string>;
    compile(config: ServiceConfig): Promise<boolean>;
    test(config: ServiceConfig): Promise<boolean>;
}
//# sourceMappingURL=go-adapter.d.ts.map