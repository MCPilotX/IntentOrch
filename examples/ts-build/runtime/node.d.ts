export interface AdapterOptions {
    name: string;
    cwd: string;
    env?: Record<string, string>;
    args?: string[];
    runtime?: 'bun' | 'node';
}
export declare class NodeAdapter {
    private options;
    private process;
    private requestId;
    private pendingRequests;
    private runtime;
    constructor(options: AdapterOptions);
    start(): Promise<void>;
    call(method: string, params?: any): Promise<any>;
    stop(): void;
    isRunning(): boolean;
}
//# sourceMappingURL=node.d.ts.map