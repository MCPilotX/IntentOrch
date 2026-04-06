/**
 * Basic Intent Engine
 * Simple intent parsing for basic functionality
 */
export interface IntentResult {
    service: string;
    method: string;
    parameters: Record<string, any>;
    confidence: number;
}
export declare class IntentEngine {
    private config;
    constructor(config: any);
    parse(query: string, availableTools: string[]): Promise<IntentResult | null>;
}
//# sourceMappingURL=intent.d.ts.map