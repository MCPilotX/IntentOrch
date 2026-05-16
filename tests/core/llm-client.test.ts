import { LLMClient } from "../../packages/core/src/ai/llm-client";
import { ProviderRegistry } from "../../packages/core/src/ai/providers/index";

const mockChat = jest.fn();
const mockConfigure = jest.fn();
const mockGetModel = jest.fn().mockReturnValue("gpt-4");
const mockTestConnection = jest.fn();

jest.mock("../../packages/core/src/ai/providers/index", () => ({
  ProviderRegistry: {
    has: jest.fn(),
    create: jest.fn(),
    getRegisteredProviders: jest.fn().mockReturnValue(["openai", "anthropic"]),
  },
}));

// Helper for default AIConfig
function aiCfg(overrides: Partial<{ provider: string; apiKey: string }> = {}) {
  return { provider: "openai", model: "gpt-4", apiKey: "sk-test", ...overrides } as any;
}

jest.mock("../../packages/core/src/telemetry/index", () => ({
  telemetry: {
    tracer: {
      getActiveSpan: jest.fn().mockReturnValue(null),
      startSpan: jest.fn().mockReturnValue({ spanId: "s1", traceId: "t1" }),
      addEvent: jest.fn(),
      endSpan: jest.fn(),
    },
    promptRecorder: { recordAIRecord: jest.fn() },
    metrics: { timing: jest.fn(), increment: jest.fn() },
  },
}));

describe("LLMClient", () => {
  let client: LLMClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new LLMClient();
    (ProviderRegistry.has as jest.Mock).mockReturnValue(true);
    (ProviderRegistry.create as jest.Mock).mockReturnValue({
      chat: mockChat, configure: mockConfigure, getModel: mockGetModel, testConnection: mockTestConnection,
    });
  });

  describe("configure", () => {
    it("should configure with valid provider", () => {
      client.configure(aiCfg());
      expect(ProviderRegistry.create).toHaveBeenCalledWith("openai");
      expect(client.isConfigured()).toBe(true);
    });

    it("should set null when provider is 'none'", () => {
      client.configure({ provider: "none", model: "gpt-4" } as any);
      expect(client.isConfigured()).toBe(false);
      expect(client.getProvider()).toBe("none");
    });

    it("should throw for unsupported provider", () => {
      (ProviderRegistry.has as jest.Mock).mockReturnValue(false);
      expect(() => client.configure({ provider: "bad", model: "gpt-4" } as any)).toThrow("Unsupported provider");
    });
  });

  describe("isConfigured", () => {
    it("should return false initially", () => { expect(client.isConfigured()).toBe(false); });
    it("should return true after valid config", () => {
      client.configure(aiCfg());
      expect(client.isConfigured()).toBe(true);
    });
  });

  describe("getProvider / getModel", () => {
    it("should default to 'none'", () => { expect(client.getProvider()).toBe("none"); });
    it("should return provider name", () => {
      client.configure(aiCfg({ provider: "anthropic" }));
      expect(client.getProvider()).toBe("anthropic");
    });
    it("should return model from provider", () => {
      client.configure(aiCfg());
      expect(client.getModel()).toBe("gpt-4");
    });
    it("should return 'unknown' when no provider", () => { expect(client.getModel()).toBe("unknown"); });
  });

  describe("testConnection", () => {
    it("should succeed when connected", async () => {
      mockTestConnection.mockResolvedValue({ success: true, message: "OK" });
      client.configure(aiCfg());
      expect((await client.testConnection()).success).toBe(true);
    });
    it("should fail when not configured", async () => {
      expect((await client.testConnection()).success).toBe(false);
    });
    it("should handle errors", async () => {
      mockTestConnection.mockRejectedValue(new Error("fail"));
      client.configure(aiCfg());
      const r = await client.testConnection();
      expect(r.success).toBe(false);
      expect(r.message).toContain("fail");
    });
  });

  describe("chat", () => {
    beforeEach(() => { mockChat.mockResolvedValue({ text: "Hi", raw: {}, provider: "openai", model: "gpt-4" }); });

    it("should throw when not configured", async () => {
      await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("not configured");
    });

    it("should return response on success", async () => {
      client.configure(aiCfg());
      const r = await client.chat({ messages: [{ role: "user", content: "hi" }] });
      expect(r.text).toBe("Hi");
      expect(mockChat).toHaveBeenCalledTimes(1);
    });

    it("should include tool calls", async () => {
      const tcs = [{ id: "c1", type: "function", function: { name: "get_weather", arguments: "{}" } }];
      mockChat.mockResolvedValue({ text: "", raw: {}, provider: "openai", model: "gpt-4", toolCalls: tcs });
      client.configure(aiCfg());
      const r = await client.chat({ messages: [{ role: "user", content: "w?" }], tools: [{ type: "function", function: { name: "get_weather", description: "x", parameters: {} } }] });
      expect(r.toolCalls).toHaveLength(1);
    });

    it("should rethrow provider errors", async () => {
      mockChat.mockRejectedValue(new Error("API error"));
      client.configure(aiCfg());
      await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow("API error");
    });

    it("should record telemetry on success", async () => {
      client.configure(aiCfg());
      await client.chat({ messages: [{ role: "user", content: "hi" }] });
      const { telemetry } = require("../../packages/core/src/telemetry/index");
      expect(telemetry.promptRecorder.recordAIRecord).toHaveBeenCalled();
      expect(telemetry.metrics.timing).toHaveBeenCalled();
    });

    it("should record telemetry on error", async () => {
      mockChat.mockRejectedValue(new Error("err"));
      client.configure(aiCfg());
      await expect(client.chat({ messages: [{ role: "user", content: "hi" }] })).rejects.toThrow();
      const { telemetry } = require("../../packages/core/src/telemetry/index");
      expect(telemetry.promptRecorder.recordAIRecord).toHaveBeenCalled();
    });
  });
});
