/**
 * Unified Configuration Service
 * 
 * This service consolidates the functionality of both ConfigManager implementations:
 * 1. src/core/config-manager.ts (static, multi-config type)
 * 2. src/utils/config.ts (singleton, AI/Registry only)
 * 
 * Design principles:
 * - Single responsibility: One service for all configuration needs
 * - Async-first: All operations are asynchronous
 * - Type-safe: Strong typing for all configuration types
 * - Caching: Intelligent caching with invalidation
 * - Error handling: Consistent error handling strategy
 */

import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as path from 'path';
import { 
  INTORCH_HOME, 
  CONFIG_PATH, 
  LOGS_DIR, 
  VENVS_DIR,
  RuntimeTypes,
  ConfigDefaults,
} from './constants';
import {
  ServiceConfig,
  RuntimeType,
  RuntimeSpecificConfig,
  DockerConnectionConfig,
  AIConfig,
  AIProvider,
  DetectionResult,
  DetectionEvidence,
} from './types';
import { logger } from './logger';

// ==================== Type Definitions ====================

export interface RegistryConfig {
  default: string;
  fallback: string;
  customRegistries?: Record<string, string>;
}

export interface ServicesConfig {
  autoStart: string[];
  defaultTimeout?: number;
}

export interface AppConfig {
  ai: AIConfig;
  registry: RegistryConfig;
  services: ServicesConfig;
  detectionThreshold?: number;
  defaultDockerHost?: string;
  requireExplicitRuntime?: boolean;
  autoSaveDetection?: boolean;
  interactiveMode?: boolean;
  logLevel?: string;
}

// ==================== Configuration Service ====================

export class ConfigService {
  private static instance: ConfigService | null = null;
  
  // Directory paths
  private readonly configDir: string;
  private readonly servicesDir: string;
  private readonly dockerHostsDir: string;
  private readonly runtimeProfilesDir: string;
  private readonly configPath: string;
  
  // Memory caches
  private appConfigCache: AppConfig | null = null;
  private serviceConfigCache = new Map<string, ServiceConfig>();
  private dockerHostsCache = new Map<string, DockerConnectionConfig>();
  private runtimeProfilesCache = new Map<string, RuntimeSpecificConfig>();
  private servicesListCache: string[] | null = null;
  
  // Lock mechanism
  private lockPath: string;
  private isLocked = false;

  private constructor() {
    this.configDir = INTORCH_HOME;
    this.servicesDir = path.join(this.configDir, 'services');
    this.dockerHostsDir = path.join(this.configDir, 'config', 'docker-hosts');
    this.runtimeProfilesDir = path.join(this.configDir, 'config', 'runtime-profiles');
    this.configPath = CONFIG_PATH;
    this.lockPath = this.configPath + '.lock';
  }

  static getInstance(): ConfigService {
    if (!ConfigService.instance) {
      ConfigService.instance = new ConfigService();
    }
    return ConfigService.instance;
  }

  // ==================== Initialization ====================

  async initialize(): Promise<void> {
    await this.ensureDirectories();
    await this.ensureDefaultConfig();
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.configDir,
      path.join(this.configDir, 'config'),
      this.servicesDir,
      this.dockerHostsDir,
      this.runtimeProfilesDir,
      LOGS_DIR,
      VENVS_DIR
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error: any) {
        if (error.code !== 'EEXIST') {
          logger.error(`Failed to create directory ${dir}: ${error.message}`);
          throw error;
        }
      }
    }
  }

  private async ensureDefaultConfig(): Promise<void> {
    try {
      await fs.access(this.configPath);
    } catch {
      // Config file doesn't exist, create with defaults
      await this.saveAppConfig(this.getDefaultAppConfig());
    }
  }

  // ==================== App Configuration (Global) ====================

  private getDefaultAppConfig(): AppConfig {
    return {
      ai: {
        provider: ConfigDefaults.AI_PROVIDER,
        model: ConfigDefaults.AI_MODEL,
        apiKey: '',
        apiEndpoint: '',
      },
      registry: {
        default: ConfigDefaults.REGISTRY_DEFAULT,
        fallback: ConfigDefaults.REGISTRY_FALLBACK,
        customRegistries: {},
      },
      services: {
        autoStart: [],
        defaultTimeout: 30000,
      },
      detectionThreshold: 0.7,
      defaultDockerHost: 'local',
      requireExplicitRuntime: false,
      autoSaveDetection: true,
      interactiveMode: true,
      logLevel: 'info',
    };
  }

  async getAppConfig(): Promise<AppConfig> {
    if (this.appConfigCache) {
      return this.appConfigCache;
    }

    try {
      const data = await fs.readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data);
      
      // Merge with defaults to ensure all fields exist
      this.appConfigCache = {
        ...this.getDefaultAppConfig(),
        ...config,
        ai: {
          ...this.getDefaultAppConfig().ai,
          ...config.ai,
        },
        registry: {
          ...this.getDefaultAppConfig().registry,
          ...config.registry,
        },
        services: {
          ...this.getDefaultAppConfig().services,
          ...config.services,
        },
      };
      
      return this.appConfigCache!;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        // Config file doesn't exist, return defaults
        const defaultConfig = this.getDefaultAppConfig();
        this.appConfigCache = defaultConfig;
        return defaultConfig;
      }
      logger.error(`Failed to read app config: ${error.message}`);
      throw error;
    }
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    await this.acquireLock();
    
    try {
      await fs.writeFile(this.configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.appConfigCache = config;
      logger.debug('App configuration saved successfully');
    } finally {
      await this.releaseLock();
    }
  }

  // ==================== AI Configuration ====================

  async getAIConfig(): Promise<AIConfig> {
    const appConfig = await this.getAppConfig();
    return appConfig.ai;
  }

  async setAIProvider(provider: AIProvider): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.ai.provider = provider;
    await this.saveAppConfig(appConfig);
  }

  async setAIAPIKey(apiKey: string): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.ai.apiKey = apiKey;
    await this.saveAppConfig(appConfig);
  }

  async setAIModel(model: string): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.ai.model = model;
    await this.saveAppConfig(appConfig);
  }

  // ==================== Registry Configuration ====================

  async getRegistryConfig(): Promise<RegistryConfig> {
    const appConfig = await this.getAppConfig();
    return appConfig.registry;
  }

  async setRegistryDefault(registry: string): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.registry.default = registry;
    await this.saveAppConfig(appConfig);
  }

  async setRegistryFallback(fallback: string): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.registry.fallback = fallback;
    await this.saveAppConfig(appConfig);
  }

  // ==================== Services Configuration ====================

  async getServicesConfig(): Promise<ServicesConfig> {
    const appConfig = await this.getAppConfig();
    return appConfig.services;
  }

  async setServicesAutoStart(servers: string[]): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.services.autoStart = servers;
    await this.saveAppConfig(appConfig);
  }

  // ==================== Service Configuration ====================

  async getServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
    if (this.serviceConfigCache.has(serviceName)) {
      return this.serviceConfigCache.get(serviceName)!;
    }

    const configPath = path.join(this.servicesDir, `${serviceName}.json`);
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(data);
      this.serviceConfigCache.set(serviceName, config);
      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to read service config for ${serviceName}: ${error.message}`);
      throw error;
    }
  }

  async saveServiceConfig(serviceName: string, config: ServiceConfig): Promise<void> {
    const configPath = path.join(this.servicesDir, `${serviceName}.json`);
    
    try {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.serviceConfigCache.set(serviceName, config);
      logger.debug(`Service config saved: ${serviceName}`);
    } catch (error: any) {
      logger.error(`Failed to save service config for ${serviceName}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Update service detection result and optionally auto-update runtime
   */
  async updateServiceDetection(
    serviceName: string,
    detection: DetectionResult,
  ): Promise<ServiceConfig> {
    const config = await this.getServiceConfig(serviceName) || {
      name: serviceName,
      path: '',
    };

    config.detectedRuntime = detection.runtime;
    config.detectionConfidence = detection.confidence;
    config.detectionSource = detection.source;
    config.detectionEvidence = detection.evidence;
    config.detectionWarning = detection.warning;
    config.lastDetectedAt = new Date().toISOString();

    // If confidence is high, automatically update runtime
    const appConfig = await this.getAppConfig();
    const detectionThreshold = appConfig.detectionThreshold ?? 0.7;
    if (detection.confidence >= detectionThreshold) {
      config.runtime = detection.runtime;
      logger.info(`Auto-updated runtime for ${serviceName}: ${detection.runtime} (confidence: ${detection.confidence})`);
    }

    await this.saveServiceConfig(serviceName, config);
    return config;
  }

  /**
   * Set service runtime explicitly
   */
  async setServiceRuntime(
    serviceName: string,
    runtime: RuntimeType,
    runtimeConfig?: RuntimeSpecificConfig,
  ): Promise<ServiceConfig> {
    const config = await this.getServiceConfig(serviceName);
    if (!config) {
      throw new Error(`Service ${serviceName} not found`);
    }

    config.runtime = runtime;
    config.detectionSource = 'explicit';
    config.detectionConfidence = 1.0;

    if (runtimeConfig) {
      config.runtimeConfig = runtimeConfig;
    }

    await this.saveServiceConfig(serviceName, config);
    return config;
  }

  /**
   * Resolve and merge service configuration with defaults
   */
  resolveServiceConfig(
    userConfig: Partial<ServiceConfig>,
    servicePath: string,
  ): ServiceConfig {
    const baseConfig: ServiceConfig = {
      name: userConfig.name || path.basename(servicePath),
      path: servicePath,
    };

    // Merge user configuration
    const mergedConfig = { ...baseConfig, ...userConfig };

    // Ensure path is absolute
    if (!path.isAbsolute(mergedConfig.path)) {
      mergedConfig.path = path.resolve(mergedConfig.path);
    }

    // If user specified runtime, set highest priority
    if (mergedConfig.runtime) {
      mergedConfig.detectionSource = 'explicit';
      mergedConfig.detectionConfidence = 1.0;
    }

    return mergedConfig;
  }

  /**
   * Validate service configuration
   */
  validateServiceConfig(config: ServiceConfig): string[] {
    const errors: string[] = [];

    if (!config.name) {
      errors.push('Service name is required');
    }

    if (!config.path) {
      errors.push('Service path is required');
    } else if (!fsSync.existsSync(config.path)) {
      errors.push(`Service path does not exist: ${config.path}`);
    }

    if (!config.runtime && !config.detectedRuntime) {
      errors.push('Runtime type is required (either explicit or detected)');
    }

    if (config.detectionConfidence !== undefined) {
      if (config.detectionConfidence < 0 || config.detectionConfidence > 1) {
        errors.push(`Detection confidence must be between 0 and 1, got ${config.detectionConfidence}`);
      }
    }

    return errors;
  }

  /**
   * Get service detection cache
   */
  async getServiceDetectionCache(serviceName: string): Promise<DetectionResult | null> {
    const cachePath = path.join(this.servicesDir, serviceName, 'detection-cache.json');

    try {
      const data = await fs.readFile(cachePath, 'utf-8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to read detection cache for ${serviceName}: ${error.message}`);
      return null;
    }
  }

  /**
   * Save service detection cache
   */
  async saveServiceDetectionCache(serviceName: string, detection: DetectionResult): Promise<void> {
    const cachePath = path.join(this.servicesDir, serviceName, 'detection-cache.json');
    const cacheDir = path.dirname(cachePath);

    try {
      await fs.mkdir(cacheDir, { recursive: true });
      await fs.writeFile(cachePath, JSON.stringify(detection, null, 2), 'utf-8');
      logger.debug(`Detection cache saved for ${serviceName}`);
    } catch (error: any) {
      logger.error(`Failed to save detection cache for ${serviceName}: ${error.message}`);
    }
  }

  async listServices(): Promise<string[]> {
    if (this.servicesListCache) {
      return this.servicesListCache;
    }

    try {
      const files = await fs.readdir(this.servicesDir);
      const services = files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
      
      this.servicesListCache = services;
      return services;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      logger.error(`Failed to list services: ${error.message}`);
      throw error;
    }
  }

  // ==================== Docker Host Configuration ====================

  async getDockerHostConfig(hostName: string): Promise<DockerConnectionConfig | null> {
    if (this.dockerHostsCache.has(hostName)) {
      return this.dockerHostsCache.get(hostName)!;
    }

    const configPath = path.join(this.dockerHostsDir, `${hostName}.json`);
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(data);
      this.dockerHostsCache.set(hostName, config);
      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to read Docker host config ${hostName}: ${error.message}`);
      throw error;
    }
  }

  async saveDockerHostConfig(hostName: string, config: DockerConnectionConfig): Promise<void> {
    const configPath = path.join(this.dockerHostsDir, `${hostName}.json`);
    
    try {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.dockerHostsCache.set(hostName, config);
      logger.debug(`Docker host config saved: ${hostName}`);
    } catch (error: any) {
      logger.error(`Failed to save Docker host config ${hostName}: ${error.message}`);
      throw error;
    }
  }

  // ==================== Runtime Profile Configuration ====================

  async getRuntimeProfile(runtime: RuntimeType): Promise<RuntimeSpecificConfig | null> {
    if (this.runtimeProfilesCache.has(runtime)) {
      return this.runtimeProfilesCache.get(runtime)!;
    }

    const configPath = path.join(this.runtimeProfilesDir, `${runtime}.json`);
    
    try {
      const data = await fs.readFile(configPath, 'utf-8');
      const config = JSON.parse(data);
      this.runtimeProfilesCache.set(runtime, config);
      return config;
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null;
      }
      logger.error(`Failed to read runtime profile for ${runtime}: ${error.message}`);
      throw error;
    }
  }

  async saveRuntimeProfile(runtime: RuntimeType, config: RuntimeSpecificConfig): Promise<void> {
    const configPath = path.join(this.runtimeProfilesDir, `${runtime}.json`);
    
    try {
      await fs.writeFile(configPath, JSON.stringify(config, null, 2), 'utf-8');
      this.runtimeProfilesCache.set(runtime, config);
      logger.debug(`Runtime profile saved: ${runtime}`);
    } catch (error: any) {
      logger.error(`Failed to save runtime profile for ${runtime}: ${error.message}`);
      throw error;
    }
  }

  // ==================== Lock Management ====================

  private async acquireLock(): Promise<void> {
    const maxAttempts = 10;
    const retryDelay = 100; // ms

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        await fs.writeFile(this.lockPath, process.pid.toString(), { flag: 'wx' });
        this.isLocked = true;
        return;
      } catch (error: any) {
        if (error.code === 'EEXIST') {
          if (attempt === maxAttempts - 1) {
            throw new Error('Configuration storage is locked by another process.');
          }
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          continue;
        }
        throw error;
      }
    }
  }

  private async releaseLock(): Promise<void> {
    if (this.isLocked) {
      try {
        await fs.unlink(this.lockPath);
      } catch (error) {
        // Ignore errors when releasing lock
      } finally {
        this.isLocked = false;
      }
    }
  }

  // ==================== Cache Management ====================

  clearCache(): void {
    this.appConfigCache = null;
    this.serviceConfigCache.clear();
    this.dockerHostsCache.clear();
    this.runtimeProfilesCache.clear();
    this.servicesListCache = null;
    logger.debug('Configuration cache cleared');
  }

  // ==================== Utility Methods ====================

  async resetToDefaults(): Promise<void> {
    await this.saveAppConfig(this.getDefaultAppConfig());
    this.clearCache();
    logger.info('Configuration reset to defaults');
  }

  async getAllConfig(): Promise<{
    app: AppConfig;
    services: string[];
    dockerHosts: string[];
    runtimeProfiles: RuntimeType[];
  }> {
    const [appConfig, services, dockerHosts, runtimeProfiles] = await Promise.all([
      this.getAppConfig(),
      this.listServices(),
      this.listDockerHosts(),
      this.listRuntimeProfiles()
    ]);

    return {
      app: appConfig,
      services,
      dockerHosts,
      runtimeProfiles,
    };
  }

  private async listDockerHosts(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.dockerHostsDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }

  private async listRuntimeProfiles(): Promise<RuntimeType[]> {
    try {
      const files = await fs.readdir(this.runtimeProfilesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', '') as RuntimeType)
        .filter(runtime => Object.values(RuntimeTypes).includes(runtime));
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return [];
      }
      throw error;
    }
  }
}

// ==================== Singleton Export ====================

export function getConfigService(): ConfigService {
  return ConfigService.getInstance();
}