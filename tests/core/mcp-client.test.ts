import { MCPClient } from "../../packages/core/src/mcp/client";
import type { MCPClientConfig } from "../../packages/core/src/mcp/types";
import { ParameterMapper } from "../../packages/core/src/mcp/parameter-mapper";

const mockConnect = jest.fn();
const mockDisconnect = jest.fn();
let mockSend: jest.Mock;
mockSend = jest.fn();
const mockIsConnected = jest.fn().mockReturnValue(true);
const mockOn = jest.fn();

let ebFail = false;
let ebError: any = null;

jest.mock("../../packages/core/src/mcp/stdio-transport", () => ({
  StdioTransport: jest.fn().mockImplementation(() => ({
    connect: mockConnect, disconnect: mockDisconnect, send: mockSend,
    isConnected: mockIsConnected, on: mockOn, emit: jest.fn(),
  })),
}));
jest.mock("../../packages/core/src/mcp/http-transport", () => ({
  HttpTransport: jest.fn().mockImplementation(() => ({
    connect: jest.fn(), disconnect: jest.fn(), send: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true), on: jest.fn(), emit: jest.fn(),
  })),
}));
jest.mock("../../packages/core/src/mcp/sse-transport", () => ({
  SseTransport: jest.fn().mockImplementation(() => ({
    connect: jest.fn(), disconnect: jest.fn(), send: jest.fn(),
    isConnected: jest.fn().mockReturnValue(true), on: jest.fn(), emit: jest.fn(),
  })),
}));
jest.mock("../../packages/core/src/kernel/error-boundary", () => ({
  ErrorBoundary: class { async execute(fn: any) { if (ebFail) return { success: false, error: ebError }; try { return { success: true, result: await fn() }; } catch (e) { return { success: false, error: e }; } } },
  globalErrorBoundary: { async execute(fn: any) { if (ebFail) return { success: false, error: ebError }; try { return { success: true, result: await fn() }; } catch (e) { return { success: false, error: e }; } } },
}));
jest.mock("../../packages/core/src/mcp/parameter-mapper", () => ({ ParameterMapper: { validateAndNormalize: jest.fn() } }));

function cfg(o: Partial<MCPClientConfig> = {}): MCPClientConfig {
  return { transport: { type: "stdio", command: "npx", args: [] }, serverName: "test", timeout: 5000, maxRetries: 2, ...o };
}

function handlerFor(method: string): ((msg: any) => void) | undefined {
  const entry = mockOn.mock.calls.find((c: any[]) => c[0] === "message");
  return entry ? entry[1] : undefined;
}

function setupClient() {
  const c = new MCPClient(cfg());
  (c as any).connected = true;
  mockSend.mockImplementation(async (req: any) => {
    const h = handlerFor(req.method);
    if (req.method === "initialize" && h) h({ jsonrpc: "2.0", id: req.id, result: { serverInfo: { name: "t", version: "1" } } });
    else if (req.method === "tools/list" && h) h({ jsonrpc: "2.0", id: req.id, result: { tools: [{ name: "greet", description: "Say hi", inputSchema: { type: "object", properties: { n: { type: "string" } }, required: [] } }] } });
    else if (req.method === "tools/call" && h) h({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: "Hello!" }] } });
    else if (req.method === "resources/list" && h) h({ jsonrpc: "2.0", id: req.id, result: { resources: [{ uri: "file:///test", name: "Test" }] } });
    else if (req.method === "prompts/list" && h) h({ jsonrpc: "2.0", id: req.id, result: { prompts: [{ name: "gp" }] } });
  });
  return c;
}

describe("MCPClient", () => {
  let client: MCPClient;
  beforeEach(() => { jest.clearAllMocks(); ebFail = false; ebError = null; });

  describe("constructor", () => {
    test("creates stdio", () => { expect(new MCPClient(cfg())).toBeInstanceOf(MCPClient); });
    test("creates http", () => { expect(new MCPClient(cfg({ transport: { type: "http", url: "http://localhost:8080" } }))).toBeInstanceOf(MCPClient); });
    test("creates sse", () => { expect(new MCPClient(cfg({ transport: { type: "sse", url: "http://localhost:8080/sse" } }))).toBeInstanceOf(MCPClient); });
    test("throws unknown transport", () => { expect(() => new MCPClient(cfg({ transport: { type: "unknown" as any } }))).toThrow("not supported"); });
    test("sets up listeners", () => { new MCPClient(cfg()); expect(mockOn).toHaveBeenCalledWith("message", expect.any(Function)); });
    test("default config", () => {
      const c = new MCPClient({ transport: { type: "stdio", command: "npx", args: [] }, serverName: "t" } as any);
      expect((c as any).config.timeout).toBe(60000);
      expect((c as any).config.maxRetries).toBe(3);
    });
  });

  describe("connect", () => {
    test("full flow", async () => {
      client = new MCPClient(cfg());
      (client as any).connected = true;
      mockSend.mockImplementation(async (req: any) => { if (req.method === "initialize") { handlerFor("initialize")?.({ jsonrpc: "2.0", id: req.id, result: { serverInfo: {} } }); } });
      await client.connect();
      expect(client.isConnected()).toBe(true);
    });
    test("skip if connected", async () => {
      client = setupClient(); await client.connect();
      mockConnect.mockClear(); mockSend.mockClear();
      await client.connect();
      expect(mockConnect).not.toHaveBeenCalled();
    });
    test("eb fail", async () => {
      client = new MCPClient(cfg()); ebFail = true; ebError = new Error("refused");
      await expect(client.connect()).rejects.toThrow("refused");
    });
  });

  describe("disconnect", () => {
    test("success", async () => {
      client = setupClient(); await client.connect();
      await client.disconnect();
      expect(mockDisconnect).toHaveBeenCalled();
    });
    test("skip if not connected", async () => {
      client = new MCPClient(cfg()); await client.disconnect();
      expect(mockDisconnect).not.toHaveBeenCalled();
    });
    test("transport error still cleans up", async () => {
      client = setupClient(); await client.connect();
      mockDisconnect.mockRejectedValue(new Error("EPIPE"));
      await expect(client.disconnect()).resolves.toBeUndefined();
    });
  });

  describe("listTools", () => {
    test("success", async () => { client = setupClient(); await client.connect(); expect((await client.listTools())[0].name).toBe("greet"); });
    test("eb fail", async () => { client = setupClient(); await client.connect(); ebFail = true; await expect(client.listTools()).rejects.toThrow(); });
  });

  describe("callTool", () => {
    test("success", async () => { client = setupClient(); await client.connect(); await client.listTools(); expect((await client.callTool("greet", { n: "World" })).content[0].text).toBe("Hello!"); });
    test("param mapping fail", async () => {
      (ParameterMapper.validateAndNormalize as jest.Mock).mockImplementation(() => { throw new Error("map fail"); });
      client = setupClient(); await client.connect(); await client.listTools();
      const r = await client.callTool("greet", { n: "World" });
      expect(r.content[0].text).toBe("Hello!");
    });
    test("isError retryable", async () => {
      client = setupClient({ maxRetries: 3 } as any); await client.connect(); await client.listTools();
      mockSend.mockImplementation(async (req: any) => {
        if (req.method === "tools/call") {
          handlerFor("tools/call")?.({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: "timeout" }], isError: true } });
        }
      });
      await expect(client.callTool("greet", {})).rejects.toThrow();
    }, 10000);
    test("isError non-retryable", async () => {
      client = setupClient(); await client.connect(); await client.listTools();
      mockSend.mockImplementation(async (req: any) => {
        if (req.method === "tools/call") handlerFor("tools/call")?.({ jsonrpc: "2.0", id: req.id, result: { content: [{ type: "text", text: "invalid" }], isError: true } });
      });
      await expect(client.callTool("greet", {})).rejects.toThrow("invalid");
    }, 10000);
    test("eb fail", async () => { client = setupClient(); await client.connect(); await client.listTools(); ebFail = true; await expect(client.callTool("greet", {})).rejects.toThrow(); });
  });

  describe("resources", () => {
    test("list", async () => { client = setupClient(); await client.connect(); expect((await client.listResources())[0].name).toBe("Test"); });
    test("list eb fail", async () => { client = setupClient(); await client.connect(); ebFail = true; await expect(client.listResources()).rejects.toThrow(); });
    test("read", async () => {
      client = setupClient(); await client.connect();
      mockSend.mockImplementation(async (req: any) => { if (req.method === "resources/read") handlerFor("resources/read")?.({ jsonrpc: "2.0", id: req.id, result: { contents: [{ uri: "f", text: "d" }] } }); });
      expect(await client.readResource("f")).toBeDefined();
    });
    test("read eb fail", async () => { client = setupClient(); await client.connect(); ebFail = true; await expect(client.readResource("f")).rejects.toThrow(); });
    test("refreshResources", async () => { client = setupClient(); const s = jest.spyOn(client, "listResources").mockResolvedValue([]); await client.refreshResources(); expect(s).toHaveBeenCalled(); });
    test("getResources", () => { expect(new MCPClient(cfg()).getResources()).toEqual([]); });
  });

  describe("prompts", () => {
    test("list", async () => { client = setupClient(); await client.connect(); expect((await client.listPrompts())[0].name).toBe("gp"); });
    test("list eb fail", async () => { client = setupClient(); await client.connect(); ebFail = true; await expect(client.listPrompts()).rejects.toThrow(); });
    test("get", async () => {
      client = setupClient(); await client.connect();
      mockSend.mockImplementation(async (req: any) => { if (req.method === "prompts/get") handlerFor("prompts/get")?.({ jsonrpc: "2.0", id: req.id, result: { messages: [] } }); });
      expect(await client.getPrompt("gp")).toBeDefined();
    });
    test("get eb fail", async () => { client = setupClient(); await client.connect(); ebFail = true; await expect(client.getPrompt("gp")).rejects.toThrow(); });
    test("getPrompts", () => { expect(new MCPClient(cfg()).getPrompts()).toEqual([]); });
  });

  describe("utils", () => {
    test("refreshTools", async () => { client = setupClient(); const s = jest.spyOn(client, "listTools").mockResolvedValue([]); await client.refreshTools(); expect(s).toHaveBeenCalled(); });
    test("getTools", () => { expect(new MCPClient(cfg()).getTools()).toEqual([]); });
    test("findTool", () => { expect((new MCPClient(cfg()) as any).findTool("x")).toBeUndefined(); });
    test("isRetryableError", () => {
      expect((new MCPClient(cfg()) as any).isRetryableError("timeout")).toBe(true);
      expect((new MCPClient(cfg()) as any).isRetryableError("network")).toBe(true);
      expect((new MCPClient(cfg()) as any).isRetryableError("connection")).toBe(true);
      expect((new MCPClient(cfg()) as any).isRetryableError("rate limit")).toBe(true);
      expect((new MCPClient(cfg()) as any).isRetryableError("server error")).toBe(true);
      expect((new MCPClient(cfg()) as any).isRetryableError("invalid")).toBe(false);
    });
    test("getStatus", () => {
      const s = new MCPClient(cfg()).getStatus();
      expect(s).toHaveProperty("connected");
      expect(s).toHaveProperty("toolsCount");
      expect(s).toHaveProperty("sessionId");
    });
  });

  describe("msg handling", () => {
    test("resolve success", () => {
      client = new MCPClient(cfg());
      const r = jest.fn();
      (client as any).pendingRequests.set(1, { resolve: r, reject: jest.fn(), timeout: setTimeout(() => {}, 100) });
      (client as any).handleTransportMessage({ jsonrpc: "2.0", id: 1, result: "ok" });
      expect(r).toHaveBeenCalledWith("ok");
    });
    test("reject error", () => {
      client = new MCPClient(cfg());
      const rj = jest.fn();
      (client as any).pendingRequests.set(1, { resolve: jest.fn(), reject: rj, timeout: setTimeout(() => {}, 100) });
      (client as any).handleTransportMessage({ jsonrpc: "2.0", id: 1, error: { code: -1, message: "err" } });
      expect(rj).toHaveBeenCalledWith(expect.objectContaining({ message: "err" }));
    });
    test("ignore notification", () => {
      client = new MCPClient(cfg());
      (client as any).handleTransportMessage({ jsonrpc: "2.0", id: null, result: {} });
    });
    test("ignore invalid", () => {
      client = new MCPClient(cfg());
      (client as any).handleTransportMessage(null);
      (client as any).handleTransportMessage("bad");
    });
  });

  describe("events", () => {
    test("transport connected", () => {
      client = new MCPClient(cfg());
      const h = mockOn.mock.calls.find((c: any[]) => c[0] === "connected")?.[1];
      h?.();
      expect(client.isConnected()).toBe(true);
    });
    test("transport disconnected", () => {
      client = new MCPClient(cfg());
      (client as any).connected = true;
      const h = mockOn.mock.calls.find((c: any[]) => c[0] === "disconnected")?.[1];
      h?.();
      expect(client.isConnected()).toBe(false);
    });
  });

  describe("sendRequest", () => {
    test("not connected", async () => { client = new MCPClient(cfg()); await expect((client as any).sendRequest("t")).rejects.toThrow("Not connected"); });
    test("timeout", async () => {
      client = new MCPClient(cfg({ timeout: 10 }));
      (client as any).connected = true;
      await expect((client as any).sendRequest("t")).rejects.toThrow("timeout");
    }, 500);
    test("send fail", async () => {
      client = new MCPClient(cfg({ timeout: 5000 }));
      (client as any).connected = true;
      mockSend.mockRejectedValue(new Error("send fail"));
      await expect((client as any).sendRequest("t")).rejects.toThrow("send fail");
    });
  });

  describe("sendNotification", () => {
    test("without params", async () => {
      client = new MCPClient(cfg());
      (client as any).connected = true;
      mockSend.mockResolvedValue(undefined);
      await (client as any).sendNotification("n/t");
      expect(mockSend.mock.calls[0][0]).not.toHaveProperty("params");
    });
    test("with params", async () => {
      client = new MCPClient(cfg());
      (client as any).connected = true;
      mockSend.mockResolvedValue(undefined);
      await (client as any).sendNotification("n/t", { k: "v" });
      expect(mockSend.mock.calls[0][0].params).toEqual({ k: "v" });
    });
  });

  describe("destroy", () => {
    test("cleanup", () => {
      client = new MCPClient(cfg());
      const s = jest.spyOn(client, "disconnect").mockResolvedValue(undefined);
      client.destroy();
      expect(s).toHaveBeenCalled();
    });
  });

  describe("withRetry", () => {
    test("success", async () => { expect(await (new MCPClient(cfg()) as any).withRetry(() => Promise.resolve("ok"))).toBe("ok"); });
    test("retry then success", async () => {
      let a = 0;
      expect(await (new MCPClient(cfg({ maxRetries: 3 })) as any).withRetry(() => { a++; return a > 2 ? Promise.resolve("ok") : Promise.reject(new Error("fail")); })).toBe("ok");
    }, 10000);
    test("exhausted", async () => {
      await expect((new MCPClient(cfg({ maxRetries: 2 })) as any).withRetry(() => Promise.reject(new Error("always")))).rejects.toThrow("always");
    }, 10000);
  });
});
