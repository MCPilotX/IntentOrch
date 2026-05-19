/**
 * Tracer — Lightweight Span/Trace system for IntentOrch
 *
 * Provides distributed tracing primitives (Trace, Span) in-memory.
 * Zero-cost when not observed — uses an active-span stack pattern.
 */

import { randomUUID } from "node:crypto";
import type { Span, SpanEvent, Trace } from "./types.js";

// ==================== Tracer Configuration ====================

export interface TracerConfig {
  /** Maximum number of traces kept in memory (default: 100) */
  maxTraces: number;
}

const DEFAULT_CONFIG: TracerConfig = {
  maxTraces: 100,
};

// ==================== Tracer Class ====================

export class Tracer {
  private static instance: Tracer;
  private config: TracerConfig;
  private traces: Map<string, Trace> = new Map();
  private spans: Map<string, Span> = new Map();
  private activeSpanIds: string[] = [];
  private traceOrder: string[] = [];
  private hooks: Array<(type: "span_start" | "span_end", data: unknown) => void> = [];

  private constructor(config: Partial<TracerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  static getInstance(config?: Partial<TracerConfig>): Tracer {
    if (!Tracer.instance) {
      Tracer.instance = new Tracer(config);
    }
    return Tracer.instance;
  }

  onHook(hook: (type: "span_start" | "span_end", data: unknown) => void): void {
    this.hooks.push(hook);
  }

  startSpan(name: string, options?: {
    parentSpanId?: string;
    traceId?: string;
    attributes?: Record<string, unknown>;
  }): Span {
    const parentSpanId = options?.parentSpanId || this.getActiveSpan()?.spanId;
    let traceId = options?.traceId;

    if (!traceId && parentSpanId) {
      const parentSpan = this.spans.get(parentSpanId);
      if (parentSpan) traceId = parentSpan.traceId;
    }

    if (!traceId) traceId = this.generateId("trace");

    const spanId = this.generateId("span");
    const span: Span = {
      spanId, parentSpanId, traceId, name, status: "ok",
      startTime: Date.now(), attributes: options?.attributes || {}, events: [],
    };

    this.spans.set(spanId, span);

    if (!this.traces.has(traceId)) {
      const trace: Trace = {
        traceId, spans: [], rootSpanId: spanId,
        startTime: span.startTime, status: "ok",
      };
      this.traces.set(traceId, trace);
      this.traceOrder.push(traceId);

      if (this.traceOrder.length > this.config.maxTraces) {
        const oldest = this.traceOrder.shift();
        if (oldest) {
          const oldTrace = this.traces.get(oldest);
          if (oldTrace) { for (const s of oldTrace.spans) this.spans.delete(s.spanId); }
          this.traces.delete(oldest);
        }
      }
    }

    this.traces.get(traceId)!.spans.push(span);
    this.activeSpanIds.push(spanId);

    for (const hook of this.hooks) hook("span_start", { spanId, traceId, name, parentSpanId });

    return span;
  }

  endSpan(spanId: string, status: "ok" | "error" = "ok"): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = status;

    const trace = this.traces.get(span.traceId);
    if (trace && status === "error") trace.status = "error";

    if (status === "error" && span.parentSpanId) {
      const parentSpan = this.spans.get(span.parentSpanId);
      if (parentSpan) parentSpan.status = "error";
    }

    if (trace) {
      trace.endTime = Date.now();
      trace.duration = trace.endTime - trace.startTime;
    }

    const idx = this.activeSpanIds.lastIndexOf(spanId);
    if (idx !== -1) this.activeSpanIds.splice(idx, 1);

    for (const hook of this.hooks) hook("span_end", { spanId, duration: span.duration, status });
  }

  addEvent(spanId: string, event: Omit<SpanEvent, "timestamp">): void {
    const span = this.spans.get(spanId);
    if (!span) return;
    span.events.push({ ...event, timestamp: Date.now() });
  }

  getTrace(traceId: string): Trace | null {
    const trace = this.traces.get(traceId);
    if (!trace) return null;
    return {
      ...trace,
      spans: trace.spans,
    };
  }

  getActiveSpan(): Span | null {
    if (this.activeSpanIds.length === 0) return null;
    return this.spans.get(this.activeSpanIds[this.activeSpanIds.length - 1]) || null;
  }

  getAllTraces(limit = 50): Trace[] {
    const result: Trace[] = [];
    for (const traceId of [...this.traceOrder].reverse().slice(0, limit)) {
      const trace = this.getTrace(traceId);
      if (trace) result.push(trace);
    }
    return result;
  }

  getTracesBySession(sessionId: string): Trace[] {
    const result: Trace[] = [];
    for (const traceId of this.traceOrder) {
      const trace = this.traces.get(traceId);
      if (!trace) continue;
      const rootSpan = this.spans.get(trace.rootSpanId);
      if (rootSpan?.attributes?.sessionId === sessionId) {
        const full = this.getTrace(traceId);
        if (full) result.push(full);
      }
    }
    return result;
  }

  reset(): void {
    this.traces.clear();
    this.spans.clear();
    this.activeSpanIds = [];
    this.traceOrder = [];
  }

  async withSpan<T>(
    name: string,
    fn: (span: Span) => Promise<T>,
    options?: { parentSpanId?: string; traceId?: string; attributes?: Record<string, unknown> },
  ): Promise<T> {
    const span = this.startSpan(name, options);
    try {
      return await fn(span);
    } catch (error) {
      this.addEvent(span.spanId, {
        name: "error",
        attributes: { error: error instanceof Error ? error.message : String(error) },
      });
      this.endSpan(span.spanId, "error");
      throw error;
    } finally {
      const current = this.spans.get(span.spanId);
      if (current && current.endTime === undefined) this.endSpan(span.spanId);
    }
  }

  private generateId(prefix: string): string {
    return `${prefix}_${randomUUID().replace(/-/g, "").substring(0, 16)}`;
  }
}
