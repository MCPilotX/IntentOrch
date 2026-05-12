/**
 * ProcessManager Unit Tests
 *
 * Tests for process lifecycle management:
 * - start/stop/list/get operations
 * - Status transitions
 * - Error handling
 */

import { ProcessManager } from "../process-manager/manager.js";
import { getRegistryClient } from "../registry/client.js";

// Mock dependencies
jest.mock("../registry/client.js");
jest.mock("../utils/paths.js", () => ({
  getLogPath: jest.fn(() => "/tmp/test-log.log"),
  getProcessesPath: jest.fn(() => "/tmp/.intorch/processes.json"),
  ensureInTorchDir: jest.fn(),
}));

// Mock fs/promises to prevent actual file I/O
jest.mock("fs/promises", () => ({
  readFile: jest.fn().mockRejectedValue({ code: "ENOENT" }),
  writeFile: jest.fn().mockResolvedValue(undefined),
  stat: jest.fn().mockRejectedValue({ code: "ENOENT" }),
  unlink: jest.fn().mockResolvedValue(undefined),
}));

describe("ProcessManager", () => {
  let processManager: ProcessManager;

  beforeEach(() => {
    jest.clearAllMocks();
    processManager = new ProcessManager();
  });

  describe("list()", () => {
    it("should return empty list when no processes exist", async () => {
      const processes = await processManager.list();
      expect(processes).toEqual([]);
    });

    it("should return all stored processes", async () => {
      // Directly mock the store's listProcesses method
      const mockProcesses = [
        { pid: 12345, name: "test-server-1", status: "running" },
        { pid: 12346, name: "test-server-2", status: "stopped" },
      ];

      (processManager as any).store.listProcesses = jest
        .fn()
        .mockResolvedValue(mockProcesses);

      const processes = await processManager.list();
      expect(processes).toHaveLength(2);
      expect(processes[0].name).toBe("test-server-1");
    });
  });

  describe("get()", () => {
    it("should return undefined for non-existent process", async () => {
      (processManager as any).store.getProcess = jest
        .fn()
        .mockResolvedValue(undefined);

      const result = await processManager.get(99999);
      expect(result).toBeUndefined();
    });

    it("should return process info for existing PID", async () => {
      const mockProcess = {
        pid: 12345,
        name: "test-server",
        status: "running",
      };
      (processManager as any).store.getProcess = jest
        .fn()
        .mockResolvedValue(mockProcess);

      const result = await processManager.get(12345);
      expect(result).toEqual(mockProcess);
    });
  });

  describe("start()", () => {
    it("should throw error for empty server name", async () => {
      await expect(processManager.start("")).rejects.toThrow();
    });

    it("should throw error when manifest fetch fails", async () => {
      (getRegistryClient as jest.Mock).mockReturnValue({
        fetchManifest: jest
          .fn()
          .mockRejectedValue(new Error("Manifest not found")),
      });

      await expect(
        processManager.start("non-existent-server"),
      ).rejects.toThrow("Manifest not found");
    });
  });

  describe("stop()", () => {
    it("should handle non-existent PID gracefully", async () => {
      (processManager as any).store.getProcess = jest
        .fn()
        .mockResolvedValue(undefined);

      // stop() does not throw for non-existent PIDs, it just logs
      await expect(processManager.stop(99999)).resolves.not.toThrow();
    });

    it("should handle already stopped process gracefully", async () => {
      const mockProcess = {
        pid: 12345,
        name: "test-server",
        status: "stopped",
      };
      (processManager as any).store.getProcess = jest
        .fn()
        .mockResolvedValue(mockProcess);

      // Should not throw for already stopped
      await expect(processManager.stop(12345)).resolves.not.toThrow();
    });
  });
});
