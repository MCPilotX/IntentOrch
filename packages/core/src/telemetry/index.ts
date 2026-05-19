/**
 * Telemetry Module — Unified observability for IntentOrch
 *
 * Provides:
 * - Tracer: Distributed tracing with Span/Trace
 * - PromptRecorder: AI request/response recording with SQLite persistence
 * - MetricsCollector: In-memory counters, gauges, histograms
 *
 * Usage:
 *   import { telemetry } from "./telemetry/index.js";
 *   const span = telemetry.tracer.startSpan("my-operation");
 *   // ... do work ...
 *   telemetry.tracer.endSpan(span.spanId);
 */

import { Tracer } from "./tracer.js";
import { PromptRecorder } from "./prompt-recorder.js";
import { MetricsCollector } from "./metrics.js";

// ==================== Telemetry Facade ====================

export const telemetry = {
  tracer: Tracer.getInstance(),
  promptRecorder: PromptRecorder.getInstance(),
  metrics: MetricsCollector.getInstance(),
};

// ==================== Export Classes ====================

export { Tracer } from "./tracer.js";
export { PromptRecorder } from "./prompt-recorder.js";
export { MetricsCollector } from "./metrics.js";

// ==================== Export Types ====================

export type {
  Span,
  SpanEvent,
  Trace,
  AIRecord,
  MetricPoint,
  Counter,
  Gauge,
  Histogram,
  Metric,
} from "./types.js";

// ==================== Initialize Telemetry ====================

let initialized = false;

/**
 * Initialize telemetry subsystems.
 * Ensures the SQLite schema for AI records exists.
 */
export async function initTelemetry(): Promise<void> {
  if (initialized) return;
  initialized = true;
  await PromptRecorder.getInstance().ensureSchema();
}
