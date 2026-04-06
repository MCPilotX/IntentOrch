/**
 * Simplified AI Configuration Manager
 * Minimal configuration system for AI features
 */
import { SimpleAIConfig } from './ai';
/**
 * Simplified AI configuration manager
 */
export declare class SimpleAIConfigManager {
    private config;
    constructor();
    /**
     * Load configuration from file
     */
    private loadConfig;
    /**
     * Save configuration to file
     */
    private saveConfig;
    /**
     * Get current configuration
     */
    getConfig(): SimpleAIConfig;
    /**
     * Update configuration
     */
    updateConfig(config: SimpleAIConfig): Promise<void>;
    /**
     * Validate configuration
     */
    private validateConfig;
    /**
     * Check if string is a valid URL
     */
    private isValidUrl;
    /**
     * Parse configuration from command line arguments
     */
    parseFromArgs(args: string[]): SimpleAIConfig;
    /**
     * Get configuration file path
     */
    getConfigFilePath(): string;
    /**
     * Check if configuration file exists
     */
    configFileExists(): boolean;
    /**
     * Reset configuration to defaults
     */
    resetConfig(): void;
    /**
     * Get configuration status
     */
    getStatus(): {
        configured: boolean;
        provider: string;
        hasApiKey: boolean;
        configFile: string;
    };
    /**
     * Format configuration for display
     */
    formatConfig(): string;
}
//# sourceMappingURL=config.d.ts.map