/**
 * RegistryClient Unit Tests
 *
 * Tests for registry client operations:
 * - fetchManifest / getCachedManifest
 * - searchServices
 * - importConfig
 * - listCachedManifests
 */

import { RegistryClient } from "../registry/client.js";

// Mock dependencies
jest.mock("../registry/cache.js");
jest.mock("../utils/paths.js", () => ({
  ensureInTorchDir: jest.fn(),
}));

describe("RegistryClient", () => {
  let registryClient: RegistryClient;
  let mockCache: any;

  beforeEach(() => {
    jest.clearAllMocks();
    registryClient = new RegistryClient();
    mockCache = (registryClient as any).cache;
  });

  describe("listCachedManifests()", () => {
    it("should return empty list when no manifests cached", async () => {
      jest.spyOn(mockCache, "list").mockResolvedValue([]);

      const result = await registryClient.listCachedManifests();
      expect(result).toEqual([]);
    });

    it("should return list of cached manifest names", async () => {
      const mockNames = ["server-a", "server-b", "server-c"];
      jest.spyOn(mockCache, "list").mockResolvedValue(mockNames);

      const result = await registryClient.listCachedManifests();
      expect(result).toEqual(mockNames);
    });
  });

  describe("getCachedManifest()", () => {
    it("should return null for non-cached manifest", async () => {
      jest.spyOn(mockCache, "get").mockResolvedValue(null);

      const result = await registryClient.getCachedManifest("non-existent");
      expect(result).toBeNull();
    });

    it("should return cached manifest data", async () => {
      const mockManifest = {
        name: "test-server",
        version: "1.0.0",
        description: "Test MCP Server",
      };
      jest.spyOn(mockCache, "get").mockResolvedValue(mockManifest);

      const result = await registryClient.getCachedManifest("test-server");
      expect(result).toEqual(mockManifest);
    });
  });

  describe("searchServices()", () => {
    beforeEach(() => {
      // Clear all sources and add a controlled mock source
      (registryClient as any).sources.clear();
    });

    it("should return search results for valid query", async () => {
      const mockResults = {
        services: [
          { name: "server-a", description: "Test A", source: "npm" },
        ],
        total: 1,
        source: "npm",
        hasMore: false,
      };

      // Mock the sources map to return a source with searchServices
      const mockSource = {
        searchServices: jest.fn().mockResolvedValue(mockResults),
      };
      (registryClient as any).sources.set("npm", mockSource);

      const result = await registryClient.searchServices({
        query: "test",
        source: "npm",
      });
      expect(result.services).toHaveLength(1);
      expect(result.services[0].name).toBe("server-a");
    });

    it("should handle empty query gracefully", async () => {
      // With no sources registered, search should return empty
      const result = await registryClient.searchServices({ query: "" });
      expect(result.services).toEqual([]);
    });
  });

  describe("importConfig()", () => {
    it("should throw error for invalid JSON config", async () => {
      await expect(
        registryClient.importConfig("invalid json"),
      ).rejects.toThrow();
    });

    it("should throw error for config without mcpServers", async () => {
      const config = JSON.stringify({ someField: "value" });
      await expect(registryClient.importConfig(config)).rejects.toThrow(
        /mcpServers/i,
      );
    });

    it("should parse valid Claude Desktop config", async () => {
      const config = JSON.stringify({
        mcpServers: {
          "test-server": {
            command: "node",
            args: ["server.js"],
          },
        },
      });

      jest
        .spyOn(registryClient as any, "fetchManifest")
        .mockResolvedValue({
          name: "test-server",
          version: "1.0.0",
          runtime: { command: "node", args: ["server.js"] },
        });

      const result = await registryClient.importConfig(config);
      expect(result).toHaveLength(1);
      expect(result[0].name).toBe("test-server");
    });
  });
});
