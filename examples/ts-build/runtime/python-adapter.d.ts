import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
export declare class PythonAdapter implements RuntimeAdapter {
    getSpawnArgs(config: ServiceConfig): {
        command: string;
        args: string[];
    };
    setup(config: ServiceConfig): Promise<void>;
    private installDependencies;
}
//# sourceMappingURL=python-adapter.d.ts.map