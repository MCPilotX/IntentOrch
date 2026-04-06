/**
 * Simplified AI Core Service
 * Focused on converting natural language to MCP tool calls
 */
export type AIProvider = 'openai' | 'anthropic' | 'google' | 'azure' | 'deepseek' | 'ollama' | 'none';
export interface SimpleAIConfig {
    provider: AIProvider;
    apiKey?: string;
    endpoint?: string;
    model?: string;
    apiVersion?: string;
    region?: string;
}
export interface AskResult {
    type: 'tool_call' | 'suggestions' | 'error';
    tool?: ToolCall;
    suggestions?: string[];
    message?: string;
    help?: string;
    confidence?: number;
}
export interface ToolCall {
    service: string;
    tool: string;
    params: Record<string, any>;
}
export declare class AIError extends Error {
    code: string;
    message: string;
    category: 'config' | 'connection' | 'execution';
    suggestions: string[];
    constructor(code: string, message: string, category: 'config' | 'connection' | 'execution', suggestions?: string[]);
}
/**
 * Simplified AI Core Service
 */
export declare class SimpleAI {
    private config;
    private enabled;
    private client;
    constructor();
    /**
     * Configure AI service
     */
    configure(config: SimpleAIConfig): Promise<void>;
    /**
     * Initialize AI client
     */
    private initializeClient;
    /**
     * Test AI connection
     */
    testConnection(): Promise<{
        success: boolean;
        message: string;
    }>;
    /**
     * Test OpenAI connection
     */
    private testOpenAIConnection;
    /**
     * Test Anthropic connection
     */
    private testAnthropicConnection;
    /**
     * Test Google (Gemini) connection
     */
    private testGoogleConnection;
    /**
     * Test Azure OpenAI connection
     */
    private testAzureConnection;
    /**
     * Test DeepSeek connection
     */
    private testDeepSeekConnection;
    /**
     * Test Ollama connection
     */
    private testOllamaConnection;
    /**
     * Process natural language query
     */
    ask(query: string): Promise<AskResult>;
    /**
     * Analyze intent (simplified version)
     */
    private analyzeIntent;
    /**
     * Analyze intent with LLM (optional)
     */
    private analyzeWithLLM;
    /**
     * Call AI API based on provider
     */
    private callAIAPI;
    /**
     * Get default model for provider
     */
    private getDefaultModel;
    /**
     * Call OpenAI API
     */
    private callOpenAI;
    /**
     * Call Anthropic API
     */
    private callAnthropic;
    /**
     * Call Google (Gemini) API
     */
    private callGoogle;
    /**
     * Call Azure OpenAI API
     */
    private callAzure;
    /**
     * Call DeepSeek API
     */
    private callDeepSeek;
    /**
     * Call Ollama API
     */
    private callOllama;
    /**
     * Parse AI response to extract intent
     */
    private parseAIResponse;
    /**
     * Extract parameters from query
     */
    private extractParams;
    /**
     * Map intent to tool call
     */
    private mapIntentToTool;
    /**
     * Get fallback suggestions (when AI is not available)
     */
    private getFallbackSuggestions;
    /**
     * Get AI status
     */
    getStatus(): {
        enabled: boolean;
        provider: string;
        configured: boolean;
    };
    /**
     * Call raw LLM API with custom messages and options
     * This method supports advanced use cases like function calling, JSON mode, etc.
     */
    callRawAPI(options: {
        messages: Array<{
            role: string;
            content: string;
        }>;
        temperature?: number;
        maxTokens?: number;
        responseFormat?: {
            type: 'text' | 'json_object';
        };
        functions?: Array<{
            name: string;
            description?: string;
            parameters: Record<string, any>;
        }>;
        functionCall?: 'auto' | 'none' | {
            name: string;
        };
    }): Promise<any>;
    /**
     * Call OpenAI raw API
     */
    private callOpenAIRaw;
    /**
     * Call Anthropic raw API
     */
    private callAnthropicRaw;
    /**
     * Call Google raw API
     */
    private callGoogleRaw;
    /**
     * Call Azure OpenAI raw API
     */
    private callAzureRaw;
    /**
     * Call DeepSeek raw API
     */
    private callDeepSeekRaw;
    /**
     * Call Ollama raw API
     */
    private callOllamaRaw;
    /**
     * Reset configuration
     */
    reset(): void;
    /**
     * Get friendly error message
     */
    static getFriendlyError(error: AIError): string;
}
//# sourceMappingURL=ai.d.ts.map