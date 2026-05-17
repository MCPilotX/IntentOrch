import { Interceptor, InterceptorContext } from "../interceptor.js";
import { getTraceRepository } from "../../utils/sqlite.js";
import { logger } from "../logger.js";
import type { TraceSpan } from "../trace-context.js";

// ==================== Batch Span Writer ====================

/**
 * BatchSpanWriter buffers span writes and flushes them periodically or when the buffer is full.
 * This reduces the per-span I/O overhead at the cost of a small risk of data loss on crash
 * for spans buffered but not yet flushed.
 */
export class BatchSpanWriter {
  private static readonly FLUSH_INTERVAL_MS = 200;       // flush every 200ms
  private static readonly MAX_BATCH_SIZE = 50;            // or when 50 spans queued
  private static readonly HIGH_PRIORITY_FLUSH_MS = 10;    // flush within 10ms for errors

  private buffer: Array<{ type: "create" | "update"; span: TraceSpan; data: Record<string, unknown> }> = [];
  private timer: ReturnType<typeof setTimeout> | null = null;
  private flushing = false;

  /**
   * Enqueue a span creation event.
   */
  pushCreate(span: TraceSpan, input: unknown): void {
    this.buffer.push({
      type: "create",
      span,
      data: {
        traceId: span.traceId,
        spanId: span.spanId,
        parentSpanId: span.parentSpanId,
        name: span.name,
        startTime: span.startTime,
        status: span.status || "unset",
        input,
        metadata: span.metadata,
      },
    });
    this.scheduleFlush(BatchSpanWriter.FLUSH_INTERVAL_MS);
  }

  /**
   * Enqueue a span update event.
   * Strips undefined values to prevent SQLite driver errors.
   */
  pushUpdate(span: TraceSpan, output: unknown, error?: string): void {
    const data: Record<string, unknown> = {};
    if (span.endTime != null) data.endTime = span.endTime;
    if (span.status != null) data.status = span.status;
    if (output !== undefined) data.output = output;
    if (error !== undefined) data.error = error;
    if (span.metadata != null && Object.keys(span.metadata).length > 0) {
      data.metadata = span.metadata;
    }
    this.buffer.push({ type: "update", span, data });
    this.scheduleFlush(error ? BatchSpanWriter.HIGH_PRIORITY_FLUSH_MS : BatchSpanWriter.FLUSH_INTERVAL_MS);
  }

  /**
   * Force an immediate flush of all buffered writes.
   * Used for graceful shutdown or critical error paths.
   */
  async flushNow(): Promise<void> {
    if (this.flushing) return;

    const batch = this.buffer.splice(0);
    if (batch.length === 0) return;

    this.flushing = true;
    try {
      const repo = getTraceRepository();
      for (const item of batch) {
        try {
          if (item.type === "create") {
            await repo.create(item.data);
          } else {
            await repo.update(item.span.traceId, item.span.spanId, item.data);
          }
        } catch (err) {
          logger.warn(`[BatchSpanWriter] Failed to ${item.type} span: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } finally {
      this.flushing = false;
    }
  }

  private scheduleFlush(delayMs: number): void {
    // If we already have a timer and the new request has the same or longer delay, skip.
    // But if the new request has a shorter delay (e.g. HIGH_PRIORITY), reschedule.
    if (this.timer) {
      if (delayMs >= BatchSpanWriter.FLUSH_INTERVAL_MS) return;
      clearTimeout(this.timer);
      this.timer = null;
    }

    // If buffer is full, flush immediately
    if (this.buffer.length >= BatchSpanWriter.MAX_BATCH_SIZE) {
      this.flushNow().catch(() => {});
      return;
    }

    this.timer = setTimeout(() => {
      this.timer = null;
      this.flushNow().catch(() => {});
    }, delayMs);

    // Allow process to exit even if timer is pending
    if (this.timer && typeof this.timer === "object" && "unref" in this.timer) {
      (this.timer as NodeJS.Timeout).unref();
    }
  }
}

// ==================== Shared instance ====================

/**
 * Shared batch writer instance for all PersistenceTraceInterceptor instances.
 * Using a shared buffer means spans from concurrent operations are batched together.
 */
const sharedBatchWriter = new BatchSpanWriter();

// ==================== PersistenceTraceInterceptor ====================

/**
 * PersistenceTraceInterceptor saves spans to the SQLite database.
 * This provides the raw evidence for the timeline and auditing.
 * Uses an internal BatchSpanWriter to reduce I/O overhead.
 */
export class PersistenceTraceInterceptor implements Interceptor {
  name = "PersistenceTrace";
  private writer: BatchSpanWriter;

  constructor(writer?: BatchSpanWriter) {
    this.writer = writer ?? sharedBatchWriter;
  }

  async before(ctx: InterceptorContext): Promise<void> {
    const { span } = ctx;
    if (span) {
      this.writer.pushCreate(span, ctx.input);
    }
  }

  async after(ctx: InterceptorContext): Promise<void> {
    this.updateSpan(ctx);
  }

  async onError(ctx: InterceptorContext, _error: Error): Promise<void> {
    this.updateSpan(ctx);
  }

  private updateSpan(ctx: InterceptorContext): void {
    const { span } = ctx;
    if (span) {
      this.writer.pushUpdate(span, ctx.output, span.error);
    }
  }
}

/**
 * Force-flush any buffered trace span writes.
 * Can be called during graceful shutdown to minimize data loss.
 */
export async function flushTraceSpans(): Promise<void> {
  await sharedBatchWriter.flushNow();
}
