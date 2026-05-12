import { WorkflowEngine } from "../workflow/engine.js";
import { MCPClient } from "../mcp/client.js";
import { getRegistryClient } from "../registry/client.js";
import { getProcessManager } from "../process-manager/manager.js";

// Mock uuid to prevent ESM parsing issues
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-v4"),
}));

// Mock MCPClient
jest.mock("../mcp/client.js");
const MockedMCPClient = MCPClient as jest.MockedClass<typeof MCPClient>;

// Mock RegistryClient
jest.mock("../registry/client.js");
const mockedGetRegistryClient = getRegistryClient as any;

// Mock ProcessManager
jest.mock("../process-manager/manager.js");
const mockedGetProcessManager = getProcessManager as any;

describe("Multi-Transport Workflow Execution", () => {
  let workflowEngine: WorkflowEngine;
  let mockRegistryClient: any;
  let mockProcessManager: any;

  beforeEach(() => {
    jest.clearAllMocks();
    workflowEngine = new WorkflowEngine();
    
    mockRegistryClient = {
      fetchManifest: jest.fn(),
      getCachedManifest: jest.fn(),
    };
    mockedGetRegistryClient.mockReturnValue(mockRegistryClient);

    mockProcessManager = {
      getByServerName: jest.fn().mockResolvedValue(null),
      start: jest.fn().mockResolvedValue(-1), // Mock virtual PID
      listRunning: jest.fn().mockResolvedValue([]),
    };
    mockedGetProcessManager.mockReturnValue(mockProcessManager);
  });

  it("should support SSE transport in workflow", async () => {
    const serverName = "remote-sse-server";
    const sseUrl = "https://example.com/sse";
    
    const manifest = {
      name: serverName,
      version: "1.0.0",
      runtime: {
        type: "remote",
        command: "",
      },
      transport: {
        type: "sse",
        url: sseUrl,
      },
    };

    mockRegistryClient.fetchManifest.mockResolvedValue(manifest);
    
    // Setup mock client behavior
    const mockClientInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      callTool: jest.fn().mockResolvedValue({ content: [{ text: "success" }] }),
      on: jest.fn(),
    };
    MockedMCPClient.mockImplementation(() => mockClientInstance as any);

    const workflow = {
      name: "SSE Test",
      steps: [
        {
          id: "step1",
          serverName: serverName,
          toolName: "test_tool",
          parameters: {},
        },
      ],
    };

    await workflowEngine.execute(workflow as any, {});

    // Verify MCPClient was created with SSE transport
    expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
      transport: expect.objectContaining({
        type: "sse",
        url: sseUrl,
      }),
    }));

    expect(mockClientInstance.connect).toHaveBeenCalled();
    expect(mockClientInstance.callTool).toHaveBeenCalledWith("test_tool", {});
  });

  it("should support HTTP transport in workflow", async () => {
    const serverName = "remote-http-server";
    const httpUrl = "https://example.com/api";
    
    const manifest = {
      name: serverName,
      version: "1.0.0",
      runtime: {
        type: "remote",
        command: "",
      },
      transport: {
        type: "http",
        url: httpUrl,
      },
    };

    mockRegistryClient.fetchManifest.mockResolvedValue(manifest);
    
    const mockClientInstance = {
      connect: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn().mockResolvedValue(undefined),
      callTool: jest.fn().mockResolvedValue({ content: [{ text: "success" }] }),
      on: jest.fn(),
    };
    MockedMCPClient.mockImplementation(() => mockClientInstance as any);

    const workflow = {
      name: "HTTP Test",
      steps: [
        {
          id: "step1",
          serverName: serverName,
          toolName: "test_tool",
          parameters: {},
        },
      ],
    };

    await workflowEngine.execute(workflow as any, {});

    expect(MockedMCPClient).toHaveBeenCalledWith(expect.objectContaining({
      transport: expect.objectContaining({
        type: "http",
        url: httpUrl,
      }),
    }));
  });
});
