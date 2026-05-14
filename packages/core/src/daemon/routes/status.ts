/**
 * Status & System Routes
 *
 * - GET /api/status
 * - GET /api/system/stats
 * - GET /api/system/logs
 * - GET /api/auth/token
 */

import fs from "fs/promises";
import { getProcessManager } from "../../process-manager/manager.js";
import { ProcessInfo } from "../../process-manager/types.js";
import { getRegistryClient } from "../../registry/client.js";
import { getSecretManager } from "../../secret/manager.js";
import { sendJson, type RouteContext } from "./index.js";
import { logger } from "../../core/logger.js";

export async function handleStatusRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, config, startTime, requestCount } = ctx;

  // GET /api/status
  if (path === "/api/status" && method === "GET") {
    const status = {
      running: true,
      pid: process.pid,
      config,
      uptime: Date.now() - startTime,
      version: "0.8.0",
      stats: {
        activeConnections: 0,
        totalRequests: requestCount,
      },
    };
    sendJson(res, 200, status);
    return true;
  }

  // GET /api/system/stats
  if (
    (path === "/api/system/stats" || path === "/api/system/stats/") &&
    method === "GET"
  ) {
    try {
      const processManager = getProcessManager();
      const allProcesses = await processManager.list();
      const runningProcesses = allProcesses.filter(
        (p: ProcessInfo) => p.status === "running",
      );
      const registryClient = getRegistryClient();
      const cachedManifests = await registryClient.listCachedManifests();

      sendJson(res, 200, {
        stats: {
          totalServers: cachedManifests.length,
          runningServers: runningProcesses.length,
          totalProcesses: allProcesses.length,
          diskUsage: 0,
          uptime: Date.now() - startTime,
          requestCount,
        },
      });
    } catch (error: unknown) {
      logger.error("[Daemon] Error getting system stats:", error);
      sendJson(res, 500, {
        error: "Failed to get system statistics",
        message: (error instanceof Error ? error.message : String(error)),
      });
    }
    return true;
  }

  // GET /api/system/logs
  if (
    (path === "/api/system/logs" || path === "/api/system/logs/") &&
    method === "GET"
  ) {
    try {
      const logContent = await fs.readFile(config.logFile, "utf-8");
      sendJson(res, 200, {
        logs: logContent,
        logFile: config.logFile,
        lastUpdated: new Date().toISOString(),
      });
    } catch (error: unknown) {
      if ((error && typeof error === "object" && "code" in error ? (error as { code: string }).code : undefined) === "ENOENT") {
        sendJson(res, 404, {
          error: "Logs Not Found",
          message: `Log file not found: ${config.logFile}`,
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

  return false;
}
