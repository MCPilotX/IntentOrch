import { ExecuteService } from "../../packages/core/src/ai/execute-service.js";
import { getSessionManager } from "../../packages/core/src/execution/session-manager.js";
import { DatabaseManager } from "../../packages/core/src/utils/sqlite.js";
import { ErrorCode } from "../../packages/core/src/core/error-handler.js";

describe("SandboxInterceptor", () => {
  let executeService: ExecuteService;

  afterAll(() => {
    // Close DB to stop cleanup timer (prevents worker process leaks)
    DatabaseManager.getInstance().close();
  });

  beforeEach(() => {
    executeService = new ExecuteService();
  });

  it("should block execution if the plan contains forbidden tools", async () => {
    // 1. Create a session with a forbidden tool (e.g., "rm")
    const sessionManager = getSessionManager();
    const session = await sessionManager.createSession({
      query: "delete everything",
      type: "direct"
    });

    // Manually inject a malicious plan
    await sessionManager.storePlan(session.id, {
      id: "malicious_plan",
      query: "delete everything",
      steps: [
        {
          id: "step_1",
          toolName: "rm",
          description: "Malicious tool call",
          arguments: { path: "/" },
          dependsOn: []
        }
      ],
      confirmed: true,
      createdAt: new Date(),
      summary: "Dangerous plan"
    });

    // 2. Execute the session - the interceptor should THROW a forbidden error
    await expect(executeService.executeSession(session.id))
        .rejects.toThrow(/Security Sandbox: Tool "rm" is forbidden/);
  });

  it("should allow execution if the plan contains safe tools", async () => {
    const sessionManager = getSessionManager();
    const session = await sessionManager.createSession({
      query: "check time",
      type: "direct"
    });

    await sessionManager.storePlan(session.id, {
      id: "safe_plan",
      query: "check time",
      steps: [
        {
          id: "step_1",
          toolName: "get_time",
          description: "Safe tool call",
          arguments: {},
          dependsOn: []
        }
      ],
      confirmed: true,
      createdAt: new Date(),
      summary: "Safe plan"
    });

    // We mock initialize to avoid hitting real engines/servers
    (executeService as any).initialize = jest.fn().mockResolvedValue(undefined);
    (executeService as any).cloudIntentEngine = {
        setAvailableTools: jest.fn()
    };
    (executeService as any).toolExecutor = {
        clearToolResultCache: jest.fn(),
        getAvailableTools: jest.fn().mockResolvedValue([{ name: "get_time" }]),
        createToolExecutor: jest.fn().mockReturnValue(jest.fn().mockResolvedValue("12:00")),
        connectToRunningServers: jest.fn().mockResolvedValue(undefined),
        cleanupConnections: jest.fn().mockResolvedValue(undefined)
    };
    (executeService as any).reactLoopEngine = {
        execute: jest.fn().mockResolvedValue({ success: true, result: "12:00" })
    };

    const result = await executeService.executeSession(session.id);
    expect(result.success).toBe(true);
    expect(result.result).toBe("12:00");
  });
});
