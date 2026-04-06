import * as os from 'os';
import { logger } from './logger';
export class PerformanceMonitor {
    constructor(config) {
        this.metrics = [];
        this.collectionTimer = null;
        this.serviceStats = new Map();
        this.config = {
            enabled: true,
            collectionInterval: 60000, // 1 minute
            retentionPeriod: 3600000, // 1 hour
            alertThresholds: {
                cpu: 80,
                memory: 80,
                responseTime: 1000,
                errorRate: 5,
            },
            ...config,
        };
        if (this.config.enabled) {
            this.start();
        }
    }
    start() {
        if (this.collectionTimer) {
            this.stop();
        }
        logger.info('Performance monitoring started');
        this.collectionTimer = setInterval(() => {
            this.collectMetrics();
            this.cleanupOldMetrics();
            this.checkAlerts();
        }, this.config.collectionInterval);
        // Collect metrics immediately
        this.collectMetrics();
    }
    stop() {
        if (this.collectionTimer) {
            clearInterval(this.collectionTimer);
            this.collectionTimer = null;
            logger.info('Performance monitoring stopped');
        }
    }
    collectMetrics() {
        try {
            const metrics = {
                timestamp: Date.now(),
                cpuUsage: this.getCpuUsage(),
                memoryUsage: this.getMemoryUsage(),
                systemMetrics: this.getSystemMetrics(),
                serviceMetrics: this.getServiceMetrics(),
            };
            this.metrics.push(metrics);
            logger.debug('Performance metrics collected', { timestamp: metrics.timestamp });
        }
        catch (error) {
            logger.error('Failed to collect performance metrics', { error: error.message });
        }
    }
    getCpuUsage() {
        const usage = process.cpuUsage();
        return {
            user: usage.user / 1000, // microseconds to milliseconds
            system: usage.system / 1000,
            total: (usage.user + usage.system) / 1000,
        };
    }
    getMemoryUsage() {
        const memory = process.memoryUsage();
        return {
            rss: memory.rss,
            heapTotal: memory.heapTotal,
            heapUsed: memory.heapUsed,
            external: memory.external,
        };
    }
    getSystemMetrics() {
        return {
            totalMemory: os.totalmem(),
            freeMemory: os.freemem(),
            loadAverage: os.loadavg(),
            uptime: os.uptime(),
        };
    }
    getServiceMetrics() {
        const serviceMetrics = {};
        for (const [serviceName, stats] of this.serviceStats) {
            serviceMetrics[serviceName] = {
                cpu: stats.cpu || 0,
                memory: stats.memory || 0,
                uptime: stats.uptime || 0,
                requestCount: stats.requestCount || 0,
                errorCount: stats.errorCount || 0,
                responseTime: stats.responseTime || 0,
                errorRate: stats.errorRate || 0,
            };
        }
        return serviceMetrics;
    }
    cleanupOldMetrics() {
        const cutoff = Date.now() - this.config.retentionPeriod;
        this.metrics = this.metrics.filter(m => m.timestamp >= cutoff);
    }
    checkAlerts() {
        if (this.metrics.length === 0) {
            return;
        }
        const latest = this.metrics[this.metrics.length - 1];
        // Check CPU usage
        const cpuPercent = (latest.cpuUsage.total / 1000) * 100; // rough estimate
        if (cpuPercent > this.config.alertThresholds.cpu) {
            logger.warn(`High CPU usage detected: ${cpuPercent.toFixed(1)}%`, {
                threshold: this.config.alertThresholds.cpu,
                metrics: latest.cpuUsage,
            });
        }
        // Check memory usage
        const memoryPercent = (latest.memoryUsage.heapUsed / latest.memoryUsage.heapTotal) * 100;
        if (memoryPercent > this.config.alertThresholds.memory) {
            logger.warn(`High memory usage detected: ${memoryPercent.toFixed(1)}%`, {
                threshold: this.config.alertThresholds.memory,
                metrics: latest.memoryUsage,
            });
        }
        // Check service metrics
        for (const [serviceName, metrics] of Object.entries(latest.serviceMetrics)) {
            if (metrics.errorRate > this.config.alertThresholds.errorRate) {
                logger.warn(`High error rate for service ${serviceName}: ${metrics.errorRate.toFixed(1)}%`, {
                    threshold: this.config.alertThresholds.errorRate,
                    metrics,
                });
            }
            if (metrics.responseTime > this.config.alertThresholds.responseTime) {
                logger.warn(`High response time for service ${serviceName}: ${metrics.responseTime}ms`, {
                    threshold: this.config.alertThresholds.responseTime,
                    metrics,
                });
            }
        }
    }
    updateServiceStats(serviceName, stats) {
        this.serviceStats.set(serviceName, {
            ...this.serviceStats.get(serviceName),
            ...stats,
            lastUpdated: Date.now(),
        });
    }
    recordServiceRequest(serviceName, duration, success = true) {
        const stats = this.serviceStats.get(serviceName) || {
            requestCount: 0,
            errorCount: 0,
            totalResponseTime: 0,
            startTime: Date.now(),
        };
        stats.requestCount++;
        if (!success) {
            stats.errorCount++;
        }
        stats.totalResponseTime += duration;
        stats.responseTime = stats.totalResponseTime / stats.requestCount;
        stats.errorRate = (stats.errorCount / stats.requestCount) * 100;
        stats.uptime = Date.now() - stats.startTime;
        this.updateServiceStats(serviceName, stats);
    }
    getMetrics(timeRange) {
        if (!timeRange) {
            return [...this.metrics];
        }
        return this.metrics.filter(m => m.timestamp >= timeRange.start && m.timestamp <= timeRange.end);
    }
    getSummary() {
        if (this.metrics.length === 0) {
            return { message: 'No metrics available' };
        }
        const latest = this.metrics[this.metrics.length - 1];
        const oldest = this.metrics[0];
        const duration = latest.timestamp - oldest.timestamp;
        // Calculate averages
        const avgCpu = this.metrics.reduce((sum, m) => sum + m.cpuUsage.total, 0) / this.metrics.length;
        const avgMemory = this.metrics.reduce((sum, m) => sum + m.memoryUsage.heapUsed, 0) / this.metrics.length;
        const avgMemoryPercent = (avgMemory / latest.memoryUsage.heapTotal) * 100;
        return {
            timeRange: {
                start: oldest.timestamp,
                end: latest.timestamp,
                duration,
            },
            averages: {
                cpuUsage: avgCpu,
                memoryUsage: avgMemory,
                memoryPercent: avgMemoryPercent,
            },
            current: {
                cpuUsage: latest.cpuUsage,
                memoryUsage: latest.memoryUsage,
                systemMetrics: latest.systemMetrics,
            },
            services: Object.keys(latest.serviceMetrics).length,
            alerts: this.checkForAlertsInternal(),
        };
    }
    checkForAlertsInternal() {
        const alerts = [];
        const latest = this.metrics[this.metrics.length - 1];
        if (!latest) {
            return alerts;
        }
        // More complex alert logic can be added here
        return alerts;
    }
    reset() {
        this.metrics = [];
        this.serviceStats.clear();
        logger.info('Performance metrics reset');
    }
    getConfig() {
        return { ...this.config };
    }
    updateConfig(newConfig) {
        this.config = { ...this.config, ...newConfig };
        if (this.config.enabled && !this.collectionTimer) {
            this.start();
        }
        else if (!this.config.enabled && this.collectionTimer) {
            this.stop();
        }
        logger.info('Performance monitor configuration updated', { config: this.config });
    }
}
// Singleton instance
let performanceMonitor = null;
export function getPerformanceMonitor(config) {
    if (!performanceMonitor) {
        performanceMonitor = new PerformanceMonitor(config);
    }
    return performanceMonitor;
}
export function startPerformanceMonitoring(config) {
    const monitor = getPerformanceMonitor(config);
    monitor.start();
    return monitor;
}
export function stopPerformanceMonitoring() {
    if (performanceMonitor) {
        performanceMonitor.stop();
    }
}
export function recordServicePerformance(serviceName, operation, duration, success = true) {
    if (performanceMonitor) {
        performanceMonitor.recordServiceRequest(serviceName, duration, success);
        logger.debug('Service performance recorded', {
            service: serviceName,
            operation,
            duration,
            success,
        });
    }
}
