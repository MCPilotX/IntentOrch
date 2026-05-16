/**
 * WorkflowEngine Unit Tests
 *
 * Comprehensive tests covering:
 * - execute() main flow
 * - executeStep() sub-flow
 * - ensureServersRunning / ensureServerRunning
 * - createMCPClientForServer (stdio, sse, http)
 * - resolveInputs / loadRequiredSecrets / resolveOutputs
 * - mapServerIdToServerName (all strategies)
 */

import { WorkflowEngine } from "../../packages/core/src/workflow/engine.js";
import { MCPClient } from "../../packages/core/src/mcp/client.js";
import { getRegistryClient } from "../../packages/core/src/registry/client.js";
import { getProcessManager } from "../../packages/core/src/process-manager/manager.js";
import { getSecretManager } from "../../packages/core/src/secret/manager.js";
import { getExecutionRecorder } from "../../packages/core/src/workflow/execution-recorder.js";
import type { Workflow } from "../../packages/core/src/workflow/types.js";

// ==================== Mocks ====================

jest.mock("uuid", () => ({ v4: jest.fn(() => "mock-uuid-v4") }));

jest.mock("../../packages/core/src/mcp/client.js");
const MockedMCPClient = MCPClient as jest.MockedClass<typeof MCPClient>;

jest.mock("../../packages/core/src/registry/client.js");
const mockedGetRegistryClient = getRegistryClient as unknown as jest.Mock;

jest.mock("../../packages/core/src/process-manager/manager.js");
const mockedGetProcessManager = getProcessManager as unknown as jest.Mock;

jest.mock("../../packages/core/src/secret/manager.js");
const mockedGetSecretManager = getSecretManager as unknown as jest.Mock;

jest.mock("../../packages/core/src/workflow/execution-recorder.js");
const mockedGetExecutionRecorder = getExecutionRecorder as unknown as jest.Mock;

jest.mock("fs");
jest.mock("fs/promises");

const mockFs = require("fs");
const mockFsPromises = require("fs/promises");

// ==================== Helpers ====================

const defaultWorkflow: Workflow = {
  name: "test-workflow",
  version: "1.0",
  requirements: { servers: [] },
  inputs: [],
  steps: [],
};

function createMockClient(): any {
  return {
    connect: jest.fn().mockResolvedValue(undefined),
    disconnect: jest.fn().mockResolvedValue(undefined),
    callTool: jest.fn().mockResolvedValue({ content: [{ text: "success" }] }),
    on: jest.fn(),
  };
}

function setupMocks(options?: {
  manifest?: any;
  processRunning?: boolean;
  runningServers?: any[];
  secrets?: Map<string, string>;
  recorder?: any;
}) {
  const manifest = options?.manifest || {
    name: "test-server",
    version: "1.0.0",
    runtime: { type: "stdio", command: "node", args: ["server.js"] },
    transport: { type: "stdio" },
  };

  const mockRegistryClient = {
    fetchManifest: jest.fn().mockResolvedValue(manifest),
    getCachedManifest: jest.fn(),
  };
  mockedGetRegistryClient.mockReturnValue(mockRegistryClient);

  const mockProcessManager = {
    getByServerName: jest.fn().mockImplementation((name: string) => {
      if (options?.processRunning) {
        return { pid: 123, serverName: name };
      }
      if (options?.runningServers) {
        const found = options.runningServers.find((s: any) => s.serverName === name);
        if (found) return found;
      }
      return null;
    }),
    start: jest.fn().mockResolvedValue(456),
    listRunning: jest.fn().mockResolvedValue(options?.runningServers || []),
    get: jest.fn().mockResolvedValue(options?.processRunning ? { pid: 456, serverName: "test-server" } : undefined),
  };
  mockedGetProcessManager.mockReturnValue(mockProcessManager);

  const mockSecretManager = {
    load: jest.fn().mockResolvedValue(undefined),
    getAll: jest.fn().mockResolvedValue(options?.secrets || new Map()),
  };
  mockedGetSecretManager.mockReturnValue(mockSecretManager);

  const mockRecorder = options?.recorder || {
    startExecution: jest.fn().mockResolvedValue(undefined),
    completeExecution: jest.fn().mockResolvedValue(undefined),
    startStep: jest.fn().mockResolvedValue(undefined),
    completeStep: jest.fn().mockResolvedValue(undefined),
  };
  mockedGetExecutionRecorder.mockReturnValue(mockRecorder);

  const mockClient = createMockClient();
  MockedMCPClient.mockImplementation(() => mockClient);

  return {
    mockRegistryClient,
    mockProcessManager,
    mockSecretManager,
    mockRecorder,
    mockClient,
    manifest,
  };
}

describe("WorkflowEngine", () => {
  let engine: WorkflowEngine;

  beforeEach(() => {
    jest.clearAllMocks();
    engine = new WorkflowEngine();
  });

  // ==================== execute() ====================

  describe("execute()", () => {
    it("should execute a simple workflow successfully", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
        outputs: { result: "{{step1}}" },
      };

      const result = await engine.execute(workflow, {});

      expect(mocks.mockSecretManager.load).toHaveBeenCalled();
      expect(mocks.mockProcessManager.getByServerName).toHaveBeenCalledWith("test-server");
      expect(mocks.mockRecorder.startExecution).toHaveBeenCalled();
      expect(mocks.mockRecorder.startStep).toHaveBeenCalled();
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
      expect(mocks.mockRecorder.completeStep).toHaveBeenCalledWith(
        expect.any(String), 0, "success", expect.any(Object),
      );
      expect(mocks.mockRecorder.completeExecution).toHaveBeenCalledWith(
        expect.any(String), "success", undefined, expect.any(Object),
      );
      expect(mocks.mockClient.disconnect).toHaveBeenCalled();
      expect(result).toHaveProperty("result");
    });

    it("should skip step when if-condition is false", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
          if: "{{input.score > 5}}",
        }],
      };

      await engine.execute(workflow, { score: 3 });

      expect(mocks.mockClient.callTool).not.toHaveBeenCalled();
      expect(mocks.mockRecorder.completeStep).toHaveBeenCalledWith(
        expect.any(String), 0, "skipped",
      );
    });

    it("should execute step when if-condition is true", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        inputs: [{ id: "score", type: "number" }],
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
          if: "{{input.score > 5}}",
        }],
      };

      await engine.execute(workflow, { score: 10 });

      expect(mocks.mockClient.callTool).toHaveBeenCalled();
      expect(mocks.mockRecorder.completeStep).toHaveBeenCalledWith(
        expect.any(String), 0, "success", expect.any(Object),
      );
    });

    it("should fail workflow when a step fails", async () => {
      const mocks = setupMocks({ processRunning: true });
      mocks.mockClient.callTool.mockRejectedValue(new Error("Tool call failed"));

      const workflow: Workflow = {
        ...defaultWorkflow,
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("Tool call failed");

      expect(mocks.mockRecorder.completeStep).toHaveBeenCalledWith(
        expect.any(String), 0, "failed", undefined, "Tool call failed",
      );
      expect(mocks.mockRecorder.completeExecution).toHaveBeenCalledWith(
        expect.any(String), "failed", "Tool call failed",
      );
    });

    it("should cleanup connections on failure", async () => {
      const mocks = setupMocks({ processRunning: true });
      mocks.mockClient.callTool.mockRejectedValue(new Error("fail"));

      const workflow: Workflow = {
        ...defaultWorkflow,
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow();
      expect(mocks.mockClient.disconnect).toHaveBeenCalled();
    });

    it("should handle workflows with no steps", async () => {
      const mocks = setupMocks();

      const result = await engine.execute({ ...defaultWorkflow, outputs: { result: "no-steps" } }, {});
      expect(mocks.mockRecorder.startExecution).toHaveBeenCalled();
      expect(mocks.mockRecorder.completeExecution).toHaveBeenCalled();
      expect(result).toEqual({ result: "no-steps" });
    });
  });

  // ==================== executeStep ====================

  describe("executeStep", () => {
    it("should use serverName directly", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: { param1: "value1" },
        }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", { param1: "value1" });
    });

    it("should map serverId to serverName and execute", async () => {
      const mocks = setupMocks({
        processRunning: true,
        runningServers: [{ pid: 123, serverName: "my-server", status: "running" }],
      });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["my-server"] },
        steps: [{
          id: "step1",
          serverId: "my-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should throw when serverName is missing and serverId cannot be mapped", async () => {
      setupMocks({ runningServers: [] });

      const workflow: Workflow = {
        ...defaultWorkflow,
        steps: [{
          id: "step1",
          serverId: "unknown-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow(
        "is missing serverName (and serverId could not be mapped)",
      );
    });

    it("should throw when server for serverId is not in cache after mapping", async () => {
      const mocks = setupMocks({
        runningServers: [{ pid: 1, serverName: "my-server", status: "running" }],
        processRunning: false,
      });
      // Override getByServerName to return null (simulating server not running)
      mocks.mockProcessManager.getByServerName.mockResolvedValue(null);

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: [] },
        steps: [{
          id: "step1",
          serverId: "my-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      // serverId maps to "my-server", but clients cache is empty and getByServerName returns null
      // ensureServerRunning is NOT called for serverId-based steps (only for serverName),
      // so executeStep finds no client and throws.
      await expect(engine.execute(workflow, {})).rejects.toThrow(
        'MCP server "my-server" is not running',
      );
    });

    it("should throw when toolName is missing", async () => {
      setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "",
          parameters: {},
        } as any],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("is missing toolName");
    });

    it("should retry on failure and succeed on retry", async () => {
      const mocks = setupMocks({ processRunning: true });
      mocks.mockClient.callTool
        .mockRejectedValueOnce(new Error("Attempt 1 failed"))
        .mockResolvedValueOnce({ content: [{ text: "retry success" }] });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
          retry: { maxAttempts: 2, delayMs: 10 },
        }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledTimes(2);
      expect(mocks.mockRecorder.completeStep).toHaveBeenCalledWith(
        expect.any(String), 0, "success", expect.any(Object),
      );
    });

    it("should throw after exhausting retries", async () => {
      const mocks = setupMocks({ processRunning: true });
      mocks.mockClient.callTool.mockRejectedValue(new Error("Always fails"));

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
          retry: { maxAttempts: 2, delayMs: 10 },
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("Always fails");
      expect(mocks.mockClient.callTool).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== ensureServersRunning ====================

  describe("ensureServersRunning", () => {
    it("should auto-start server if not running", async () => {
      const mocks = setupMocks({ processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(mocks.mockProcessManager.getByServerName).toHaveBeenCalledWith("test-server");
      expect(mocks.mockProcessManager.start).toHaveBeenCalledWith("test-server");
      expect(mocks.mockRegistryClient.fetchManifest).toHaveBeenCalledWith("test-server");
    });

    it("should not start server if already running", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(mocks.mockProcessManager.start).not.toHaveBeenCalled();
      expect(mocks.mockRegistryClient.fetchManifest).toHaveBeenCalled();
    });

    it("should create MCP client for each server in requirements", async () => {
      const mocks = setupMocks({ processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["server-a", "server-b"] },
        steps: [{
          id: "step1",
          serverName: "server-a",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(mocks.mockProcessManager.start).toHaveBeenCalledTimes(2);
    });
  });

  // ==================== createMCPClientForServer ====================

  describe("createMCPClientForServer", () => {
    it("should create stdio client", async () => {
      const manifest = {
        name: "stdio-server", version: "1.0.0",
        runtime: { type: "stdio", command: "node", args: ["server.js"] },
        transport: { type: "stdio" },
      };
      const mocks = setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["stdio-server"] },
        steps: [{
          id: "step1",
          serverName: "stdio-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          type: "stdio",
          command: "node",
          args: ["server.js"],
        }),
      }));
      expect(mocks.mockClient.connect).toHaveBeenCalled();
    });

    it("should create SSE client", async () => {
      const manifest = {
        name: "sse-server", version: "1.0.0",
        runtime: { type: "remote", command: "" },
        transport: { type: "sse", url: "https://example.com/sse" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["sse-server"] },
        steps: [{
          id: "step1",
          serverName: "sse-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          type: "sse",
          url: "https://example.com/sse",
        }),
      }));
    });

    it("should create HTTP client", async () => {
      const manifest = {
        name: "http-server", version: "1.0.0",
        runtime: { type: "remote", command: "" },
        transport: { type: "http", url: "https://example.com/api" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["http-server"] },
        steps: [{
          id: "step1",
          serverName: "http-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await engine.execute(workflow, {});

      expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          type: "http",
          url: "https://example.com/api",
        }),
      }));
    });

    it("should throw when SSE transport is missing URL", async () => {
      const manifest = {
        name: "bad-sse", version: "1.0.0",
        runtime: { type: "remote" },
        transport: { type: "sse" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["bad-sse"] },
        steps: [{
          id: "step1",
          serverName: "bad-sse",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("missing URL for sse transport");
    });

    it("should throw when HTTP transport is missing URL", async () => {
      const manifest = {
        name: "bad-http", version: "1.0.0",
        runtime: { type: "remote" },
        transport: { type: "http" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["bad-http"] },
        steps: [{
          id: "step1",
          serverName: "bad-http",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("missing URL for http transport");
    });

    it("should throw when stdio transport is missing runtime command", async () => {
      const manifest = {
        name: "bad-stdio", version: "1.0.0",
        runtime: { type: "stdio" },
        transport: { type: "stdio" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["bad-stdio"] },
        steps: [{
          id: "step1",
          serverName: "bad-stdio",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow(
        "missing runtime configuration for stdio transport",
      );
    });

    it("should throw when manifest not found", async () => {
      const mocks = setupMocks({ processRunning: false });
      mocks.mockRegistryClient.fetchManifest.mockResolvedValue(null);

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["unknown-server"] },
        steps: [{
          id: "step1",
          serverName: "unknown-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("Manifest not found");
    });

    it("should handle MCP client connection failure", async () => {
      const mocks = setupMocks({ processRunning: false });
      mocks.mockClient.connect.mockRejectedValue(new Error("Connection refused"));

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("Failed to create MCP client");
    });
  });

  // ==================== resolveInputs ====================

  describe("resolveInputs", () => {
    it("should use user-provided values", async () => {
      setupMocks();

      const workflow: Workflow = {
        ...defaultWorkflow,
        inputs: [
          { id: "name", type: "string", required: true },
          { id: "count", type: "number", required: true },
        ],
      };

      const result = await engine.execute(workflow, { name: "test", count: 42 });
      expect(result).toBeDefined();
    });

    it("should use default values when user input is missing", async () => {
      setupMocks();

      const workflow: Workflow = {
        ...defaultWorkflow,
        inputs: [
          { id: "name", type: "string", default: "default-name" },
        ],
      };

      await expect(engine.execute(workflow, {})).resolves.toBeDefined();
    });

    it("should throw error when required input is missing", async () => {
      setupMocks();

      const workflow: Workflow = {
        ...defaultWorkflow,
        inputs: [
          { id: "name", type: "string", required: true },
        ],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow("Missing required input: name");
    });
  });

  // ==================== loadRequiredSecrets / resolveOutputs ====================

  describe("loadRequiredSecrets / resolveOutputs", () => {
    it("should load secrets and make them available", async () => {
      const secrets = new Map<string, string>([["API_KEY", "secret-123"]]);
      const mocks = setupMocks({ secrets, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: { key: "{{secret.API_KEY}}" },
        }],
      };

      await engine.execute(workflow, {});

      expect(mocks.mockSecretManager.getAll).toHaveBeenCalled();
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith(
        "test_tool",
        expect.objectContaining({ key: "secret-123" }),
      );
    });

    it("should return context.state when workflow has no outputs", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
        outputs: undefined as any,
      };

      const result = await engine.execute(workflow, {});
      expect(result).toHaveProperty("step1");
    });

    it("should resolve outputs using ExpressionEvaluator", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [{
          id: "step1",
          serverName: "test-server",
          toolName: "test_tool",
          parameters: {},
        }],
        outputs: { finalResult: "{{step1}}" },
      };

      const result = await engine.execute(workflow, {});
      expect(result).toHaveProperty("finalResult");
    });
  });

  // ==================== mapServerIdToServerName ====================

  describe("mapServerIdToServerName", () => {
    it("should find exact match from tool registry", async () => {
      const runningServers = [
        { pid: 1, serverName: "my-server", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      mockFs.existsSync.mockReturnValue(true);
      mockFsPromises.readFile.mockResolvedValue(JSON.stringify({
        tools: [{ serverName: "legacy-id", actualServerName: "my-server" }],
      }));

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["my-server"] },
        steps: [{ id: "step1", serverId: "legacy-id", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should find exact match among running servers", async () => {
      const runningServers = [
        { pid: 1, serverName: "my-server", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["my-server"] },
        steps: [{ id: "step1", serverId: "my-server", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should map owner/project format", async () => {
      const runningServers = [
        { pid: 2, serverName: "12306-mcp", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["12306-mcp"] },
        steps: [{ id: "step1", serverId: "Joooook/12306-mcp", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should try name variations for owner/project format", async () => {
      const runningServers = [
        { pid: 4, serverName: "12306", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["12306"] },
        steps: [{ id: "step1", serverId: "Joooook/12306-mcp", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should map source:server-name format", async () => {
      const runningServers = [
        { pid: 5, serverName: "12306-mcp", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["12306-mcp"] },
        steps: [{ id: "step1", serverId: "github:12306-mcp", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should find partial matches", async () => {
      const runningServers = [
        { pid: 6, serverName: "file-system-server", status: "running" },
      ];
      const mocks = setupMocks({ runningServers, processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["file-system-server"] },
        steps: [{ id: "step1", serverId: "file-system", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should try to start the server if not found running", async () => {
      const mocks = setupMocks({ runningServers: [], processRunning: false });
      mocks.mockProcessManager.start.mockResolvedValue(789);
      mocks.mockProcessManager.get.mockResolvedValue({
        pid: 789,
        serverName: "started-server",
        status: "running",
      });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["started-server"] },
        steps: [{ id: "step1", serverId: "started-server", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});
      expect(mocks.mockProcessManager.start).toHaveBeenCalledWith("started-server");
      expect(mocks.mockClient.callTool).toHaveBeenCalledWith("test_tool", {});
    });

    it("should return null when all mapping strategies fail", async () => {
      setupMocks({ runningServers: [] });

      const workflow: Workflow = {
        ...defaultWorkflow,
        steps: [{ id: "step1", serverId: "completely-unknown-server", toolName: "test_tool", parameters: {} }],
      };

      await expect(engine.execute(workflow, {})).rejects.toThrow(
        "is missing serverName (and serverId could not be mapped)",
      );
    });
  });

  // ==================== Edge Cases ====================

  describe("edge cases", () => {
    it("should handle runtime.url fallback for transport URL", async () => {
      const manifest = {
        name: "url-fallback", version: "1.0.0",
        runtime: { type: "remote", url: "https://fallback.example.com/api" },
        transport: { type: "sse" },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["url-fallback"] },
        steps: [{ id: "step1", serverName: "url-fallback", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});

      expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          type: "sse",
          url: "https://fallback.example.com/api",
        }),
      }));
    });

    it("should pass headers when present in transport config", async () => {
      const manifest = {
        name: "auth-server", version: "1.0.0",
        runtime: { type: "remote" },
        transport: {
          type: "sse",
          url: "https://example.com/sse",
          headers: { Authorization: "Bearer token123" },
        },
      };
      setupMocks({ manifest, processRunning: false });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["auth-server"] },
        steps: [{ id: "step1", serverName: "auth-server", toolName: "test_tool", parameters: {} }],
      };

      await engine.execute(workflow, {});

      expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          headers: { Authorization: "Bearer token123" },
        }),
      }));
    });

    it("should handle multiple steps with same server", async () => {
      const mocks = setupMocks({ processRunning: true });

      const workflow: Workflow = {
        ...defaultWorkflow,
        requirements: { servers: ["test-server"] },
        steps: [
          { id: "step1", serverName: "test-server", toolName: "tool_a", parameters: {} },
          { id: "step2", serverName: "test-server", toolName: "tool_b", parameters: {} },
        ],
      };

      await engine.execute(workflow, {});

      expect(mocks.mockClient.callTool).toHaveBeenCalledTimes(2);
      expect(mocks.mockClient.callTool).toHaveBeenNthCalledWith(1, "tool_a", {});
      expect(mocks.mockClient.callTool).toHaveBeenNthCalledWith(2, "tool_b", {});
    });
  });
});
