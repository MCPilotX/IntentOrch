/**
 * ProcessManager Unit Tests
 *
 * Tests for process lifecycle management:
 * - start/stop/list/get operations
 * - Status transitions
 * - Error handling
 * - External service management
 * - Orphan process adoption
 * - Tool discovery
 */

import { ProcessManager } from "../../packages/core/src/process-manager/manager.js";
import { getRegistryClient } from "../../packages/core/src/registry/client.js";
import { getSecretManager } from "../../packages/core/src/secret/manager.js";
import { getLogPath, ensureInTorchDir } from "../../packages/core/src/utils/paths.js";
import { isProcessRunningWithRetry } from "../../packages/core/src/utils/system.js";
import { MCPClient } from "../../packages/core/src/mcp/client.js";
import { getToolRegistry } from "../../packages/core/src/tool-registry/registry.js";
import { spawn } from "child_process";

// Mock all dependencies
jest.mock("../../packages/core/src/registry/client.js");
jest.mock("../../packages/core/src/secret/manager.js");
jest.mock("../../packages/core/src/utils/paths.js", () => ({
  getLogPath: jest.fn((id?: number) => `/tmp/test-log-${id || 0}.log`),
  ensureInTorchDir: jest.fn(),
  getProcessesPath: jest.fn(() => "/tmp/test-processes.json"),
  getInTorchDir: jest.fn(() => "/tmp/.intorch"),
}));
jest.mock("child_process", () => ({
  spawn: jest.fn(),
}));
jest.mock("../../packages/core/src/mcp/client.js");
jest.mock("../../packages/core/src/tool-registry/registry.js");
jest.mock("../../packages/core/src/utils/system.js", () => ({
  isProcessRunningWithRetry: jest.fn().mockResolvedValue(true),
}));
jest.mock("../../packages/core/src/utils/constants.js", () => ({
  PROGRAM_NAME: "intorch",
}));


describe("ProcessManager", () => {
  let processManager: ProcessManager;
  let mockSecretManager: { get: jest.Mock };
  let mockRegistryClient: { fetchManifest: jest.Mock };
  let mockMCPClient: { connect: jest.Mock; listTools: jest.Mock; disconnect: jest.Mock; on: jest.Mock };
  let mockToolRegistry: { registerDynamicTools: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();

    // Setup mock secret manager
    mockSecretManager = { get: jest.fn().mockResolvedValue(undefined) };
    (getSecretManager as jest.Mock).mockReturnValue(mockSecretManager);

    // Setup mock MCPClient
    mockMCPClient = {
      connect: jest.fn().mockResolvedValue(undefined),
      listTools: jest.fn().mockResolvedValue([]),
      disconnect: jest.fn().mockResolvedValue(undefined),
      on: jest.fn(),
    };
    (MCPClient as unknown as jest.Mock).mockImplementation(() => mockMCPClient);

    // Setup mock tool registry
    mockToolRegistry = { registerDynamicTools: jest.fn().mockResolvedValue(undefined) };
    (getToolRegistry as jest.Mock).mockReturnValue(mockToolRegistry);

    processManager = new ProcessManager();
  });

  describe("start()", () => {
    beforeEach(() => {
      // Default mock fetchManifest returns a stdio-based manifest
      mockRegistryClient = { fetchManifest: jest.fn().mockResolvedValue({
        name: "test-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: ["server.js"], env: [] },
        transport: { type: "stdio" },
      })};
      (getRegistryClient as jest.Mock).mockReturnValue(mockRegistryClient);
    });

    it("should return existing PID when server is already running", async () => {
      const existingPid = 999;
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([
        { pid: existingPid, serverName: "my-server", name: "test-server",
          version: "1.0.0", status: "running",
          manifest: { name: "test-server", version: "1.0.0",
            runtime: { type: "node", command: "node", args: [], env: [] } },
          startTime: Date.now() },
      ]);
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const pid = await processManager.start("my-server");
      expect(pid).toBe(existingPid);
    });

    it("should start external service for http/sse transport", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "ext-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "sse", url: "http://localhost:3000/sse" },
      });
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const pid = await processManager.start("ext-server");
      expect(pid).toBeLessThan(0);
      expect(mockMCPClient.connect).toHaveBeenCalled();
    });
    it("should spawn a process and return positive PID for stdio transport", async () => {
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue(undefined);

      const mockChild = {
        pid: 12345,
        stdin: { end: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        unref: jest.fn(),
        exitCode: null,
        signalCode: null,
        connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      const pid = await processManager.start("test-server");
      expect(pid).toBe(12345);
      expect(spawn).toHaveBeenCalledWith("node", ["server.js"], expect.objectContaining({ shell: false }));
    });

    it("should throw error when required secret is missing", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "secret-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: ["MY_SECRET"] },
        transport: { type: "stdio" },
      });
      mockSecretManager.get.mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      await expect(processManager.start("secret-server")).rejects.toThrow(
        /requires secret \[MY_SECRET\] which is not set/
      );
    });
    it("should set status to running after successful spawn", async () => {
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const mockChild = {
        pid: 12345,
        stdin: { end: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        unref: jest.fn(),
        exitCode: null,
        signalCode: null,
        connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await processManager.start("test-server");
      expect((processManager as any).store.addProcess).toHaveBeenCalledWith(
        expect.objectContaining({ pid: 12345, status: "running" })
      );
    });

    it("should set status to stopped when process exits immediately", async () => {
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);
      (isProcessRunningWithRetry as jest.Mock).mockResolvedValueOnce(false);

      const mockChild = {
        pid: 12345,
        stdin: { end: jest.fn() },
        on: jest.fn(),
        kill: jest.fn(),
        unref: jest.fn(),
        exitCode: 1,
        signalCode: null,
        connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await processManager.start("test-server");
      expect((processManager as any).store.updateProcess).toHaveBeenCalledWith(
        12345, { status: "stopped" }
      );
    });
  });
  describe("startExternalService()", () => {
    it("should throw error when URL is missing", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "no-url-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "http" },
      });
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      await expect(processManager.start("no-url-server")).rejects.toThrow(/missing URL/);
    });

    it("should resolve $SECRET in headers", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "secret-header-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "sse", url: "http://localhost:3000/sse", headers: { Authorization: "$API_KEY" } },
      });
      mockSecretManager.get.mockResolvedValue("my-secret-value");
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      const pid = await processManager.start("secret-header-server");
      expect(pid).toBeLessThan(0);
      expect(MCPClient).toHaveBeenCalledWith(expect.objectContaining({
        transport: expect.objectContaining({
          headers: expect.objectContaining({ Authorization: "my-secret-value" }),
        }),
      }));
    });

    it("should register tools when connection succeeds and tools are returned", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "tool-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "sse", url: "http://localhost:3000/sse" },
      });
      mockMCPClient.listTools.mockResolvedValue([
        { name: "tool1", description: "desc1", inputSchema: {} },
      ]);
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      await processManager.start("tool-server");
      expect(mockToolRegistry.registerDynamicTools).toHaveBeenCalledWith(
        "tool-server",
        expect.arrayContaining([expect.objectContaining({ name: "tool1" })])
      );
    });

    it("should throw error when connection fails", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "failing-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "sse", url: "http://localhost:3000/sse" },
      });
      mockMCPClient.connect.mockRejectedValue(new Error("Connection refused"));
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      await expect(processManager.start("failing-server")).rejects.toThrow(
        /Cannot connect to external service/
      );
    });

    it("should generate a negative virtual PID", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "vpid-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: [], env: [] },
        transport: { type: "sse", url: "http://localhost:3000/sse" },
      });
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);

      const pid = await processManager.start("vpid-server");
      expect(pid).toBeLessThan(0);
      expect(pid).toBeGreaterThan(-100001);
    });
  });
  describe("discoverToolsIfSupported()", () => {
    it("should skip discovery when manifest has tools", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "static-tool-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: ["server.js"], env: [] },
        tools: [{ name: "builtin", description: "Builtin tool", inputSchema: {} }],
      });
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const mockChild = {
        pid: 12345, stdin: { end: jest.fn() }, on: jest.fn(),
        kill: jest.fn(), unref: jest.fn(),
        exitCode: null, signalCode: null, connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await processManager.start("static-tool-server");
      expect(mockMCPClient.connect).toHaveBeenCalledTimes(0);
    });

    it("should dynamically discover tools and register them", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "dynamic-tool-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: ["server.js"], env: [] },
      });
      mockMCPClient.listTools.mockResolvedValue([
        { name: "dyn-tool", description: "Dynamic tool", inputSchema: {} },
      ]);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const mockChild = {
        pid: 12345, stdin: { end: jest.fn() }, on: jest.fn(),
        kill: jest.fn(), unref: jest.fn(),
        exitCode: null, signalCode: null, connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await processManager.start("dynamic-tool-server");
      expect(mockToolRegistry.registerDynamicTools).toHaveBeenCalledWith(
        "dynamic-tool-server",
        expect.arrayContaining([expect.objectContaining({ name: "dyn-tool" })])
      );
    });

    it("should not throw when dynamic discovery connect fails", async () => {
      mockRegistryClient.fetchManifest.mockResolvedValue({
        name: "fail-disc-server",
        version: "1.0.0",
        runtime: { type: "node", command: "node", args: ["server.js"], env: [] },
      });
      mockMCPClient.connect.mockRejectedValueOnce(new Error("Discovery failed"));
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const mockChild = {
        pid: 12345, stdin: { end: jest.fn() }, on: jest.fn(),
        kill: jest.fn(), unref: jest.fn(),
        exitCode: null, signalCode: null, connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);

      await expect(processManager.start("fail-disc-server")).resolves.toBe(12345);
    });
  });
  describe("stop()", () => {
    it("should deregister external service without killing process", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({
        pid: -42, name: "ext-service", external: true, status: "running",
      });
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.stop(-42);
      expect((processManager as any).store.updateProcess).toHaveBeenCalledWith(
        -42, { status: "stopped" }
      );
    });

    it("should kill process with SIGTERM then SIGKILL if still running", async () => {
      const mockChild = {
        pid: 12345,
        kill: jest.fn(),
        on: jest.fn(),
        unref: jest.fn(),
        stdin: { end: jest.fn() },
        exitCode: null as number | null,
        signalCode: null,
        connected: true,
      };
      (spawn as jest.Mock).mockReturnValue(mockChild);
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({
        pid: 12345, name: "test", status: "running",
      });
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.listProcesses = jest.fn().mockResolvedValue([]);
      (processManager as any).store.addProcess = jest.fn().mockResolvedValue(undefined);
      await processManager.start("test-server");

      jest.clearAllMocks();
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({
        pid: 12345, name: "test", status: "running",
      });
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      const handle = (processManager as any).processes.get(12345);
      handle.exitCode = null;

      await processManager.stop(12345);
      expect(mockChild.kill).toHaveBeenCalledWith("SIGTERM");
      expect(mockChild.kill).toHaveBeenCalledWith("SIGKILL");
    });

    it("should use system kill when PID not in processes map", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({
        pid: 99999, name: "orphan", status: "running",
      });
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.stop(99999);
      expect((processManager as any).store.updateProcess).toHaveBeenCalledWith(
        99999, { status: "stopped" }
      );
    });

    it("should handle non-existent PID gracefully", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue(undefined);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await expect(processManager.stop(99999)).resolves.toBeUndefined();
    });
  });
  describe("list/listRunning/get/getByServerName", () => {
    it("list() should delegate to store.listProcesses", async () => {
      const mockList = jest.fn().mockResolvedValue([{ pid: 1, name: "p1" }]);
      (processManager as any).store.listProcesses = mockList;

      const result = await processManager.list();
      expect(mockList).toHaveBeenCalled();
      expect(result).toEqual([{ pid: 1, name: "p1" }]);
    });

    it("listRunning() should delegate to store.listRunningProcesses", async () => {
      const mockListRunning = jest.fn().mockResolvedValue([{ pid: 1, name: "p1" }]);
      (processManager as any).store.listRunningProcesses = mockListRunning;

      const result = await processManager.listRunning();
      expect(mockListRunning).toHaveBeenCalled();
      expect(result).toEqual([{ pid: 1, name: "p1" }]);
    });

    it("get() should delegate to store.getProcess", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({ pid: 42, name: "p42" });

      const result = await processManager.get(42);
      expect(result).toEqual({ pid: 42, name: "p42" });
    });

    it("getByServerName() should delegate to store.getProcessByServerName", async () => {
      (processManager as any).store.getProcessByServerName = jest.fn().mockResolvedValue({ pid: 1, serverName: "my-server" });

      const result = await processManager.getByServerName("my-server");
      expect(result).toEqual({ pid: 1, serverName: "my-server" });
    });
  });
  describe("getProcessHandle/isRunning/cleanup", () => {
    it("getProcessHandle should return undefined for unknown PID", () => {
      expect((processManager as any).getProcessHandle(999)).toBeUndefined();
    });

    it("getProcessHandle should return handle for known PID", () => {
      const mockChild = { pid: 1, exitCode: null };
      (processManager as any).processes.set(1, mockChild);

      expect((processManager as any).getProcessHandle(1)).toBe(mockChild);
    });

    it("isRunning should return true when process has null exitCode", async () => {
      (processManager as any).processes.set(1, { pid: 1, exitCode: null });

      const running = await processManager.isRunning(1);
      expect(running).toBe(true);
    });

    it("isRunning should return false when process has non-null exitCode", async () => {
      (processManager as any).processes.set(1, { pid: 1, exitCode: 0 });

      const running = await processManager.isRunning(1);
      expect(running).toBe(false);
    });

    it("isRunning should fall back to store status when not in map", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue({ pid: 2, status: "running" });

      const running = await processManager.isRunning(2);
      expect(running).toBe(true);
    });

    it("isRunning should return false when PID not in map and store returns undefined", async () => {
      (processManager as any).store.getProcess = jest.fn().mockResolvedValue(undefined);

      const running = await processManager.isRunning(2);
      expect(running).toBe(false);
    });

    it("cleanup should clear stopped processes from store and map", async () => {
      (processManager as any).store.clearStoppedProcesses = jest.fn().mockResolvedValue(undefined);
      (processManager as any).processes.set(1, { pid: 1, exitCode: 0 });
      (processManager as any).processes.set(2, { pid: 2, exitCode: null });

      await processManager.cleanup();

      expect((processManager as any).store.clearStoppedProcesses).toHaveBeenCalled();
      expect((processManager as any).processes.has(1)).toBe(false);
      expect((processManager as any).processes.has(2)).toBe(true);
    });

    it("getProcessHandleByServerName should return handle when server found", async () => {
      (processManager as any).store.getProcessByServerName = jest.fn().mockResolvedValue({ pid: 42, serverName: "srv" });
      const mockChild = { pid: 42 };
      (processManager as any).processes.set(42, mockChild);

      const result = await (processManager as any).getProcessHandleByServerName("srv");
      expect(result).toBe(mockChild);
    });

    it("getProcessHandleByServerName should return undefined when server not found", async () => {
      (processManager as any).store.getProcessByServerName = jest.fn().mockResolvedValue(undefined);

      const result = await (processManager as any).getProcessHandleByServerName("unknown");
      expect(result).toBeUndefined();
    });
  });
  describe("adoptOrphanProcesses()", () => {
    it("should skip external services", async () => {
      (processManager as any).store.listRunningProcesses = jest.fn().mockResolvedValue([
        { pid: -1, name: "ext", external: true, url: "http://ext", status: "running" },
      ]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.adoptOrphanProcesses();
      expect((processManager as any).store.updateProcess).not.toHaveBeenCalled();
    });

    it("should skip processes that already have a handle", async () => {
      const mockChild = { pid: 42 };
      (processManager as any).processes.set(42, mockChild);
      (processManager as any).store.listRunningProcesses = jest.fn().mockResolvedValue([
        { pid: 42, name: "existing", status: "running" },
      ]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.adoptOrphanProcesses();
      expect((processManager as any).store.updateProcess).not.toHaveBeenCalled();
    });

    it("should mark orphan as stopped if not alive", async () => {
      (isProcessRunningWithRetry as jest.Mock).mockResolvedValueOnce(false);
      (processManager as any).store.listRunningProcesses = jest.fn().mockResolvedValue([
        { pid: 77, name: "dead-orphan", status: "running" },
      ]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.adoptOrphanProcesses();
      expect((processManager as any).store.updateProcess).toHaveBeenCalledWith(
        77, { status: "stopped" }
      );
    });

    it("should create empty handle for alive orphan", async () => {
      (isProcessRunningWithRetry as jest.Mock).mockResolvedValueOnce(true);
      (processManager as any).store.listRunningProcesses = jest.fn().mockResolvedValue([
        { pid: 88, name: "alive-orphan", status: "running" },
      ]);
      (processManager as any).store.updateProcess = jest.fn().mockResolvedValue(undefined);

      await processManager.adoptOrphanProcesses();
      expect((processManager as any).processes.get(88)).toBeDefined();
      expect((processManager as any).processes.get(88).pid).toBe(88);
    });
  });
});
