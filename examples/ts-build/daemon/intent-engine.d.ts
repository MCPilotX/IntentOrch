export declare class IntentEngine {
    private availableTools;
    constructor();
    parse(query: string): Promise<{
        tool: string;
        action: string;
        params: {
            path: string;
            expression?: undefined;
        };
    } | {
        tool: string;
        action: string;
        params: {
            expression: string;
            path?: undefined;
        };
    }>;
    addTool(tool: any): void;
    getTools(): any[];
}
//# sourceMappingURL=intent-engine.d.ts.map