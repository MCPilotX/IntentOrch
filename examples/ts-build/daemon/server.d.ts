import { Orchestrator } from './orchestrator';
export declare class DaemonServer {
    private server;
    private pm;
    private orchestrator;
    private app;
    constructor();
    private setupRoutes;
    start(): Promise<void>;
    static testAIConnection(orchestrator: Orchestrator): Promise<any>;
    private static testCloudProvider;
    private static getProviderConfig;
    private static createTestRequest;
    private static getDefaultModel;
    stop(): void;
}
//# sourceMappingURL=server.d.ts.map