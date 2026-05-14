import * as fsSyncReal from "fs";
import * as path from "path";
import { SecretManager } from "../secret/manager.js";
import { DatabaseManager, closeSqliteDb } from "../utils/sqlite.js";

// In-memory file store for testing (legacy)
const fileStore: Record<string, Buffer> = {};
let fileStats: Record<string, { mtimeMs: number }> = {};
const TEST_DB_DIR = "/tmp/intorch-test-secrets";
const TEST_DB_PATH = path.join(TEST_DB_DIR, "intorch.db");

// Mock filesystem
jest.mock("fs/promises", () => ({
  readFile: jest.fn(async (path: string) => {
    if (fileStore[path]) {
      return fileStore[path];
    }
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
  writeFile: jest.fn(async (path: string, data: Buffer) => {
    fileStore[path] = data;
    fileStats[path] = { mtimeMs: Date.now() };
  }),
  stat: jest.fn(async (path: string) => {
    if (fileStats[path]) {
      return fileStats[path];
    }
    throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
  }),
  unlink: jest.fn(async (path: string) => {
    delete fileStore[path];
    delete fileStats[path];
  }),
  mkdir: jest.fn(async () => {}),
  rename: jest.fn(async (oldPath, newPath) => {
    fileStore[newPath] = fileStore[oldPath];
    fileStats[newPath] = fileStats[oldPath];
    delete fileStore[oldPath];
    delete fileStats[oldPath];
  }),
}));

// Use real fs for the SQLite database since createClient needs a real file or :memory:
// But we'll mock the paths to point to a test directory
jest.mock("../utils/paths.js", () => ({
  getInTorchDir: jest.fn(() => "/tmp/intorch-test-secrets"),
  getSecretsPath: jest.fn(() => "/tmp/intorch-test-secrets/secrets.json.enc"),
  getProcessesPath: jest.fn(() => "/tmp/intorch-test-secrets/processes.json"),
  getConfigPath: jest.fn(() => "/tmp/intorch-test-secrets/config.json"),
  ensureInTorchDir: jest.fn(),
}));

describe("SecretManager", () => {
  let secretManager: SecretManager;

  beforeAll(() => {
    if (!fsSyncReal.existsSync(TEST_DB_DIR)) {
      fsSyncReal.mkdirSync(TEST_DB_DIR, { recursive: true });
    }
  });

  beforeEach(async () => {
    jest.clearAllMocks();
    // Clear the in-memory file store
    Object.keys(fileStore).forEach((k) => delete fileStore[k]);
    Object.keys(fileStats).forEach((k) => delete fileStats[k]);
    
    // Clear the SQLite database file
    if (fsSyncReal.existsSync(TEST_DB_PATH)) {
      fsSyncReal.unlinkSync(TEST_DB_PATH);
    }
    // Also clear WAL files
    if (fsSyncReal.existsSync(TEST_DB_PATH + "-wal")) fsSyncReal.unlinkSync(TEST_DB_PATH + "-wal");
    if (fsSyncReal.existsSync(TEST_DB_PATH + "-shm")) fsSyncReal.unlinkSync(TEST_DB_PATH + "-shm");

    closeSqliteDb();
    secretManager = new SecretManager();
  });

  afterAll(() => {
    closeSqliteDb();
    if (fsSyncReal.existsSync(TEST_DB_PATH)) {
      fsSyncReal.unlinkSync(TEST_DB_PATH);
    }
  });

  describe("set() and get()", () => {
    it("should store and retrieve a secret", async () => {
      await secretManager.set("api_key", "sk-test-123");
      const value = await secretManager.get("api_key");
      expect(value).toBe("sk-test-123");
    });

    it("should overwrite existing secret", async () => {
      await secretManager.set("api_key", "old-value");
      await secretManager.set("api_key", "new-value");
      const value = await secretManager.get("api_key");
      expect(value).toBe("new-value");
    });

    it("should return undefined for non-existent key", async () => {
      const value = await secretManager.get("non_existent_key");
      expect(value).toBeUndefined();
    });
  });

  describe("remove()", () => {
    it("should remove an existing secret", async () => {
      await secretManager.set("temp_key", "temp-value");
      await secretManager.remove("temp_key");
      const value = await secretManager.get("temp_key");
      expect(value).toBeUndefined();
    });

    it("should not throw when removing non-existent key", async () => {
      await expect(
        secretManager.remove("non_existent_key"),
      ).resolves.not.toThrow();
    });
  });

  describe("list()", () => {
    it("should return empty list when no secrets exist", async () => {
      const keys = await secretManager.list();
      expect(keys).toEqual([]);
    });

    it("should return all secret keys", async () => {
      await secretManager.set("key1", "value1");
      await secretManager.set("key2", "value2");
      await secretManager.set("key3", "value3");

      const keys = await secretManager.list();
      expect(keys).toHaveLength(3);
      expect(keys).toContain("key1");
      expect(keys).toContain("key2");
      expect(keys).toContain("key3");
    });
  });

  describe("has()", () => {
    it("should return true for existing secret", async () => {
      await secretManager.set("existing_key", "value");
      const exists = await secretManager.has("existing_key");
      expect(exists).toBe(true);
    });

    it("should return false for non-existing secret", async () => {
      const exists = await secretManager.has("non_existing_key");
      expect(exists).toBe(false);
    });
  });

  describe("getAll()", () => {
    it("should return all secrets as a Map", async () => {
      await secretManager.set("a", "1");
      await secretManager.set("b", "2");

      const all = await secretManager.getAll();
      expect(all).toBeInstanceOf(Map);
      expect(all.size).toBe(2);
      expect(all.get("a")).toBe("1");
      expect(all.get("b")).toBe("2");
    });
  });
});
