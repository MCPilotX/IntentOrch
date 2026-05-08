import { logger } from "../core/logger.js";
import { spawn, ChildProcess } from "child_process";
import fs from "fs";
import { ProcessInfo } from "./types.js";
import { ProcessStoreManager } from "./store.js";
import { getSecretManager } from "../secret/manager.js";
import { getRegistryClient } from "../registry/client.js";
import { getLogPath, ensureInTorchDir } from "../utils/paths.js";
import { isProcessRunningWithRetry } from "../utils/system.js";
import { PROGRAM_NAME } from "../utils/constants.js";
import { MCPClient } from "../mcp/client.js";
import { getToolRegistry } from "../tool-registry/registry.js";

export class ProcessManager {
  private store: ProcessStoreManager;
  private processes: Map<number, ChildProcess> = new Map();

  constructor() {
    this.store = new ProcessStoreManager();
  }

  async start(serverNameOrUrl: string): Promise<number> {
    ensureInTorchDir();

    // Get manifest
    const registryClient = getRegistryClient();
    const manifest = await registryClient.fetchManifest(serverNameOrUrl);

    // Check if the same server is already running
    const existingProcesses = await this.list();
    const runningServer = existingProcesses.find(
      (p) => p.manifest.name === manifest.name && p.status === "running",
    );

    if (runningServer) {
      // Server is already running, return the existing PID
      logger.info(
        `Server "${manifest.name}" is already running (PID: ${runningServer.pid})`,
      );
      logger.info(
        `   Returning existing process instead of creating a new one`,
      );
      return runningServer.pid;
    }

    // Determine transport type (default to stdio for backward compatibility)
    const transportType = manifest.transport?.type || "stdio";
    const isExternalService = ["http", "sse"].includes(transportType);

    // For external services (HTTP/SSE), connect to existing service instead of spawning
    if (isExternalService) {
      return this.startExternalService(manifest, serverNameOrUrl);
    }

    // Check required secrets
    const secretManager = getSecretManager();
    const envVars: Record<string, string> = {};

    if (manifest.runtime.env && manifest.runtime.env.length > 0) {
      for (const envName of manifest.runtime.env) {
        const value = await secretManager.get(envName);
        if (!value) {
          throw new Error(
            `Startup failed: Server "${manifest.name}" requires secret [${envName}] which is not set.\n` +
              `   Please set the secret by running:\n` +
              `   ${PROGRAM_NAME} secret set ${envName} <your-value>\n` +
              `   Example: ${PROGRAM_NAME} secret set ${envName} "your-secret-value-here"`,
          );
        }
        envVars[envName] = value;
      }
    }

    // Prepare log file
    const tempLogId = Date.now() + Math.floor(Math.random() * 100000);
    const tempLogPath = getLogPath(tempLogId);
    const logFile = fs.openSync(tempLogPath, "a");

    // Determine if this is a network-based server (HTTP, SSE, WebSocket, etc.)
    const isNetworkServer = ["http", "sse", "websocket", "tcp"].includes(
      transportType,
    );

    let spawnOptions: any = {
      env: { ...process.env, ...envVars },
      shell: false,
    };

    if (isNetworkServer) {
      spawnOptions = {
        ...spawnOptions,
        stdio: ["ignore", logFile, logFile],
        detached: true,
      };
    } else {
      spawnOptions = {
        ...spawnOptions,
        stdio: ["pipe", "pipe", logFile],
        detached: true,
      };
    }

    const child = spawn(
      manifest.runtime.command,
      manifest.runtime.args,
      spawnOptions,
    );

    if (isNetworkServer && child.stdin) {
      child.stdin.end();
    }

    const pid = child.pid!;
    const finalLogPath = getLogPath(pid);

    // Rename temporary log to PID log
    try {
      fs.closeSync(logFile);
      fs.renameSync(tempLogPath, finalLogPath);
    } catch (e) {
      try {
        fs.unlinkSync(tempLogPath);
      } catch (e2) {
        /* ignore */
      }
    }

    child.on("exit", async (code) => {
      try {
        const status = code === 0 ? "stopped" : "error";
        await this.store.updateProcess(pid, { status });
        this.processes.delete(pid);
      } catch (e) {
        // Ignore errors in exit handler
      }
    });

    this.processes.set(pid, child);
    child.unref();

    const waitTime = isNetworkServer ? 1000 : 2000;
    await new Promise((resolve) => setTimeout(resolve, waitTime));

    const isAlive = await isProcessRunningWithRetry(pid, 3, 500);
    const childAlive = child.exitCode === null && child.signalCode === null;
    const finalIsAlive = isAlive || childAlive;

    const processInfo: ProcessInfo = {
      pid: pid,
      serverName: serverNameOrUrl,
      name: manifest.name,
      version: manifest.version,
      manifest: {
        name: manifest.name,
        version: manifest.version,
        runtime: manifest.runtime,
      },
      startTime: Date.now(),
      status: finalIsAlive ? "running" : "stopped",
      logPath: finalLogPath,
    };

    await this.store.addProcess(processInfo);

    if (finalIsAlive) {
      logger.info(
        `Started ${manifest.name} v${manifest.version} (PID: ${pid})`,
      );
      logger.info(`  Logs: ${finalLogPath}`);
      logger.info(`  Status: Running (detached process)`);

      await this.discoverToolsIfSupported(serverNameOrUrl, manifest, child);
    } else {
      const exitCode = child.exitCode;
      const signalCode = child.signalCode;
      logger.info(`Process ${pid} exited immediately`);
      logger.info(`  Exit code: ${exitCode !== null ? exitCode : "N/A"}`);
      logger.info(`  Signal: ${signalCode || "N/A"}`);
      logger.info(`  Check logs: ${finalLogPath}`);
      logger.info(
        `  Note: Some MCP servers may exit if they require stdio communication`,
      );

      await this.store.updateProcess(pid, { status: "stopped" });
    }

    return pid;
  }

  /**
   * Start an external service (HTTP/SSE) by connecting to it rather than spawning a process.
   * The service must already be running externally.
   */
  private async startExternalService(
    manifest: any,
    serverNameOrUrl: string,
  ): Promise<number> {
    const transportType = manifest.transport?.type || manifest.runtime?.type || "sse";
    const url = manifest.transport?.url || manifest.runtime?.url;

    if (!url) {
      throw new Error(
        `External service "${manifest.name}" is missing URL configuration.\n` +
        `   Please add a "url" field to the transport config in the manifest.`,
      );
    }

    logger.info(
      `Connecting to external service ${manifest.name} (${transportType.toUpperCase()}: ${url})...`,
    );

    // Try to connect to the service to verify it's available
    const client = new MCPClient({
      transport: {
        type: transportType,
        url: url,
      },
      timeout: 15000, // Increased from 5s to 15s
      maxRetries: 2, // Increased retries
      serverName: manifest.name,
    });

    // Add error listener to prevent process crash on async connection errors
    client.on("error", (error) => {
      logger.error(`[ProcessManager] Error from external service "${manifest.name}":`, error);
    });

    try {
      await client.connect();

      // Health check: call tools/list to verify the service is responsive
      const tools = await client.listTools();
      await client.disconnect();

      // Generate a virtual PID (negative number based on URL hash)
      const virtualPid = this.generateVirtualPid(url);

      const processInfo: ProcessInfo = {
        pid: virtualPid,
        serverName: serverNameOrUrl,
        name: manifest.name,
        version: manifest.version,
        manifest: {
          name: manifest.name,
          version: manifest.version,
          runtime: manifest.runtime,
          transport: manifest.transport,
        },
        startTime: Date.now(),
        status: "running",
        external: true,
        transportType: transportType,
        url: url,
      };

      await this.store.addProcess(processInfo);

      logger.info(
        `Connected to external service ${manifest.name} (${transportType.toUpperCase()}: ${url})`,
      );
      logger.info(`  Discovered ${tools.length} tool(s)`);

      return virtualPid;
    } catch (error: any) {
      throw new Error(
        `Cannot connect to external service "${manifest.name}"\n\n` +
        `  This service is configured as ${transportType.toUpperCase()} type and must be started manually.\n` +
        `  Connection URL: ${url}\n\n` +
        `  Please ensure the service is running first, then try again.\n` +
        `  Example: node mock-mcp-server.js`,
      );
    }
  }

  /**
   * Generate a virtual PID for external services based on URL hash.
   * Uses negative numbers to distinguish from real PIDs.
   */
  private generateVirtualPid(url: string): number {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    // Ensure negative and within reasonable range
    return -(Math.abs(hash) % 100000 + 1);
  }

  /**
   * Discover tools from a running MCP server via MCP protocol's tools/list
   */
  private async discoverToolsIfSupported(
    serverName: string,
    manifest: any,
    childProcess: ChildProcess,
  ): Promise<void> {
    try {
      const hasToolsInManifest =
        (manifest.tools && manifest.tools.length > 0) ||
        (manifest.capabilities?.tools &&
          manifest.capabilities.tools.length > 0);

      if (hasToolsInManifest) {
        logger.info(
          `Server has static tool definitions, skipping dynamic discovery`,
        );
        return;
      }

      logger.info(
        `Attempting dynamic tool discovery for ${manifest.name}...`,
      );

      const client = new MCPClient({
        transport: {
          type: "stdio",
          command: manifest.runtime.command,
          args: manifest.runtime.args || [],
          existingProcess: childProcess,
        },
        timeout: 15000,
        maxRetries: 2,
        serverName: manifest.name,
      });

      client.on("stderr", (msg: string) => {
        logger.debug(`[${manifest.name}] ${msg}`);
      });

      try {
        await client.connect();
        const tools = await client.listTools();

        if (tools && tools.length > 0) {
          logger.info(
            `Dynamically discovered ${tools.length} tools from ${manifest.name}`,
          );

          const toolRegistry = getToolRegistry();
          await toolRegistry.registerDynamicTools(serverName, tools);

          for (const tool of tools.slice(0, 3)) {
            logger.info(`  - ${tool.name}: ${tool.description}`);
          }
          if (tools.length > 3) {
            logger.info(`  ... and ${tools.length - 3} more`);
          }
        } else {
          logger.info(`Server ${manifest.name} returned no tools`);
        }

        await client.disconnect();
      } catch (connectError: any) {
        logger.warn(
          `Dynamic tool discovery failed for ${manifest.name}: ${connectError.message}`,
        );
        logger.info(
          `   Tools can still be used via direct MCP protocol calls when needed`,
        );
      }
    } catch (error: any) {
      logger.error(
        `Tool discovery error for ${manifest.name}:`,
        error.message,
      );
    }
  }

  async stop(pid: number): Promise<void> {
    // Check if this is an external service
    const processInfo = await this.store.getProcess(pid);

    if (processInfo?.external) {
      // External service: just remove the record, don't kill the process
      await this.store.updateProcess(pid, { status: "stopped" });
      logger.info(`Deregistered external service ${processInfo.name}`);
      return;
    }

    const process = this.processes.get(pid);
    if (process) {
      process.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 1000));

      if (process.exitCode === null) {
        process.kill("SIGKILL");
      }

      await this.store.updateProcess(pid, { status: "stopped" });
      this.processes.delete(pid);
      logger.info(`Stopped process ${pid}`);
    } else {
      try {
        const { exec } = await import("child_process");
        const { promisify } = await import("util");
        const execAsync = promisify(exec);

        try {
          await execAsync(`kill ${pid}`);
          await new Promise((resolve) => setTimeout(resolve, 1000));

          try {
            await execAsync(`kill -0 ${pid} 2>/dev/null`);
            await execAsync(`kill -9 ${pid}`);
          } catch {
            // Process is already dead
          }
        } catch (error) {
          logger.info(`Process ${pid} may not exist or already stopped`);
        }

        logger.info(`Stopped process ${pid} using system kill command`);
      } catch (error) {
        logger.info(`Could not kill process ${pid}: ${error}`);
      }

      await this.store.updateProcess(pid, { status: "stopped" });
    }
  }

  async list(): Promise<ProcessInfo[]> {
    return this.store.listProcesses();
  }

  async listRunning(): Promise<ProcessInfo[]> {
    return this.store.listRunningProcesses();
  }

  async get(pid: number): Promise<ProcessInfo | undefined> {
    return this.store.getProcess(pid);
  }

  async getByServerName(serverName: string): Promise<ProcessInfo | undefined> {
    return this.store.getProcessByServerName(serverName);
  }

  getProcessHandle(pid: number): ChildProcess | undefined {
    return this.processes.get(pid);
  }

  async getProcessHandleByServerName(
    serverName: string,
  ): Promise<ChildProcess | undefined> {
    const info = await this.getByServerName(serverName);
    if (info && info.pid) {
      return this.processes.get(info.pid);
    }
    return undefined;
  }

  async isRunning(pid: number): Promise<boolean> {
    const process = this.processes.get(pid);
    if (process) {
      return process.exitCode === null;
    }

    const info = await this.store.getProcess(pid);
    return info?.status === "running" || false;
  }

  async cleanup(): Promise<void> {
    await this.store.clearStoppedProcesses();

    for (const [pid, process] of this.processes.entries()) {
      if (process.exitCode !== null) {
        this.processes.delete(pid);
      }
    }
  }
}

// Singleton instance
let processManager: ProcessManager | null = null;

export function getProcessManager(): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager();
  }
  return processManager;
}
