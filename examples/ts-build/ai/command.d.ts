/**
 * Simplified AI Command Handler
 * Minimal command interface for AI features
 */
import { SimpleAI } from './ai';
import { SimpleAIConfigManager } from './config';
/**
 * Simplified AI command handler
 */
export declare class SimpleAICommand {
    private ai;
    private configManager;
    constructor();
    /**
     * Load configuration from manager
     */
    private loadConfiguration;
    /**
     * Handle AI command
     */
    handleCommand(action?: string, ...args: string[]): Promise<void>;
    /**
     * Handle configure command
     */
    private handleConfigure;
    /**
     * Handle test command
     */
    private handleTest;
    /**
     * Handle ask command
     */
    private handleAsk;
    /**
     * Handle ask result
     */
    private handleAskResult;
    /**
     * Handle reset command
     */
    private handleReset;
    /**
     * Show AI status
     */
    private showStatus;
    /**
     * Show help
     */
    private showHelp;
    /**
     * Get AI instance (for integration with other modules)
     */
    getAIInstance(): SimpleAI;
    /**
     * Get config manager instance
     */
    getConfigManager(): SimpleAIConfigManager;
}
//# sourceMappingURL=command.d.ts.map