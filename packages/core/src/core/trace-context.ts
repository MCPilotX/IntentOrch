import { AsyncLocalStorage } from "async_hooks";
import { randomUUID } from "crypto";

/**
 * Metadata for a trace span
 */
export type TraceMetadata = Record<string, unknown>;

/**
 * Status of a trace span
 */
export enum SpanStatus {
  UNSET = "unset",
  OK = "ok",
  ERROR = "error",
}

/**
 * Data structure for a single trace span
 */
export interface TraceSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  startTime: number;
  endTime?: number;
  status: SpanStatus;
  input?: unknown;
  output?: unknown;
  error?: string;
  metadata: TraceMetadata;
}

/**
 * Active context data stored in AsyncLocalStorage
 */
export interface TraceContextData {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  metadata: TraceMetadata;
}

/**
 * TraceContextManager provides full-link tracing capabilities using Node.js AsyncLocalStorage.
 * It allows tracking the flow of execution across asynchronous boundaries without passing
 * context objects manually through every function.
 */
export class TraceContextManager {
  private static storage = new AsyncLocalStorage<TraceContextData>();

  /**
   * Run a function within a specific trace context
   */
  static run<R>(data: TraceContextData, fn: () => R): R {
    return this.storage.run(data, fn);
  }

  /**
   * Get the current active trace context
   */
  static getContext(): TraceContextData | undefined {
    return this.storage.getStore();
  }

  /**
   * Create a new root context for a new operation (e.g., a user request)
   */
  static createRootContext(
    traceId: string = randomUUID(),
    metadata: TraceMetadata = {},
  ): TraceContextData {
    return {
      traceId,
      spanId: randomUUID(),
      metadata,
    };
  }

  /**
   * Create a child context for a sub-operation
   */
  static createChildContext(
    name: string,
    metadata: TraceMetadata = {},
  ): TraceContextData {
    const parent = this.getContext();
    const traceId = parent?.traceId || randomUUID();
    const spanId = randomUUID();

    return {
      traceId,
      spanId,
      parentSpanId: parent?.spanId,
      metadata: {
        ...parent?.metadata,
        ...metadata,
        spanName: name,
      },
    };
  }

  /**
   * Start a new span and run the provided function within its context
   */
  static async trace<R>(
    name: string,
    fn: (span: TraceSpan) => Promise<R>,
    metadata: TraceMetadata = {},
  ): Promise<R> {
    const ctx = this.createChildContext(name, metadata);
    const span: TraceSpan = {
      traceId: ctx.traceId,
      spanId: ctx.spanId,
      parentSpanId: ctx.parentSpanId,
      name,
      startTime: Date.now(),
      status: SpanStatus.UNSET,
      metadata: ctx.metadata,
    };

    return this.run(ctx, async () => {
      try {
        const result = await fn(span);
        span.status = SpanStatus.OK;
        span.output = result;
        return result;
      } catch (error) {
        span.status = SpanStatus.ERROR;
        span.error = error instanceof Error ? error.message : String(error);
        throw error;
      } finally {
        span.endTime = Date.now();
        // In the future, we will emit this span to a collector/emitter here
        this.emitSpan(span);
      }
    });
  }

  /**
   * Internal method to emit completed spans.
   * Currently just logs to debug, but will be connected to SQLite storage later.
   */
  private static emitSpan(span: TraceSpan): void {
    // For now, we could log to a dedicated trace logger
    // Later this will call the InterceptorChain or a dedicated TraceStore
    const duration = span.endTime ? span.endTime - span.startTime : 0;
    // console.debug(`[Trace] ${span.name} (${duration}ms) [${span.traceId}/${span.spanId}] status=${span.status}`);
  }
}
