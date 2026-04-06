import { ProcessManager } from './pm';
export declare class Orchestrator {
    private pm;
    private intentEngine;
    private config;
    constructor(pm: ProcessManager);
    executeQuery(query: string): Promise<{
        success: boolean;
        service: string;
        method: string;
        result: any;
    }>;
    getConfig(): any;
    updateAIConfig(newAIConfig: any): {
        success: boolean;
        config: import("..").AIConfig;
        error?: undefined;
    } | {
        success: boolean;
        error: any;
        config?: undefined;
    };
}
//# sourceMappingURL=orchestrator.d.ts.map