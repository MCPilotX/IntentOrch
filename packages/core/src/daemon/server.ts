/**
 * Daemon HTTP Server
 *
 * Refactored to use route splitting + middleware chain pattern.
 * Routes are organized into separate files under routes/.
 * Middleware (CORS, auth, body parsing, logging) runs as a chain before routing.
 */

import http from "http";
import { getProcessManager } from "../process-manager/manager.js";
import type { ProcessInfo } from "../process-manager/types.js";
import { getRegistryClient } from "../registry/client.js";
import { getToolRegistry } from "../tool-registry/registry.js";
import {
  ensureInTorchDir,
  getDaemonPidPath,
  getDaemonLogPath,
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
  runMiddlewareChain,
  type MiddlewareFn,
} from "./routes/middleware.js";

// ==================== Shared Types ====================
import { sendJson, type RouteContext } from "./routes/index.js";

import { Router } from "./router/router.js";

import { getLockRepository } from "../utils/sqlite.js";

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
    // /api/status and /api/system/* share the same handler
    router.use("ALL", /^\/api\/(?:status(?:\/|$)|system\/|dashboard(?:\/|$))/, handleStatusRoutes);
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

    // SECURITY FIX: Wrap middleware chain execution in try-catch to prevent
    // unhandled rejections from leaking connections. If middleware throws
    // (e.g. body parse timeout, auth service failure), we send a 500 response
    // and return immediately. Without this, the request would hang forever
    // or cause "writeHead already called" errors.
    let mwResult: boolean;
    try {
      mwResult = await runMiddlewareChain(ctx, middlewares);
    } catch (err) {
      logger.error("[Daemon] Middleware chain error:", err);
      sendJson(res, 500, {
        error: "Internal Error",
        message: (err as Error).message || "Middleware chain failed",
      });
      return;
    }
    if (!mwResult) return; // Middleware short-circuited (e.g., OPTIONS, auth failure)

    // Increment request count
    if (method !== "OPTIONS") {
      this.requestCount++;
      ctx.requestCount = this.requestCount;
    }

    // ==================== Route Dispatch ====================
    // Router.dispatch() already has internal try-catch, so errors in route
    // handlers will be caught there and a 500 response sent. The await ensures
    // we don't have fire-and-forget behavior.
    const handled = await this.router.dispatch(ctx);
    if (handled) return;

    // ==================== 404 Fallback ====================
    sendJson(res, 404, { error: "Not Found", path });
  }

  async start() {
    ensureInTorchDir();

    // ==================== Global error handlers ====================
    // Catch any unhandled errors to prevent silent daemon exit.
    // Log the error and keep the process alive when possible.
    process.on("uncaughtException", (error) => {
      logger.error("[Daemon] UNCAUGHT EXCEPTION:", error);
      logger.error("[Daemon] Stack:", (error as Error).stack);
    });
    process.on("unhandledRejection", (reason) => {
      logger.error("[Daemon] UNHANDLED REJECTION:", reason);
    });

    // ==================== Initialize shared infrastructure ====================
    // Initialize the database and config service at daemon startup so that
    // all subsequent operations (process management, secrets, tool registry, etc.)
    // share a single SQLite connection and configuration context.
    // This prevents the "each component initializes on its own" problem that
    // causes data inconsistency between daemon and CLI sessions.
    const { DatabaseManager } = await import("../utils/sqlite.js");
    await DatabaseManager.getInstance().initialize();
    const { getConfigService } = await import("../core/config-service.js");
    await getConfigService().initialize();
    logger.info("[Daemon] Database and configuration service initialized");

    // Ensure a daemon auth token exists so the Web UI login can work.
    // The default token "intorch" is used when no explicit token has been configured.
    // Users can change it later with: intorch secret set daemon_auth_token <new-token>
    const { getSecretManager } = await import("../secret/manager.js");
    const sm = getSecretManager();
    const existingToken = await sm.get("daemon_auth_token").catch(() => undefined);
    if (!existingToken) {
      await sm.set("daemon_auth_token", "intorch");
      logger.info("[Daemon] Generated default auth token (daemon_auth_token=intorch)");
      logger.info("[Daemon] Change it via: intorch secret set daemon_auth_token <your-token>");
    }

    // Use SQLite-backed lock to prevent multiple daemon instances.
    // The lock is stored in the daemon_locks table and handles stale locks
    // via TTL expiration + process-liveness check automatically.
    const lockName = `daemon:pid:${this.config.pidFile}`;
    const lockRepo = getLockRepository();
    const acquired = await lockRepo.acquire(lockName, process.pid, 60000);
    if (!acquired) {
      const holder = await lockRepo.getLockHolder(lockName);
      logger.error(
        `[Daemon] Failed to start: Another instance is running (PID ${holder?.pid ?? "unknown"})`,
      );
      process.exit(1);
    }

    // Setup periodic touch to keep lock alive (refreshes TTL every 30s)
    const touchInterval = setInterval(
      () => lockRepo.touch(lockName, process.pid, 60000),
      30000,
    );

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

        // Adopt orphan processes from previous daemon instance
        getProcessManager().adoptOrphanProcesses().catch((error) => {
          logger.error(
            "[Daemon] Error adopting orphan processes:",
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
            // serverInfo.manifest is guaranteed non-null here because we checked
            // `s.manifest && s.manifest.name` above (line 387-390) before reaching this branch.
            await this.discoverToolsDynamically(serverInfo as ProcessInfo & { manifest: NonNullable<ProcessInfo['manifest']> });
          } else {
            await toolRegistry.registerToolsFromManifest(
              serverName,
              manifest,
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

  /**
   * Dynamically discover tools from a running MCP server.
   * Called when a manifest lacks static tool definitions.
   * 
   * @param serverInfo - ProcessInfo from the process store, which includes
   *                     the `manifest` field with runtime/transport config.
   *                     This method requires access to `manifest.runtime`.
   */
  private async discoverToolsDynamically(serverInfo: ProcessInfo & { manifest: NonNullable<ProcessInfo['manifest']> }): Promise<void> {
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

      const runtime = serverInfo.manifest.runtime;
      const command = typeof runtime === 'object' && runtime !== null ? (runtime as Record<string, unknown>).command as string : undefined;
      const args = typeof runtime === 'object' && runtime !== null ? (runtime as Record<string, unknown>).args as string[] : [];

      if (!command) {
        logger.warn(
          `[Daemon] Cannot discover tools for ${serverInfo.name}: manifest.runtime.command is missing`,
        );
        return;
      }

      const client = new MCPClientImport({
        transport: {
          type: "stdio",
          command,
          args,
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
    const lockName = `daemon:pid:${this.config.pidFile}`;
    await getLockRepository().release(lockName, process.pid);
    return new Promise<void>((r) => this.server.close(() => r()));
  }
}
