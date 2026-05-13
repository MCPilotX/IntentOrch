/**
 * MetricsCollector — Lightweight metrics (counter, gauge, histogram)
 *
 * In-memory only. No external dependencies.
 */

import type { Counter, Gauge, Histogram, Metric } from "./types.js";

// ==================== MetricsCollector Class ====================

export class MetricsCollector {
  private static instance: MetricsCollector;
  private metrics: Map<string, Metric> = new Map();
  private hooks: Array<(metric: Metric) => void> = [];

  private constructor() {}

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  onMetric(hook: (metric: Metric) => void): void {
    this.hooks.push(hook);
  }

  /**
   * Increment a counter metric.
   */
  increment(name: string, labels: Record<string, string> = {}): void {
    const key = this.metricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type === "counter") {
      (existing as Counter).value += 1;
    } else {
      const counter: Counter = {
        name, value: 1, labels, timestamp: Date.now(), type: "counter",
      };
      this.metrics.set(key, counter);
      for (const hook of this.hooks) hook(counter);
    }
  }

  /**
   * Set a gauge metric to a specific value.
   */
  gauge(name: string, value: number, labels: Record<string, string> = {}): void {
    const key = this.metricKey(name, labels);
    const gauge: Gauge = {
      name, value, labels, timestamp: Date.now(), type: "gauge",
    };
    this.metrics.set(key, gauge);
    for (const hook of this.hooks) hook(gauge);
  }

  /**
   * Record a timing (duration in ms) as a histogram.
   * Stores min, max, sum, count for each metric key.
   */
  timing(name: string, durationMs: number, labels: Record<string, string> = {}): void {
    const key = this.metricKey(name, labels);
    const existing = this.metrics.get(key);

    if (existing && existing.type === "histogram") {
      const h = existing as Histogram & { _min?: number; _max?: number; _sum?: number; _count?: number };
      h._min = h._min !== undefined ? Math.min(h._min, durationMs) : durationMs;
      h._max = h._max !== undefined ? Math.max(h._max, durationMs) : durationMs;
      h._sum = (h._sum || 0) + durationMs;
      h._count = (h._count || 0) + 1;
      h.value = h._sum / h._count; // average
    } else {
      const hist: Histogram & { _min: number; _max: number; _sum: number; _count: number } = {
        name, value: durationMs, labels, timestamp: Date.now(), type: "histogram",
        _min: durationMs, _max: durationMs, _sum: durationMs, _count: 1,
      };
      this.metrics.set(key, hist);
      for (const hook of this.hooks) hook(hist);
    }
  }

  /**
   * Get all current metrics.
   */
  getMetrics(): Metric[] {
    return Array.from(this.metrics.values()).map((m) => {
      if (m.type === "histogram") {
        const h = m as unknown as Record<string, unknown>;
        return {
          name: m.name,
          value: m.value,
          labels: m.labels,
          timestamp: m.timestamp,
          type: "histogram",
          min: h._min,
          max: h._max,
          sum: h._sum,
          count: h._count,
        } as unknown as Histogram;
      }
      return m;
    });
  }

  /**
   * Reset all metrics.
   */
  reset(): void {
    this.metrics.clear();
  }

  private metricKey(name: string, labels: Record<string, string>): string {
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(",");
    return labelStr ? `${name}{${labelStr}}` : name;
  }
}
