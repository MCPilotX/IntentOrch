export interface AdapterOptions {
    name: string;
    cwd: string;
    env?: Record<string, string>;
}
export declare class PythonAdapter {
    private options;
    private process;
    private requestId;
    private pendingRequests;
    constructor(options: AdapterOptions);
    start(): Promise<void>;
    call(method: string, params?: any): Promise<any>;
    stop(): void;
    isRunning(): boolean;
}
//# sourceMappingURL=python.d.ts.map