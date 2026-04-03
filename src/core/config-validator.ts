import { DEFAULT_CONFIG } from './constants';
import { logger } from './logger';
import { Config, AIConfig, RegistryConfig, ServicesConfig, AIProvider } from './types';

export class ConfigValidator {
  static validate(config: any): Config {
    const validated: Config = {
      ai: {
        provider: 'deepseek',
        model: 'deepseek-v3',
        apiKey: '',
      },
      registry: {
        preferred: 'gitee-mcp',
      },
      services: {
        autoStart: [],
      }
    };

    // Handle null or undefined config
    if (!config) {
      return validated;
    }

    // Validate AI configuration
    if (config.ai) {
      // Validate provider
      if (typeof config.ai.provider === 'string') {
        const validProviders: AIProvider[] = ['openai', 'anthropic', 'deepseek', 'cohere', 'ollama', 'local', 'custom'];
        if (validProviders.includes(config.ai.provider as AIProvider)) {
          validated.ai.provider = config.ai.provider as AIProvider;
        } else {
          logger.warn(`Invalid AI provider "${config.ai.provider}" in config, using default "deepseek"`);
        }
      } else {
        logger.warn('Invalid AI provider in config, using default');
      }

      // Validate model
      if (typeof config.ai.model === 'string') {
        validated.ai.model = config.ai.model;
      } else {
        logger.warn('Invalid AI model in config, using default');
      }

      // Validate apiKey
      if (typeof config.ai.apiKey === 'string') {
        validated.ai.apiKey = config.ai.apiKey;
      }

      // Validate apiEndpoint
      if (typeof config.ai.apiEndpoint === 'string') {
        validated.ai.apiEndpoint = config.ai.apiEndpoint;
      }

      // Validate timeout
      if (typeof config.ai.timeout === 'number' && config.ai.timeout > 0) {
        validated.ai.timeout = config.ai.timeout;
      }

      // Validate maxTokens
      if (typeof config.ai.maxTokens === 'number' && config.ai.maxTokens > 0) {
        validated.ai.maxTokens = config.ai.maxTokens;
      }

      // Validate temperature
      if (typeof config.ai.temperature === 'number' && config.ai.temperature >= 0 && config.ai.temperature <= 2) {
        validated.ai.temperature = config.ai.temperature;
      }

      // Validate embeddingProvider
      if (typeof config.ai.embeddingProvider === 'string') {
        validated.ai.embeddingProvider = config.ai.embeddingProvider;
      }

      // Validate embeddingApiKey
      if (typeof config.ai.embeddingApiKey === 'string') {
        validated.ai.embeddingApiKey = config.ai.embeddingApiKey;
      }

      // Validate embeddingModel
      if (typeof config.ai.embeddingModel === 'string') {
        validated.ai.embeddingModel = config.ai.embeddingModel;
      }

      // Validate embeddingEndpoint
      if (typeof config.ai.embeddingEndpoint === 'string') {
        validated.ai.embeddingEndpoint = config.ai.embeddingEndpoint;
      }

      // Validate localModelPath
      if (typeof config.ai.localModelPath === 'string') {
        validated.ai.localModelPath = config.ai.localModelPath;
      }

      // Validate ollamaHost
      if (typeof config.ai.ollamaHost === 'string') {
        validated.ai.ollamaHost = config.ai.ollamaHost;
      }

      // Validate customConfig
      if (config.ai.customConfig && typeof config.ai.customConfig === 'object') {
        validated.ai.customConfig = config.ai.customConfig;
      }
    }

    // Validate registry configuration
    if (config.registry) {
      if (typeof config.registry.preferred === 'string') {
        validated.registry.preferred = config.registry.preferred;
      } else {
        logger.warn('Invalid registry preference in config, using default');
      }

      // Validate customRegistries
      if (config.registry.customRegistries && typeof config.registry.customRegistries === 'object') {
        validated.registry.customRegistries = config.registry.customRegistries;
      }
    }

    // Validate service configuration
    if (config.services) {
      if (Array.isArray(config.services.autoStart)) {
        validated.services.autoStart = config.services.autoStart.filter(
          (service: any) => typeof service === 'string'
        );
      } else {
        logger.warn('Invalid autoStart configuration, using empty array');
      }

      // Validate defaultTimeout
      if (typeof config.services.defaultTimeout === 'number' && config.services.defaultTimeout > 0) {
        validated.services.defaultTimeout = config.services.defaultTimeout;
      }
    }

    // Check required configuration
    this.checkRequiredConfig(validated);

    return validated;
  }

  private static checkRequiredConfig(config: Config) {
    // Check AI configuration
    const aiConfig = config.ai;
    
    // Check AI API key (if using providers that require API key)
    const providersRequiringKey = ['openai', 'anthropic', 'deepseek', 'cohere'];
    if (providersRequiringKey.includes(aiConfig.provider) && !aiConfig.apiKey) {
      logger.warn(`AI provider ${aiConfig.provider} requires an API key but none was provided`);
    }

    // Check local model configuration
    if (aiConfig.provider === 'local' && !aiConfig.localModelPath) {
      logger.warn('Local AI provider selected but no localModelPath specified');
    }

    // Check Ollama configuration
    if (aiConfig.provider === 'ollama') {
      if (!aiConfig.ollamaHost) {
        logger.info('Ollama provider selected, using default host: http://localhost:11434');
        aiConfig.ollamaHost = 'http://localhost:11434';
      }
      if (!aiConfig.model) {
        logger.warn('Ollama provider selected but no model specified');
      }
    }

    // Check custom provider configuration
    if (aiConfig.provider === 'custom' && !aiConfig.apiEndpoint) {
      logger.warn('Custom AI provider selected but no apiEndpoint specified');
    }

    // Check if auto-start services are valid
    if (config.services.autoStart.length > 0) {
      logger.info(`Services configured for auto-start: ${config.services.autoStart.join(', ')}`);
    }

    // Check registry configuration
    if (config.registry.customRegistries) {
      const customRegistryCount = Object.keys(config.registry.customRegistries).length;
      if (customRegistryCount > 0) {
        logger.info(`Loaded ${customRegistryCount} custom registry configuration(s)`);
      }
    }
  }

  static getDefaultConfig(): Config {
    return DEFAULT_CONFIG as Config;
  }

  static mergeWithDefaults(userConfig: any): Config {
    const defaultConfig = this.getDefaultConfig();
    const merged = {
      ai: { ...defaultConfig.ai, ...(userConfig.ai || {}) },
      registry: { ...defaultConfig.registry, ...(userConfig.registry || {}) },
      services: { ...defaultConfig.services, ...(userConfig.services || {}) }
    };
    return this.validate(merged);
  }

  static validateAIConfig(aiConfig: any): any {
    // Create a mock config with just the AI config for validation
    const mockConfig = {
      ai: aiConfig,
      registry: { preferred: 'gitee-mcp' },
      services: { autoStart: [] }
    };
    
    const validated = this.validate(mockConfig);
    return validated.ai;
  }
}