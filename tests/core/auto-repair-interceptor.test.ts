import { jest } from "@jest/globals";
import { AutoRepairInterceptor } from "../../packages/core/src/core/interceptors/auto-repair.js";
import { InterceptorChain } from "../../packages/core/src/core/interceptor.js";
import { TraceContextManager } from "../../packages/core/src/core/trace-context.js";
import { getLLMClient } from "../../packages/core/src/ai/llm-client.js";

// Mock LLMClient
jest.mock("../../packages/core/src/ai/llm-client.js", () => ({
  getLLMClient: jest.fn(),
}));

describe("AutoRepairInterceptor", () => {
  let interceptor: AutoRepairInterceptor;
  let mockLLMClient: any;

  beforeEach(() => {
    interceptor = new AutoRepairInterceptor();
    mockLLMClient = {
      isConfigured: jest.fn().mockReturnValue(true),
      chat: jest.fn(),
    };
    (getLLMClient as jest.Mock).mockReturnValue(mockLLMClient);
  });

  it("should attempt to repair a parameter error and return recovered result", async () => {
    const toolName = "test_tool";
    const initialArgs = { foo: "bar" };
    const fixedArgs = { foo: "bar", baz: "qux" };
    const toolResult = { success: true, data: "ok" };

    const executeToolFn = jest.fn()
      .mockRejectedValueOnce(new Error("Missing required parameter 'baz'"))
      .mockResolvedValueOnce(toolResult);

    mockLLMClient.chat.mockResolvedValue({
      text: JSON.stringify(fixedArgs),
    });

    const chain = new InterceptorChain();
    chain.use(interceptor);

    const result = await TraceContextManager.trace("test", async (span) => {
      return chain.execute(
        { toolName, arguments: initialArgs, toolMetadata: { name: toolName, serverName: "test-server", inputSchema: { required: ["foo", "baz"] } } as any },
        async (input) => executeToolFn(input.toolName, input.arguments),
        { span, executeToolFn }
      );
    });

    expect(result).toEqual(toolResult);
    expect(executeToolFn).toHaveBeenCalledTimes(2);
    expect(executeToolFn).toHaveBeenNthCalledWith(1, toolName, initialArgs);
    expect(executeToolFn).toHaveBeenNthCalledWith(2, toolName, fixedArgs);
    expect(mockLLMClient.chat).toHaveBeenCalled();
  });

  it("should not attempt repair for non-parameter errors", async () => {
    const executeToolFn = jest.fn().mockRejectedValue(new Error("Network timeout"));

    const chain = new InterceptorChain();
    chain.use(interceptor);

    await expect(TraceContextManager.trace("test", async (span) => {
      return chain.execute(
        { toolName: "test", arguments: {} },
        async (input) => executeToolFn(input.toolName, input.arguments),
        { span, executeToolFn }
      );
    })).rejects.toThrow("Network timeout");

    expect(mockLLMClient.chat).not.toHaveBeenCalled();
  });

  it("should stop after max retries", async () => {
    const executeToolFn = jest.fn().mockRejectedValue(new Error("Missing parameter 'x'"));
    
    mockLLMClient.chat.mockResolvedValue({
      text: JSON.stringify({ x: 1 }),
    });

    const chain = new InterceptorChain();
    chain.use(interceptor);

    await expect(TraceContextManager.trace("test", async (span) => {
      return chain.execute(
        { toolName: "test", arguments: {} },
        async (input) => executeToolFn(input.toolName, input.arguments),
        { span, executeToolFn }
      );
    })).rejects.toThrow("Missing parameter 'x'");

    // 1 original call + 1 repair attempt = 2 calls total
    // The second call still fails, and interceptor should stop.
    expect(executeToolFn).toHaveBeenCalledTimes(2);
  });
});
