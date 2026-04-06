/**
 * Basic Intent Engine
 * Simple intent parsing for basic functionality
 */
export class IntentEngine {
    config;
    constructor(config) {
        this.config = config;
        // Initialize with configuration
    }
    async parse(query, availableTools) {
        // Simple keyword matching
        const queryLower = query.toLowerCase();
        for (const tool of availableTools) {
            const [service, method] = tool.split(':');
            // Check if query contains service or method name
            if (service.toLowerCase().includes(queryLower) ||
                method.toLowerCase().includes(queryLower)) {
                return {
                    service,
                    method,
                    parameters: {},
                    confidence: 0.6,
                };
            }
        }
        return null;
    }
}
//# sourceMappingURL=intent.js.map