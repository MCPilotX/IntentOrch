/**
 * Server Management Routes
 *
 * - GET    /api/servers              — List all servers
 * - POST   /api/servers              — Start a server
 * - GET    /api/servers/:pid         — Get server details
 * - DELETE /api/servers/:pid         — Stop a server
 * - GET    /api/servers/:pid/logs    — Get server logs
 * - POST   /api/servers/import       — Import servers from config
 * - POST   /api/servers/pull         — Pull server manifest
 * - GET    /api/servers/search       — Search servers
 * - GET    /api/servers/cached       — List cached manifests
 */

import { getProcessManager } from "../../process-manager/manager.js";
import { getRegistryClient } from "../../registry/client.js";
import { getToolRegistry } from "../../tool-registry/registry.js";
import { getLogPath } from "../../utils/paths.js";
import { sendJson, type RouteContext } from "./index.js";
import { logger } from "../../core/logger.js";

export async function handleServerRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // ==================== GET /api/servers ====================
  if (path === "/api/servers" && method === "GET") {
    try {
      const processManager = getProcessManager();
      const registryClient = getRegistryClient();
      const toolRegistry = getToolRegistry();

      const processes = await processManager.list();
      const cachedNames = await registryClient.listCachedManifests();

      // Use a Map to merge processes and cached manifests by name
      const serverMap = new Map<string, Record<string, unknown>>();

      // 1. Add all active/stored processes
      // For duplicate server names, prefer the running process over stopped ones.
      // If multiple running processes exist, prefer the most recent one.
      for (const proc of processes) {
        const name = proc.serverName || proc.name;
        const existing = serverMap.get(name);
        
        // Keep the existing entry if:
        // - Existing is running and current is not running, OR
        // - Both are running but existing is more recent
        if (existing) {
          const existingRunning = existing.status === "running";
          const currentRunning = proc.status === "running";
          
          if (existingRunning && !currentRunning) {
            continue; // Keep the running entry
          }
          if (existingRunning && currentRunning && existing.startTime >= proc.startTime) {
            continue; // Keep the more recent running entry
          }
        }
        
        serverMap.set(name, {
          ...proc,
          status: proc.status || "stopped",
          source: "process",
        });
      }

      // 2. Add cached manifests that aren't already in the list
      for (const name of cachedNames) {
        if (!serverMap.has(name)) {
          try {
            const manifest = await registryClient.getCachedManifest(name);
            if (manifest) {
              serverMap.set(name, {
                id: `cached_${name}`,
                name: manifest.name,
                serverName: name,
                version: manifest.version,
                status: "pulled",
                manifest: manifest,
                source: "cache",
              });
            }
          } catch (e) {
            // Skip failed manifest loads
          }
        }
      }

      const servers = Array.from(serverMap.values());

      // Enrich all with tools
      const enrichedServers = await Promise.all(
        servers.map(async (server: Record<string, unknown>) => {
          const serverKey = (server.serverName || server.name) as string | undefined;
          const tools = serverKey ? await toolRegistry.findToolsByServer(serverKey) : [];
          return {
            ...server,
            tools: tools,
          };
        }),
      );

      sendJson(res, 200, { servers: enrichedServers });
    } catch (error: unknown) {
      logger.error("[Daemon] Error getting servers:", error);
      sendJson(res, 500, {
        error: "Internal Server Error",
        message: (error instanceof Error ? error.message : String(error)),
      });
    }
    return true;
  }

  // ==================== POST /api/servers ====================
  if (path === "/api/servers" && method === "POST") {
    try {
      const data = JSON.parse(body);
      const serverNameOrUrl = data.serverNameOrUrl || data.serverId || data.serverName;

      if (!serverNameOrUrl || typeof serverNameOrUrl !== "string") {
        sendJson(res, 400, {
          error: "Bad Request",
          message: "serverNameOrUrl (or serverId/serverName) is required and must be a string",
        });
        return true;
      }

      // First fetch and cache the manifest
      const manifest =
        await getRegistryClient().fetchManifest(serverNameOrUrl);

      // Register tools
      await getToolRegistry().registerToolsFromManifest(
        serverNameOrUrl,
        manifest,
      );

      // Check if the server is already running before starting
      const existingProcesses = await getProcessManager().list();
      const runningServer = existingProcesses.find(
        (p) =>
          p.manifest &&
          p.manifest.name === manifest.name &&
          p.status === "running",
      );

      if (runningServer) {
        const tools =
          await getToolRegistry().findToolsByServer(serverNameOrUrl);
        sendJson(res, 200, {
          pid: runningServer.pid,
          name: runningServer.name || runningServer.manifest.name,
          version: runningServer.version || runningServer.manifest.version,
          status: runningServer.status,
          logPath: runningServer.logPath || getLogPath(runningServer.pid),
          tools: tools,
          alreadyRunning: true,
          external: runningServer.external || false,
        });
        return true;
      }

      // Then start the server
      const pid = await getProcessManager().start(serverNameOrUrl);
      const processInfo = await getProcessManager().get(pid);

      if (!processInfo) {
        sendJson(res, 500, {
          error: "Server Startup Failed",
          message: `Failed to retrieve process info for PID ${pid}`,
          suggestion: "Check if the process started successfully",
        });
        return true;
      }

      const tools = await getToolRegistry().findToolsByServer(serverNameOrUrl);
      sendJson(res, 201, {
        pid: processInfo.pid,
        name: processInfo.name || processInfo.manifest.name,
        version: processInfo.version || processInfo.manifest.version,
        status: processInfo.status,
        logPath: processInfo.logPath || getLogPath(processInfo.pid),
        tools: tools,
        alreadyRunning: false,
        external: processInfo.external || false,
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
        return true;
      }

      // If starting fails, still return the cached manifest info
      try {
        const { serverNameOrUrl } = JSON.parse(body);
        const manifest =
          await getRegistryClient().getCachedManifest(serverNameOrUrl);
        if (manifest) {
          sendJson(res, 500, {
            error: "Server Startup Failed",
            message: `Failed to start server: ${(error instanceof Error ? error.message : String(error))}`,
            details: {
              manifestName: manifest.name,
              manifestVersion: manifest.version,
              manifestDescription: manifest.description,
              suggestion:
                "Check server configuration and required secrets",
            },
          });
          return true;
        }
      } catch (cacheError) {
        // Ignore cache error
      }

      sendJson(res, 500, {
        error: "Server Startup Failed",
        message: `Failed to start server: ${(error instanceof Error ? error.message : String(error))}`,
        suggestion:
          "Check if the server name/URL is valid and all required secrets are set",
      });
    }
    return true;
  }

  // ==================== POST /api/servers/import ====================
  if (path === "/api/servers/import" && method === "POST") {
    try {
      const { config } = JSON.parse(body);
      if (!config || typeof config !== "string") {
        sendJson(res, 400, {
          error: "Bad Request",
          message: "config is required and must be a JSON string",
        });
        return true;
      }

      const manifests = await getRegistryClient().importConfig(config);

      sendJson(res, 200, {
        success: true,
        message: `Successfully imported ${manifests.length} MCP server(s)`,
        imported: manifests.map((m) => ({
          name: m.name,
          version: m.version,
          description: m.description,
        })),
        total: manifests.length,
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 400, {
          success: false,
          error: "Import Failed",
          message: (error instanceof Error ? error.message : String(error)),
          suggestion:
            'Please check that the config is valid Claude Desktop format (has "mcpServers" field)',
        });
      }
    }
    return true;
  }

  // ==================== POST /api/servers/pull ====================
  if (path === "/api/servers/pull" && method === "POST") {
    try {
      const data = JSON.parse(body);
      const serverNameOrUrl = data.serverNameOrUrl || data.serverName || data.serverId;

      if (!serverNameOrUrl || typeof serverNameOrUrl !== "string") {
        sendJson(res, 400, {
          error: "Bad Request",
          message: "serverNameOrUrl (or serverName/serverId) is required and must be a string",
        });
        return true;
      }

      const manifest =
        await getRegistryClient().fetchManifest(serverNameOrUrl);
      logger.info(
        "[Daemon] Pulled manifest:",
        JSON.stringify(manifest, null, 2).substring(0, 500),
      );

      await getToolRegistry().registerToolsFromManifest(
        serverNameOrUrl,
        manifest,
      );

      sendJson(res, 200, {
        success: true,
        message: `Successfully pulled and cached manifest for ${manifest.name}`,
        manifest: {
          name: manifest.name,
          version: manifest.version,
          description: manifest.description,
        },
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 400, {
          success: false,
          error: "Manifest Pull Failed",
          message: `Failed to pull manifest: ${(error instanceof Error ? error.message : String(error))}`,
          suggestion:
            "Check if the server name/URL is valid and accessible",
        });
      }
    }
    return true;
  }

  // ==================== GET /api/servers/search ====================
  if (path === "/api/servers/search" && method === "GET") {
    const query = ctx.parsedUrl.searchParams.get("q") || "";
    const source = ctx.parsedUrl.searchParams.get("source") || "all";
    sendJson(
      res,
      200,
      await getRegistryClient().searchServices({ query, source }),
    );
    return true;
  }

  // ==================== GET /api/servers/cached ====================
  if (path === "/api/servers/cached" && method === "GET") {
    const cachedManifests = await getRegistryClient().listCachedManifests();
    const services = cachedManifests.map((name: string) => ({
      name,
      description: `Cached MCP Server: ${name}`,
      version: "unknown",
      source: "local",
      tags: ["cached", "local"],
      lastUpdated: new Date().toISOString().split("T")[0],
    }));
    sendJson(res, 200, {
      services,
      total: services.length,
      source: "local",
      hasMore: false,
    });
    return true;
  }

  // ==================== GET /api/servers/:pid ====================
  const detailMatch = path.match(/^\/api\/servers\/(\d+)$/);
  if (detailMatch && method === "GET") {
    const pid = parseInt(detailMatch[1], 10);
    const processInfo = await getProcessManager().get(pid);
    if (!processInfo) {
      sendJson(res, 404, {
        error: "Not Found",
        message: `Server with PID ${pid} not found`,
      });
      return true;
    }
    sendJson(res, 200, processInfo);
    return true;
  }

  // ==================== GET /api/servers/:pid/logs ====================
  const logsMatch = path.match(/^\/api\/servers\/(\d+)\/logs$/);
  if (logsMatch && method === "GET") {
    const pid = parseInt(logsMatch[1], 10);
    const processInfo = await getProcessManager().get(pid);
    if (!processInfo) {
      sendJson(res, 404, {
        error: "Not Found",
        message: `Server with PID ${pid} not found`,
      });
      return true;
    }

    try {
      const fs = await import("fs/promises");
      const logPath = getLogPath(pid);
      const logContent = await fs.readFile(logPath, "utf-8");
      sendJson(res, 200, {
        pid,
        logs: logContent,
        logPath,
      });
    } catch (error: unknown) {
      if ((error && typeof error === "object" && "code" in error ? (error as { code: string }).code : undefined) === "ENOENT") {
        sendJson(res, 404, {
          error: "Logs Not Found",
          message: `Log file for PID ${pid} not found`,
        });
      } else {
        sendJson(res, 500, {
          error: "Internal Server Error",
          message: `Failed to read logs: ${(error instanceof Error ? error.message : String(error))}`,
        });
      }
    }
    return true;
  }

  // ==================== DELETE /api/servers/:pid ====================
  if (detailMatch && method === "DELETE") {
    const pid = parseInt(detailMatch[1], 10);
    const processInfo = await getProcessManager().get(pid);
    if (!processInfo) {
      sendJson(res, 404, {
        error: "Not Found",
        message: `Server with PID ${pid} not found`,
      });
      return true;
    }

    if (processInfo.status === "stopped") {
      sendJson(res, 200, {
        success: true,
        message: `Server with PID ${pid} is already stopped`,
        pid,
      });
      return true;
    }

    try {
      await getProcessManager().stop(pid);
      sendJson(res, 200, {
        success: true,
        message: `Server with PID ${pid} stopped successfully`,
        pid,
      });
    } catch (error: unknown) {
      sendJson(res, 500, {
        error: "Failed to Stop Server",
        message: `Failed to stop server: ${(error instanceof Error ? error.message : String(error))}`,
      });
    }
    return true;
  }

  return false;
}
