/**
 * SQLite Integration Test
 *
 * Tests the full DatabaseManager and all Repository implementations
 * using @libsql/client.
 */

import {
  DatabaseManager,
  getConfigRepository,
  getSecretRepository,
  getProcessRepository,
  getToolRepository,
  getManifestCacheRepository,
  getWorkflowRepository,
  getWorkflowExecutionRepository,
  getLockRepository,
} from "../../packages/core/src/utils/sqlite.js";
import path from "path";
import fs from "fs";
import os from "os";

// Use a temp directory for test database
const TEST_DIR = path.join(os.tmpdir(), "intorch-test-" + Date.now());
const TEST_DB_PATH = path.join(TEST_DIR, "intorch.db");

// Mock paths module to use test directory
jest.mock("../../packages/core/src/utils/paths.js", () => {
  const actual = jest.requireActual("../../packages/core/src/utils/paths.js");
  return {
    ...actual,
    getInTorchDir: () => TEST_DIR,
  };
});

describe("SQLite DatabaseManager", () => {
  beforeAll(async () => {
    // Clean up any previous test data
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
    fs.mkdirSync(TEST_DIR, { recursive: true });

    // Initialize the database
    await DatabaseManager.getInstance().initialize();
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
    // Clean up test directory
    if (fs.existsSync(TEST_DIR)) {
      fs.rmSync(TEST_DIR, { recursive: true });
    }
  });

  test("should create database file", () => {
    expect(DatabaseManager.dbFileExists()).toBe(true);
    expect(fs.existsSync(TEST_DB_PATH)).toBe(true);
  });

  test("should be initialized", () => {
    expect(DatabaseManager.getInstance().initialized).toBe(true);
  });

  test("should execute raw SQL", async () => {
    const db = DatabaseManager.getInstance();
    await db.execute("INSERT INTO config (key, value) VALUES (?, ?)", [
      "test_key",
      "test_value",
    ]);
    const row = await db.queryOne<{ key: string; value: string }>(
      "SELECT key, value FROM config WHERE key = ?",
      ["test_key"],
    );
    expect(row).not.toBeNull();
    expect(row!.key).toBe("test_key");
    expect(row!.value).toBe("test_value");
  });

  test("should support transactions", async () => {
    const db = DatabaseManager.getInstance();
    const result = await db.transaction(async () => {
      await db.execute(
        "INSERT INTO config (key, value) VALUES (?, ?)",
        ["tx_key", "tx_value"],
      );
      const row = await db.queryOne<{ value: string }>(
        "SELECT value FROM config WHERE key = ?",
        ["tx_key"],
      );
      return row!.value;
    });
    expect(result).toBe("tx_value");
  });

  test("should rollback on transaction error", async () => {
    const db = DatabaseManager.getInstance();
    try {
      await db.transaction(async () => {
        await db.execute(
          "INSERT INTO config (key, value) VALUES (?, ?)",
          ["rollback_key", "rollback_value"],
        );
        throw new Error("force rollback");
      });
    } catch {
      // expected
    }
    const row = await db.queryOne(
      "SELECT value FROM config WHERE key = ?",
      ["rollback_key"],
    );
    expect(row).toBeNull();
  });

  test("should close and reopen", async () => {
    DatabaseManager.getInstance().close();
    expect(DatabaseManager.getInstance().initialized).toBe(false);

    await DatabaseManager.getInstance().initialize();
    expect(DatabaseManager.getInstance().initialized).toBe(true);

    // Data should persist
    const row = await DatabaseManager.getInstance().queryOne<{ value: string }>(
      "SELECT value FROM config WHERE key = ?",
      ["test_key"],
    );
    expect(row).not.toBeNull();
    expect(row!.value).toBe("test_value");
  });
});

describe("ConfigRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should set and get config", async () => {
    const repo = getConfigRepository();
    await repo.set("api_key", "sk-12345");
    const value = await repo.get("api_key");
    expect(value).toBe("sk-12345");
  });

  test("should return null for missing key", async () => {
    const repo = getConfigRepository();
    const value = await repo.get("nonexistent_key");
    expect(value).toBeNull();
  });

  test("should get all configs", async () => {
    const repo = getConfigRepository();
    await repo.set("key_a", "value_a");
    await repo.set("key_b", "value_b");
    const all = await repo.getAll();
    expect(all["key_a"]).toBe("value_a");
    expect(all["key_b"]).toBe("value_b");
  });

  test("should delete config", async () => {
    const repo = getConfigRepository();
    await repo.set("temp_key", "temp_value");
    await repo.delete("temp_key");
    const value = await repo.get("temp_key");
    expect(value).toBeNull();
  });

  test("should overwrite existing config", async () => {
    const repo = getConfigRepository();
    await repo.set("overwrite_key", "original");
    await repo.set("overwrite_key", "updated");
    const value = await repo.get("overwrite_key");
    expect(value).toBe("updated");
  });
});

describe("SecretRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should set and get secret", async () => {
    const repo = getSecretRepository();
    const encryptedValue = Buffer.from("encrypted_data");
    const iv = Buffer.from("iv_vector_16bytes");
    const authTag = Buffer.from("auth_tag_16bytes");

    await repo.set("my_secret", encryptedValue, iv, authTag);
    const result = await repo.get("my_secret");

    expect(result).not.toBeNull();
    expect(result!.encryptedValue.toString()).toBe("encrypted_data");
    expect(result!.iv.toString()).toBe("iv_vector_16bytes");
    expect(result!.authTag.toString()).toBe("auth_tag_16bytes");
  });

  test("should return null for missing secret", async () => {
    const repo = getSecretRepository();
    const result = await repo.get("nonexistent_secret");
    expect(result).toBeNull();
  });

  test("should list secret names", async () => {
    const repo = getSecretRepository();
    const names = await repo.list();
    expect(names).toContain("my_secret");
  });

  test("should delete secret", async () => {
    const repo = getSecretRepository();
    await repo.set("temp_secret", Buffer.from("data"), Buffer.from("iv12345678901234"), Buffer.from("tag12345678901234"));
    await repo.delete("temp_secret");
    const result = await repo.get("temp_secret");
    expect(result).toBeNull();
  });
});

describe("ProcessRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should upsert and find by pid", async () => {
    const repo = getProcessRepository();
    await repo.upsert({
      pid: 1001,
      server_name: "test-server",
      name: "test-server",
      version: "1.0.0",
      manifest: JSON.stringify({ name: "test-server" }),
      start_time: Date.now(),
      status: "running",
      port: 3000,
      log_path: "/tmp/test.log",
      external: 0,
    });

    const process = await repo.findByPid(1001);
    expect(process).not.toBeNull();
    expect(process!.server_name).toBe("test-server");
    expect(process!.status).toBe("running");
  });

  test("should find by server name", async () => {
    const repo = getProcessRepository();
    const process = await repo.findByServerName("test-server");
    expect(process).not.toBeNull();
    expect(process!.pid).toBe(1001);
  });

  test("should find by status", async () => {
    const repo = getProcessRepository();
    const running = await repo.findByStatus("running");
    expect(running.length).toBeGreaterThanOrEqual(1);
    expect(running[0].status).toBe("running");
  });

  test("should list all processes", async () => {
    const repo = getProcessRepository();
    const all = await repo.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  test("should delete process", async () => {
    const repo = getProcessRepository();
    await repo.upsert({
      pid: 9999,
      server_name: "temp-server",
      name: "temp-server",
      version: "1.0.0",
      manifest: "{}",
      start_time: Date.now(),
      status: "stopped",
    });
    await repo.delete(9999);
    const process = await repo.findByPid(9999);
    expect(process).toBeNull();
  });
});

describe("ToolRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should upsert and find tool", async () => {
    const repo = getToolRepository();
    await repo.upsert({
      name: "read_file",
      description: "Read a file from disk",
      server_name: "filesystem",
      parameters: JSON.stringify({ path: "string" }),
      categories: "file",
      keywords: "read,file",
    });

    const tool = await repo.findByServerAndName("filesystem", "read_file");
    expect(tool).not.toBeNull();
    expect(tool!.name).toBe("read_file");
    expect(tool!.server_name).toBe("filesystem");
  });

  test("should find tools by server", async () => {
    const repo = getToolRepository();
    const tools = await repo.findByServer("filesystem");
    expect(tools.length).toBeGreaterThanOrEqual(1);
    expect(tools[0].server_name).toBe("filesystem");
  });

  test("should search tools by keyword", async () => {
    const repo = getToolRepository();
    const results = await repo.search("read");
    expect(results.length).toBeGreaterThanOrEqual(1);
    expect(results[0].name).toContain("read");
  });

  test("should delete tools by server", async () => {
    const repo = getToolRepository();
    await repo.upsert({
      name: "write_file",
      description: "Write to a file",
      server_name: "temp-fs",
    });
    await repo.deleteByServer("temp-fs");
    const tools = await repo.findByServer("temp-fs");
    expect(tools.length).toBe(0);
  });

  test("should list all tools", async () => {
    const repo = getToolRepository();
    const all = await repo.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });
});

describe("ManifestCacheRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should set and get manifest", async () => {
    const repo = getManifestCacheRepository();
    const manifest = {
      name: "test-server",
      version: "1.0.0",
      tools: [{ name: "tool1" }],
    };

    await repo.set("test-server", manifest);
    const result = await repo.get("test-server");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-server");
    expect(result!.tools).toHaveLength(1);
  });

  test("should return null for missing manifest", async () => {
    const repo = getManifestCacheRepository();
    const result = await repo.get("nonexistent-server");
    expect(result).toBeNull();
  });

  test("should list cached server names", async () => {
    const repo = getManifestCacheRepository();
    const names = await repo.list();
    expect(names).toContain("test-server");
  });

  test("should delete manifest", async () => {
    const repo = getManifestCacheRepository();
    await repo.set("temp-server", { name: "temp" });
    await repo.delete("temp-server");
    const result = await repo.get("temp-server");
    expect(result).toBeNull();
  });

  test("should clear all manifests", async () => {
    const repo = getManifestCacheRepository();
    await repo.set("server-a", { name: "a" });
    await repo.set("server-b", { name: "b" });
    await repo.clear();
    const names = await repo.list();
    expect(names).toHaveLength(0);
  });
});

describe("WorkflowRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should upsert and get workflow", async () => {
    const repo = getWorkflowRepository();
    const workflow = {
      id: "wf-001",
      name: "test-workflow",
      version: "1.0",
      description: "A test workflow",
      steps: [
        { tool: "tool1", params: {} },
        { tool: "tool2", params: {} },
      ],
    };

    await repo.upsert(workflow);
    const result = await repo.get("wf-001");
    expect(result).not.toBeNull();
    expect(result!.name).toBe("test-workflow");
    expect(result!.steps).toHaveLength(2);
  });

  test("should find workflow by name", async () => {
    const repo = getWorkflowRepository();
    const result = await repo.findByName("test-workflow");
    expect(result).not.toBeNull();
    expect(result!.id).toBe("wf-001");
  });

  test("should list all workflows", async () => {
    const repo = getWorkflowRepository();
    const all = await repo.list();
    expect(all.length).toBeGreaterThanOrEqual(1);
  });

  test("should delete workflow", async () => {
    const repo = getWorkflowRepository();
    await repo.upsert({
      id: "wf-temp",
      name: "temp-workflow",
    });
    await repo.delete("wf-temp");
    const result = await repo.get("wf-temp");
    expect(result).toBeNull();
  });
});

describe("WorkflowExecutionRepository", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should create and get execution", async () => {
    const repo = getWorkflowExecutionRepository();
    await repo.create({
      id: "exec-001",
      workflow_id: "wf-001",
      status: "running",
      input: JSON.stringify({ prompt: "hello" }),
    });

    const result = await repo.get("exec-001");
    expect(result).not.toBeNull();
    expect(result!.workflow_id).toBe("wf-001");
    expect(result!.status).toBe("running");
  });

  test("should update execution", async () => {
    const repo = getWorkflowExecutionRepository();
    await repo.update("exec-001", {
      status: "completed",
      output: JSON.stringify({ result: "done" }),
      finished_at: new Date().toISOString(),
    });

    const result = await repo.get("exec-001");
    expect(result!.status).toBe("completed");
  });

  test("should find executions by workflow id", async () => {
    const repo = getWorkflowExecutionRepository();
    const executions = await repo.findByWorkflowId("wf-001");
    expect(executions.length).toBeGreaterThanOrEqual(1);
  });

  test("should add and get execution steps", async () => {
    const repo = getWorkflowExecutionRepository();
    await repo.addStep({
      id: "step-001",
      execution_id: "exec-001",
      step_index: 0,
      tool_name: "read_file",
      parameters: JSON.stringify({ path: "/tmp/test.txt" }),
      status: "completed",
    });

    await repo.addStep({
      id: "step-002",
      execution_id: "exec-001",
      step_index: 1,
      tool_name: "write_file",
      parameters: JSON.stringify({ path: "/tmp/output.txt" }),
      status: "pending",
    });

    const steps = await repo.getSteps("exec-001");
    expect(steps).toHaveLength(2);
    expect(steps[0].step_index).toBe(0);
    expect(steps[1].step_index).toBe(1);
  });
});

describe("DatabaseManager - Edge Cases", () => {
  beforeAll(async () => {
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should handle empty query results", async () => {
    const db = DatabaseManager.getInstance();
    const rows = await db.query(
      "SELECT * FROM config WHERE key = ?",
      ["nonexistent"],
    );
    expect(rows).toHaveLength(0);
  });

  test("should handle null values in parameters", async () => {
    const db = DatabaseManager.getInstance();
    // Use a table that allows NULL values (processes.log_path is nullable)
    await db.execute(
      "INSERT INTO processes (pid, server_name, name, version, manifest, start_time, status, log_path) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [7777, "null-test-server", "null-test", "1.0", "{}", Date.now(), "running", null],
    );
    const row = await db.queryOne<{ log_path: string | null }>(
      "SELECT log_path FROM processes WHERE pid = ?",
      [7777],
    );
    expect(row!.log_path).toBeNull();
  });

  test("should handle concurrent queries", async () => {
    const db = DatabaseManager.getInstance();
    const promises = Array.from({ length: 10 }, (_, i) =>
      db.execute(
        "INSERT INTO config (key, value) VALUES (?, ?)",
        [`concurrent_${i}`, `value_${i}`],
      ),
    );
    await Promise.all(promises);

    const count = await db.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM config WHERE key LIKE ?",
      ["concurrent_%"],
    );
    expect(count!.count).toBe(10);
  });

  test("should handle special characters in strings", async () => {
    const repo = getConfigRepository();
    await repo.set("special_chars", "hello'world\"test\nnewline");
    const value = await repo.get("special_chars");
    expect(value).toBe("hello'world\"test\nnewline");
  });

  test("should handle large data", async () => {
    const repo = getManifestCacheRepository();
    const largeManifest = {
      name: "large-server",
      data: "x".repeat(10000),
      tools: Array.from({ length: 100 }, (_, i) => ({
        name: `tool_${i}`,
        description: "a".repeat(100),
      })),
    };

    await repo.set("large-server", largeManifest);
    const result = await repo.get("large-server");
    expect(result).not.toBeNull();
    expect(result!.data).toHaveLength(10000);
    expect(result!.tools).toHaveLength(100);
  });

  test("should handle re-initialization gracefully", async () => {
    const db = DatabaseManager.getInstance();
    await db.initialize(); // Should be no-op
    expect(db.initialized).toBe(true);
  });
});


describe("LockRepository", () => {
  beforeAll(async () => {
    // Ensure DB is initialized (previous suite may have closed it)
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  beforeEach(async () => {
    // Ensure DB is initialized before each test (in case of cross-suite close)
    if (!DatabaseManager.getInstance().initialized) {
      await DatabaseManager.getInstance().initialize();
    }
  });

  afterAll(() => {
    DatabaseManager.getInstance().close();
  });

  test("should acquire and release a lock", async () => {
    const repo = getLockRepository();
    const acquired = await repo.acquire("test:lock-1", 12345, 10000);
    expect(acquired).toBe(true);

    const holder = await repo.getLockHolder("test:lock-1");
    expect(holder).not.toBeNull();
    expect(holder!.pid).toBe(12345);

    await repo.release("test:lock-1", 12345);
    const afterRelease = await repo.getLockHolder("test:lock-1");
    expect(afterRelease).toBeNull();
  });

  test("should reject duplicate lock from different PID", async () => {
    const repo = getLockRepository();
    const realPid = process.pid;
    // Acquire with current process PID → simulates a live lock holder
    await repo.acquire("test:lock-2", realPid, 10000);
    // Different PID should NOT be able to acquire (lock is still alive)
    const reacquired = await repo.acquire("test:lock-2", 99999, 10000);
    expect(reacquired).toBe(false);
    await repo.release("test:lock-2", realPid);
  });

  test("should allow same PID to re-acquire (renew)", async () => {
    const repo = getLockRepository();
    await repo.acquire("test:lock-3", 33333, 10000);
    // Same PID can re-acquire (acts as lock renewal)
    const again = await repo.acquire("test:lock-3", 33333, 30000);
    expect(again).toBe(true);
    await repo.release("test:lock-3", 33333);
  });

  test("should handle expired lock (TTL)", async () => {
    const repo = getLockRepository();
    // Acquire with 1ms TTL (will expire immediately)
    await repo.acquire("test:lock-expire", 44444, 1);
    // Wait for expiration
    await new Promise((r) => setTimeout(r, 50));
    // Now another PID should be able to acquire
    const reacquired = await repo.acquire("test:lock-expire", 55555, 10000);
    expect(reacquired).toBe(true);
    await repo.release("test:lock-expire", 55555);
  });

  test("should refresh lock via touch", async () => {
    const repo = getLockRepository();
    await repo.acquire("test:lock-touch", 66666, 5000);

    // Get initial expiry
    const before = await repo.getLockHolder("test:lock-touch");
    expect(before).not.toBeNull();

    // Touch to extend
    await repo.touch("test:lock-touch", 66666, 30000);
    const after = await repo.getLockHolder("test:lock-touch");
    expect(after!.expiresAt > before!.expiresAt).toBe(true);

    await repo.release("test:lock-touch", 66666);
  });

  test("should return null for nonexistent lock", async () => {
    const repo = getLockRepository();
    const holder = await repo.getLockHolder("test:nonexistent");
    expect(holder).toBeNull();
  });

  test("should release only by matching PID", async () => {
    const repo = getLockRepository();
    await repo.acquire("test:lock-pid", 77777, 10000);

    // Try releasing with wrong PID
    await repo.release("test:lock-pid", 88888);
    const holder = await repo.getLockHolder("test:lock-pid");
    expect(holder).not.toBeNull();
    expect(holder!.pid).toBe(77777);

    // Release with correct PID
    await repo.release("test:lock-pid", 77777);
    const after = await repo.getLockHolder("test:lock-pid");
    expect(after).toBeNull();
  });
});
