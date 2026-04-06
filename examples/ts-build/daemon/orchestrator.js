import { EnhancedIntentEngine } from '../ai/enhanced-intent';
import * as fs from 'fs';
import { CONFIG_PATH } from '../core/constants';
import { ConfigValidator } from '../core/config-validator';
import { logger } from '../core/logger';
export class Orchestrator {
    pm;
    intentEngine;
    config;
    constructor(pm) {
        this.pm = pm;
        // Load and validate configuration
        if (fs.existsSync(CONFIG_PATH)) {
            const rawConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
            this.config = ConfigValidator.mergeWithDefaults(rawConfig);
            logger.info('Configuration loaded and validated');
        }
        else {
            this.config = ConfigValidator.getDefaultConfig();
            logger.warn('Config file not found, using default configuration');
        }
        // Check if AI is enabled
        if (this.config.ai?.enabled !== false) {
            // Use enhanced AI intent engine
            this.intentEngine = new EnhancedIntentEngine(this.config.ai);
            logger.info('AI features enabled (vector database functionality removed)');
        }
        else {
            // AI disabled
            this.intentEngine = null;
            logger.info('AI features disabled');
        }
    }
    async executeQuery(query) {
        logger.info(`Processing query: "${query}"`);
        // Check if AI is enabled
        if (!this.intentEngine) {
            throw new Error('AI features are disabled. Enable AI in configuration to use natural language queries.');
        }
        try {
            // 1. Get all available tools
            const availableServices = this.pm.getRunningServices();
            const availableTools = [];
            for (const service of availableServices) {
                const tools = this.pm.getServiceTools(service);
                if (tools) {
                    availableTools.push(...tools.map((tool) => `${service}:${tool.name}`));
                }
            }
            logger.debug(`Available tools: ${availableTools.join(', ')}`);
            // 2. Use AI intent engine to parse user intent
            const toolCall = await this.intentEngine.parse(query, availableTools);
            if (!toolCall) {
                throw new Error('Unable to determine which service to use for your request.');
            }
            logger.info(`AI selected service: ${toolCall.service}.${toolCall.method}`);
            // 3. Call the selected service
            const result = await this.pm.callService(toolCall.service, toolCall.method, toolCall.parameters);
            return {
                success: true,
                service: toolCall.service,
                method: toolCall.method,
                result: result,
            };
        }
        catch (error) {
            logger.error(`Query execution failed: ${error.message}`);
            // No vector database fallback available
            throw new Error(`Query failed: ${error.message}. Vector database functionality has been removed.`);
        }
    }
    getConfig() {
        return this.config;
    }
    // Update AI configuration
    updateAIConfig(newAIConfig) {
        try {
            // Validate new AI configuration
            const validatedConfig = ConfigValidator.validate({ ai: newAIConfig });
            this.config.ai = validatedConfig.ai;
            // Update intent engine configuration if it exists
            if (this.intentEngine) {
                this.intentEngine.updateConfig(validatedConfig.ai);
            }
            // Save to configuration file
            if (fs.existsSync(CONFIG_PATH)) {
                const currentConfig = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
                currentConfig.ai = validatedConfig.ai;
                fs.writeFileSync(CONFIG_PATH, JSON.stringify(currentConfig, null, 2));
            }
            logger.info(`AI configuration updated to provider: ${validatedConfig.ai.provider}`);
            return { success: true, config: validatedConfig.ai };
        }
        catch (error) {
            logger.error(`Failed to update AI config: ${error.message}`);
            return { success: false, error: error.message };
        }
    }
}
//# sourceMappingURL=orchestrator.js.map