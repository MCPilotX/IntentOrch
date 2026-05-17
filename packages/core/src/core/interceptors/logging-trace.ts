import { Interceptor, InterceptorContext } from "../interceptor.js";
import { logger } from "../logger.js";

/**
 * LoggingTraceInterceptor bridges the tracing system with the existing logger.
 * It provides human-readable logs for the start and end of spans.
 */
export class LoggingTraceInterceptor implements Interceptor {
  name = "LoggingTrace";

  async before(ctx: InterceptorContext): Promise<void> {
    const { span } = ctx;
    if (span) {
      logger.info(`[Trace] 🟢 START: ${span.name} [ID: ${span.traceId}]`);
    }
  }

  async after(ctx: InterceptorContext): Promise<void> {
    const { span } = ctx;
    if (span) {
      const duration = span.endTime
        ? span.endTime - span.startTime
        : Date.now() - span.startTime;
      logger.info(
        `[Trace] ✅ END: ${span.name} (Status: ${span.status}, Duration: ${duration}ms)`,
      );
    }
  }

  async onError(ctx: InterceptorContext, error: Error): Promise<void> {
    const { span } = ctx;
    if (span) {
      logger.error(
        `[Trace] ❌ ERROR: ${span.name} [ID: ${span.traceId}] - ${error.message}`,
      );
    }
  }
}
