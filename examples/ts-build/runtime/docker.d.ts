export interface AdapterOptions {
    name: string;
    image: string;
    env?: Record<string, string>;
}
export declare class DockerAdapter {
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
//# sourceMappingURL=docker.d.ts.map