import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { type ChildProcess } from 'child_process';
export declare class RustAdapter implements RuntimeAdapter {
    private process;
    getSpawnArgs(config: ServiceConfig): {
        command: string;
        args: string[];
    };
    setup(config: ServiceConfig): Promise<void>;
    private findRustBinary;
    private isExecutable;
    startService(config: ServiceConfig): Promise<ChildProcess>;
    stopService(): Promise<void>;
    getServiceStatus(): Promise<string>;
    compile(config: ServiceConfig): Promise<boolean>;
    test(config: ServiceConfig): Promise<boolean>;
    check(config: ServiceConfig): Promise<boolean>;
    clippy(config: ServiceConfig): Promise<boolean>;
}
//# sourceMappingURL=rust-adapter.d.ts.map