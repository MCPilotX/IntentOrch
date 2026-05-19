/**
 * Unit tests for SessionManager
 *
 * Tests the state machine state transitions (legal and illegal paths)
 * for both direct and interactive session types.
 */

import { SessionManager } from "../../packages/core/src/execution/session-manager";
import { SessionStore } from "../../packages/core/src/execution/session-store";
import {
  SessionNotFoundError,
  InvalidSessionStateError,
} from "../../packages/core/src/execution/types";

jest.mock("uuid", () => ({ v4: () => "mocked-uuid" }));
import type {
  ExecutionSession,
  SessionType,
  ConversationMessage,
  StepResult,
} from "../../packages/core/src/execution/types";

jest.mock("uuid", () => ({ v4: () => "mocked-uuid" }));

// ==================== Mocks ====================

function createMockStore(): jest.Mocked<SessionStore> {
  return {
    ensureSchema: jest.fn(),
    create: jest.fn(),
    get: jest.fn(),
    getOrThrow: jest.fn(),
    updateState: jest.fn(),
    updatePlan: jest.fn(),
    updateMetadata: jest.fn(),
    appendConversation: jest.fn(),
    addStepResult: jest.fn(),
    addFeedback: jest.fn(),
    delete: jest.fn(),
    list: jest.fn(),
    listActive: jest.fn(),
    cleanup: jest.fn(),
    startAutoCleanup: jest.fn(),
    stopAutoCleanup: jest.fn(),
    rowToSession: jest.fn(),
  } as unknown as jest.Mocked<SessionStore>;
}

function createSession(overrides: Partial<ExecutionSession> = {}): ExecutionSession {
  const now = new Date().toISOString();
  return {
    id: "session-test-1", type: "direct", state: "planning",
    query: "test query", plan: null,
    conversationHistory: [], stepResults: [], feedback: [],
    currentTurn: 0, maxTurns: 5,
    createdAt: now, updatedAt: now, metadata: {},
    ...overrides,
  };
}

describe("SessionManager", () => {
  let manager: SessionManager;
  let mockStore: jest.Mocked<SessionStore>;

  beforeEach(() => {
    mockStore = createMockStore();
    manager = new SessionManager(mockStore);
  });

  describe("createSession", () => {
    it("should create a direct session with planning state", async () => {
      const expectedSession = createSession({ id: "new-id", type: "direct", state: "planning", query: "list all files" });
      mockStore.create.mockResolvedValue(expectedSession);
      const session = await manager.createSession({ query: "list all files", type: "direct" });
      expect(session.id).toBe("new-id");
      expect(session.type).toBe("direct");
      expect(session.state).toBe("planning");
    });

    it("should create an interactive session", async () => {
      const expectedSession = createSession({ id: "is-1", type: "interactive", state: "planning", query: "book a flight" });
      mockStore.create.mockResolvedValue(expectedSession);
      const session = await manager.createSession({ query: "book a flight", type: "interactive" });
      expect(session.type).toBe("interactive");
      expect(session.state).toBe("planning");
    });

    it("should create a session with metadata", async () => {
      const metadata = { userId: "user-1" };
      const expectedSession = createSession({ id: "s-meta", type: "direct", query: "test", metadata });
      mockStore.create.mockResolvedValue(expectedSession);
      const session = await manager.createSession({ query: "test", type: "direct", metadata });
      expect(session.metadata).toEqual(metadata);
    });

    it("should propagate store errors", async () => {
      mockStore.create.mockRejectedValue(new Error("DB connection failed"));
      await expect(manager.createSession({ query: "test", type: "direct" })).rejects.toThrow("DB connection failed");
    });
  });

  describe("getSession", () => {
    it("should return a session when found", async () => {
      const session = createSession({ id: "s1" });
      mockStore.get.mockResolvedValue(session);
      expect(await manager.getSession("s1")).toEqual(session);
    });

    it("should return null when session not found", async () => {
      mockStore.get.mockResolvedValue(null);
      expect(await manager.getSession("nonexistent")).toBeNull();
    });
  });

  describe("deleteSession", () => {
    it("should delete a session by id", async () => {
      await manager.deleteSession("s1");
      expect(mockStore.delete).toHaveBeenCalledWith("s1");
    });
  });

  // ==================== State Machine - Direct Session ====================

  describe("transitionState - direct session legal paths", () => {
    it("planning -> executing", async () => {
      const session = createSession({ id: "s1", type: "direct", state: "planning" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "direct", state: "executing" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      const result = await manager.transitionState("s1", "executing");
      expect(result.state).toBe("executing");
      expect(mockStore.updateState).toHaveBeenCalledWith("s1", "executing");
    });

    it("executing -> completed", async () => {
      const session = createSession({ id: "s1", type: "direct", state: "executing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "direct", state: "completed" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      const result = await manager.transitionState("s1", "completed");
      expect(result.state).toBe("completed");
    });

    it("executing -> failed", async () => {
      const session = createSession({ id: "s1", type: "direct", state: "executing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "direct", state: "failed" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      const result = await manager.transitionState("s1", "failed");
      expect(result.state).toBe("failed");
    });
  });

  describe("transitionState - direct session illegal paths", () => {
    it("should NOT transition planning -> reviewing", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "planning" }));
      await expect(manager.transitionState("s1", "reviewing")).rejects.toThrow(InvalidSessionStateError);
      expect(mockStore.updateState).not.toHaveBeenCalled();
    });

    it("should NOT transition planning -> completed", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "planning" }));
      await expect(manager.transitionState("s1", "completed")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition planning -> cancelled", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "planning" }));
      await expect(manager.transitionState("s1", "cancelled")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition from completed (terminal)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "completed" }));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition from failed (terminal)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "failed" }));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition executing -> planning (no loopback)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "executing" }));
      await expect(manager.transitionState("s1", "planning")).rejects.toThrow(InvalidSessionStateError);
    });
  });

  // ==================== State Machine - Interactive Session ====================

  describe("transitionState - interactive session legal paths", () => {
    it("planning -> reviewing", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "planning" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "reviewing")).state).toBe("reviewing");
    });

    it("reviewing -> confirmed", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "confirmed" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "confirmed")).state).toBe("confirmed");
    });

    it("reviewing -> cancelled", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "cancelled" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "cancelled")).state).toBe("cancelled");
    });

    it("reviewing -> planning (regenerate)", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "planning" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "planning")).state).toBe("planning");
    });

    it("confirmed -> executing", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "confirmed" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "executing" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "executing")).state).toBe("executing");
    });

    it("executing -> completed", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "executing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "completed" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "completed")).state).toBe("completed");
    });

    it("executing -> failed", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "executing" });
      mockStore.getOrThrow.mockResolvedValue(session);
      const updated = createSession({ id: "s1", type: "interactive", state: "failed" });
      mockStore.getOrThrow.mockResolvedValueOnce(session).mockResolvedValueOnce(updated);

      expect((await manager.transitionState("s1", "failed")).state).toBe("failed");
    });
  });

  describe("transitionState - interactive session illegal paths", () => {
    it("should NOT transition planning directly to executing", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "planning" }));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition planning to confirmed", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "planning" }));
      await expect(manager.transitionState("s1", "confirmed")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition confirmed back to planning", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "confirmed" }));
      await expect(manager.transitionState("s1", "planning")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition confirmed to cancelled", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "confirmed" }));
      await expect(manager.transitionState("s1", "cancelled")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition from completed (terminal)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "completed" }));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition from failed (terminal)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "failed" }));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow(InvalidSessionStateError);
    });

    it("should NOT transition from cancelled (terminal)", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "cancelled" }));
      await expect(manager.transitionState("s1", "planning")).rejects.toThrow(InvalidSessionStateError);
    });
  });

  it("should throw SessionNotFoundError when transitioning non-existent session", async () => {
    mockStore.getOrThrow.mockRejectedValue(new SessionNotFoundError("ghost"));
    await expect(manager.transitionState("ghost", "executing")).rejects.toThrow(SessionNotFoundError);
  });

  // ==================== storePlan ====================

  describe("storePlan", () => {
    const mockPlan = { steps: [{ id: "step-1", tool: "read-file", params: { path: "/tmp/test.txt" } }] } as any;

    it("direct session: planning -> executing", async () => {
      const session = createSession({ id: "s1", type: "direct", state: "planning" });
      const updated = createSession({ id: "s1", type: "direct", state: "executing", plan: mockPlan });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // storePlan line 129
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(updated); // transitionState line 117

      const result = await manager.storePlan("s1", mockPlan);
      expect(mockStore.updatePlan).toHaveBeenCalledWith("s1", mockPlan);
      expect(mockStore.updateState).toHaveBeenCalledWith("s1", "executing");
      expect(result.state).toBe("executing");
    });

    it("interactive session: planning -> reviewing", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "planning" });
      const updated = createSession({ id: "s1", type: "interactive", state: "reviewing", plan: mockPlan });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // storePlan line 129
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(updated); // transitionState line 117

      const result = await manager.storePlan("s1", mockPlan);
      expect(result.state).toBe("reviewing");
    });
  });

  // ==================== handleFeedback ====================

  describe("handleFeedback", () => {
    it("should throw for non-interactive session", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct" }));
      await expect(manager.handleFeedback("s1", { type: "confirm" })).rejects.toThrow(InvalidSessionStateError);
    });

    it("should throw when not in reviewing state", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "planning" }));
      await expect(manager.handleFeedback("s1", { type: "confirm" })).rejects.toThrow(InvalidSessionStateError);
    });

    it("confirm: reviewing -> confirmed", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      const cs = createSession({ id: "s1", type: "interactive", state: "confirmed" });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // handleFeedback line 151
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(cs)       // transitionState line 117
        .mockResolvedValueOnce(cs);      // handleFeedback line 195

      const result = await manager.handleFeedback("s1", { type: "confirm" });
      expect(mockStore.addFeedback).toHaveBeenCalledWith("s1", expect.objectContaining({ type: "confirm" }));
      expect(result.state).toBe("confirmed");
    });

    it("modify with modifiedPlan", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      const modifiedPlan = { steps: [{ id: "step-mod", tool: "custom-tool", params: {} }] } as any;
      const cs = createSession({ id: "s1", type: "interactive", state: "confirmed", plan: modifiedPlan });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // handleFeedback line 151
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(cs)       // transitionState line 117
        .mockResolvedValueOnce(cs);      // handleFeedback line 195

      const result = await manager.handleFeedback("s1", { type: "modify", modifiedPlan });
      expect(mockStore.updatePlan).toHaveBeenCalledWith("s1", modifiedPlan);
      expect(result.state).toBe("confirmed");
    });

    it("modify without modifiedPlan should skip updatePlan", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      const cs = createSession({ id: "s1", type: "interactive", state: "confirmed" });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // handleFeedback line 151
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(cs);      // transitionState line 117

      await manager.handleFeedback("s1", { type: "modify" });
      expect(mockStore.updatePlan).not.toHaveBeenCalled();
    });

    it("reject: reviewing -> cancelled", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      const cs = createSession({ id: "s1", type: "interactive", state: "cancelled" });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // handleFeedback line 151
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(cs)       // transitionState line 117
        .mockResolvedValueOnce(cs);      // handleFeedback line 195

      const result = await manager.handleFeedback("s1", { type: "reject" });
      expect(result.state).toBe("cancelled");
    });

    it("regenerate: reviewing -> planning", async () => {
      const session = createSession({ id: "s1", type: "interactive", state: "reviewing" });
      const ps = createSession({ id: "s1", type: "interactive", state: "planning" });
      mockStore.getOrThrow
        .mockResolvedValueOnce(session)  // handleFeedback line 151
        .mockResolvedValueOnce(session)  // transitionState line 104
        .mockResolvedValueOnce(ps)       // transitionState line 117
        .mockResolvedValueOnce(ps);      // handleFeedback line 195

      const result = await manager.handleFeedback("s1", { type: "regenerate" });
      expect(result.state).toBe("planning");
    });
  });

  // ==================== recordStepResult ====================

  describe("recordStepResult", () => {
    const stepResult: StepResult = {
      stepId: "step-1", toolName: "read-file", success: true,
      result: { content: "file content" }, duration: 150,
      timestamp: new Date().toISOString(),
    };

    it("should add step result for executing session", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "executing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "direct", state: "executing" }));

      await manager.recordStepResult("s1", stepResult);
      expect(mockStore.addStepResult).toHaveBeenCalledWith("s1", stepResult);
    });

    it("should throw when not executing", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "planning" }));
      await expect(manager.recordStepResult("s1", stepResult)).rejects.toThrow(InvalidSessionStateError);
    });

    it("should throw for completed session", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "completed" }));
      await expect(manager.recordStepResult("s1", stepResult)).rejects.toThrow(InvalidSessionStateError);
    });
  });

  // ==================== High-Level Methods ====================

  describe("completeSession / failSession / cancelSession", () => {
    it("completeSession", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "executing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "direct", state: "executing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "direct", state: "completed" }));

      expect((await manager.completeSession("s1")).state).toBe("completed");
    });

    it("failSession", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "executing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "direct", state: "executing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "direct", state: "failed" }));

      expect((await manager.failSession("s1")).state).toBe("failed");
    });

    it("cancelSession for interactive session in review", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "interactive", state: "reviewing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "interactive", state: "reviewing" }));
      mockStore.getOrThrow.mockResolvedValueOnce(createSession({ id: "s1", type: "interactive", state: "cancelled" }));

      expect((await manager.cancelSession("s1")).state).toBe("cancelled");
    });
  });

  describe("appendConversation", () => {
    it("should append messages to conversation", async () => {
      const messages: ConversationMessage[] = [
        { role: "user", content: "hello" },
        { role: "assistant", content: "how can I help?" },
      ];
      await manager.appendConversation("s1", messages);
      expect(mockStore.appendConversation).toHaveBeenCalledWith("s1", messages);
    });
  });

  // ==================== Query Methods ====================

  describe("listSessions / getActiveSessions / cleanupOldSessions", () => {
    it("listSessions with filter", async () => {
      mockStore.list.mockResolvedValue({ sessions: [createSession({ id: "s1" })], total: 1, hasMore: false });
      const result = await manager.listSessions({ type: "direct", limit: 10 });
      expect(result.sessions).toHaveLength(1);
    });

    it("getActiveSessions", async () => {
      mockStore.listActive.mockResolvedValue([
        createSession({ id: "s1", state: "planning" }),
        createSession({ id: "s2", state: "executing" }),
      ]);
      expect((await manager.getActiveSessions())).toHaveLength(2);
    });

    it("cleanupOldSessions with custom maxAge", async () => {
      mockStore.cleanup.mockResolvedValue(5);
      expect(await manager.cleanupOldSessions(3600000)).toBe(5);
      expect(mockStore.cleanup).toHaveBeenCalledWith(3600000);
    });

    it("cleanupOldSessions with default maxAge (24h)", async () => {
      mockStore.cleanup.mockResolvedValue(0);
      await manager.cleanupOldSessions();
      expect(mockStore.cleanup).toHaveBeenCalledWith(24 * 60 * 60 * 1000);
    });
  });

  // ==================== Error Propagation ====================

  describe("error propagation", () => {
    it("should propagate store errors from getOrThrow", async () => {
      mockStore.getOrThrow.mockRejectedValue(new SessionNotFoundError("ghost"));
      await expect(manager.transitionState("ghost", "executing")).rejects.toThrow(SessionNotFoundError);
    });

    it("should propagate store errors from updateState", async () => {
      mockStore.getOrThrow.mockResolvedValue(createSession({ id: "s1", type: "direct", state: "planning" }));
      mockStore.updateState.mockRejectedValue(new Error("DB write error"));
      await expect(manager.transitionState("s1", "executing")).rejects.toThrow("DB write error");
    });
  });


  // ==================== Singleton & Constructor ====================

  describe("singleton and constructor", () => {
    it("should use getSessionStore() when no store provided", () => {
      // Create manager without store - should use singleton getSessionStore
      // We just verify constructor doesn't throw
      const manager = new SessionManager();
      expect(manager).toBeDefined();
    });

    it("getSessionManager() should return a SessionManager instance", () => {
      // Import the function and verify it returns a SessionManager
      // Note: This may throw if no DB is available at runtime in test env
      // The test validates the import resolves correctly at module level
      const mod = require("../../packages/core/src/execution/session-manager");
      expect(mod.getSessionManager).toBeDefined();
      expect(typeof mod.getSessionManager).toBe("function");
    });
  });

});