import { AIProvider } from './types';
export interface AIError {
    type: 'config' | 'connection' | 'validation' | 'authentication' | 'unknown';
    message: string;
    provider?: AIProvider;
    details?: any;
}
export declare class AIErrorHandler {
    static handleError(error: AIError): void;
    private static getSuggestions;
    private static printNextSteps;
    private static getProviderWebsite;
    static handleProviderError(input: string, similarProviders?: Array<{
        provider: AIProvider;
        similarity: number;
        distance: number;
    }>): void;
    static handleModelError(provider: AIProvider, model: string, availableModels?: string[]): void;
    static handleApiKeyError(provider: AIProvider): void;
    private static getEnvVarName;
    static handleTestResult(success: boolean, provider?: AIProvider, details?: any): void;
}
//# sourceMappingURL=error-ai.d.ts.map