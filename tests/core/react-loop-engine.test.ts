import { ReActLoopEngine, type StepStreamEvent } from "../../packages/core/src/ai/executor/react-loop-engine";
import type { SessionManager } from "../../packages/core/src/execution/session-manager";
import type { CloudIntentEngine } from "../../packages/core/src/ai/cloud-intent-engine";
import type { StepResult } from "../../packages/core/src/execution/types";

const mockRecord = jest.fn();
const mockSM: jest.Mocked<SessionManager> = { recordStepResult: mockRecord } as any;
const mockBuildSP = jest.fn().mockReturnValue("sp");
const mockPWH = jest.fn();
const mockCIE: jest.Mocked<CloudIntentEngine> = { buildSystemPrompt: mockBuildSP, processQueryWithHistory: mockPWH } as any;
const mockTE = jest.fn();

function plan(steps: Array<{ id: string; t: string; a?: Record<string, unknown> }>) {
  return { steps: steps.map((s) => ({ id: s.id, toolName: s.t, arguments: s.a || {} })), summary: "p" };
}
function tc(tcs?: Array<{ t: string; a?: Record<string, unknown> }>) {
  if (!tcs) return { hasToolCall: false, toolCalls: [], text: "done" };
  return { hasToolCall: true, toolCalls: tcs.map((c) => ({ toolName: c.t, arguments: c.a || {} })), text: "" };
}

describe("ReActLoopEngine", () => {
  let e: ReActLoopEngine;
  beforeEach(() => { jest.clearAllMocks(); e = new ReActLoopEngine(); });

  test("constants", () => { expect(e.maxConversationHistoryLength).toBe(20); expect(e.maxReActExecutionTimeMs).toBe(120_000); });

  describe("buildResult", () => {
    test("success", () => { const r = e.buildResult([{ stepId: "s", toolName: "t", success: true, duration: 10, timestamp: "" }], true, "ok"); expect(r.success).toBe(true); });
    test("failure", () => { const sr: StepResult[] = [{ stepId: "s1", toolName: "t1", success: true, duration: 5, timestamp: "" }, { stepId: "s2", toolName: "t2", success: false, error: "err", duration: 3, timestamp: "" }]; expect(e.buildResult(sr, false, undefined).error).toBe("err"); });
    test("empty", () => { expect(e.buildResult([], true, undefined).statistics!.totalSteps).toBe(0); });
  });

  describe("execute", () => {
    test("plan steps sequentially", async () => {
      mockTE.mockResolvedValueOnce("a").mockResolvedValueOnce("b"); mockPWH.mockResolvedValue(tc());
      const r = await e.execute("s", "q", plan([{ id: "s1", t: "ta", a: { x: 1 } }, { id: "s2", t: "tb" }]), mockSM, mockCIE, mockTE);
      expect(r.executionSteps).toHaveLength(2); expect(mockTE).toHaveBeenNthCalledWith(1, "ta", { x: 1 });
    });
    test("stops on step failure", async () => {
      mockTE.mockResolvedValueOnce("ok").mockRejectedValueOnce(new Error("fail"));
      expect((await e.execute("s", "q", plan([{ id: "s1", t: "ta" }, { id: "s2", t: "tb" }]), mockSM, mockCIE, mockTE)).success).toBe(false);
      expect(mockTE).toHaveBeenCalledTimes(2);
    });
    test("runs ReAct when LLM returns tool calls", async () => {
      mockTE.mockResolvedValueOnce("ok"); mockPWH.mockResolvedValueOnce(tc([{ t: "rt" }])).mockResolvedValueOnce(tc());
      expect((await e.execute("s", "q", plan([{ id: "s1", t: "pt" }]), mockSM, mockCIE, mockTE)).executionSteps).toHaveLength(2);
    });
    test("breaks when LLM returns no tool calls", async () => {
      mockTE.mockResolvedValueOnce("ok"); mockPWH.mockResolvedValueOnce(tc());
      expect((await e.execute("s", "q", plan([{ id: "s1", t: "pt" }]), mockSM, mockCIE, mockTE)).executionSteps).toHaveLength(1);
    });
    test("respects maxReActTurns", async () => {
      mockTE.mockResolvedValue("r"); mockPWH.mockResolvedValue(tc([{ t: "st" }]));
      expect((await e.execute("s", "q", { steps: [], summary: "" }, mockSM, mockCIE, mockTE, { maxReActTurns: 3 })).executionSteps).toHaveLength(3);
    });
    test("stops on tool error", async () => {
      mockTE.mockResolvedValueOnce("ok"); mockPWH.mockResolvedValueOnce(tc([{ t: "ft" }])); mockTE.mockRejectedValueOnce(new Error("fail"));
      const r = await e.execute("s", "q", plan([{ id: "s1", t: "pt" }]), mockSM, mockCIE, mockTE);
      expect(r.success).toBe(false); expect(r.executionSteps![1].error).toBe("fail");
    });
  });

  describe("executeStream", () => {
    test("emits step events", async () => {
      mockTE.mockResolvedValue("r"); mockPWH.mockResolvedValue(tc()); const os = jest.fn();
      await e.executeStream("s", "q", plan([{ id: "s1", t: "t1" }, { id: "s2", t: "t2" }]), mockSM, mockCIE, mockTE, os);
      expect(os).toHaveBeenCalledTimes(2);
    });
    test("emits ReAct events", async () => {
      mockTE.mockResolvedValue("r"); mockPWH.mockResolvedValueOnce(tc([{ t: "rt" }])).mockResolvedValueOnce(tc()); const os = jest.fn();
      await e.executeStream("s", "q", { steps: [], summary: "" }, mockSM, mockCIE, mockTE, os);
      expect(os).toHaveBeenCalledTimes(1);
    });
    test("emits failure event", async () => {
      mockTE.mockRejectedValueOnce(new Error("err")); mockPWH.mockResolvedValue(tc()); const os = jest.fn();
      await e.executeStream("s", "q", plan([{ id: "s1", t: "ft" }]), mockSM, mockCIE, mockTE, os);
      expect((os.mock.calls[0][0] as StepStreamEvent).success).toBe(false);
    });
    test("handles onStep errors gracefully", async () => {
      mockTE.mockResolvedValue("r"); mockPWH.mockResolvedValue(tc());
      expect((await e.executeStream("s", "q", plan([{ id: "s1", t: "t" }]), mockSM, mockCIE, mockTE, jest.fn().mockRejectedValue(new Error("e")))).success).toBe(true);
    });
  });
});
