export class IntentEngine {
    availableTools = [];
    constructor() {
        // For now, we'll have a simple hardcoded list of tools
        this.availableTools = [
            {
                name: 'filesystem',
                description: 'Read and list files in a directory',
                capabilities: ['list_directory', 'read_file'],
            },
            {
                name: 'calculator',
                description: 'Perform mathematical calculations',
                capabilities: ['add', 'subtract', 'multiply', 'divide'],
            },
        ];
    }
    async parse(query) {
        // Simple keyword matching for now
        // In a real implementation, this would use vector search and LLM
        const queryLower = query.toLowerCase();
        if (queryLower.includes('file') || queryLower.includes('directory') || queryLower.includes('list')) {
            return {
                tool: 'filesystem',
                action: 'list_directory',
                params: { path: '.' },
            };
        }
        if (queryLower.includes('calculate') || queryLower.includes('math') || queryLower.includes('add') || queryLower.includes('subtract')) {
            return {
                tool: 'calculator',
                action: 'calculate',
                params: { expression: query },
            };
        }
        // Default fallback
        return {
            tool: 'filesystem',
            action: 'list_directory',
            params: { path: '.' },
        };
    }
    addTool(tool) {
        this.availableTools.push(tool);
    }
    getTools() {
        return this.availableTools;
    }
}
//# sourceMappingURL=intent-engine.js.map