/**
 * DaemonClient Unit Tests
 *
 * Tests for daemon client API methods:
 * - getStatus / startServer / stopServer
 * - listServers / getServerStatus / getServerLogs
 * - executeNaturalLanguage / parseIntent / executeSteps
 * - isDaemonRunning
 */

import { DaemonClient } from "../../packages/core/src/daemon/client.js";

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

describe("DaemonClient", () => {
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

  describe("getStatus()", () => {
    it("should return daemon status", async () => {
      const mockStatus = {
        running: true,
        pid: 12345,
        uptime: 5000,
        version: "0.8.0",
      };

      setupMockResponse(200, mockStatus);

      const status = await client.getStatus();
      expect(status.running).toBe(true);
      expect(status.pid).toBe(12345);
    });

    it("should throw on error response", async () => {
      setupMockResponse(500, {
        error: "Internal Error",
        message: "Server error",
      });

      await expect(client.getStatus()).rejects.toThrow("Server error");
    });
  });

  describe("startServer()", () => {
    it("should start a server and return process info", async () => {
      const mockResponseData = {
        pid: 12345,
        name: "test-server",
        status: "running",
        alreadyRunning: false,
      };

      setupMockResponse(201, mockResponseData);

      const result = await client.startServer("test-server");
      expect(result.pid).toBe(12345);
      expect(result.status).toBe("running");
    });
  });

  describe("stopServer()", () => {
    it("should stop a running server", async () => {
      setupMockResponse(200, {
        success: true,
        message: "Server stopped successfully",
        pid: 12345,
      });

      const result = await client.stopServer(12345);
      expect(result.success).toBe(true);
    });
  });

  describe("listServers()", () => {
    it("should return list of servers", async () => {
      const mockServers = {
        servers: [
          { pid: 12345, name: "server-1", status: "running" },
          { pid: 12346, name: "server-2", status: "stopped" },
        ],
      };

      setupMockResponse(200, mockServers);

      const result = await client.listServers();
      expect(result.servers).toHaveLength(2);
    });
  });

  describe("getServerStatus()", () => {
    it("should return server details by PID", async () => {
      const mockServer = {
        pid: 12345,
        name: "test-server",
        status: "running",
        manifest: { name: "test-server", version: "1.0.0" },
      };

      setupMockResponse(200, mockServer);

      const result = await client.getServerStatus(12345);
      expect(result.pid).toBe(12345);
    });
  });

  describe("getServerLogs()", () => {
    it("should return server logs", async () => {
      setupMockResponse(200, {
        pid: 12345,
        logs: "[INFO] Server started\n[INFO] Tool registered",
        logPath: "/tmp/test.log",
      });

      const result = await client.getServerLogs(12345);
      expect(result.logs).toContain("[INFO] Server started");
    });
  });

  describe("executeNaturalLanguage()", () => {
    it("should execute natural language query", async () => {
      setupMockResponse(200, {
        success: true,
        result: { message: "Query executed" },
      });

      const result = await client.executeNaturalLanguage("list all servers");
      expect(result.success).toBe(true);
    });
  });

  describe("parseIntent()", () => {
    it("should parse intent and return steps", async () => {
      setupMockResponse(200, {
        success: true,
        data: {
          steps: [{ serverName: "srv", toolName: "tool" }],
          status: "completed",
          confidence: 0.95,
        },
      });

      const result = await client.parseIntent("start server");
      expect(result.success).toBe(true);
      expect(result.data.steps).toHaveLength(1);
    });
  });

  describe("executeSteps()", () => {
    it("should execute pre-parsed steps", async () => {
      setupMockResponse(200, {
        success: true,
        results: [{ toolName: "tool-1", status: "success" }],
      });

      const result = await client.executeSteps([
        { serverName: "srv", toolName: "tool-1" },
      ]);
      expect(result.success).toBe(true);
    });
  });

  describe("isDaemonRunning()", () => {
    it("should return true when daemon is running", async () => {
      setupMockResponse(200, { running: true });

      const isRunning = await client.isDaemonRunning();
      expect(isRunning).toBe(true);
    });

    it("should return false when daemon is not running", async () => {
      mockRequestStream.on.mockImplementation(
        (event: string, handler: Function) => {
          if (event === "error") {
            handler(new Error("Connection refused"));
          }
          return mockRequestStream;
        },
      );

      const isRunning = await client.isDaemonRunning();
      expect(isRunning).toBe(false);
    });
  });

  describe("getDaemonPid()", () => {
    it("should return null when PID file doesn't exist", async () => {
      // Mock fs.readFile to throw
      jest.spyOn(require("fs/promises"), "readFile").mockRejectedValue(
        Object.assign(new Error("ENOENT"), { code: "ENOENT" }),
      );

      const pid = await DaemonClient.getDaemonPid();
      expect(pid).toBeNull();
    });
  });
});
