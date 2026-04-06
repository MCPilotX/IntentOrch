import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
export declare class NodeAdapter implements RuntimeAdapter {
    getSpawnArgs(config: ServiceConfig): {
        command: string;
        args: string[];
    };
    setup(config: ServiceConfig): Promise<void>;
}
//# sourceMappingURL=node-adapter.d.ts.map