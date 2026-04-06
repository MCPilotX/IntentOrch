import { AIProvider } from './types';
export interface ProviderInfo {
    name: string;
    description: string;
    aliases: string[];
    requiresApiKey: boolean;
    defaultModel: string;
    modelDescriptions?: Record<string, string>;
    configHint?: string;
}
export declare const PROVIDER_DB: Record<AIProvider, ProviderInfo>;
export declare const VALID_PROVIDERS: AIProvider[];
export declare function getProviderDisplayName(provider: AIProvider): string;
export declare function getProviderInfo(provider: AIProvider): ProviderInfo | undefined;
export declare function findProviderByAlias(alias: string): AIProvider | null;
export declare function levenshteinDistance(a: string, b: string): number;
export declare function findSimilarProviders(input: string, threshold?: number): Array<{
    provider: AIProvider;
    similarity: number;
    distance: number;
}>;
export declare function autoCorrectProvider(input: string): {
    corrected: AIProvider | null;
    original: string;
    confidence: number;
    suggestions: AIProvider[];
};
export declare function getDefaultConfigForProvider(provider: AIProvider): any;
export declare function getAllProvidersForDisplay(): Array<{
    id: AIProvider;
    name: string;
    description: string;
    requiresKey: boolean;
    defaultModel: string;
}>;
//# sourceMappingURL=providers.d.ts.map