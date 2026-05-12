/**
 * SecretManager Unit Tests
 *
 * Tests for secret management operations:
 * - set/get/delete/list
 * - Persistence and loading
 * - Error handling
 *
 * Note: SecretManager uses AES-256-GCM encryption for persistence.
 * These tests mock the filesystem layer to test the in-memory operations.
 */

import { SecretManager } from "../secret/manager.js";

// In-memory file store for testing
const fileStore: Record<string, Buffer> = {};
let fileStats: Record<string, { mtimeMs: number }> = {};

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
    // Update stats so subsequent stat calls find the file
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
}));

jest.mock("../utils/paths.js", () => ({
  getSecretsPath: jest.fn(() => "/tmp/.intorch/secrets.json"),
  ensureInTorchDir: jest.fn(),
}));

describe("SecretManager", () => {
  let secretManager: SecretManager;

  beforeEach(() => {
    jest.clearAllMocks();
    // Clear the in-memory file store
    Object.keys(fileStore).forEach((k) => delete fileStore[k]);
    Object.keys(fileStats).forEach((k) => delete fileStats[k]);
    secretManager = new SecretManager();
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
