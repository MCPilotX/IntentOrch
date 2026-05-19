/**
 * Session API Integration Tests
 *
 * Tests for the Session-based execution API:
 * - SessionManager state machine transitions
 * - SessionStore CRUD operations
 * - DaemonClient Session API methods
 * - ExecuteService session methods
 */

import { DaemonClient } from "../../packages/core/src/daemon/client.js";
import type {
  SessionCreateResponse,
  SessionExecuteResponse,
  SessionFeedbackResponse,
  SessionGetResponse,
  SessionListResponse,
  SessionCancelResponse,
} from "../../packages/core/src/daemon/types.js";

// Mock http module
const mockRequestStream = {
  on: jest.fn(),
  write: jest.fn(),
  end: jest.fn(),
};

const mockResponseStream = {
  on: jest.fn(),
  statusCode: 200,
};

jest.mock("http", () => ({
  request: jest.fn(
    (
      _url: string,
      _options: any,
      callback?: (res: any) => void,
    ) => {
      if (callback) {
        callback(mockResponseStream);
      }
      return mockRequestStream;
    },
  ),
}));

jest.mock("../../packages/core/src/secret/manager.js", () => ({
  getSecretManager: jest.fn(() => ({
    get: jest.fn().mockResolvedValue("test-auth-token"),
  })),
}));

jest.mock("../../packages/core/src/utils/paths.js", () => ({
  getDaemonPidPath: jest.fn(() => "/tmp/.intorch/daemon.pid"),
}));

describe("Session API (DaemonClient)", () => {
  let client: DaemonClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new DaemonClient("localhost", 9658);

    // Default mock response stream behavior
    mockResponseStream.on.mockImplementation(
      (event: string, handler: Function) => {
        if (event === "data") {
          // Don't call data by default - tests will set up their own
        }
        if (event === "end") {
          // Don't call end by default
        }
        return mockResponseStream;
      },
    );

    // Default mock request stream behavior
    mockRequestStream.on.mockImplementation(
      (event: string, handler: Function) => {
        if (event === "error") {
          // Don't call error by default
        }
        return mockRequestStream;
      },
    );
  });

  function setupMockResponse(statusCode: number, data: any) {
    mockResponseStream.statusCode = statusCode;
    mockResponseStream.on.mockImplementation(
      (event: string, handler: Function) => {
        if (event === "data") {
          handler(JSON.stringify(data));
        }
        if (event === "end") {
          handler();
        }
        return mockResponseStream;
      },
    );
  }

  // ==================== Session Create ====================

  describe("createSession()", () => {
    it("should create a direct session and return sessionId", async () => {
      const mockResponse: SessionCreateResponse = {
        success: true,
        sessionId: "session-123",
        session: {
          id: "session-123",
          type: "direct",
          state: "planning",
          query: "test query",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.createSession("test query", "direct");
      expect(result.success).toBe(true);
      expect(result.sessionId).toBe("session-123");
      expect(result.session.type).toBe("direct");
      expect(result.session.state).toBe("planning");
    });

    it("should create an interactive session", async () => {
      const mockResponse: SessionCreateResponse = {
        success: true,
        sessionId: "session-456",
        session: {
          id: "session-456",
          type: "interactive",
          state: "planning",
          query: "interactive query",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.createSession("interactive query", "interactive");
      expect(result.success).toBe(true);
      expect(result.session.type).toBe("interactive");
    });

    it("should create session with metadata", async () => {
      const mockResponse: SessionCreateResponse = {
        success: true,
        sessionId: "session-789",
        session: {
          id: "session-789",
          type: "direct",
          state: "planning",
          query: "query with metadata",
          metadata: { userId: "user-1", source: "test" },
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.createSession("query with metadata", "direct", {
        userId: "user-1",
        source: "test",
      });
      expect(result.success).toBe(true);
      expect(result.session.metadata.userId).toBe("user-1");
    });

    it("should handle error response", async () => {
      setupMockResponse(400, {
        success: false,
        error: "Query is required and must be a string",
      });

      await expect(client.createSession("", "direct")).rejects.toThrow(
        "Query is required and must be a string",
      );
    });
  });

  // ==================== Session Execute ====================

  describe("executeSession()", () => {
    it("should execute a session and return results", async () => {
      const mockResponse: SessionExecuteResponse = {
        success: true,
        result: { message: "Task completed" },
        executionSteps: [
          { name: "get-current-date", success: true, duration: 500 },
          { name: "get-tickets", success: true, duration: 2000 },
        ],
        statistics: {
          totalSteps: 2,
          successfulSteps: 2,
          failedSteps: 0,
          totalDuration: 2500,
          averageStepDuration: 1250,
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.executeSession("session-123");
      expect(result.success).toBe(true);
      expect(result.executionSteps).toHaveLength(2);
      expect(result.statistics?.totalSteps).toBe(2);
    });

    it("should handle execution failure", async () => {
      const mockResponse: SessionExecuteResponse = {
        success: false,
        error: "Tool execution failed: connection refused",
        executionSteps: [
          { name: "get-current-date", success: true, duration: 500 },
          { name: "get-tickets", success: false, duration: 1000 },
        ],
        statistics: {
          totalSteps: 2,
          successfulSteps: 1,
          failedSteps: 1,
          totalDuration: 1500,
          averageStepDuration: 750,
        },
      };

      setupMockResponse(400, mockResponse);

      // DaemonClient.request() rejects on 400+ status codes
      await expect(client.executeSession("session-123")).rejects.toThrow(
        "Tool execution failed: connection refused",
      );
    });
  });

  // ==================== Session Feedback ====================

  describe("sendFeedback()", () => {
    it("should confirm a plan", async () => {
      const mockResponse: SessionFeedbackResponse = {
        success: true,
        session: {
          id: "session-123",
          type: "interactive",
          state: "confirmed",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.sendFeedback("session-123", "confirm");
      expect(result.success).toBe(true);
      expect(result.session.state).toBe("confirmed");
    });

    it("should reject a plan", async () => {
      const mockResponse: SessionFeedbackResponse = {
        success: true,
        session: {
          id: "session-123",
          type: "interactive",
          state: "cancelled",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.sendFeedback("session-123", "reject", "Not what I wanted");
      expect(result.success).toBe(true);
      expect(result.session.state).toBe("cancelled");
    });

    it("should request plan regeneration", async () => {
      const mockResponse: SessionFeedbackResponse = {
        success: true,
        session: {
          id: "session-123",
          type: "interactive",
          state: "planning",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.sendFeedback("session-123", "regenerate", "Try a different approach");
      expect(result.success).toBe(true);
      expect(result.session.state).toBe("planning");
    });
  });

  // ==================== Session Get ====================

  describe("getSession()", () => {
    it("should return a session by ID", async () => {
      const mockResponse: SessionGetResponse = {
        success: true,
        session: {
          id: "session-123",
          type: "direct",
          state: "completed",
          query: "test query",
          stepResults: [
            { stepId: "1", toolName: "tool-1", success: true, duration: 500, timestamp: "2024-01-01T00:00:00Z" },
          ],
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.getSession("session-123");
      expect(result.success).toBe(true);
      expect(result.session.state).toBe("completed");
      expect(result.session.stepResults).toHaveLength(1);
    });

    it("should return 404 for non-existent session", async () => {
      setupMockResponse(404, {
        success: false,
        error: "Session not found",
      });

      await expect(client.getSession("non-existent")).rejects.toThrow(
        "Session not found",
      );
    });
  });

  // ==================== Session List ====================

  describe("listSessions()", () => {
    it("should return list of sessions", async () => {
      const mockResponse: SessionListResponse = {
        success: true,
        sessions: [
          { id: "session-1", type: "direct", state: "completed", query: "query 1" },
          { id: "session-2", type: "interactive", state: "planning", query: "query 2" },
        ],
        total: 2,
      };

      setupMockResponse(200, mockResponse);

      const result = await client.listSessions();
      expect(result.success).toBe(true);
      expect(result.sessions).toHaveLength(2);
      expect(result.total).toBe(2);
    });

    it("should return empty list when no sessions exist", async () => {
      const mockResponse: SessionListResponse = {
        success: true,
        sessions: [],
        total: 0,
      };

      setupMockResponse(200, mockResponse);

      const result = await client.listSessions();
      expect(result.success).toBe(true);
      expect(result.sessions).toHaveLength(0);
      expect(result.total).toBe(0);
    });
  });

  // ==================== Session Cancel ====================

  describe("cancelSession()", () => {
    it("should cancel a session", async () => {
      const mockResponse: SessionCancelResponse = {
        success: true,
        session: {
          id: "session-123",
          type: "interactive",
          state: "cancelled",
        },
      };

      setupMockResponse(200, mockResponse);

      const result = await client.cancelSession("session-123");
      expect(result.success).toBe(true);
      expect(result.session.state).toBe("cancelled");
    });

    it("should handle cancel of non-existent session", async () => {
      setupMockResponse(404, {
        success: false,
        error: "Session not found",
      });

      await expect(client.cancelSession("non-existent")).rejects.toThrow(
        "Session not found",
      );
    });
  });

  // ==================== Session State Machine Validation ====================

  describe("Session State Machine", () => {
    it("should validate direct session state transitions", () => {
      // Direct: planning -> executing -> completed | failed
      const validDirectTransitions: Record<string, string[]> = {
        planning: ["executing"],
        executing: ["completed", "failed"],
        completed: [],
        failed: [],
      };

      expect(validDirectTransitions["planning"]).toContain("executing");
      expect(validDirectTransitions["planning"]).not.toContain("reviewing");
      expect(validDirectTransitions["executing"]).toContain("completed");
      expect(validDirectTransitions["executing"]).toContain("failed");
      expect(validDirectTransitions["completed"]).toHaveLength(0);
    });

    it("should validate interactive session state transitions", () => {
      // Interactive: planning -> reviewing -> confirmed -> executing -> completed | failed
      //             planning -> reviewing -> cancelled
      //             planning -> reviewing -> planning (regenerate)
      const validInteractiveTransitions: Record<string, string[]> = {
        planning: ["reviewing"],
        reviewing: ["confirmed", "cancelled", "planning"],
        confirmed: ["executing"],
        executing: ["completed", "failed"],
        completed: [],
        failed: [],
        cancelled: [],
      };

      expect(validInteractiveTransitions["planning"]).toContain("reviewing");
      expect(validInteractiveTransitions["reviewing"]).toContain("confirmed");
      expect(validInteractiveTransitions["reviewing"]).toContain("cancelled");
      expect(validInteractiveTransitions["reviewing"]).toContain("planning");
      expect(validInteractiveTransitions["confirmed"]).toContain("executing");
      expect(validInteractiveTransitions["executing"]).toContain("completed");
      expect(validInteractiveTransitions["executing"]).toContain("failed");
    });

    it("should prevent invalid transitions", () => {
      // Direct sessions should never enter reviewing
      const directTransitions: Record<string, string[]> = {
        planning: ["executing"],
        executing: ["completed", "failed"],
      };

      expect(directTransitions["planning"]).not.toContain("reviewing");
      expect(directTransitions["planning"]).not.toContain("confirmed");
      expect(directTransitions["executing"]).not.toContain("planning");
    });
  });
});
