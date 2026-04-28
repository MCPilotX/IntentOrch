/**
 * @deprecated Configuration Adapter — Use ConfigService directly instead.
 * 
 * This adapter exists only for backward compatibility with legacy code that uses:
 * 1. src/utils/config.ts (ConfigManager singleton)
 * 2. src/core/config-manager.ts (static ConfigManager)
 * 
 * New code should use ConfigService (from './config-service') directly.
 * This file will be removed in a future major version.
 * 
 * It delegates to the new ConfigService while maintaining the old API.
 */

import { ConfigService, getConfigService } from './config-service';
import type { AIConfig, AIProvider, ServiceConfig, DockerConnectionConfig, RuntimeSpecificConfig, DetectionResult } from './types';

// ==================== Adapter for src/utils/config.ts ====================

/**
 * @deprecated Use ConfigService directly instead.
 * Backward compatibility adapter for the old ConfigManager from src/utils/config.ts
 * This maintains the same API but delegates to the new ConfigService
 */
export class LegacyConfigManagerAdapter {
  private configService: ConfigService;

  constructor() {
    this.configService = getConfigService();
  }

  async ensureLoaded(): Promise<void> {
    // ConfigService loads lazily, so this is a no-op
  }

  async load(): Promise<void> {
    // ConfigService loads lazily, so this is a no-op
  }

  async save(): Promise<void> {
    // ConfigService saves automatically on set operations
  }

  async getAIConfig(): Promise<AIConfig> {
    return this.configService.getAIConfig();
  }

  async getRegistryConfig(): Promise<{ default: string; fallback: string }> {
    const registryConfig = await this.configService.getRegistryConfig();
    return {
      default: registryConfig.default,
      fallback: registryConfig.fallback,
    };
  }

  async setAIProvider(provider: AIProvider): Promise<void> {
    await this.configService.setAIProvider(provider);
  }

  async setAIAPIKey(apiKey: string): Promise<void> {
    await this.configService.setAIAPIKey(apiKey);
  }

  async setAIModel(model: string): Promise<void> {
    await this.configService.setAIModel(model);
  }

  async setRegistryDefault(registry: string): Promise<void> {
    await this.configService.setRegistryDefault(registry);
  }

  async setRegistryFallback(fallback: string): Promise<void> {
    await this.configService.setRegistryFallback(fallback);
  }

  async setServicesAutoStart(servers: string[]): Promise<void> {
    await this.configService.setServicesAutoStart(servers);
  }

  async getAll(): Promise<{
    ai: AIConfig;
    registry: { default: string; fallback: string };
    services: { autoStart: string[] };
  }> {
    const [aiConfig, registryConfig, servicesConfig] = await Promise.all([
      this.configService.getAIConfig(),
      this.configService.getRegistryConfig(),
      this.configService.getServicesConfig(),
    ]);

    return {
      ai: aiConfig,
      registry: {
        default: registryConfig.default,
        fallback: registryConfig.fallback,
      },
      services: {
        autoStart: servicesConfig.autoStart || [],
      },
    };
  }
}

// ==================== Adapter for src/core/config-manager.ts ====================

/**
 * @deprecated Use ConfigService directly instead.
 * Backward compatibility adapter for the static ConfigManager from src/core/config-manager.ts
 * This provides static methods that delegate to the ConfigService instance
 */
export class StaticConfigManagerAdapter {
  private static configService: ConfigService = getConfigService();

  static async init(): Promise<void> {
    await this.configService.initialize();
  }

  static async getServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
    return this.configService.getServiceConfig(serviceName);
  }

  static async saveServiceConfig(serviceName: string, config: ServiceConfig): Promise<void> {
    await this.configService.saveServiceConfig(serviceName, config);
  }

  static async listServices(): Promise<string[]> {
    return this.configService.listServices();
  }

  static async getDockerHostConfig(hostName: string): Promise<DockerConnectionConfig | null> {
    return this.configService.getDockerHostConfig(hostName);
  }

  static async saveDockerHostConfig(hostName: string, config: DockerConnectionConfig): Promise<void> {
    await this.configService.saveDockerHostConfig(hostName, config);
  }

  static async deleteDockerHostConfig(hostName: string): Promise<void> {
    // Note: This method doesn't exist in ConfigService yet
    // For now, we'll implement a simple version
    const configPath = `${process.env.INTORCH_HOME || '~/.intorch'}/config/docker-hosts/${hostName}.json`;
    const fs = await import('fs/promises');
    try {
      await fs.unlink(configPath);
    } catch (error: any) {
      if (error.code !== 'ENOENT') {
        throw error;
      }
    }
  }

  static async getRuntimeProfile(runtime: string): Promise<RuntimeSpecificConfig | null> {
    return this.configService.getRuntimeProfile(runtime as any);
  }

  static async saveRuntimeProfile(runtime: string, config: RuntimeSpecificConfig): Promise<void> {
    await this.configService.saveRuntimeProfile(runtime as any, config);
  }

  static async getGlobalConfig(): Promise<any> {
    const appConfig = await this.configService.getAppConfig();
    return {
      ai: appConfig.ai,
      registry: appConfig.registry,
      services: appConfig.services,
    };
  }

  static async saveGlobalConfig(config: any): Promise<void> {
    const appConfig = await this.configService.getAppConfig();
    
    // Merge with existing config
    const mergedConfig = {
      ...appConfig,
      ai: { ...appConfig.ai, ...config.ai },
      registry: { ...appConfig.registry, ...config.registry },
      services: { ...appConfig.services, ...config.services },
    };

    await this.configService.saveAppConfig(mergedConfig);
  }

  static async resetConfig(): Promise<void> {
    await this.configService.resetToDefaults();
  }

  static getDefaultGlobalConfig(): any {
    // Return a simplified default config
    return {
      ai: {
        provider: 'none',
        model: 'none',
        apiKey: '',
        apiEndpoint: '',
      },
      registry: {
        default: 'gitee',
        fallback: 'github',
      },
      services: {
        autoStart: [],
      },
    };
  }
}

// ==================== Singleton Export for Backward Compatibility ====================

// Singleton instance for src/utils/config.ts compatibility
let legacyConfigManager: LegacyConfigManagerAdapter | null = null;

export function getConfigManager(): LegacyConfigManagerAdapter {
  if (!legacyConfigManager) {
    legacyConfigManager = new LegacyConfigManagerAdapter();
  }
  return legacyConfigManager;
}

// Re-export types for backward compatibility
export type { AIConfig } from './types';

// Utility functions for backward compatibility
export async function getAIConfig(): Promise<AIConfig> {
  return getConfigManager().getAIConfig();
}

export async function getRegistryConfig(): Promise<{ default: string; fallback: string }> {
  return getConfigManager().getRegistryConfig();
}
