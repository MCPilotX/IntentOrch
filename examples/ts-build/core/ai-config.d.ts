import { AIProvider } from './types';
export interface SimpleAIConfig {
    provider: AIProvider;
    apiKey?: string;
    model?: string;
    options?: {
        apiEndpoint?: string;
        ollamaHost?: string;
        localModelPath?: string;
        timeout?: number;
        maxTokens?: number;
        temperature?: number;
    };
}
export declare class SimpleAIConfigParser {
    static parse(args: string[]): SimpleAIConfig | null;
    private static looksLikeApiKey;
    static applyConfig(config: SimpleAIConfig, confirm?: boolean): Promise<boolean>;
    private static showConfigSummary;
    static showAIStatus(): void;
    static listProviders(): void;
    static listModels(providerInput?: string): void;
    static close(): void;
}
//# sourceMappingURL=ai-config.d.ts.map