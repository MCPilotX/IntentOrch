/**
 * Tool Execution Engine
 *
 * Extracted from ExecuteService. Handles:
 * - MCP server connection management
 * - Tool discovery and caching
 * - Tool call execution with timeout protection
 * - Result caching with TTL
 * - Server auto-start
 * - Connection cleanup
 */

import { MCPClient } from "../../mcp/client.js";
import { getProcessManager } from "../../process-manager/manager.js";
import { getRegistryClient } from "../../registry/client.js";
import type { Manifest } from "../../registry/types.js";
import type { TransportConfig } from "../../mcp/types.js";
import { AutoStartManager } from "../../utils/auto-start-manager.js";
import { getConfigService } from "../../core/config-service.js";
import { logger } from "../../core/logger.js";
import { IntentOrchError, ErrorCode } from "../../core/error-handler.js";
import { Timeouts } from "../../core/constants.js";

export interface ConnectedServer {
  name: string;
  client: MCPClient;
}

export interface ToolInfo {
  name: string;
  serverName: string;
  inputSchema?: Record<string, unknown>;
  description?: string;
  [key: string]: unknown;
}

export class ToolExecutionEngine {
  private connectedServers: Map<string, ConnectedServer> = new Map();
  private connectedUrls: Set<string> = new Set();

  /**
   * Result cache for tool calls.
   * Key: `${toolName}:${JSON.stringify(sortedParams)}`
   * Value: { result, timestamp }
   * Cache is cleared between sessions.
   */
  private toolResultCache: Map<string, { result: unknown; timestamp: number }> = new Map();
  /** Cache TTL: 5 minutes */
  private readonly CACHE_TTL_MS = 5 * 60 * 1000;

  // NOTE: ReAct loop constants (MAX_REACT_EXECUTION_TIME_MS, MAX_CONVERSATION_HISTORY_LENGTH)
  // were previously duplicated here from ReActLoopEngine. After the refactor that delegated
  // the ReAct loop to ReActLoopEngine.execute(), ExecuteService no longer references these
  // constants on ToolExecutionEngine. They have been removed. All callers should use
  // ReActLoopEngine's own constants instead.

  // ==================== Connection Management ====================

  /**
   * Connect to running MCP servers.
   */
  async connectToRunningServers(options: { simulate?: boolean } = {}): Promise<void> {
    if (options.simulate) return;

    const processManager = getProcessManager();
    const runningServers = await processManager.listRunning();

    if (runningServers.length === 0) {
      logger.info("[ToolExecutor] No running MCP servers found — nothing to connect to");
      return;
    }

    logger.debug(`[ToolExecutor] Connecting to ${runningServers.length} running servers`);

    for (const server of runningServers) {
      try {
        const registryClient = getRegistryClient();
        let manifest = await registryClient.getCachedManifest(server.serverName);

        if (!manifest) {
          try {
            manifest = await registryClient.fetchManifest(server.serverName);
          } catch (fetchError: unknown) {
            logger.warn(`[ToolExecutor] Failed to fetch manifest for ${server.serverName}: ${fetchError instanceof Error ? fetchError.message : String(fetchError)}`);
            continue;
          }
        }

        if (manifest) {
          const transportUrl = manifest.transport?.url;
          if (transportUrl && this.connectedUrls.has(transportUrl)) {
            continue;
          }
          try {
            await this.connectToServer(server.serverName, manifest as Manifest);
          } catch (connectError: unknown) {
            // If connection fails (e.g. EBADF from a zombie process), mark the server
            // as stopped so we don't retry it on every subsequent request.
            logger.warn(`[ToolExecutor] Failed to connect to ${server.serverName}: ${connectError instanceof Error ? connectError.message : String(connectError)}`);
            try {
              const pm = getProcessManager();
              const info = await pm.getByServerName(server.serverName);
              if (info) {
                await pm.stop(info.pid);
              }
            } catch {
              // best-effort cleanup
            }
            continue;  // Skip this server, try others
          }
        }
      } catch (error: unknown) {
        logger.warn(`[ToolExecutor] Failed to connect to ${server.serverName}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }
  }

  /**
   * Connect to a specific MCP server.
   */
  async connectToServer(serverName: string, manifest: Manifest): Promise<void> {
    if (this.connectedServers.has(serverName)) return;

    try {
      const transportType = manifest.transport?.type || "stdio";
      const isExternal = ["sse", "http", "websocket", "tcp"].includes(transportType);

      const processManager = getProcessManager();
      let existingProcess: import("child_process").ChildProcess | null = null;

      if (!isExternal) {
        existingProcess = (await processManager.getProcessHandleByServerName(serverName)) ?? null;
        const runningInfo = await processManager.getByServerName(serverName);

        // runningInfo may be undefined if no process is registered for this server.
        // This is valid — it means the server has never been started, so we skip
        // the stop-and-restart logic and proceed directly to connecting.
        if (!existingProcess && runningInfo && runningInfo.status === "running") {
          try {
            await processManager.stop(runningInfo.pid);
            await new Promise((resolve) => setTimeout(resolve, 1000));

            // Verify the process actually stopped after kill attempt
            const stillAlive = await processManager.isRunning(runningInfo.pid);
            if (stillAlive) {
              throw new Error(
                `Process ${runningInfo.pid} for ${serverName} did not terminate after SIGTERM/SIGKILL. ` +
                `Aborting connection to prevent port/state conflicts.`
              );
            }
          } catch (stopError: unknown) {
            logger.error(`[ToolExecutor] Failed to stop existing process for ${serverName}: ${stopError instanceof Error ? stopError.message : String(stopError)}`);
            // CRITICAL: Do NOT continue if we can't stop the existing process.
            // Proceeding would allow starting a second instance of the same server
            // on the same port, causing file descriptor leaks and unpredictable behavior.
            // runningInfo is guaranteed non-null here because the outer if-check
            // (runningInfo && runningInfo.status === "running") ensures we only
            // reach this catch block when runningInfo is defined.
            const pid = runningInfo!.pid;
            throw new Error(
              `Cannot connect to ${serverName}: previous process (PID ${pid}) is still running. ` +
              `Please stop it manually with 'intorch server stop ${pid}' and try again.`
            );
          }
        }
      }

      const envVars: Record<string, string> = { ...process.env } as Record<string, string>;

      if (manifest.runtime?.env && manifest.runtime.env.length > 0) {
        const { getSecretManager } = await import("../../secret/manager.js");
        const secretManager = getSecretManager();
        for (const envName of manifest.runtime.env) {
          if (!envVars[envName]) {
            try {
              const secretValue = await secretManager.get(envName);
              if (secretValue) {
                envVars[envName] = secretValue;
              }
            } catch (e: unknown) {
              logger.debug(`[ToolExecutor] Failed to get secret ${envName}: ${(e instanceof Error ? e.message : String(e))}`);
            }
          }
        }
      }

      let transportConfig: TransportConfig;
      if (transportType === "sse") {
        transportConfig = {
          type: "sse",
          url: manifest.transport?.url || `http://localhost:3000/sse`,
          headers: manifest.transport?.headers,
        };
      } else if (transportType === "http") {
        transportConfig = {
          type: "http",
          url: manifest.transport?.url || `http://localhost:3000`,
          headers: manifest.transport?.headers,
        };
      } else {
        transportConfig = {
          type: "stdio",
          command: manifest.runtime.command,
          args: manifest.runtime.args || [],
          env: envVars,
          existingProcess: existingProcess ?? undefined,
        };
      }

      const client = new MCPClient({
        transport: transportConfig,
        serverName: serverName,
      });

      client.on("error", (error) => {
        logger.warn(`[ToolExecutor] MCP Client error for ${serverName}: ${(error instanceof Error ? error.message : String(error)) || error}`);
      });

      await client.connect();

      this.connectedServers.set(serverName, { name: serverName, client });

      if (manifest.transport?.url) {
        this.connectedUrls.add(manifest.transport.url);
      }

      logger.debug(`[ToolExecutor] Connected to server: ${serverName}`);
    } catch (error: unknown) {
      logger.error(`[ToolExecutor] Failed to connect to server ${serverName}: ${(error instanceof Error ? error.message : String(error))}`);
      throw error;
    }
  }

  /**
   * Get all available tools from connected servers.
   */
  async getAvailableTools(): Promise<ToolInfo[]> {
    const tools: ToolInfo[] = [];

    for (const [name, server] of this.connectedServers) {
      try {
        const serverTools = await Promise.race([
          server.client.listTools(),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error(`Request timeout after ${Timeouts.TOOL_LIST}ms`)), Timeouts.TOOL_LIST),
          ),
        ]);

        const toolsWithServer = serverTools.map((tool) => ({
          ...tool,
          serverName: name,
        }));

        tools.push(...toolsWithServer as ToolInfo[]);
      } catch (error: unknown) {
        logger.warn(`[ToolExecutor] Failed to list tools for server ${name}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }

    // Fallback: if no tools from connected servers, try ToolRegistry (cached manifests)
    if (tools.length === 0) {
      try {
        const { getToolRegistry } = await import("../../tool-registry/registry.js");
        const registry = getToolRegistry();
        const allTools = await registry.getAllTools();
        for (const t of allTools) {
          tools.push({
            name: t.name,
            serverName: t.serverName,
            description: t.description,
            inputSchema: t.parameters as Record<string, unknown> | undefined,
          });
        }
        if (tools.length > 0) {
          logger.info(`[ToolExecutor] Using ${tools.length} tools from ToolRegistry fallback`);
        }
      } catch {
        // best-effort
      }
    }

    return tools;
  }

  /**
   * Create a tool executor function.
   */
  createToolExecutor(
    tools: ToolInfo[],
  ): (toolName: string, params: Record<string, unknown>) => Promise<unknown> {
    const toolToServer = new Map<string, string>();
    for (const tool of tools) {
      if (tool.name && tool.serverName) {
        toolToServer.set(tool.name, tool.serverName);
      }
    }

    return async (toolName: string, params: Record<string, unknown>): Promise<unknown> => {
      // Check cache first
      const cached = this.getCachedToolResult(toolName, params);
      if (cached !== null) {
        return cached;
      }

      const serverName = toolToServer.get(toolName);

      if (!serverName) {
        throw new IntentOrchError(ErrorCode.TOOL_NOT_FOUND, `Tool ${toolName} not found in any connected server`);
      }

      const server = this.connectedServers.get(serverName);
      if (!server) {
        throw new IntentOrchError(ErrorCode.SERVER_DISCONNECTED, `Server ${serverName} for tool ${toolName} is no longer connected`);
      }

      logger.debug(`[ToolExecutor] Calling tool ${toolName} on server ${serverName}`);

      const TOOL_CALL_TIMEOUT_MS = 30_000;
      const result = await Promise.race([
        server.client.callTool(toolName, params),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Tool call ${toolName} timed out after ${TOOL_CALL_TIMEOUT_MS}ms`)), TOOL_CALL_TIMEOUT_MS),
        ),
      ]);

      this.setCachedToolResult(toolName, params, result);

      return result;
    };
  }

  /**
   * Handle auto-start of servers based on query analysis.
   */
  async handleAutoStart(query: string, options: { autoStart?: boolean }): Promise<void> {
    if (!options.autoStart) return;

    const autoStartManager = new AutoStartManager();
    const requiredServers = await autoStartManager.analyzeIntentForServers(query);

    if (requiredServers.length > 0) {
      const results = await autoStartManager.ensureServersRunning(requiredServers);

      if (!autoStartManager.areAllServersReady(results)) {
        throw new IntentOrchError(ErrorCode.SERVER_START_FAILED, "Some required servers failed to start");
      }
    }
  }

  /**
   * Ensure servers are running for a workflow.
   */
  async ensureServersForWorkflow(workflow: { steps?: Array<{ serverId?: string; serverName?: string }> }): Promise<void> {
    const requiredServers = new Set<string>();

    for (const step of workflow.steps || []) {
      const serverRef = step.serverId || step.serverName;
      if (serverRef) {
        requiredServers.add(serverRef);
      }
    }

    if (requiredServers.size > 0) {
      const autoStartManager = new AutoStartManager();
      const results = await autoStartManager.ensureServersRunning(Array.from(requiredServers));

      if (!autoStartManager.areAllServersReady(results)) {
        throw new IntentOrchError(ErrorCode.SERVER_START_FAILED, "Some required servers failed to start");
      }
    }
  }

  /**
   * Cleanup all connections.
   */
  async cleanupConnections(): Promise<void> {
    const disconnectPromises: Promise<void>[] = [];
    for (const [name] of this.connectedServers) {
      disconnectPromises.push(this.disconnectServer(name));
    }
    await Promise.allSettled(disconnectPromises);
    this.connectedServers.clear();
  }

  /**
   * Disconnect a specific server.
   */
  async disconnectServer(serverName: string): Promise<void> {
    const server = this.connectedServers.get(serverName);
    if (server) {
      try {
        await server.client.disconnect();
        logger.debug(`[ToolExecutor] Disconnected from server: ${serverName}`);
      } catch (error: unknown) {
        logger.error(`[ToolExecutor] Failed to disconnect from server ${serverName}: ${(error instanceof Error ? error.message : String(error))}`);
      }
    }
  }

  // ==================== Cache Management ====================

  /**
   * Build a cache key for a tool call.
   */
  private buildToolCacheKey(toolName: string, params: Record<string, unknown>): string {
    const sortedParams = Object.keys(params).sort().reduce((acc: Record<string, unknown>, key) => {
      acc[key] = params[key];
      return acc;
    }, {} as Record<string, unknown>);
    return `${toolName}:${JSON.stringify(sortedParams)}`;
  }

  /**
   * Get a cached tool result if available and not expired.
   */
  private getCachedToolResult(toolName: string, params: Record<string, unknown>): unknown | null {
    const key = this.buildToolCacheKey(toolName, params);
    const cached = this.toolResultCache.get(key);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL_MS) {
      logger.debug(`[ToolExecutor] Cache hit for ${key}`);
      return cached.result;
    }
    if (cached) {
      this.toolResultCache.delete(key);
    }
    return null;
  }

  /**
   * Cache a tool result.
   */
  private setCachedToolResult(toolName: string, params: Record<string, unknown>, result: unknown): void {
    const key = this.buildToolCacheKey(toolName, params);
    this.toolResultCache.set(key, { result, timestamp: Date.now() });
  }

  /**
   * Clear the tool result cache.
   */
  clearToolResultCache(): void {
    this.toolResultCache.clear();
    logger.debug("[ToolExecutor] Tool result cache cleared");
  }

  /**
   * Resolve server name for a tool.
   */
  resolveServerName(toolName: string, context?: { availableServers?: string[] }): string | null {
    for (const [serverName] of this.connectedServers) {
      if (serverName.includes(toolName.split(".")[0])) {
        return serverName;
      }
    }

    if (context?.availableServers && context.availableServers.length > 0) {
      for (const server of context.availableServers) {
        if (toolName.includes(server) || server.includes(toolName.split(".")[0])) {
          return server;
        }
      }
    }

    return null;
  }
}

// Singleton
let toolExecutorInstance: ToolExecutionEngine | null = null;

export function getToolExecutor(): ToolExecutionEngine {
  if (!toolExecutorInstance) {
    toolExecutorInstance = new ToolExecutionEngine();
  }
  return toolExecutorInstance;
}
