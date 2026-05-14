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

import * as fs from "fs/promises";
import * as fsSync from "fs";
import * as path from "path";
import {
  INTORCH_HOME,
  CONFIG_PATH,
  LOGS_DIR,
  VENVS_DIR,
  RuntimeTypes,
  ConfigDefaults,
} from "./constants.js";
import {
  ServiceConfig,
  RuntimeType,
  RuntimeSpecificConfig,
  DockerConnectionConfig,
  AIConfig,
  AIProvider,
  DetectionResult,
} from "./types.js";
import { logger } from "./logger.js";
import { DatabaseManager, getConfigRepository } from "../utils/sqlite.js";

// Helper to safely extract error code from unknown errors
function getErrorCode(error: unknown): string | undefined {
  if (error && typeof error === "object" && "code" in error) {
    return (error as { code: string }).code;
  }
  return undefined;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

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

  // Key prefixes for SQLite
  private static readonly KEY_GLOBAL = "global:app_config";
  private static readonly PREFIX_SERVICE = "service:";
  private static readonly PREFIX_DOCKER_HOST = "docker-host:";
  private static readonly PREFIX_RUNTIME_PROFILE = "runtime-profile:";

  private constructor() {
    this.configDir = INTORCH_HOME;
    this.servicesDir = path.join(this.configDir, "services");
    this.dockerHostsDir = path.join(this.configDir, "config", "docker-hosts");
    this.runtimeProfilesDir = path.join(
      this.configDir,
      "config",
      "runtime-profiles",
    );
    this.configPath = CONFIG_PATH;
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
    await DatabaseManager.getInstance().initialize();
    await this.migrateLegacyConfigs();
  }

  private async ensureDirectories(): Promise<void> {
    const dirs = [
      this.configDir,
      path.join(this.configDir, "config"),
      this.servicesDir,
      this.dockerHostsDir,
      this.runtimeProfilesDir,
      LOGS_DIR,
      VENVS_DIR,
    ];

    for (const dir of dirs) {
      try {
        await fs.mkdir(dir, { recursive: true });
      } catch (error: unknown) {
        const err = error as NodeJS.ErrnoException;
        if (err.code !== "EEXIST") {
          logger.error(`Failed to create directory ${dir}: ${err.message}`);
          throw error;
        }
      }
    }
  }

  /**
   * Migrate legacy JSON configuration files to SQLite
   */
  private async migrateLegacyConfigs(): Promise<void> {
    const repo = getConfigRepository();

    // 1. Migrate global app config
    const globalExists = await repo.get(ConfigService.KEY_GLOBAL);
    if (!globalExists) {
      try {
        if (fsSync.existsSync(this.configPath)) {
          const data = await fs.readFile(this.configPath, "utf-8");
          const config = JSON.parse(data);
          await repo.set(ConfigService.KEY_GLOBAL, JSON.stringify(config));
          await fs.rename(this.configPath, this.configPath + ".bak");
          logger.info("[ConfigService] Migrated global config to SQLite");
        }
      } catch (e) {
        logger.warn(`[ConfigService] Global config migration failed: ${getErrorMessage(e)}`);
      }
    }

    // 2. Migrate service configs
    try {
      if (fsSync.existsSync(this.servicesDir)) {
        const files = await fs.readdir(this.servicesDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const serviceName = file.replace(".json", "");
            const sqliteKey = ConfigService.PREFIX_SERVICE + serviceName;
            const exists = await repo.get(sqliteKey);
            if (!exists) {
              const filePath = path.join(this.servicesDir, file);
              const data = await fs.readFile(filePath, "utf-8");
              await repo.set(sqliteKey, data);
              await fs.rename(filePath, filePath + ".bak");
              logger.info(`[ConfigService] Migrated service config ${serviceName} to SQLite`);
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[ConfigService] Service config migration failed: ${getErrorMessage(e)}`);
    }

    // 3. Migrate Docker host configs
    try {
      if (fsSync.existsSync(this.dockerHostsDir)) {
        const files = await fs.readdir(this.dockerHostsDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const hostName = file.replace(".json", "");
            const sqliteKey = ConfigService.PREFIX_DOCKER_HOST + hostName;
            const exists = await repo.get(sqliteKey);
            if (!exists) {
              const filePath = path.join(this.dockerHostsDir, file);
              const data = await fs.readFile(filePath, "utf-8");
              await repo.set(sqliteKey, data);
              await fs.rename(filePath, filePath + ".bak");
              logger.info(`[ConfigService] Migrated Docker host config ${hostName} to SQLite`);
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[ConfigService] Docker host config migration failed: ${getErrorMessage(e)}`);
    }

    // 4. Migrate runtime profile configs
    try {
      if (fsSync.existsSync(this.runtimeProfilesDir)) {
        const files = await fs.readdir(this.runtimeProfilesDir);
        for (const file of files) {
          if (file.endsWith(".json")) {
            const runtimeName = file.replace(".json", "");
            const sqliteKey = ConfigService.PREFIX_RUNTIME_PROFILE + runtimeName;
            const exists = await repo.get(sqliteKey);
            if (!exists) {
              const filePath = path.join(this.runtimeProfilesDir, file);
              const data = await fs.readFile(filePath, "utf-8");
              await repo.set(sqliteKey, data);
              await fs.rename(filePath, filePath + ".bak");
              logger.info(`[ConfigService] Migrated runtime profile ${runtimeName} to SQLite`);
            }
          }
        }
      }
    } catch (e) {
      logger.warn(`[ConfigService] Runtime profile migration failed: ${getErrorMessage(e)}`);
    }
  }

  // ==================== App Configuration (Global) ====================

  private getDefaultAppConfig(): AppConfig {
    return {
      ai: {
        provider: ConfigDefaults.AI_PROVIDER,
        model: ConfigDefaults.AI_MODEL,
        apiKey: "",
        apiEndpoint: "",
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
      defaultDockerHost: "local",
      requireExplicitRuntime: false,
      autoSaveDetection: true,
      interactiveMode: true,
      logLevel: "info",
    };
  }

  async getAppConfig(): Promise<AppConfig> {
    if (this.appConfigCache) {
      return this.appConfigCache;
    }

    await this.ensureInitialized();

    try {
      const repo = getConfigRepository();
      const data = await repo.get(ConfigService.KEY_GLOBAL);
      
      if (!data) {
        // No config in SQLite, return defaults
        const defaultConfig = this.getDefaultAppConfig();
        this.appConfigCache = defaultConfig;
        return defaultConfig;
      }

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
    } catch (error: unknown) {
      logger.error(`Failed to read app config from SQLite: ${getErrorMessage(error)}`);
      return this.getDefaultAppConfig();
    }
  }

  async saveAppConfig(config: AppConfig): Promise<void> {
    await this.ensureInitialized();
    const repo = getConfigRepository();
    try {
      await repo.set(ConfigService.KEY_GLOBAL, JSON.stringify(config, null, 2));
      this.appConfigCache = config;
      logger.debug("App configuration saved to SQLite successfully");
    } catch (error: unknown) {
      logger.error(`Failed to save app config to SQLite: ${getErrorMessage(error)}`);
      throw error;
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

  async setAIEndpoint(endpoint: string): Promise<void> {
    const appConfig = await this.getAppConfig();
    appConfig.ai.apiEndpoint = endpoint;
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

  /**
   * Ensure the database is initialized before any data access.
   * Silently succeeds if already initialized.
   */
  private async ensureInitialized(): Promise<void> {
    if (!DatabaseManager.getInstance().initialized) {
      await this.initialize();
    }
  }

  // ==================== Service Configuration ====================

  async getServiceConfig(serviceName: string): Promise<ServiceConfig | null> {
    if (this.serviceConfigCache.has(serviceName)) {
      return this.serviceConfigCache.get(serviceName)!;
    }

    await this.ensureInitialized();

    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_SERVICE + serviceName;
      const data = await repo.get(sqliteKey);
      
      if (!data) return null;

      const config = JSON.parse(data);
      this.serviceConfigCache.set(serviceName, config);
      return config;
    } catch (error: unknown) {
      logger.error(
        `Failed to read service config for ${serviceName} from SQLite: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async saveServiceConfig(
    serviceName: string,
    config: ServiceConfig,
  ): Promise<void> {
    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_SERVICE + serviceName;
      await repo.set(sqliteKey, JSON.stringify(config, null, 2));
      
      this.serviceConfigCache.set(serviceName, config);
      this.servicesListCache = null; // Invalidate list cache
      logger.debug(`Service config saved to SQLite: ${serviceName}`);
    } catch (error: unknown) {
      logger.error(
        `Failed to save service config for ${serviceName} to SQLite: ${getErrorMessage(error)}`,
      );
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
    const config = (await this.getServiceConfig(serviceName)) || {
      name: serviceName,
      path: "",
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
      logger.info(
        `Auto-updated runtime for ${serviceName}: ${detection.runtime} (confidence: ${detection.confidence})`,
      );
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
    config.detectionSource = "explicit";
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
      mergedConfig.detectionSource = "explicit";
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
      errors.push("Service name is required");
    }

    if (!config.path) {
      errors.push("Service path is required");
    } else if (!fsSync.existsSync(config.path)) {
      errors.push(`Service path does not exist: ${config.path}`);
    }

    if (!config.runtime && !config.detectedRuntime) {
      errors.push("Runtime type is required (either explicit or detected)");
    }

    if (config.detectionConfidence !== undefined) {
      if (config.detectionConfidence < 0 || config.detectionConfidence > 1) {
        errors.push(
          `Detection confidence must be between 0 and 1, got ${config.detectionConfidence}`,
        );
      }
    }

    return errors;
  }

  /**
   * Get service detection cache
   */
  async getServiceDetectionCache(
    serviceName: string,
  ): Promise<DetectionResult | null> {
    const sqliteKey = `detection-cache:${serviceName}`;
    try {
      const repo = getConfigRepository();
      const data = await repo.get(sqliteKey);
      if (!data) return null;
      return JSON.parse(data);
    } catch (error: unknown) {
      logger.error(
        `Failed to read detection cache for ${serviceName} from SQLite: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  /**
   * Save service detection cache
   */
  async saveServiceDetectionCache(
    serviceName: string,
    detection: DetectionResult,
  ): Promise<void> {
    const sqliteKey = `detection-cache:${serviceName}`;
    try {
      const repo = getConfigRepository();
      await repo.set(sqliteKey, JSON.stringify(detection, null, 2));
      logger.debug(`Detection cache saved for ${serviceName} to SQLite`);
    } catch (error: unknown) {
      logger.error(
        `Failed to save detection cache for ${serviceName} to SQLite: ${getErrorMessage(error)}`,
      );
    }
  }

  async listServices(): Promise<string[]> {
    if (this.servicesListCache) {
      return this.servicesListCache;
    }

    await this.ensureInitialized();

    try {
      const repo = getConfigRepository();
      const allConfigs = await repo.getAll();
      const services = Object.keys(allConfigs)
        .filter((key) => key.startsWith(ConfigService.PREFIX_SERVICE))
        .map((key) => key.replace(ConfigService.PREFIX_SERVICE, ""));

      this.servicesListCache = services;
      return services;
    } catch (error: unknown) {
      logger.error(`Failed to list services from SQLite: ${getErrorMessage(error)}`);
      return [];
    }
  }

  // ==================== Docker Host Configuration ====================

  async getDockerHostConfig(
    hostName: string,
  ): Promise<DockerConnectionConfig | null> {
    if (this.dockerHostsCache.has(hostName)) {
      return this.dockerHostsCache.get(hostName)!;
    }

    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_DOCKER_HOST + hostName;
      const data = await repo.get(sqliteKey);
      
      if (!data) return null;

      const config = JSON.parse(data);
      this.dockerHostsCache.set(hostName, config);
      return config;
    } catch (error: unknown) {
      logger.error(
        `Failed to read Docker host config ${hostName} from SQLite: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async saveDockerHostConfig(
    hostName: string,
    config: DockerConnectionConfig,
  ): Promise<void> {
    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_DOCKER_HOST + hostName;
      await repo.set(sqliteKey, JSON.stringify(config, null, 2));
      
      this.dockerHostsCache.set(hostName, config);
      logger.debug(`Docker host config saved to SQLite: ${hostName}`);
    } catch (error: unknown) {
      logger.error(
        `Failed to save Docker host config ${hostName} to SQLite: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  // ==================== Runtime Profile Configuration ====================

  async getRuntimeProfile(
    runtime: RuntimeType,
  ): Promise<RuntimeSpecificConfig | null> {
    if (this.runtimeProfilesCache.has(runtime)) {
      return this.runtimeProfilesCache.get(runtime)!;
    }

    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_RUNTIME_PROFILE + runtime;
      const data = await repo.get(sqliteKey);
      
      if (!data) return null;

      const config = JSON.parse(data);
      this.runtimeProfilesCache.set(runtime, config);
      return config;
    } catch (error: unknown) {
      logger.error(
        `Failed to read runtime profile for ${runtime} from SQLite: ${getErrorMessage(error)}`,
      );
      return null;
    }
  }

  async saveRuntimeProfile(
    runtime: RuntimeType,
    config: RuntimeSpecificConfig,
  ): Promise<void> {
    try {
      const repo = getConfigRepository();
      const sqliteKey = ConfigService.PREFIX_RUNTIME_PROFILE + runtime;
      await repo.set(sqliteKey, JSON.stringify(config, null, 2));
      
      this.runtimeProfilesCache.set(runtime, config);
      logger.debug(`Runtime profile saved to SQLite: ${runtime}`);
    } catch (error: unknown) {
      logger.error(
        `Failed to save runtime profile for ${runtime} to SQLite: ${getErrorMessage(error)}`,
      );
      throw error;
    }
  }

  // ==================== Cache Management ====================

  clearCache(): void {
    this.appConfigCache = null;
    this.serviceConfigCache.clear();
    this.dockerHostsCache.clear();
    this.runtimeProfilesCache.clear();
    this.servicesListCache = null;
    logger.debug("Configuration cache cleared");
  }

  // ==================== Utility Methods ====================

  async resetToDefaults(): Promise<void> {
    await this.saveAppConfig(this.getDefaultAppConfig());
    this.clearCache();
    logger.info("Configuration reset to defaults");
  }

  async getAllConfig(): Promise<{
    app: AppConfig;
    services: string[];
    dockerHosts: string[];
    runtimeProfiles: RuntimeType[];
  }> {
    const [appConfig, services, dockerHosts, runtimeProfiles] =
      await Promise.all([
        this.getAppConfig(),
        this.listServices(),
        this.listDockerHosts(),
        this.listRuntimeProfiles(),
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
      const repo = getConfigRepository();
      const allConfigs = await repo.getAll();
      return Object.keys(allConfigs)
        .filter((key) => key.startsWith(ConfigService.PREFIX_DOCKER_HOST))
        .map((key) => key.replace(ConfigService.PREFIX_DOCKER_HOST, ""));
    } catch (error: unknown) {
      logger.error(`Failed to list Docker hosts from SQLite: ${getErrorMessage(error)}`);
      return [];
    }
  }

  private async listRuntimeProfiles(): Promise<RuntimeType[]> {
    try {
      const repo = getConfigRepository();
      const allConfigs = await repo.getAll();
      return Object.keys(allConfigs)
        .filter((key) => key.startsWith(ConfigService.PREFIX_RUNTIME_PROFILE))
        .map((key) => key.replace(ConfigService.PREFIX_RUNTIME_PROFILE, "") as RuntimeType)
        .filter((runtime) => Object.values(RuntimeTypes).includes(runtime));
    } catch (error: unknown) {
      logger.error(`Failed to list runtime profiles from SQLite: ${getErrorMessage(error)}`);
      return [];
    }
  }
}

// ==================== Singleton Export ====================

export function getConfigService(): ConfigService {
  return ConfigService.getInstance();
}
