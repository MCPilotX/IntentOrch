import { SemanticRoutingInterceptor } from "../../packages/core/src/core/interceptors/semantic-routing.js";
import { SpanStatus } from "../../packages/core/src/core/trace-context.js";
import type { TraceSpan } from "../../packages/core/src/core/trace-context.js";

// ==================== jest.mock (inline factories) ====================

jest.mock("../../packages/core/src/core/logger.js", () => {
  const m = { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() };
  return { logger: m };
});

jest.mock("../../packages/core/src/utils/sqlite.js", () => {
  const create = jest.fn().mockResolvedValue(undefined);
  return {
    getRoutingEvaluationRepository: () => ({ create, listRecent: jest.fn(), cleanupOldEvaluations: jest.fn().mockResolvedValue(0) }),
    getTraceRepository: () => ({ create: jest.fn(), update: jest.fn(), listByTraceId: jest.fn(), deleteByTraceId: jest.fn(), cleanupOldSpans: jest.fn().mockResolvedValue(0) }),
  };
});

// ==================== Helpers ====================

function loggerMock(name: "info" | "warn") {
  return require("../../packages/core/src/core/logger.js").logger[name];
}
function evalCreateMock() {
  return require("../../packages/core/src/utils/sqlite.js").getRoutingEvaluationRepository().create;
}
function makeSpan(overrides: Partial<TraceSpan> = {}): TraceSpan {
  const now = Date.now();
  return { traceId: "tid", spanId: "sid", parentSpanId: undefined, name: "routing.eval", startTime: now, endTime: now + 50, status: SpanStatus.OK, metadata: { query: "list files", provider: "openai", model: "gpt-4" }, ...overrides };
}
function makeOutput(overrides: Record<string, unknown> = {}) {
  return { success: true, steps: [{ toolName: "list_files" }, { toolName: "read_file" }], executionSteps: [{ toolName: "list_files", success: true }, { toolName: "read_file", success: true }], ...overrides };
}

// ==================== Tests ====================

describe("SemanticRoutingInterceptor", () => {
  let interceptor: SemanticRoutingInterceptor;
  beforeEach(() => { jest.clearAllMocks(); interceptor = new SemanticRoutingInterceptor(); });

  it("has name", () => expect(interceptor.name).toBe("SemanticRoutingGovernance"));
  it("saves evaluation", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: makeOutput() });
    expect(evalCreateMock()).toHaveBeenCalledWith({ traceId: "tid", query: "list files", provider: "openai", model: "gpt-4", plannedTools: ["list_files", "read_file"], executedTools: ["list_files", "read_file"], successRate: 1.0, isAccurate: true, errorDetails: null });
  });
  it("marks inaccurate on partial failure", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: makeOutput({ executionSteps: [{ toolName: "a", success: true }, { toolName: "b", success: false }] }) });
    expect(evalCreateMock()).toHaveBeenCalledWith(expect.objectContaining({ successRate: 0.5, isAccurate: false }));
  });
  it("no-ops when span missing", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: undefined, output: makeOutput() });
    expect(evalCreateMock()).not.toHaveBeenCalled();
  });
  it("no-ops when output missing", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: undefined });
    expect(evalCreateMock()).not.toHaveBeenCalled();
  });
  it("falls back to 'unknown' for missing query", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan({ metadata: {} }), output: makeOutput() });
    expect(evalCreateMock()).toHaveBeenCalledWith(expect.objectContaining({ query: "unknown" }));
  });
  it("includes error details", async () => {
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: makeOutput({ success: false, error: "timeout", steps: [{ toolName: "a" }], executionSteps: [{ toolName: "a", success: false }] }) });
    expect(evalCreateMock()).toHaveBeenCalledWith(expect.objectContaining({ errorDetails: "timeout" }));
  });
  it("handles repo failure gracefully", async () => {
    evalCreateMock().mockRejectedValueOnce(new Error("DB err"));
    await interceptor.after!({ input: {}, metadata: {}, span: makeSpan(), output: makeOutput() });
    expect(loggerMock("warn")).toHaveBeenCalledWith(expect.stringContaining("Failed to record"));
  });
  it("saves failed evaluation in onError()", async () => {
    await interceptor.onError!({ input: {}, metadata: {}, span: makeSpan() }, new Error("provider error"));
    expect(evalCreateMock()).toHaveBeenCalledWith({ traceId: "tid", query: "list files", successRate: 0, isAccurate: false, errorDetails: "provider error" });
  });
  it("no-ops in onError() when span missing", async () => {
    await interceptor.onError!({ input: {}, metadata: {}, span: undefined }, new Error("x"));
    expect(evalCreateMock()).not.toHaveBeenCalled();
  });
  it("does not throw in onError() when repo fails", async () => {
    evalCreateMock().mockRejectedValueOnce(new Error("DB"));
    await expect(interceptor.onError!({ input: {}, metadata: {}, span: makeSpan() }, new Error("x"))).resolves.toBeUndefined();
  });
});