import { ServiceConfig, RuntimeType, RuntimeSpecificConfig, DockerConnectionConfig, DetectionResult, Config } from './types';
export declare class ConfigManager {
    private static CONFIG_DIR;
    private static SERVICES_DIR;
    private static DOCKER_HOSTS_DIR;
    private static RUNTIME_PROFILES_DIR;
    private static GLOBAL_CONFIG_PATH;
    private static serviceConfigCache;
    private static servicesListCache;
    private static globalConfigCache;
    private static dockerHostsCache;
    private static runtimeProfilesCache;
    static init(): void;
    static getServiceConfig(serviceName: string): ServiceConfig | null;
    static saveServiceConfig(serviceName: string, config: ServiceConfig): void;
    static updateServiceDetection(serviceName: string, detection: DetectionResult): ServiceConfig;
    static setServiceRuntime(serviceName: string, runtime: RuntimeType, runtimeConfig?: RuntimeSpecificConfig): ServiceConfig;
    static getDockerHostConfig(hostName: string): DockerConnectionConfig | null;
    static saveDockerHostConfig(hostName: string, config: DockerConnectionConfig): void;
    static deleteDockerHostConfig(hostName: string): void;
    static listDockerHosts(): string[];
    static getRuntimeProfile(runtime: RuntimeType): RuntimeSpecificConfig | null;
    static saveRuntimeProfile(runtime: RuntimeType, config: RuntimeSpecificConfig): void;
    static getGlobalConfig(): Config;
    static saveGlobalConfig(config: Partial<Config>): void;
    private static getServiceConfigPath;
    private static ensureDefaultDockerHosts;
    private static ensureDefaultRuntimeProfiles;
    private static getDefaultGlobalConfig;
    static resolveServiceConfig(userConfig: Partial<ServiceConfig>, servicePath: string): ServiceConfig;
    static validateServiceConfig(config: ServiceConfig): string[];
    static getAllServices(): string[];
    static getServiceDetectionCache(serviceName: string): DetectionResult | null;
    static saveServiceDetectionCache(serviceName: string, detection: DetectionResult): void;
}
//# sourceMappingURL=config-manager.d.ts.map