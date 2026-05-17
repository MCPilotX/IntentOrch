import { LoggingTraceInterceptor } from "../../packages/core/src/core/interceptors/logging-trace.js";
import { PersistenceTraceInterceptor, BatchSpanWriter } from "../../packages/core/src/core/interceptors/persistence-trace.js";
import { SpanStatus } from "../../packages/core/src/core/trace-context.js";
import { InterceptorChain } from "../../packages/core/src/core/interceptor.js";
import type { TraceSpan } from "../../packages/core/src/core/trace-context.js";

// ==================== jest.mock factories (inline, no outer var refs) ====================

jest.mock("../../packages/core/src/core/logger.js", () => {
  const m = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { logger: m };
});

jest.mock("../../packages/core/src/utils/sqlite.js", () => {
  const create = jest.fn().mockResolvedValue(undefined);
  const update = jest.fn().mockResolvedValue(undefined);
  return {
    getTraceRepository: () => ({
      create, update,
      listByTraceId: jest.fn(), deleteByTraceId: jest.fn(),
      cleanupOldSpans: jest.fn().mockResolvedValue(0),
    }),
    getRoutingEvaluationRepository: () => ({
      create: jest.fn().mockResolvedValue(undefined),
      listRecent: jest.fn(), cleanupOldEvaluations: jest.fn().mockResolvedValue(0),
    }),
  };
});

// ==================== Module-level helpers ====================
// Grab references to mock fns via require after jest.mock has been applied.
function loggerMock(name: "info" | "error" | "warn" | "debug") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../packages/core/src/core/logger.js").logger[name];
}

function traceRepoMock(name: "create" | "update") {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  return require("../../packages/core/src/utils/sqlite.js").getTraceRepository()[name];
}

function makeSpan(overrides: Partial<TraceSpan> = {}): TraceSpan {
  const now = Date.now();
  return {
    traceId: "tid", spanId: "sid", parentSpanId: undefined,
    name: "test.op", startTime: now, endTime: now + 100,
    status: SpanStatus.UNSET, metadata: {},
    ...overrides,
  };
}

// ==================== LoggingTraceInterceptor ====================

describe("LoggingTraceInterceptor", () => {
  let interceptor: LoggingTraceInterceptor;

  beforeEach(() => { jest.clearAllMocks(); interceptor = new LoggingTraceInterceptor(); });

  it("has name", () => expect(interceptor.name).toBe("LoggingTrace"));

  it("logs START when span present", async () => {
    await interceptor.before!({ input: {}, metadata: {}, span: makeSpan() });
    expect(loggerMock("info")).toHaveBeenCalledWith(expect.stringContaining("START"));
  });

  it("skips log when span missing", async () => {
    await interceptor.before!({ input: {}, metadata: {} });
    expect(loggerMock("info")).not.toHaveBeenCalled();
  });

  it("logs END after completion", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: {} });
    expect(loggerMock("info")).toHaveBeenCalledWith(expect.stringContaining("END"));
  });

  it("logs ERROR on exception", async () => {
    await interceptor.onError!({ input: {}, metadata: {}, span: makeSpan() }, new Error("fail"));
    expect(loggerMock("error")).toHaveBeenCalledWith(expect.stringContaining("ERROR"));
  });

  it("works through InterceptorChain", async () => {
    const chain = new InterceptorChain();
    chain.use(new LoggingTraceInterceptor());
    await chain.execute({}, async () => ({}), { span: makeSpan() });
    expect(loggerMock("info")).toHaveBeenCalledWith(expect.stringContaining("END"));
  });

  it("logs error through chain on failure", async () => {
    const chain = new InterceptorChain();
    chain.use(new LoggingTraceInterceptor());
    await expect(chain.execute({}, async () => { throw new Error("boom"); }, { span: makeSpan() })).rejects.toThrow("boom");
    expect(loggerMock("error")).toHaveBeenCalledWith(expect.stringContaining("boom"));
  });
});

// ==================== PersistenceTraceInterceptor ====================

describe("PersistenceTraceInterceptor", () => {
  let interceptor: PersistenceTraceInterceptor;
  let writer: BatchSpanWriter;

  beforeEach(() => {
    jest.clearAllMocks();
    writer = new BatchSpanWriter();
    interceptor = new PersistenceTraceInterceptor(writer);
  });

  /** Flush the batch writer and wait for writes to complete */
  async function flush() { await writer.flushNow(); }

  it("has name", () => expect(interceptor.name).toBe("PersistenceTrace"));

  it("creates span record in before()", async () => {
    const span = makeSpan({ endTime: undefined });
    await interceptor.before!({ input: { x: 1 }, metadata: {}, span });
    await flush();
    expect(traceRepoMock("create")).toHaveBeenCalledWith({
      traceId: "tid", spanId: "sid", parentSpanId: undefined,
      name: "test.op", startTime: span.startTime,
      status: SpanStatus.UNSET, input: { x: 1 }, metadata: {},
    });
  });

  it("no-ops when span missing", async () => {
    await interceptor.before!({ input: {}, metadata: {} });
    await flush();
    expect(traceRepoMock("create")).not.toHaveBeenCalled();
  });

  it("handles repo failure gracefully in before()", async () => {
    traceRepoMock("create").mockRejectedValueOnce(new Error("DB down"));
    await interceptor.before!({ input: {}, metadata: {}, span: makeSpan() });
    await flush();
    expect(loggerMock("warn")).toHaveBeenCalledWith(expect.stringContaining("Failed to create span"));
  });

  it("updates span in after()", async () => {
    const span = makeSpan({ endTime: undefined });
    await interceptor.after!({ input: {}, metadata: {}, span, output: { ok: true } });
    await flush();
    expect(traceRepoMock("update")).toHaveBeenCalledWith("tid", "sid",
      expect.objectContaining({ status: SpanStatus.UNSET }));
  });

  it("updates span with error in onError()", async () => {
    const span = makeSpan({ status: SpanStatus.ERROR, error: "err" });
    await interceptor.onError!({ input: {}, metadata: {}, span, output: undefined }, new Error("err"));
    await flush();
    expect(traceRepoMock("update")).toHaveBeenCalledWith("tid", "sid",
      expect.objectContaining({ status: SpanStatus.ERROR, error: "err" }));
  });
});
