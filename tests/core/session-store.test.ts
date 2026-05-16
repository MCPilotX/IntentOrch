/**
 * Unit tests for SessionStore
 *
 * Tests SQLite CRUD operations with mocked DatabaseManager,
 * covering normal operations and boundary conditions.
 */

import { SessionStore } from "../../packages/core/src/execution/session-store";
import { SessionNotFoundError } from "../../packages/core/src/execution/types";

jest.mock("uuid", () => ({ v4: () => "mocked-uuid" }));

// ==================== Mock DatabaseManager ====================

const mockExecute = jest.fn().mockResolvedValue(undefined);
const mockQuery = jest.fn().mockResolvedValue([]);
const mockQueryOne = jest.fn().mockResolvedValue(null);
const mockInitialize = jest.fn().mockResolvedValue(undefined);

jest.mock("../../packages/core/src/utils/sqlite", () => ({
  DatabaseManager: {
    getInstance: jest.fn(() => ({
      initialize: mockInitialize,
      execute: mockExecute,
      query: mockQuery,
      queryOne: mockQueryOne,
      transaction: jest.fn(),
      close: jest.fn(),
      initialized: false,
      dbFileExists: jest.fn(),
    })),
  },
}));

// ==================== Helpers ====================

function createRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: "session-1", type: "direct", state: "planning",
    query: "test query", plan: null,
    conversation_history: JSON.stringify([]),
    step_results: JSON.stringify([]),
    feedback: JSON.stringify([]),
    current_turn: 0, max_turns: 5,
    created_at: now, updated_at: now,
    metadata: JSON.stringify({}),
    ...overrides,
  };
}

describe("SessionStore", () => {
  let store: SessionStore;

  beforeEach(() => {
    jest.clearAllMocks();
    mockInitialize.mockResolvedValue(undefined);
    mockExecute.mockResolvedValue(undefined);
    store = new SessionStore();
  });

  // ==================== Schema ====================

  describe("schema initialization", () => {
    it("should create tables on first operation", async () => {
      mockQueryOne.mockResolvedValue(null);
      await store.get("nonexistent");
      expect(mockInitialize).toHaveBeenCalled();
      expect(mockExecute).toHaveBeenCalled();
    });

    it("should not re-create schema on subsequent operations", async () => {
      mockQueryOne.mockResolvedValue(createRow());
      await store.get("s1");
      const callsAfterFirst = mockExecute.mock.calls.length;

      mockQueryOne.mockResolvedValue(createRow({ id: "s2" }));
      await store.get("s2");
      // schema was already applied, so no new DDL executes
      // (get only calls ensureSchema + queryOne; execute only used for DDL)
      expect(mockExecute.mock.calls.length).toBe(callsAfterFirst);
    });
  });

  // ==================== Create ====================

  describe("create", () => {
    it("should create a direct session with defaults", async () => {
      const session = await store.create({ query: "list files", type: "direct" });
      expect(session.id).toBeDefined();
      expect(session.type).toBe("direct");
      expect(session.state).toBe("planning");
      expect(session.query).toBe("list files");
      expect(session.plan).toBeNull();
      expect(session.conversationHistory).toEqual([]);
      expect(session.stepResults).toEqual([]);
      expect(session.feedback).toEqual([]);
      expect(session.currentTurn).toBe(0);
      expect(session.maxTurns).toBe(5);
      expect(session.metadata).toEqual({});
    });

    it("should create an interactive session", async () => {
      const s = await store.create({ query: "book flight", type: "interactive" });
      expect(s.type).toBe("interactive");
    });

    it("should accept optional metadata and maxTurns", async () => {
      const metadata = { userId: "user-1" };
      const s = await store.create({ query: "test", type: "direct", metadata, maxTurns: 10 });
      expect(s.metadata).toEqual(metadata);
      expect(s.maxTurns).toBe(10);
    });

    it("should INSERT via execute", async () => {
      await store.create({ query: "test", type: "direct" });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("INSERT INTO execution_sessions"),
        expect.arrayContaining([expect.any(String), "direct", "planning", "test"]),
      );
    });
  });

  // ==================== Get ====================

  describe("get", () => {
    it("should return a session from a row", async () => {
      mockQueryOne.mockResolvedValue(createRow({
        id: "s1", state: "completed",
        plan: JSON.stringify({ steps: [{ id: "s1", tool: "find" }] }),
      }));

      const s = await store.get("s1");
      expect(s!.id).toBe("s1");
      expect(s!.state).toBe("completed");
      expect(s!.plan).toEqual({ steps: [{ id: "s1", tool: "find" }] });
    });

    it("should return null for non-existent", async () => {
      mockQueryOne.mockResolvedValue(null);
      expect(await store.get("nonexistent")).toBeNull();
    });

    it("should deserialize JSON fields", async () => {
      const history = [{ role: "user", content: "hello" }];
      mockQueryOne.mockResolvedValue(createRow({
        conversation_history: JSON.stringify(history),
        step_results: JSON.stringify([{ stepId: "s1", toolName: "find", success: true, duration: 100 }]),
        feedback: JSON.stringify([{ type: "confirm", timestamp: "2024-01-01" }]),
        metadata: JSON.stringify({ source: "cli" }),
      }));

      const s = await store.get("s1")!;
      expect(s!.conversationHistory).toEqual(history);
      expect(s!.stepResults).toHaveLength(1);
      expect(s!.feedback).toHaveLength(1);
      expect(s!.metadata).toEqual({ source: "cli" });
    });

    it("should handle null JSON fields gracefully", async () => {
      mockQueryOne.mockResolvedValue(createRow({
        conversation_history: null,
        step_results: null,
        feedback: null,
        metadata: null,
      }));

      const s = await store.get("s1");
      expect(s!.conversationHistory).toEqual([]);
      expect(s!.stepResults).toEqual([]);
      expect(s!.feedback).toEqual([]);
      expect(s!.metadata).toEqual({});
    });
  });

  describe("getOrThrow", () => {
    it("should throw SessionNotFoundError when not found", async () => {
      mockQueryOne.mockResolvedValue(null);
      await expect(store.getOrThrow("ghost")).rejects.toThrow(SessionNotFoundError);
    });
  });

  // ==================== Update Operations ====================

  describe("updateState", () => {
    it("should update state", async () => {
      await store.updateState("s1", "executing");
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE execution_sessions SET state ="),
        ["executing", "s1"],
      );
    });
  });

  describe("updatePlan", () => {
    it("should serialize plan as JSON", async () => {
      const plan = { steps: [{ id: "s1", tool: "read-file", params: { path: "/tmp" } }] };
      await store.updatePlan("s1", plan);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET plan ="), [JSON.stringify(plan), "s1"],
      );
    });

    it("should store null plan", async () => {
      await store.updatePlan("s1", null);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET plan ="), [null, "s1"],
      );
    });
  });

  describe("appendConversation", () => {
    it("should append to existing history", async () => {
      mockQueryOne.mockResolvedValue(createRow({
        conversation_history: JSON.stringify([{ role: "user", content: "hi" }]),
      }));

      await store.appendConversation("s1", [{ role: "assistant", content: "hello" }]);

      // Filter for the UPDATE statement (not the schema DDL)
      const calls = mockExecute.mock.calls.filter(c => c[0].includes("SET conversation_history"));
      expect(calls.length).toBe(1);
      const merged = JSON.parse(calls[0][1][0] as string);
      expect(merged).toHaveLength(2);
      expect(merged[0].role).toBe("user");
      expect(merged[1].role).toBe("assistant");
    });

    it("should throw on non-existent session", async () => {
      mockQueryOne.mockResolvedValue(null);
      await expect(
        store.appendConversation("ghost", [{ role: "user", content: "hi" }]),
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe("addStepResult / addFeedback / updateMetadata", () => {
    it("addStepResult increments current_turn", async () => {
      mockQueryOne.mockResolvedValue(createRow());
      await store.addStepResult("s1", {
        stepId: "s1", toolName: "find", success: true,
        result: "found", duration: 100, timestamp: new Date().toISOString(),
      });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("current_turn = current_turn + 1"),
        expect.any(Array),
      );
    });

    it("addFeedback appends to feedback array", async () => {
      mockQueryOne.mockResolvedValue(createRow({
        feedback: JSON.stringify([{ type: "confirm", timestamp: "2024-01-01" }]),
      }));

      await store.addFeedback("s1", {
        type: "reject", message: "not good", timestamp: new Date().toISOString(),
      });

      const calls = mockExecute.mock.calls.filter(c => c[0].includes("SET feedback"));
      const fb = JSON.parse(calls[0][1][0] as string);
      expect(fb).toHaveLength(2);
      expect(fb[0].type).toBe("confirm");
      expect(fb[1].type).toBe("reject");
    });

    it("updateMetadata", async () => {
      await store.updateMetadata("s1", { key: "value" });
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("SET metadata ="), [JSON.stringify({ key: "value" }), "s1"],
      );
    });
  });

  // ==================== Delete ====================

  describe("delete", () => {
    it("should delete by id", async () => {
      await store.delete("s1");
      expect(mockExecute).toHaveBeenCalledWith(
        "DELETE FROM execution_sessions WHERE id = ?", ["s1"],
      );
    });
  });

  // ==================== List ====================

  describe("list", () => {
    it("should list with type filter and pagination", async () => {
      mockQueryOne.mockResolvedValue({ total: 10 });
      mockQuery.mockResolvedValue([createRow({ id: "s1", type: "interactive" })]);

      const result = await store.list({ type: "interactive", limit: 1, offset: 0 });
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].type).toBe("interactive");
      expect(result.total).toBe(10);
      expect(result.hasMore).toBe(true);
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("WHERE type = ?"),
        ["interactive", 1, 0],
      );
    });

    it("should filter by state", async () => {
      mockQueryOne.mockResolvedValue({ total: 1 });
      mockQuery.mockResolvedValue([createRow({ id: "s1", state: "completed" })]);

      const result = await store.list({ state: "completed" });
      expect(result.sessions[0].state).toBe("completed");
    });

    it("should sort by updatedAt asc", async () => {
      mockQueryOne.mockResolvedValue({ total: 0 });
      mockQuery.mockResolvedValue([]);

      await store.list({ sortBy: "updatedAt", sortOrder: "asc" });
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining("ORDER BY updated_at ASC"),
        expect.any(Array),
      );
    });

    it("should handle empty result set", async () => {
      mockQueryOne.mockResolvedValue({ total: 0 });
      mockQuery.mockResolvedValue([]);
      const result = await store.list({});
      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.hasMore).toBe(false);
    });
  });

  // ==================== listActive ====================

  describe("listActive", () => {
    it("should return planning and executing sessions", async () => {
      mockQueryOne.mockResolvedValueOnce({ total: 1 }).mockResolvedValueOnce({ total: 1 });
      mockQuery
        .mockResolvedValueOnce([createRow({ id: "s1", state: "planning" })])
        .mockResolvedValueOnce([createRow({ id: "s2", state: "executing" })]);

      const sessions = await store.listActive();
      expect(sessions).toHaveLength(2);
      expect(sessions[0].state).toBe("planning");
      expect(sessions[1].state).toBe("executing");
    });
  });

  // ==================== Cleanup ====================

  describe("cleanup", () => {
    it("should delete old terminal sessions", async () => {
      mockQuery.mockResolvedValue([{ count: 3 }]);

      expect(await store.cleanup(3600000)).toBe(3);
      expect(mockExecute).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM execution_sessions"),
        expect.any(Array),
      );
    });

    it("should not delete when no old sessions", async () => {
      mockQuery.mockResolvedValue([{ count: 0 }]);

      expect(await store.cleanup(3600000)).toBe(0);
      const deleteCalls = mockExecute.mock.calls.filter(c => c[0].includes("DELETE"));
      expect(deleteCalls).toHaveLength(0);
    });
  });

  // ==================== Auto Cleanup ====================

  describe("auto cleanup", () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    it("should start and stop cleanup timer", () => {
      const setSpy = jest.spyOn(global, "setInterval");
      const clearSpy = jest.spyOn(global, "clearInterval");

      store.startAutoCleanup(60000);
      expect(setSpy).toHaveBeenCalledWith(expect.any(Function), 60000);

      store.stopAutoCleanup();
      expect(clearSpy).toHaveBeenCalled();
    });

    it("should restart timer if already running", () => {
      const clearSpy = jest.spyOn(global, "clearInterval");
      const setSpy = jest.spyOn(global, "setInterval");

      store.startAutoCleanup(60000);
      store.startAutoCleanup(30000);

      expect(clearSpy).toHaveBeenCalled();
      expect(setSpy).toHaveBeenCalledTimes(2);
    });

    it("should stop without error if not running", () => {
      expect(() => store.stopAutoCleanup()).not.toThrow();
    });
  });


  // ==================== Singleton ====================

  describe("getSessionStore singleton", () => {
    it("should export getSessionStore function", () => {
      const mod = require("../../packages/core/src/execution/session-store");
      expect(mod.getSessionStore).toBeDefined();
      expect(typeof mod.getSessionStore).toBe("function");
    });
  });

});