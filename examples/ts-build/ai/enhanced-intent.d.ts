/**
 * Enhanced Intent Engine
 * Advanced AI-powered intent parsing with context awareness
 */
export interface IntentResult {
    service: string;
    method: string;
    parameters: Record<string, any>;
    confidence: number;
}
export declare class EnhancedIntentEngine {
    private config;
    constructor(config: any);
    parse(query: string, availableTools: string[]): Promise<IntentResult | null>;
    updateConfig(config: any): void;
}
//# sourceMappingURL=enhanced-intent.d.ts.map