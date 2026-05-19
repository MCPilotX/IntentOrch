/**
 * Tests for Ollama function calling support via /api/chat endpoint
 *
 * These tests verify that:
 * 1. callOllama() uses /api/chat endpoint (not /api/generate)
 * 2. callOllama() sends tools in OpenAI-compatible format
 * 3. callOllama() correctly parses tool_calls from Ollama response
 * 4. The full CloudIntentEngine pipeline works with Ollama-style responses
 * 5. Ollama does not require apiKey
 * 6. Custom apiEndpoint is properly used
 */

import { LLMClient, getLLMClient } from "../../packages/core/src/ai/llm-client";
import type { AIConfig } from "../../packages/core/src/core/types";

// ==================== Mock fetch ====================

const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// ==================== Helpers ====================

function createOllamaConfig(overrides: Partial<AIConfig> = {}): AIConfig {
  return {
    provider: "ollama",
    model: "llama3.1",
    apiKey: "", // Ollama doesn't need apiKey
    apiEndpoint: "http://localhost:11434",
    ...overrides,
  };
}

function createOllamaChatResponse(
  content: string,
  toolCalls?: Array<{
    function: { name: string; arguments: Record<string, any> | string };
  }>,
): any {
  const message: any = { role: "assistant", content };

  if (toolCalls && toolCalls.length > 0) {
    message.tool_calls = toolCalls.map((tc, idx) => ({
      id: `call_${idx}`,
      type: "function",
      function: {
        name: tc.function.name,
        arguments:
          typeof tc.function.arguments === "string"
            ? tc.function.arguments
            : JSON.stringify(tc.function.arguments),
      },
    }));
  }

  return { message };
}

// ==================== Tests ====================

describe("LLMClient - Ollama Function Calling", () => {
  let client: LLMClient;

  beforeEach(() => {
    jest.clearAllMocks();
    client = new LLMClient();
  });

  describe("Configuration", () => {
    it("should configure Ollama without apiKey", () => {
      const config = createOllamaConfig();
      expect(() => client.configure(config)).not.toThrow();
      expect(client.isConfigured()).toBe(true);
      expect(client.getProvider()).toBe("ollama");
    });

    it("should use custom apiEndpoint when provided", () => {
      const config = createOllamaConfig({
        apiEndpoint: "http://192.168.1.100:11434",
      });
      client.configure(config);
      expect(client.isConfigured()).toBe(true);
    });

    it("should use default model when not specified", () => {
      const config = createOllamaConfig({ model: undefined as any });
      client.configure(config);
      expect(client.getModel()).toBe("llama2"); // default from PROVIDER_CONFIGS
    });
  });

  describe("Connection Test", () => {
    it("should test connection via /api/tags endpoint", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      client.configure(createOllamaConfig());
      const result = await client.testConnection();

      expect(result.success).toBe(true);
      expect(result.message).toContain("Ollama connection OK");
      expect(mockFetch).toHaveBeenCalledWith(
        "http://localhost:11434/api/tags",
        expect.objectContaining({ method: "GET" }),
      );
    });

    it("should use custom endpoint for connection test", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
      });

      client.configure(
        createOllamaConfig({ apiEndpoint: "http://192.168.1.100:11434" }),
      );
      await client.testConnection();

      expect(mockFetch).toHaveBeenCalledWith(
        "http://192.168.1.100:11434/api/tags",
        expect.any(Object),
      );
    });

    it("should report failure when Ollama is not running", async () => {
      // Use mockImplementation to avoid unhandled rejection issues
      mockFetch.mockImplementation(
        () =>
          new Promise((_, reject) => {
            reject(new Error("Connection refused"));
          }),
      );

      client.configure(createOllamaConfig());
      const result = await client.testConnection();

      expect(result.success).toBe(false);
      expect(result.message).toContain("Connection test failed");
    });
  });

  describe("Chat - /api/chat endpoint", () => {
    it("should call /api/chat endpoint (not /api/generate)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createOllamaChatResponse("Hello! How can I help?"),
      });

      client.configure(createOllamaConfig());
      await client.chat({
        messages: [{ role: "user", content: "Hello" }],
      });

      // Verify it uses /api/chat, not /api/generate
      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toBe("http://localhost:11434/api/chat");
    });

    it("should send full messages array to /api/chat", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createOllamaChatResponse("I am fine, thank you!"),
      });

      client.configure(createOllamaConfig());
      await client.chat({
        messages: [
          { role: "system", content: "You are a helpful assistant." },
          { role: "user", content: "How are you?" },
        ],
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.messages).toHaveLength(2);
      expect(requestBody.messages[0].role).toBe("system");
      expect(requestBody.messages[1].role).toBe("user");
      expect(requestBody.messages[1].content).toBe("How are you?");
    });

    it("should parse text response from /api/chat correctly", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("The weather in Beijing is sunny."),
      });

      client.configure(createOllamaConfig());
      const result = await client.chat({
        messages: [{ role: "user", content: "What's the weather in Beijing?" }],
      });

      expect(result.text).toBe("The weather in Beijing is sunny.");
      expect(result.provider).toBe("ollama");
      expect(result.model).toBe("llama3.1");
    });

    it("should use custom apiEndpoint for /api/chat", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createOllamaChatResponse("OK"),
      });

      client.configure(
        createOllamaConfig({ apiEndpoint: "http://192.168.1.100:11434" }),
      );
      await client.chat({
        messages: [{ role: "user", content: "Hi" }],
      });

      const fetchUrl = mockFetch.mock.calls[0][0];
      expect(fetchUrl).toBe("http://192.168.1.100:11434/api/chat");
    });
  });

  describe("Function Calling (Tools)", () => {
    const mockTools = [
      {
        type: "function" as const,
        function: {
          name: "get_weather",
          description: "Get weather for a city",
          parameters: {
            type: "object",
            properties: {
              city: { type: "string", description: "City name" },
            },
            required: ["city"],
          },
        },
      },
    ];

    it("should send tools in request body when provided", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => createOllamaChatResponse(""),
      });

      client.configure(createOllamaConfig());
      await client.chat({
        messages: [{ role: "user", content: "What's the weather in Beijing?" }],
        tools: mockTools,
        toolChoice: "auto",
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tools).toBeDefined();
      expect(requestBody.tools).toHaveLength(1);
      expect(requestBody.tools[0].function.name).toBe("get_weather");
      expect(requestBody.tool_choice).toBe("auto");
    });

    it("should parse tool_calls from Ollama response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("", [
            {
              function: {
                name: "get_weather",
                arguments: { city: "Beijing" },
              },
            },
          ]),
      });

      client.configure(createOllamaConfig());
      const result = await client.chat({
        messages: [{ role: "user", content: "What's the weather in Beijing?" }],
        tools: mockTools,
      });

      expect(result.toolCalls).toBeDefined();
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls![0].function.name).toBe("get_weather");
      expect(result.toolCalls![0].function.arguments).toBe(
        JSON.stringify({ city: "Beijing" }),
      );
    });

    it("should handle string arguments in tool_calls", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("", [
            {
              function: {
                name: "get_weather",
                arguments: '{"city": "Shanghai"}',
              },
            },
          ]),
      });

      client.configure(createOllamaConfig());
      const result = await client.chat({
        messages: [{ role: "user", content: "Weather in Shanghai?" }],
        tools: mockTools,
      });

      expect(result.toolCalls![0].function.arguments).toBe(
        '{"city": "Shanghai"}',
      );
    });

    it("should handle multiple tool_calls in one response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("", [
            {
              function: {
                name: "get_weather",
                arguments: { city: "Beijing" },
              },
            },
            {
              function: {
                name: "get_weather",
                arguments: { city: "Shanghai" },
              },
            },
          ]),
      });

      client.configure(createOllamaConfig());
      const result = await client.chat({
        messages: [{ role: "user", content: "Weather in Beijing and Shanghai?" }],
        tools: mockTools,
      });

      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls![0].function.name).toBe("get_weather");
      expect(result.toolCalls![1].function.name).toBe("get_weather");
    });

    it("should return text content alongside tool_calls", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("I'll check the weather for you.", [
            {
              function: {
                name: "get_weather",
                arguments: { city: "Beijing" },
              },
            },
          ]),
      });

      client.configure(createOllamaConfig());
      const result = await client.chat({
        messages: [{ role: "user", content: "Weather in Beijing?" }],
        tools: mockTools,
      });

      expect(result.text).toBe("I'll check the weather for you.");
      expect(result.toolCalls).toHaveLength(1);
    });

    it("should handle toolChoice 'required'", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () =>
          createOllamaChatResponse("", [
            {
              function: {
                name: "get_weather",
                arguments: { city: "Beijing" },
              },
            },
          ]),
      });

      client.configure(createOllamaConfig());
      await client.chat({
        messages: [{ role: "user", content: "Weather in Beijing?" }],
        tools: mockTools,
        toolChoice: "required",
      });

      const requestBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(requestBody.tool_choice).toBe("required");
    });
  });

  describe("Error Handling", () => {
    it("should throw on non-ok response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      client.configure(createOllamaConfig());
      await expect(
        client.chat({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Ollama API error: 500");
    });

    it("should throw on network error", async () => {
      mockFetch.mockRejectedValueOnce(new Error("Network error"));

      client.configure(createOllamaConfig());
      await expect(
        client.chat({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("Network error");
    });

    it("should throw if not configured", async () => {
      // Don't configure the client
      await expect(
        client.chat({
          messages: [{ role: "user", content: "Hello" }],
        }),
      ).rejects.toThrow("AI provider not configured");
    });
  });
});

describe("CloudIntentEngine - Ollama Integration", () => {
  let mockClient: any;
  let getLLMClientSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.resetModules();

    // Create a mock LLMClient
    mockClient = {
      chat: jest.fn(),
      configure: jest.fn(),
      isConfigured: jest.fn().mockReturnValue(true),
      getProvider: jest.fn().mockReturnValue("ollama"),
      getModel: jest.fn().mockReturnValue("llama3.1"),
    };

    // Spy on getLLMClient to return our mock
    getLLMClientSpy = jest
      .spyOn(require("../../packages/core/src/ai/llm-client"), "getLLMClient")
      .mockReturnValue(mockClient);
  });

  afterEach(() => {
    getLLMClientSpy?.mockRestore();
  });

  it("should configure LLMClient with Ollama settings including endpoint", () => {
    const { CloudIntentEngine } = require("../../packages/core/src/ai/cloud-intent-engine");

    new CloudIntentEngine({
      llm: {
        provider: "ollama",
        apiKey: "",
        model: "llama3.1",
        endpoint: "http://192.168.1.100:11434",
        temperature: 0.3,
        maxTokens: 1000,
        timeout: 30000,
        maxRetries: 3,
      },
      execution: {},
      fallback: {},
    });

    expect(mockClient.configure).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "ollama",
        apiKey: "",
        model: "llama3.1",
        apiEndpoint: "http://192.168.1.100:11434",
      }),
    );
  });

  it("should pass tools to LLMClient.chat() for function calling", async () => {
    // Mock LLMClient.chat() to return a tool call response (Ollama-style)
    mockClient.chat.mockResolvedValue({
      text: "",
      raw: {
        message: {
          role: "assistant",
          content: "",
          tool_calls: [
            {
              id: "call_0",
              type: "function",
              function: {
                name: "get_weather",
                arguments: JSON.stringify({ city: "Beijing" }),
              },
            },
          ],
        },
      },
      provider: "ollama",
      model: "llama3.1",
      toolCalls: [
        {
          id: "call_0",
          type: "function",
          function: {
            name: "get_weather",
            arguments: JSON.stringify({ city: "Beijing" }),
          },
        },
      ],
    });

    const { CloudIntentEngine } = require("../../packages/core/src/ai/cloud-intent-engine");

    const engine = new CloudIntentEngine({
      llm: {
        provider: "ollama",
        apiKey: "",
        model: "llama3.1",
        endpoint: "http://localhost:11434",
      },
      execution: {},
      fallback: {},
    });

    engine.setAvailableTools([
      {
        name: "get_weather",
        description: "Get weather for a city",
        inputSchema: {
          type: "object",
          properties: {
            city: { type: "string" },
          },
          required: ["city"],
        },
      } as any,
    ]);

    const result = await engine.processQueryWithHistory([
      { role: "user", content: "What's the weather in Beijing?" },
    ]);

    // Verify the result contains the tool call
    expect(result.hasToolCall).toBe(true);
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0].toolName).toBe("get_weather");
    expect(result.toolCalls[0].arguments).toEqual({ city: "Beijing" });

    // Verify that tools were passed to LLMClient.chat()
    const chatCallArgs = mockClient.chat.mock.calls[0][0];
    expect(chatCallArgs.tools).toBeDefined();
    expect(chatCallArgs.tools).toHaveLength(1);
    expect(chatCallArgs.tools[0].function.name).toBe("get_weather");
  });
});
