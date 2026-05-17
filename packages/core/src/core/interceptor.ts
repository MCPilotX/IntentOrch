import { TraceSpan, SpanStatus } from "./trace-context.js";

/**
 * Context passed through the interceptor chain
 */
export interface InterceptorContext<TInput = any, TOutput = any> {
  /** The input argument(s) to the operation */
  input: TInput;
  /** The output result of the operation (available in after/onError hooks) */
  output?: TOutput;
  /** The active trace span for this operation */
  span?: TraceSpan;
  /** Arbitrary metadata for the interceptor chain */
  metadata: Record<string, any>;
}

/**
 * Interceptor interface for hooking into core execution flows
 */
export interface Interceptor<TInput = any, TOutput = any> {
  /** Unique name of the interceptor */
  name: string;
  /** Hook run BEFORE the main operation. Can modify ctx.input. */
  before?: (ctx: InterceptorContext<TInput, TOutput>) => Promise<void>;
  /** Hook run AFTER the main operation succeeds. Can modify ctx.output. */
  after?: (ctx: InterceptorContext<TInput, TOutput>) => Promise<void>;
  /** Hook run when the main operation THROWS an error. */
  onError?: (
    ctx: InterceptorContext<TInput, TOutput>,
    error: Error,
  ) => Promise<void>;
}

/**
 * InterceptorChain manages a list of interceptors and executes them in a "onion" style.
 * Before hooks: 1 -> 2 -> 3
 * Main operation
 * After/Error hooks: 3 -> 2 -> 1
 */
export class InterceptorChain<TInput = any, TOutput = any> {
  private interceptors: Interceptor<TInput, TOutput>[] = [];

  /**
   * Register a new interceptor in the chain
   */
  use(interceptor: Interceptor<TInput, TOutput>): this {
    this.interceptors.push(interceptor);
    return this;
  }

  /**
   * Execute the chain for a given operation
   */
  async execute<R extends TOutput>(
    input: TInput,
    fn: (input: TInput) => Promise<R>,
    metadata: Record<string, any> = {},
  ): Promise<R> {
    const ctx: InterceptorContext<TInput, R> = {
      input,
      metadata,
      span: metadata.span,
    };

    // 1. Run before hooks (in order)
    for (const interceptor of this.interceptors) {
      if (interceptor.before) {
        await interceptor.before(ctx);
      }
    }

    try {
      // 2. Run the main operation
      const result = await fn(ctx.input);
      ctx.output = result;

      // 3. Update span status BEFORE running after hooks so interceptors
      //    (e.g. PersistenceTraceInterceptor) see the final status, endTime.
      if (ctx.span) {
        ctx.span.status = SpanStatus.OK;
        ctx.span.endTime = Date.now();
        ctx.span.output = result;
      }

      // 4. Run after hooks (in reverse order)
      for (const interceptor of [...this.interceptors].reverse()) {
        if (interceptor.after) {
          await interceptor.after(ctx);
        }
      }

      return result;
    } catch (error: any) {
      // 5. Update span status before running error hooks
      if (ctx.span) {
        ctx.span.status = SpanStatus.ERROR;
        ctx.span.endTime = Date.now();
        ctx.span.error = error instanceof Error ? error.message : String(error);
      }

      // 6. Run error hooks (in reverse order)
      for (const interceptor of [...this.interceptors].reverse()) {
        if (interceptor.onError) {
          await interceptor.onError(ctx, error);
        }
      }
      throw error;
    }
  }
}
