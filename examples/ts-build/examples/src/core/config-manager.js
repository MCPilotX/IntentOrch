var _a;
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_PATH, MCPILOT_HOME, DEFAULT_CONFIG } from './constants';
import { logger } from './logger';
export class ConfigManager {
    static init() {
        // Create configuration directory structure
        const dirs = [
            this.CONFIG_DIR,
            path.join(this.CONFIG_DIR, 'config'),
            this.SERVICES_DIR,
            this.DOCKER_HOSTS_DIR,
            this.RUNTIME_PROFILES_DIR,
        ];
        for (const dir of dirs) {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        }
        // Create default global configuration
        if (!fs.existsSync(this.GLOBAL_CONFIG_PATH)) {
            this.saveGlobalConfig(this.getDefaultGlobalConfig());
        }
        // Create default Docker host configuration
        this.ensureDefaultDockerHosts();
        // Create default runtime configuration templates
        this.ensureDefaultRuntimeProfiles();
        logger.info('Configuration system initialized');
    }
    // ==================== Service Configuration Management ====================
    static getServiceConfig(serviceName) {
        // Check cache first
        if (this.serviceConfigCache.has(serviceName)) {
            return this.serviceConfigCache.get(serviceName);
        }
        const configPath = this.getServiceConfigPath(serviceName);
        if (!fs.existsSync(configPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            const config = JSON.parse(content);
            // Cache the result
            this.serviceConfigCache.set(serviceName, config);
            return config;
        }
        catch (error) {
            logger.error(`Failed to read service config for ${serviceName}: ${error.message}`);
            return null;
        }
    }
    static saveServiceConfig(serviceName, config) {
        const configPath = this.getServiceConfigPath(serviceName);
        const configDir = path.dirname(configPath);
        if (!fs.existsSync(configDir)) {
            fs.mkdirSync(configDir, { recursive: true });
        }
        try {
            // Ensure path is absolute
            if (!path.isAbsolute(config.path)) {
                config.path = path.resolve(config.path);
            }
            // Add/update metadata
            config.installedAt = config.installedAt || new Date().toISOString();
            config.lastDetectedAt = new Date().toISOString();
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            // Update cache
            this.serviceConfigCache.set(serviceName, config);
            this.servicesListCache = null; // Invalidate services list cache
            logger.debug(`Service config saved: ${serviceName}`);
        }
        catch (error) {
            logger.error(`Failed to save service config for ${serviceName}: ${error.message}`);
            throw error;
        }
    }
    static updateServiceDetection(serviceName, detection) {
        const config = this.getServiceConfig(serviceName) || {
            name: serviceName,
            path: '', // Will be set by caller
        };
        config.detectedRuntime = detection.runtime;
        config.detectionConfidence = detection.confidence;
        config.detectionSource = detection.source;
        config.detectionEvidence = detection.evidence;
        config.detectionWarning = detection.warning;
        config.lastDetectedAt = new Date().toISOString();
        // If confidence is high, automatically update runtime
        const globalConfig = this.getGlobalConfig();
        if (detection.confidence >= globalConfig.detectionThreshold) {
            config.runtime = detection.runtime;
            logger.info(`Auto-updated runtime for ${serviceName}: ${detection.runtime} (confidence: ${detection.confidence})`);
        }
        this.saveServiceConfig(serviceName, config);
        return config;
    }
    static setServiceRuntime(serviceName, runtime, runtimeConfig) {
        const config = this.getServiceConfig(serviceName);
        if (!config) {
            throw new Error(`Service ${serviceName} not found`);
        }
        config.runtime = runtime;
        config.detectionSource = 'explicit';
        config.detectionConfidence = 1.0;
        if (runtimeConfig) {
            config.runtimeConfig = runtimeConfig;
        }
        this.saveServiceConfig(serviceName, config);
        return config;
    }
    // ==================== Docker Host Configuration ====================
    static getDockerHostConfig(hostName) {
        const configPath = path.join(this.DOCKER_HOSTS_DIR, `${hostName}.json`);
        if (!fs.existsSync(configPath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(configPath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.error(`Failed to read Docker host config ${hostName}: ${error.message}`);
            return null;
        }
    }
    static saveDockerHostConfig(hostName, config) {
        const configPath = path.join(this.DOCKER_HOSTS_DIR, `${hostName}.json`);
        try {
            fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
            logger.debug(`Docker host config saved: ${hostName}`);
        }
        catch (error) {
            logger.error(`Failed to save Docker host config ${hostName}: ${error.message}`);
            throw error;
        }
    }
    static deleteDockerHostConfig(hostName) {
        const configPath = path.join(this.DOCKER_HOSTS_DIR, `${hostName}.json`);
        try {
            if (fs.existsSync(configPath)) {
                fs.unlinkSync(configPath);
                logger.debug(`Docker host config deleted: ${hostName}`);
            }
        }
        catch (error) {
            logger.error(`Failed to delete Docker host config ${hostName}: ${error.message}`);
            throw error;
        }
    }
    static listDockerHosts() {
        if (!fs.existsSync(this.DOCKER_HOSTS_DIR)) {
            return [];
        }
        return fs.readdirSync(this.DOCKER_HOSTS_DIR)
            .filter(file => file.endsWith('.json'))
            .map(file => path.basename(file, '.json'));
    }
    // ==================== Runtime Configuration Templates ====================
    static getRuntimeProfile(runtime) {
        const profilePath = path.join(this.RUNTIME_PROFILES_DIR, `${runtime}.json`);
        if (!fs.existsSync(profilePath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(profilePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.error(`Failed to read runtime profile for ${runtime}: ${error.message}`);
            return null;
        }
    }
    static saveRuntimeProfile(runtime, config) {
        const profilePath = path.join(this.RUNTIME_PROFILES_DIR, `${runtime}.json`);
        try {
            fs.writeFileSync(profilePath, JSON.stringify(config, null, 2));
            logger.debug(`Runtime profile saved: ${runtime}`);
        }
        catch (error) {
            logger.error(`Failed to save runtime profile for ${runtime}: ${error.message}`);
            throw error;
        }
    }
    // ==================== Global Configuration ====================
    static getGlobalConfig() {
        if (!fs.existsSync(this.GLOBAL_CONFIG_PATH)) {
            return this.getDefaultGlobalConfig();
        }
        try {
            const content = fs.readFileSync(this.GLOBAL_CONFIG_PATH, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.error(`Failed to read global config: ${error.message}`);
            return this.getDefaultGlobalConfig();
        }
    }
    static saveGlobalConfig(config) {
        try {
            fs.writeFileSync(this.GLOBAL_CONFIG_PATH, JSON.stringify(config, null, 2));
            logger.debug('Global config saved');
        }
        catch (error) {
            logger.error(`Failed to save global config: ${error.message}`);
            throw error;
        }
    }
    // ==================== Helper Methods ====================
    static getServiceConfigPath(serviceName) {
        return path.join(this.SERVICES_DIR, serviceName, 'config.json');
    }
    static ensureDefaultDockerHosts() {
        const defaultHosts = {
            local: {
                type: 'local',
                socketPath: process.platform === 'win32'
                    ? '//./pipe/docker_engine'
                    : '/var/run/docker.sock',
            },
            'localhost-tcp': {
                type: 'remote',
                host: 'localhost',
                port: 2375,
            },
            'localhost-tls': {
                type: 'remote',
                host: 'localhost',
                port: 2376,
                useTLS: true,
            },
        };
        for (const [name, config] of Object.entries(defaultHosts)) {
            const configPath = path.join(this.DOCKER_HOSTS_DIR, `${name}.json`);
            if (!fs.existsSync(configPath)) {
                this.saveDockerHostConfig(name, config);
            }
        }
    }
    static ensureDefaultRuntimeProfiles() {
        const defaultProfiles = {
            node: {
                node: {
                    npmRegistry: 'https://registry.npmmirror.com',
                    bun: false,
                    nodeVersion: '>=18.0.0',
                },
            },
            python: {
                python: {
                    venv: true,
                    mirror: 'https://pypi.tuna.tsinghua.edu.cn/simple',
                    pythonVersion: '>=3.8',
                },
            },
            docker: {
                docker: {
                    type: 'local',
                    ports: [8080],
                },
            },
            go: {
                go: {
                    build: true,
                    goVersion: '>=1.20',
                },
            },
            rust: {
                rust: {
                    release: true,
                    rustVersion: '>=1.70',
                },
            },
            binary: {
            // Binary runtime has no special configuration
            },
        };
        for (const [runtime, config] of Object.entries(defaultProfiles)) {
            const profilePath = path.join(this.RUNTIME_PROFILES_DIR, `${runtime}.json`);
            if (!fs.existsSync(profilePath)) {
                this.saveRuntimeProfile(runtime, config);
            }
        }
    }
    static getDefaultGlobalConfig() {
        return {
            ...DEFAULT_CONFIG,
            defaultDockerHost: 'local',
            detectionThreshold: 0.7,
            requireExplicitRuntime: false,
            autoSaveDetection: true,
            interactiveMode: true,
            logLevel: 'info',
        };
    }
    // ==================== Configuration Parsing and Merging ====================
    static resolveServiceConfig(userConfig, servicePath) {
        const baseConfig = {
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
        // Apply runtime configuration template
        if (mergedConfig.runtime && !mergedConfig.runtimeConfig) {
            const profile = this.getRuntimeProfile(mergedConfig.runtime);
            if (profile) {
                mergedConfig.runtimeConfig = profile;
            }
        }
        return mergedConfig;
    }
    // ==================== Configuration validation ====================
    static validateServiceConfig(config) {
        const errors = [];
        if (!config.name) {
            errors.push('Service name is required');
        }
        if (!config.path) {
            errors.push('Service path is required');
        }
        else if (!fs.existsSync(config.path)) {
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
    // ==================== Configuration Utility Methods ====================
    static getAllServices() {
        // Check cache first
        if (this.servicesListCache !== null) {
            return this.servicesListCache;
        }
        if (!fs.existsSync(this.SERVICES_DIR)) {
            this.servicesListCache = [];
            return [];
        }
        const services = fs.readdirSync(this.SERVICES_DIR, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name);
        // Cache the result
        this.servicesListCache = services;
        return services;
    }
    static getServiceDetectionCache(serviceName) {
        const cachePath = path.join(this.SERVICES_DIR, serviceName, 'detection-cache.json');
        if (!fs.existsSync(cachePath)) {
            return null;
        }
        try {
            const content = fs.readFileSync(cachePath, 'utf-8');
            return JSON.parse(content);
        }
        catch (error) {
            logger.error(`Failed to read detection cache for ${serviceName}: ${error.message}`);
            return null;
        }
    }
    static saveServiceDetectionCache(serviceName, detection) {
        const cachePath = path.join(this.SERVICES_DIR, serviceName, 'detection-cache.json');
        const cacheDir = path.dirname(cachePath);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }
        try {
            fs.writeFileSync(cachePath, JSON.stringify(detection, null, 2));
            logger.debug(`Detection cache saved for ${serviceName}`);
        }
        catch (error) {
            logger.error(`Failed to save detection cache for ${serviceName}: ${error.message}`);
        }
    }
}
_a = ConfigManager;
ConfigManager.CONFIG_DIR = MCPILOT_HOME;
ConfigManager.SERVICES_DIR = path.join(_a.CONFIG_DIR, 'services');
ConfigManager.DOCKER_HOSTS_DIR = path.join(_a.CONFIG_DIR, 'config', 'docker-hosts');
ConfigManager.RUNTIME_PROFILES_DIR = path.join(_a.CONFIG_DIR, 'config', 'runtime-profiles');
ConfigManager.GLOBAL_CONFIG_PATH = CONFIG_PATH;
// Memory caches
ConfigManager.serviceConfigCache = new Map();
ConfigManager.servicesListCache = null;
ConfigManager.globalConfigCache = null;
ConfigManager.dockerHostsCache = new Map();
ConfigManager.runtimeProfilesCache = new Map();
