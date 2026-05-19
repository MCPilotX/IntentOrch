import { jest } from "@jest/globals";
import { EnvironmentAnomaliesInterceptor } from "../../packages/core/src/core/interceptors/environment-anomalies.js";
import { InterceptorChain } from "../../packages/core/src/core/interceptor.js";
import { TraceContextManager } from "../../packages/core/src/core/trace-context.js";
import { getToolExecutor } from "../../packages/core/src/execution/tool-executor/index.js";

// Mock ToolExecutor
jest.mock("../../packages/core/src/execution/tool-executor/index.js", () => ({
  getToolExecutor: jest.fn(),
}));

describe("EnvironmentAnomaliesInterceptor", () => {
  let interceptor: EnvironmentAnomaliesInterceptor;
  let mockToolExecutor: any;

  beforeEach(() => {
    interceptor = new EnvironmentAnomaliesInterceptor();
    mockToolExecutor = {
      restartServer: jest.fn(),
      resolveServerName: jest.fn().mockReturnValue("test-server"),
    };
    (getToolExecutor as jest.Mock).mockReturnValue(mockToolExecutor);
  });

  it("should attempt to restart server on connection error and return recovered result", async () => {
    const toolName = "test_tool";
    const toolResult = { success: true, data: "ok" };

    const executeToolFn = jest.fn()
      .mockRejectedValueOnce(new Error("MCP Client disconnected"))
      .mockResolvedValueOnce(toolResult);

    const chain = new InterceptorChain();
    chain.use(interceptor);

    const result = await TraceContextManager.trace("test", async (span) => {
      return chain.execute(
        { toolName, arguments: {}, toolMetadata: { name: toolName, serverName: "test-server" } as any },
        async (input) => executeToolFn(input.toolName, input.arguments),
        { span, executeToolFn }
      );
    });

    expect(result).toEqual(toolResult);
    expect(mockToolExecutor.restartServer).toHaveBeenCalledWith("test-server");
    expect(executeToolFn).toHaveBeenCalledTimes(2);
  });

  it("should not attempt restart for parameter errors", async () => {
    const executeToolFn = jest.fn().mockRejectedValue(new Error("Missing parameter 'foo'"));

    const chain = new InterceptorChain();
    chain.use(interceptor);

    await expect(TraceContextManager.trace("test", async (span) => {
      return chain.execute(
        { toolName: "test", arguments: {} },
        async (input) => executeToolFn(input.toolName, input.arguments),
        { span, executeToolFn }
      );
    })).rejects.toThrow("Missing parameter 'foo'");

    expect(mockToolExecutor.restartServer).not.toHaveBeenCalled();
  });
});
