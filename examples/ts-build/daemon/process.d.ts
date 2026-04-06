import { ServiceConfig } from '../core/types';
export declare class ProcessManager {
    private processes;
    startService(config: ServiceConfig): Promise<import("child_process").ChildProcessWithoutNullStreams>;
    stopService(name: string): boolean;
    getStatuses(): {
        name: string;
        status: string;
    }[];
}
//# sourceMappingURL=process.d.ts.map