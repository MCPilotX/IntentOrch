export declare const MCPILOT_HOME: string;
export declare const MCPILOT_DIR: string;
export declare const SOCKET_PATH: string;
export declare const LOGS_DIR: string;
export declare const SERVERS_DIR: string;
export declare const VENVS_DIR: string;
export declare const CONFIG_PATH: string;
export declare const DEFAULT_CONFIG: {
    ai: {
        enabled: boolean;
        provider: string;
        model: string;
        apiKey: string;
        timeout: number;
        maxTokens: number;
        temperature: number;
        embeddingProvider: string;
        embeddingApiKey: string;
        embeddingModel: string;
        embeddingEndpoint: string;
        useLocalEmbeddings: boolean;
        useVectorSearch: boolean;
        transformersTimeout: number;
        fallbackMode: string;
    };
    registry: {
        preferred: string;
    };
    services: {
        autoStart: string[];
        defaultTimeout: number;
    };
};
//# sourceMappingURL=constants.d.ts.map