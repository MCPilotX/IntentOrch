export interface PerformanceMetrics {
    timestamp: number;
    cpuUsage: {
        user: number;
        system: number;
        total: number;
    };
    memoryUsage: {
        rss: number;
        heapTotal: number;
        heapUsed: number;
        external: number;
    };
    systemMetrics: {
        totalMemory: number;
        freeMemory: number;
        loadAverage: number[];
        uptime: number;
    };
    serviceMetrics: {
        [serviceName: string]: {
            cpu: number;
            memory: number;
            uptime: number;
            requestCount: number;
            errorCount: number;
            responseTime: number;
            errorRate?: number;
        };
    };
}
export interface PerformanceConfig {
    enabled: boolean;
    collectionInterval: number;
    retentionPeriod: number;
    alertThresholds: {
        cpu: number;
        memory: number;
        responseTime: number;
        errorRate: number;
    };
}
export declare class PerformanceMonitor {
    private metrics;
    private config;
    private collectionTimer;
    private serviceStats;
    constructor(config?: Partial<PerformanceConfig>);
    start(): void;
    stop(): void;
    private collectMetrics;
    private getCpuUsage;
    private getMemoryUsage;
    private getSystemMetrics;
    private getServiceMetrics;
    private cleanupOldMetrics;
    private checkAlerts;
    updateServiceStats(serviceName: string, stats: any): void;
    recordServiceRequest(serviceName: string, duration: number, success?: boolean): void;
    getMetrics(timeRange?: {
        start: number;
        end: number;
    }): PerformanceMetrics[];
    getSummary(): any;
    private checkForAlertsInternal;
    reset(): void;
    getConfig(): PerformanceConfig;
    updateConfig(newConfig: Partial<PerformanceConfig>): void;
}
export declare function getPerformanceMonitor(config?: Partial<PerformanceConfig>): PerformanceMonitor;
export declare function startPerformanceMonitoring(config?: Partial<PerformanceConfig>): PerformanceMonitor;
export declare function stopPerformanceMonitoring(): void;
export declare function recordServicePerformance(serviceName: string, operation: string, duration: number, success?: boolean): void;
//# sourceMappingURL=performance-monitor.d.ts.map