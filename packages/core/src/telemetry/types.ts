/**
 * Telemetry Type Definitions
 *
 * Core types for Span/Trace system, AI recording, and metrics collection.
 */

// ==================== Span / Trace Types ====================

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, unknown>;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  traceId: string;
  name: string;
  status: "ok" | "error";
  startTime: number;
  endTime?: number;
  duration?: number;
  attributes: Record<string, unknown>;
  events: SpanEvent[];
}

export interface Trace {
  traceId: string;
  spans: Span[];
  rootSpanId: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: "ok" | "error";
}

// ==================== AI Record Types ====================

export interface AIRecord {
  id: string;
  traceId?: string;
  timestamp: string;
  provider: string;
  model: string;
  systemPrompt: string;
  userMessage: string;
  toolsProvided: Array<{ name: string; description: string }>;
  rawResponse: unknown;
  parsedToolCalls: Array<{ name: string; args: unknown }>;
  latency: number;
  success: boolean;
  error?: string;
  tokenUsage?: { prompt: number; completion: number; total: number };
}

// ==================== Metrics Types ====================

export interface MetricPoint {
  name: string;
  value: number;
  labels: Record<string, string>;
  timestamp: number;
}

export interface Counter extends MetricPoint {
  type: "counter";
}

export interface Gauge extends MetricPoint {
  type: "gauge";
}

export interface Histogram extends MetricPoint {
  type: "histogram";
}

export type Metric = Counter | Gauge | Histogram;

// ==================== Hook Types ====================

export type TelemetryHook = (
  type: "span_start" | "span_end" | "ai_record" | "metric",
  data: unknown,
) => void;
