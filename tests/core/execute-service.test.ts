import { ExecuteService } from "../../packages/core/src/ai/execute-service";
import { getSessionManager } from "../../packages/core/src/execution/session-manager";
import { getToolExecutor } from "../../packages/core/src/execution/tool-executor/index";
import { getConfigService } from "../../packages/core/src/core/config-service";

const mockCreateSession = jest.fn();
const mockGetSession = jest.fn();
const mockHandleFeedback = jest.fn();
const mockCompleteSession = jest.fn();
const mockFailSession = jest.fn();
const mockStorePlan = jest.fn();
const mockGetActiveSessions = jest.fn();
const mockCleanupOldSessions = jest.fn();

jest.mock("../../packages/core/src/execution/session-manager", () => ({
  getSessionManager: jest.fn(() => ({
    createSession: mockCreateSession, getSession: mockGetSession,
    handleFeedback: mockHandleFeedback, completeSession: mockCompleteSession,
    failSession: mockFailSession, storePlan: mockStorePlan,
    getActiveSessions: mockGetActiveSessions, cleanupOldSessions: mockCleanupOldSessions,
    recordStepResult: jest.fn(),
  })),
  SessionManager: jest.fn(),
}));

const mockGetAvailableTools = jest.fn();
const mockCreateToolExecutor = jest.fn();
const mockConnectToRunningServers = jest.fn();
const mockHandleAutoStart = jest.fn();
const mockClearToolResultCache = jest.fn();
const mockCleanupConnections = jest.fn();

jest.mock("../../packages/core/src/execution/tool-executor/index", () => ({
  getToolExecutor: jest.fn(() => ({
    getAvailableTools: mockGetAvailableTools,
    createToolExecutor: mockCreateToolExecutor,
    connectToRunningServers: mockConnectToRunningServers,
    handleAutoStart: mockHandleAutoStart,
    clearToolResultCache: mockClearToolResultCache,
    cleanupConnections: mockCleanupConnections,
  })),
}));

jest.mock("../../packages/core/src/core/config-service", () => ({
  getConfigService: jest.fn(() => ({
    getAIConfig: jest.fn().mockResolvedValue({ provider: "openai", model: "gpt-4", apiKey: "sk-test" }),
  })),
}));

jest.mock("../../packages/core/src/utils/cloud-intent-engine-factory", () => ({
  createCloudIntentEngine: jest.fn().mockResolvedValue({
    setAvailableTools: jest.fn(), planQuery: jest.fn().mockResolvedValue({ steps: [], summary: "" }),
    processQueryWithHistory: jest.fn(), buildSystemPrompt: jest.fn().mockReturnValue("sp"),
  }),
}));

jest.mock("../../packages/core/src/utils/sqlite", () => ({
  DatabaseManager: { getInstance: jest.fn(() => ({ initialize: jest.fn().mockResolvedValue(undefined) })) },
}));

jest.mock("../../packages/core/src/execution/session-store", () => ({
  getSessionStore: jest.fn(() => ({ startAutoCleanup: jest.fn() })),
}));

// Mock executor sub-components to avoid ESM module resolution issues
jest.mock("../../packages/core/src/ai/executor/workflow-orchestrator", () => ({
  WorkflowOrchestrator: jest.fn().mockImplementation(() => ({
    executeWorkflowFromFile: jest.fn(),
    executeNamedWorkflow: jest.fn(),
    executeWorkflow: jest.fn(),
  })),
}));

jest.mock("../../packages/core/src/ai/executor/daemon-delegator", () => ({
  DaemonDelegator: jest.fn().mockImplementation(() => ({
    tryDelegate: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock("../../packages/core/src/ai/executor/plan-executor", () => ({
  PlanExecutor: jest.fn().mockImplementation(() => ({
    parseIntent: jest.fn(),
    executeSteps: jest.fn(),
  })),
}));

jest.mock("../../packages/core/src/ai/executor/session-orchestrator", () => ({
  SessionOrchestrator: jest.fn().mockImplementation(() => ({})),
}));

jest.mock("../../packages/core/src/ai/executor/react-loop-engine", () => ({
  ReActLoopEngine: jest.fn().mockImplementation(() => ({
    execute: jest.fn().mockResolvedValue({ success: true, executionSteps: [], statistics: {} }),
    executeStream: jest.fn(),
  })),
}));

describe("ExecuteService", () => {
  let service: ExecuteService;

  beforeEach(() => { jest.clearAllMocks(); service = new ExecuteService(); });

  describe("constructor", () => {
    it("creates service instance", () => { expect(service).toBeInstanceOf(ExecuteService); });
  });

  describe("initialize", () => {
    it("initializes with config", async () => { await expect(service.initialize()).resolves.toBeUndefined(); });

    it("throws when provider not set", async () => {
      const cs = require("../../packages/core/src/core/config-service");
      cs.getConfigService.mockReturnValue({ getAIConfig: jest.fn().mockResolvedValue({ provider: "", model: "gpt-4" }) });
      await expect(service.initialize()).rejects.toThrow("AI configuration not set");
    });
  });

  describe("createSession", () => {
    it("creates a session", async () => {
      mockCreateSession.mockResolvedValue({ id: "s1", query: "q", type: "direct", state: "planning" });
      const s = await service.createSession("test");
      expect(mockCreateSession).toHaveBeenCalledWith({ query: "test", type: "direct", metadata: undefined });
      expect(s.id).toBe("s1");
    });
  });

  describe("getSession", () => {
    it("gets session by id", async () => {
      mockGetSession.mockResolvedValue({ id: "s1" });
      expect((await service.getSession("s1"))!.id).toBe("s1");
    });
  });

  describe("sendFeedback", () => {
    it("sends feedback", async () => {
      mockHandleFeedback.mockResolvedValue({ id: "s1", state: "confirmed" });
      const s = await service.sendFeedback("s1", { type: "confirm", message: "ok" });
      expect(s.state).toBe("confirmed");
    });
  });

  describe("executeSession", () => {
    beforeEach(async () => {
      const cs = require("../../packages/core/src/core/config-service");
      cs.getConfigService.mockReturnValue({ getAIConfig: jest.fn().mockResolvedValue({ provider: "openai", model: "gpt-4", apiKey: "sk-test" }) });
      await service.initialize();
    });

    it("returns error when no tools", async () => {
      mockGetSession.mockResolvedValue({ id: "s1", query: "t", state: "planning", plan: null });
      mockGetAvailableTools.mockResolvedValue([]);
      const r = await service.executeSession("s1");
      expect(r.success).toBe(false);
      expect(r.error).toContain("No MCP tools");
    });

    it("returns not found error", async () => {
      mockGetSession.mockResolvedValue(null);
      const r = await service.executeSession("bad");
      expect(r.success).toBe(false);
      expect(r.error).toContain("Session not found");
    });
  });

  describe("executeNaturalLanguage", () => {
    it("executes query", async () => {
      mockCreateSession.mockResolvedValue({ id: "s1", query: "t", type: "direct", state: "planning" });
      mockGetSession.mockResolvedValue({ id: "s1", query: "t", state: "planning", plan: null });
      mockGetAvailableTools.mockResolvedValue([{ name: "t1", description: "d", inputSchema: { type: "object", properties: {} } }]);
      mockCreateToolExecutor.mockReturnValue(jest.fn());
      mockCompleteSession.mockResolvedValue({});
      await service.initialize();
      const r = await service.executeNaturalLanguage("test", { simulate: true });
      expect(r).toBeDefined();
    });
  });

  describe("startInteractiveSession", () => {
    it("starts interactive session", async () => {
      mockCreateSession.mockResolvedValue({ id: "i1", query: "t", type: "interactive", state: "planning" });
      mockGetSession.mockResolvedValue({ id: "i1", query: "t", type: "interactive", state: "reviewing", plan: { steps: [], summary: "p" } });
      mockGetAvailableTools.mockResolvedValue([{ name: "t", description: "d", inputSchema: { type: "object", properties: {} } }]);
      await service.initialize();
      const r = await service.startInteractiveSession("test");
      expect(r.sessionId).toBe("i1");
      expect(r.guidance.type).toBe("plan");
    });
  });

  describe("processInteractiveFeedback", () => {
    it("processes confirm feedback", async () => {
      mockHandleFeedback.mockResolvedValue({ id: "i1", state: "confirmed" });
      const r = await service.processInteractiveFeedback("i1", { type: "confirm" });
      expect(r.success).toBe(true);
      expect(r.readyForExecution).toBe(true);
    });
  });

  describe("session management", () => {
    it("lists active sessions", async () => {
      mockGetActiveSessions.mockResolvedValue([{ id: "s1" }]);
      expect((await service.getActiveInteractiveSessions()).length).toBe(1);
    });

    it("cleans up old sessions", async () => {
      mockCleanupOldSessions.mockResolvedValue(3);
      expect(await service.cleanupInteractiveSessions()).toBe(3);
    });
  });
});
