/**
 * WorkflowManager Unit Tests
 *
 * Tests for workflow CRUD operations:
 * - save/load/delete/list/exists
 * - Persistence via filesystem
 */

import { WorkflowManager } from "../workflow/manager.js";
import type { Workflow } from "../workflow/types.js";

// Mock uuid to prevent ESM parsing issues
jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid-v4"),
}));

// In-memory file store
const fileStore: Record<string, string> = {};

// Mock fs/promises
jest.mock("fs/promises", () => ({
  mkdir: jest.fn().mockResolvedValue(undefined),
  readFile: jest.fn(async (filePath: string) => {
    if (fileStore[filePath]) {
      return fileStore[filePath];
    }
    const err: any = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  }),
  writeFile: jest.fn(async (filePath: string, data: string) => {
    fileStore[filePath] = data;
  }),
  readdir: jest.fn(async (dirPath: string) => {
    const files = Object.keys(fileStore)
      .filter((p) => p.startsWith(dirPath + "/"))
      .map((p) => p.replace(dirPath + "/", ""));
    return files;
  }),
  unlink: jest.fn(async (filePath: string) => {
    if (fileStore[filePath]) {
      delete fileStore[filePath];
      return undefined;
    }
    const err: any = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  }),
  access: jest.fn(async (filePath: string) => {
    if (fileStore[filePath]) {
      return undefined;
    }
    const err: any = new Error("ENOENT");
    err.code = "ENOENT";
    throw err;
  }),
}));

jest.mock("../utils/paths.js", () => ({
  getInTorchDir: jest.fn(() => "/tmp/.intorch"),
  ensureInTorchDir: jest.fn(),
}));

const WORKFLOWS_DIR = "/tmp/.intorch/workflows";

function createMockWorkflow(overrides: Partial<Workflow> = {}): Workflow {
  return {
    name: "Test Workflow",
    version: "1.0.0",
    requirements: { servers: [] },
    inputs: [],
    steps: [
      {
        id: "step-1",
        serverName: "server-a",
        toolName: "tool-1",
        parameters: {},
      },
    ],
    ...overrides,
  };
}

/** Helper to pre-create a workflow file in the in-memory store */
function preCreateWorkflowFile(
  id: string,
  workflow: Workflow,
): void {
  const filePath = `${WORKFLOWS_DIR}/${id}.json`;
  fileStore[filePath] = JSON.stringify(workflow);
}

describe("WorkflowManager", () => {
  let workflowManager: WorkflowManager;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear in-memory file store
    Object.keys(fileStore).forEach((k) => delete fileStore[k]);
    workflowManager = new WorkflowManager();
  });

  describe("save()", () => {
    it("should save a new workflow and return generated UUID", async () => {
      const workflow = createMockWorkflow();
      const id = await workflowManager.save(workflow);
      expect(id).toBe("mock-uuid-v4");
    });

    it("should preserve existing ID when the file already exists", async () => {
      // Pre-create the file so save() finds it via fs.access()
      const existingWorkflow = createMockWorkflow({
        id: "custom-id-123",
        name: "Custom ID Workflow",
      });
      preCreateWorkflowFile("custom-id-123", existingWorkflow);

      const id = await workflowManager.save(existingWorkflow);
      expect(id).toBe("custom-id-123");
    });

    it("should update lastExecutedAt when provided", async () => {
      const now = new Date().toISOString();
      const workflow = createMockWorkflow({
        name: "Executed Workflow",
        lastExecutedAt: now,
      });

      const id = await workflowManager.save(workflow);
      expect(id).toBeDefined();
    });
  });

  describe("load()", () => {
    it("should throw for non-existent workflow", async () => {
      await expect(
        workflowManager.load("non-existent-id"),
      ).rejects.toThrow(/Workflow not found/i);
    });

    it("should return workflow data for existing ID", async () => {
      const workflow = createMockWorkflow({
        id: "wf-123",
        name: "Test Workflow",
      });
      preCreateWorkflowFile("wf-123", workflow);

      const result = await workflowManager.load("wf-123");
      expect(result).not.toBeNull();
      expect(result.id).toBe("wf-123");
      expect(result.name).toBe("Test Workflow");
      expect(Array.isArray(result.steps)).toBe(true);
    });
  });

  describe("delete()", () => {
    it("should delete an existing workflow", async () => {
      const workflow = createMockWorkflow({
        id: "wf-123",
        name: "Test Workflow",
      });
      preCreateWorkflowFile("wf-123", workflow);

      await expect(
        workflowManager.delete("wf-123"),
      ).resolves.not.toThrow();
    });

    it("should throw when deleting non-existent workflow", async () => {
      await expect(
        workflowManager.delete("non-existent"),
      ).rejects.toThrow(/Workflow not found/i);
    });
  });

  describe("list()", () => {
    it("should return empty array when no workflows exist", async () => {
      const workflows = await workflowManager.list();
      expect(workflows).toEqual([]);
    });

    it("should return all workflows", async () => {
      const wf1 = createMockWorkflow({ name: "Workflow 1" });
      const wf2 = createMockWorkflow({ name: "Workflow 2" });
      preCreateWorkflowFile("wf-1", wf1);
      preCreateWorkflowFile("wf-2", wf2);

      const workflows = await workflowManager.list();
      expect(workflows).toHaveLength(2);
    });
  });

  describe("exists()", () => {
    it("should return true for existing workflow", async () => {
      const workflow = createMockWorkflow({
        id: "wf-123",
        name: "Test Workflow",
      });
      preCreateWorkflowFile("wf-123", workflow);

      const exists = await workflowManager.exists("wf-123");
      expect(exists).toBe(true);
    });

    it("should return false for non-existing workflow", async () => {
      const exists = await workflowManager.exists("non-existent");
      expect(exists).toBe(false);
    });
  });
});
