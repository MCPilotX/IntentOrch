/**
 * Simplified AI Configuration Manager
 * Minimal configuration system for AI features
 */

import * as fs from 'fs';
import * as path from 'path';
import { logger } from '../core/logger';
import { SimpleAIConfig } from './ai';

// Configuration file path
const CONFIG_DIR = process.env.MCPILOT_CONFIG_DIR ||
  path.join(process.env.HOME || process.env.USERPROFILE || '.', '.mcpilot');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ai-config.json');

/**
 * Simplified AI configuration manager
 */
export class SimpleAIConfigManager {
  private config: SimpleAIConfig | null = null;

  constructor() {
    this.loadConfig();
  }

  /**
   * Load configuration from file
   */
  private loadConfig(): void {
    try {
      if (fs.existsSync(CONFIG_FILE)) {
        const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
        this.config = JSON.parse(content);
        logger.info('[AI] Configuration loaded from file');
      } else {
        logger.info('[AI] No configuration file found, using defaults');
        this.config = { provider: 'none' };
      }
    } catch (error: any) {
      logger.warn(`[AI] Failed to load configuration: ${error.message}`);
      this.config = { provider: 'none' };
    }
  }

  /**
   * Save configuration to file
   */
  private saveConfig(): void {
    try {
      // Ensure config directory exists
      if (!fs.existsSync(CONFIG_DIR)) {
        fs.mkdirSync(CONFIG_DIR, { recursive: true });
      }

      // Save configuration
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(this.config, null, 2));
      logger.info('[AI] Configuration saved to file');
    } catch (error: any) {
      logger.error(`[AI] Failed to save configuration: ${error.message}`);
      throw new Error(`Failed to save configuration: ${error.message}`, { cause: error });
    }
  }

  /**
   * Get current configuration
   */
  getConfig(): SimpleAIConfig {
    return this.config || { provider: 'none' };
  }

  /**
   * Update configuration
   */
  async updateConfig(config: SimpleAIConfig): Promise<void> {
    // Validate configuration
    this.validateConfig(config);

    // Update configuration
    this.config = config;

    // Save to file
    this.saveConfig();

    logger.info(`[AI] Configuration updated for provider: ${config.provider}`);
  }

  /**
   * Validate configuration
   */
  private validateConfig(config: SimpleAIConfig): void {
    // Basic validation
    if (!config.provider) {
      throw new Error('Provider is required');
    }

    const validProviders = ['openai', 'ollama', 'none'];
    if (!validProviders.includes(config.provider)) {
      throw new Error(`Invalid provider: ${config.provider}. Valid providers: ${validProviders.join(', ')}`);
    }

    // Provider-specific validation
    if (config.provider === 'openai' && !config.apiKey) {
      throw new Error('OpenAI requires API key');
    }

    // Validate endpoint format if provided
    if (config.endpoint && !this.isValidUrl(config.endpoint)) {
      throw new Error(`Invalid endpoint URL: ${config.endpoint}`);
    }
  }

  /**
   * Check if string is a valid URL
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Parse configuration from command line arguments
   */
  parseFromArgs(args: string[]): SimpleAIConfig {
    if (args.length === 0) {
      throw new Error('No arguments provided');
    }

    const provider = args[0].toLowerCase();
    const config: SimpleAIConfig = { provider: 'none' };

    // Parse provider
    if (provider === 'openai' || provider === 'ollama') {
      config.provider = provider as 'openai' | 'ollama';
    } else if (provider === 'none' || provider === 'reset') {
      config.provider = 'none';
      return config;
    } else {
      throw new Error(`Unknown provider: ${provider}. Use: openai, ollama, or none`);
    }

    // Parse additional arguments
    for (let i = 1; i < args.length; i++) {
      const arg = args[i];

      if (arg.startsWith('--')) {
        const [key, value] = arg.slice(2).split('=');

        switch (key) {
          case 'api-key':
          case 'apikey':
            config.apiKey = value;
            break;

          case 'endpoint':
            config.endpoint = value;
            break;

          case 'model':
            config.model = value;
            break;

          default:
            logger.warn(`[AI] Unknown option: --${key}`);
        }
      } else if (i === 1 && !arg.startsWith('--')) {
        // First non-option argument after provider is treated as API key
        config.apiKey = arg;
      }
    }

    return config;
  }

  /**
   * Get configuration file path
   */
  getConfigFilePath(): string {
    return CONFIG_FILE;
  }

  /**
   * Check if configuration file exists
   */
  configFileExists(): boolean {
    return fs.existsSync(CONFIG_FILE);
  }

  /**
   * Reset configuration to defaults
   */
  resetConfig(): void {
    this.config = { provider: 'none' };
    this.saveConfig();
    logger.info('[AI] Configuration reset to defaults');
  }

  /**
   * Get configuration status
   */
  getStatus(): {
    configured: boolean;
    provider: string;
    hasApiKey: boolean;
    configFile: string;
    } {
    return {
      configured: this.config?.provider !== 'none',
      provider: this.config?.provider || 'none',
      hasApiKey: !!this.config?.apiKey,
      configFile: CONFIG_FILE,
    };
  }

  /**
   * Format configuration for display
   */
  formatConfig(): string {
    const config = this.getConfig();

    const lines = [
      'AI Configuration:',
      `  Provider: ${config.provider}`,
    ];

    if (config.provider !== 'none') {
      if (config.model) {
        lines.push(`  Model: ${config.model}`);
      }

      if (config.endpoint) {
        lines.push(`  Endpoint: ${config.endpoint}`);
      }

      if (config.apiKey) {
        lines.push(`  API Key: ${config.apiKey ? '********' + config.apiKey.slice(-4) : 'Not set'}`);
      }
    }

    lines.push(`  Config file: ${CONFIG_FILE}`);

    return lines.join('\n');
  }
}
