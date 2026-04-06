export type RuntimeType = 'node' | 'python' | 'docker' | 'java' | 'go' | 'rust' | 'binary';
export interface DockerConnectionConfig {
    type: 'local' | 'remote' | 'socket';
    host?: string;
    port?: number;
    socketPath?: string;
    useTLS?: boolean;
    certs?: {
        ca?: string;
        cert?: string;
        key?: string;
    };
    registryAuth?: {
        username: string;
        password: string;
        serveraddress: string;
    };
}
export interface RuntimeSpecificConfig {
    node?: {
        npmRegistry?: string;
        bun?: boolean;
        nodeVersion?: string;
    };
    python?: {
        venv?: boolean;
        mirror?: string;
        pythonVersion?: string;
        dependencies?: string[];
    };
    go?: {
        module?: string;
        build?: boolean;
        goVersion?: string;
    };
    rust?: {
        release?: boolean;
        rustVersion?: string;
        test?: boolean;
        binary?: string;
        debug?: boolean;
        output?: string;
    };
    docker?: DockerConnectionConfig & {
        image?: string;
        dockerfile?: string;
        buildContext?: string;
        ports?: number[];
        volumes?: string[];
        workdir?: string;
    };
    java?: {
        maven?: boolean;
        gradle?: boolean;
        javaVersion?: string;
    };
}
export interface DetectionEvidence {
    executableAnalysis?: {
        type: string;
        confidence: number;
        details: any;
    };
    projectFiles?: {
        files: string[];
        confidence: number;
    };
    fileStatistics?: {
        extensions: Record<string, number>;
        confidence: number;
    };
    fileExtensions?: {
        extensions: string[];
        confidence: number;
    };
}
export interface DetectionResult {
    runtime: RuntimeType;
    confidence: number;
    evidence: DetectionEvidence;
    source: 'legacy' | 'enhanced' | 'explicit';
    suggestions?: string[];
    warning?: string;
}
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'cohere' | 'ollama' | 'local' | 'custom' | 'none';
export interface AIConfig {
    provider: AIProvider;
    model: string;
    apiKey?: string;
    apiEndpoint?: string;
    timeout?: number;
    maxTokens?: number;
    temperature?: number;
    apiVersion?: string;
    region?: string;
    embeddingProvider?: string;
    embeddingApiKey?: string;
    embeddingModel?: string;
    embeddingEndpoint?: string;
    localModelPath?: string;
    ollamaHost?: string;
    customConfig?: Record<string, any>;
}
export interface RegistryConfig {
    preferred: string;
    customRegistries?: Record<string, string>;
}
export interface ServicesConfig {
    autoStart: string[];
    defaultTimeout?: number;
}
export interface Config {
    ai: AIConfig;
    registry: RegistryConfig;
    services: ServicesConfig;
    detectionThreshold?: number;
    defaultDockerHost?: string;
    requireExplicitRuntime?: boolean;
    autoSaveDetection?: boolean;
    interactiveMode?: boolean;
    logLevel?: string;
}
export interface ServiceConfig {
    name: string;
    path: string;
    runtime?: RuntimeType;
    detectedRuntime?: RuntimeType;
    detectionConfidence?: number;
    detectionSource?: 'legacy' | 'enhanced' | 'explicit';
    detectionEvidence?: DetectionEvidence;
    runtimeConfig?: RuntimeSpecificConfig;
    dockerHost?: string;
    entry?: string;
    args?: string[];
    env?: Record<string, string>;
    image?: string;
    ports?: number[];
    volumes?: string[];
    workdir?: string;
    dockerfile?: string;
    buildContext?: string;
    build?: boolean;
    output?: string;
    binary?: string;
    trim?: boolean;
    installedAt?: string;
    lastDetectedAt?: string;
    detectionWarning?: string;
}
export interface DaemonResponse {
    success: boolean;
    message?: string;
    data?: any;
}
//# sourceMappingURL=types.d.ts.map