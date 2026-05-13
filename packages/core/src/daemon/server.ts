/**
 * Daemon HTTP Server
 *
 * Refactored to use route splitting + middleware chain pattern.
 * Routes are organized into separate files under routes/.
 * Middleware (CORS, auth, body parsing, logging) runs as a chain before routing.
 */

import http from "http";
import fs from "fs/promises";
import { getProcessManager } from "../process-manager/manager.js";
import { ProcessInfo } from "../process-manager/types.js";
import { getRegistryClient } from "../registry/client.js";
import { getToolRegistry } from "../tool-registry/registry.js";
import {
  ensureInTorchDir,
  getDaemonPidPath,
  getDaemonLogPath,
  getLogPath,
} from "../utils/paths.js";
import { DaemonConfig } from "./types.js";
import { healthCheckScheduler } from "../kernel/health-check-scheduler.js";
import { logger } from "../core/logger.js";

// ==================== Route Handlers ====================
import { handleStatusRoutes } from "./routes/status.js";
import { handleAuthRoutes } from "./routes/auth.js";
import { handleServerRoutes } from "./routes/servers.js";
import { handleWorkflowRoutes } from "./routes/workflows.js";
import { handleExecutionRoutes } from "./routes/execution.js";
import { handleAIRoutes } from "./routes/ai.js";
import { handleConfigRoutes } from "./routes/config.js";
import { handleSecretsRoutes } from "./routes/secrets.js";

// ==================== Middleware ====================
import {
  corsMiddleware,
  optionsHandler,
  authMiddleware,
  bodyParserMiddleware,
  loggingMiddleware,
  errorHandlerMiddleware,
  runMiddlewareChain,
  type MiddlewareFn,
} from "./routes/middleware.js";

// ==================== Shared Types ====================
import { sendJson, type RouteContext } from "./routes/index.js";

import { Router } from "./router/router.js";

import { FSLock } from "../utils/fs-lock.js";

export class DaemonServer {
  private server: http.Server;
  private config: DaemonConfig;
  private startTime: number;
  private requestCount: number;
  private router: Router;

  constructor(
    config: Partial<DaemonConfig> = {
      /* Intentionally empty */
    },
  ) {
    this.config = {
      port: config.port || 9658,
      host: config.host || "localhost",
      pidFile: config.pidFile || getDaemonPidPath(),
      logFile: config.logFile || getDaemonLogPath(),
    };
    this.startTime = Date.now();
    this.requestCount = 0;
    this.router = this.setupRouter();
    this.server = this.createServer();
  }

  private setupRouter(): Router {
    const router = new Router();
    
    // Register all routes
    router.use("ALL", /^\/api\/status/, handleStatusRoutes);
    router.use("ALL", /^\/api\/servers/, handleServerRoutes);
    router.use("ALL", /^\/api\/workflows/, handleWorkflowRoutes);
    router.use("ALL", /^\/api\/execute/, handleExecutionRoutes);
    router.use("ALL", /^\/api\/ai/, handleAIRoutes);
    router.use("ALL", /^\/api\/config/, handleConfigRoutes);
    router.use("ALL", /^\/api\/secrets/, handleSecretsRoutes);
    router.use("ALL", /^\/api\/auth/, handleAuthRoutes);

    return router;
  }

  private createServer() {
    return http.createServer(async (req, res) => {
      try {
        await this.handleRequest(req, res);
      } catch (e) {
        logger.error("[Daemon Error]", e);
        sendJson(res, 500, {
          error: "Internal Error",
          message: (e as Error).message,
        });
      }
    });
  }

  private async handleRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
  ) {
    const method = req.method || "GET";
    const parsedUrl = new URL(req.url || "/", "http://localhost");
    const path = parsedUrl.pathname;

    // Build route context
    const ctx: RouteContext = {
      req,
      res,
      path,
      method,
      body: "",
      parsedUrl,
      config: this.config,
      startTime: this.startTime,
      requestCount: this.requestCount,
    };

    // ==================== Middleware Chain ====================
    const middlewares: MiddlewareFn[] = [
      corsMiddleware,
      optionsHandler, // Short-circuits on OPTIONS
      loggingMiddleware,
      authMiddleware,
      bodyParserMiddleware,
    ];

    const mwResult = await runMiddlewareChain(ctx, middlewares);
    if (!mwResult) return; // Middleware short-circuited (e.g., OPTIONS, auth failure)

    // Increment request count
    if (method !== "OPTIONS") {
      this.requestCount++;
      ctx.requestCount = this.requestCount;
    }

    // ==================== Route Dispatch ====================
    const handled = await this.router.dispatch(ctx);
    if (handled) return;

    // ==================== 404 Fallback ====================
    sendJson(res, 404, { error: "Not Found", path });
  }

  async start() {
    ensureInTorchDir();

    // Use FSLock to prevent multiple instances and handle stale PID files
    const acquired = await FSLock.acquire(this.config.pidFile, 60000); // 1 min TTL
    if (!acquired) {
      const existingPid = await fs.readFile(this.config.pidFile, "utf-8").catch(() => "unknown");
      logger.error(`[Daemon] Failed to start: Another instance is running with PID ${existingPid}`);
      process.exit(1);
    }

    // Update PID file content (FSLock already wrote the PID, but let's be explicit)
    await fs.writeFile(this.config.pidFile, process.pid.toString());

    // Setup periodic touch to keep lock alive
    const touchInterval = setInterval(() => FSLock.touch(this.config.pidFile), 30000);

    return new Promise<void>((resolve) => {
      this.server.listen(this.config.port, this.config.host, async () => {
        logger.info(
          `[Daemon] Server started on ${this.config.host}:${this.config.port}`,
        );

        this.autoStartServers().catch((error) => {
          logger.error("[Daemon] Error auto-starting servers:", error);
        });

        this.initHealthCheckScheduler().catch((error) => {
          logger.error(
            "[Daemon] Error initializing health check scheduler:",
            error,
          );
        });

        // Cleanup on shutdown
        process.on("SIGTERM", () => {
          clearInterval(touchInterval);
          this.stop();
        });
        process.on("SIGINT", () => {
          clearInterval(touchInterval);
          this.stop();
        });

        resolve();
      });
    });
  }

  private async initHealthCheckScheduler(): Promise<void> {
    try {
      logger.info("[Daemon] Initializing health check scheduler...");
      const runningServers = await getProcessManager().list();
      const runningProcesses = runningServers.filter(
        (p: { status?: string }) => p.status === "running",
      );

      if (runningProcesses.length === 0) {
        logger.info(
          "[Daemon] No running servers to register for health checks",
        );
        return;
      }

      logger.info(
        `[Daemon] Registering ${runningProcesses.length} running servers for health checks`,
      );

      for (const server of runningProcesses) {
        const serverName =
          server.serverName || server.name || `server-${server.pid}`;
        const processManager = getProcessManager();

        healthCheckScheduler.registerServer(
          serverName,
          async () => {
            try {
              const processInfo = await processManager.get(server.pid);
              return (
                processInfo !== null && processInfo?.status === "running"
              );
            } catch {
              return false;
            }
          },
        );

        logger.info(
          `[Daemon] Registered health check for server: ${serverName} (PID: ${server.pid})`,
        );
      }

      healthCheckScheduler.on("degraded", (result: { serverName: string; consecutiveFailures: number }) => {
        logger.warn(
          `[Daemon] Health check: Server "${result.serverName}" is DEGRADED (${result.consecutiveFailures} consecutive failures)`,
        );
      });

      healthCheckScheduler.on("recovered", (result: { serverName: string }) => {
        logger.info(
          `[Daemon] Health check: Server "${result.serverName}" RECOVERED`,
        );
      });

      healthCheckScheduler.start();
      logger.info("[Daemon] Health check scheduler started successfully");
    } catch (error) {
      logger.error(
        "[Daemon] Failed to initialize health check scheduler:",
        error,
      );
    }
  }

  private async autoStartServers(): Promise<void> {
    try {
      logger.info("[Daemon] Starting auto-start manager for MCP servers...");
      const { AutoStartManager } = await import(
        "../utils/auto-start-manager.js"
      );
      const autoStartManager = new AutoStartManager();
      const configuredServers = await this.getConfiguredServers();

      if (configuredServers.length === 0) {
        logger.info("[Daemon] No servers configured for auto-start");
        return;
      }

      logger.info(
        `[Daemon] Found ${configuredServers.length} configured servers: ${configuredServers.join(", ")}`,
      );
      const results =
        await autoStartManager.ensureServersRunning(configuredServers);
      const summary = autoStartManager.getResultsSummary(results);
      logger.info(
        `[Daemon] Auto-start completed: ${summary.successful} started, ${summary.alreadyRunning} already running, ${summary.failed} failed`,
      );

      if (summary.failed > 0) {
        logger.warn(
          "[Daemon] Some servers failed to start. Check logs for details.",
        );
      }

      await new Promise((resolve) => setTimeout(resolve, 5000));
      await this.ensureToolsRegistered(configuredServers);
    } catch (error) {
      logger.error("[Daemon] Failed to auto-start servers:", error);
    }
  }

  private async getConfiguredServers(): Promise<string[]> {
    const envServers = process.env.INTORCH_AUTO_START_SERVERS;
    if (envServers) {
      return envServers
        .split(",")
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
    }

    try {
      const { getConfigService } = await import(
        "../core/config-service.js"
      );
      const configService = getConfigService();
      const config = await configService.getAppConfig();
      if (
        config.services &&
        config.services.autoStart &&
        Array.isArray(config.services.autoStart)
      ) {
        return config.services.autoStart;
      }
    } catch (error) {
      logger.warn(
        "[Daemon] Failed to read auto-start configuration:",
        error,
      );
    }

    return [];
  }

  private async ensureToolsRegistered(
    serverNames: string[],
  ): Promise<void> {
    try {
      logger.info("[Daemon] Ensuring tools are registered for servers...");
      const { MCPClient: MCPClientImport } = await import("../mcp/client.js");
      const processManager = getProcessManager();
      const toolRegistry = getToolRegistry();
      const registryClient = getRegistryClient();

      await new Promise((resolve) => setTimeout(resolve, 2000));
      const runningServers = await processManager.list();
      logger.info(
        `[Daemon] Found ${runningServers.length} running servers`,
      );

      for (const serverName of serverNames) {
        try {
          const serverInfo = runningServers.find(
            (s: ProcessInfo) =>
              s.status === "running" &&
              (s.serverName === serverName ||
                s.name === serverName ||
                (s.manifest &&
                  s.manifest.name &&
                  serverName.includes(s.manifest.name)) ||
                serverName.includes(s.name || "")),
          );

          if (!serverInfo) {
            logger.info(
              `[Daemon] Server ${serverName} is not running or not found, skipping tool registration`,
            );
            continue;
          }

          logger.info(
            `[Daemon] Registering tools for server: ${serverName} (PID: ${serverInfo.pid})`,
          );
          const manifest =
            await registryClient.getCachedManifest(serverName);
          if (!manifest) {
            logger.warn(
              `[Daemon] No manifest found for server ${serverName}`,
            );
            continue;
          }

          const hasTools =
            manifest.tools ||
            (manifest.capabilities && manifest.capabilities.tools);
          if (!hasTools) {
            logger.info(
              `[Daemon] Manifest for ${serverName} has no tools field, trying dynamic discovery`,
            );
            await this.discoverToolsDynamically(serverInfo);
          } else {
            await toolRegistry.registerToolsFromManifest(
              serverName,
              manifest as unknown as Record<string, unknown>,
            );
            logger.info(
              `[Daemon] Tools registered from manifest for server: ${serverName}`,
            );
          }
        } catch (serverError) {
          logger.error(
            `[Daemon] Error registering tools for server ${serverName}:`,
            serverError,
          );
        }
      }

      logger.info("[Daemon] Tool registration completed");
    } catch (error) {
      logger.error(
        "[Daemon] Failed to ensure tools are registered:",
        error,
      );
    }
  }

  private async discoverToolsDynamically(serverInfo: { name: string; serverName?: string; transport?: { type: string; url?: string }; runtime?: { command: string; args?: string[]; env?: Record<string, string> } }): Promise<void> {
    try {
      logger.info(
        `[Daemon] Attempting dynamic tool discovery for server: ${serverInfo.name}`,
      );
      const { MCPClient: MCPClientImport } = await import(
        "../mcp/client.js"
      );
      const { getToolRegistry } = await import(
        "../tool-registry/registry.js"
      );

      const client = new MCPClientImport({
        transport: {
          type: "stdio",
          command: serverInfo.manifest.runtime.command,
          args: serverInfo.manifest.runtime.args || [],
          env: { ...process.env } as Record<string, string>,
        },
      });

      client.on("error", (error: Error) => {
        logger.warn(
          `[Daemon] MCP Client error for ${serverInfo.name} during discovery: ${error.message || error}`,
        );
      });

      await client.connect();
      const tools = await client.listTools();
      logger.info(
        `[Daemon] Discovered ${tools.length} tools dynamically from server ${serverInfo.name}`,
      );

      const toolRegistry = getToolRegistry();
      const toolMetadataArray = tools.map((tool: { name: string; description?: string; inputSchema?: { properties?: Record<string, unknown> } }) => ({
        name: tool.name,
        description: tool.description || "",
        serverName: serverInfo.serverName,
        actualServerName: serverInfo.name,
        parameters: tool.inputSchema?.properties || {},
        isDynamic: true,
        discoveryTime: new Date().toISOString(),
      }));

      await toolRegistry.registerDynamicTools(
        serverInfo.serverName,
        toolMetadataArray,
      );
      await client.disconnect();
      logger.info(
        `[Daemon] Dynamic tool discovery completed for ${serverInfo.name}`,
      );
    } catch (error) {
      logger.error(
        `[Daemon] Failed to discover tools dynamically for ${serverInfo.name}:`,
        error,
      );
    }
  }

  async stop() {
    await FSLock.release(this.config.pidFile);
    return new Promise<void>((r) => this.server.close(() => r()));
  }
}
