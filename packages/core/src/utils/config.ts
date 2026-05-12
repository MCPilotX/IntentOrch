/**
 * @deprecated This module is kept for backward compatibility.
 * Please use `getConfigService()` from `../core/config-service.js` instead.
 *
 * This file delegates to the new unified configuration system (ConfigService).
 */

import type { AIConfig, AIProvider } from "../core/types.js";
import {
  getConfigManager,
  getAIConfig as getAIConfigNew,
  getRegistryConfig as getRegistryConfigNew,
} from "../core/config-adapter.js";

// Re-export types for backward compatibility
export type { AIConfig } from "../core/types.js";

// Define RegistryConfig type for backward compatibility
export interface RegistryConfig {
  default: string;
  fallback: string;
}

/**
 * @deprecated Use getConfigService() from core/config-service.js instead.
 * This is kept for backward compatibility only.
 */
export { getConfigManager };

// Re-export utility functions
export {
  getAIConfigNew as getAIConfig,
  getRegistryConfigNew as getRegistryConfig,
};

/**
 * @deprecated Use ConfigService from core/config-service.js instead.
 * This class is kept for backward compatibility only.
 */
export class ConfigManager {
  private adapter = getConfigManager();

  async ensureLoaded(): Promise<void> {
    return this.adapter.ensureLoaded();
  }

  async load(): Promise<void> {
    return this.adapter.load();
  }

  async save(): Promise<void> {
    return this.adapter.save();
  }

  async getAIConfig(): Promise<AIConfig> {
    return this.adapter.getAIConfig();
  }

  async getRegistryConfig(): Promise<{ default: string; fallback: string }> {
    return this.adapter.getRegistryConfig();
  }

  async setAIProvider(provider: AIProvider): Promise<void> {
    return this.adapter.setAIProvider(provider);
  }

  async setAIAPIKey(apiKey: string): Promise<void> {
    return this.adapter.setAIAPIKey(apiKey);
  }

  async setAIModel(model: string): Promise<void> {
    return this.adapter.setAIModel(model);
  }

  async setRegistryDefault(registry: string): Promise<void> {
    return this.adapter.setRegistryDefault(registry);
  }

  async setRegistryFallback(fallback: string): Promise<void> {
    return this.adapter.setRegistryFallback(fallback);
  }

  async getAll(): Promise<{
    ai: AIConfig;
    registry: { default: string; fallback: string };
  }> {
    return this.adapter.getAll();
  }
}
