import fs from "fs/promises";
import fsSync from "fs";
import { getProcessesPath, ensureInTorchDir } from "../utils/paths.js";
import { ProcessInfo, ProcessStore } from "./types.js";
import { isProcessRunning } from "../utils/system.js";
import { MCPClient } from "../mcp/client.js";
import { DatabaseManager, getProcessRepository } from "../utils/sqlite.js";
import { logger } from "../core/logger.js";

export class ProcessStoreManager {
  private storePath: string;
  private _initialized = false;

  constructor() {
    this.storePath = getProcessesPath();
  }

  private async ensureInitialized(): Promise<void> {
    if (this._initialized) return;
    await DatabaseManager.getInstance().initialize();
    await this.migrateLegacyProcesses();
    this._initialized = true;
  }

  private async migrateLegacyProcesses(): Promise<void> {
    try {
      if (fsSync.existsSync(this.storePath)) {
        const data = await fs.readFile(this.storePath, "utf-8");
        const store: ProcessStore = JSON.parse(data);
        const repo = getProcessRepository();

        for (const process of store.processes) {
          // Map to repository expected structure
          const repoData: Record<string, unknown> = {
            ...process,
            external: process.external ? 1 : 0,
            manifest: JSON.stringify(process.manifest),
            tools: process.tools ? JSON.stringify(process.tools) : null,
          };
          await repo.upsert(repoData);
        }

        await fs.rename(this.storePath, this.storePath + ".bak");
        logger.info("[ProcessStoreManager] Migrated legacy processes to SQLite");
      }
    } catch (err) {
      logger.warn(`[ProcessStoreManager] Legacy process migration failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async load(): Promise<ProcessStore> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    const processes = await repo.list();
    return { 
      processes: processes.map(p => this.rowToProcessInfo(p))
    };
  }

  async save(store: ProcessStore): Promise<void> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    // Since we now use individual row operations, save(store) is less efficient
    // but we'll maintain it for compatibility by upserting all.
    for (const process of store.processes) {
      await repo.upsert(this.processInfoToRow(process));
    }
  }

  async addProcess(processInfo: ProcessInfo): Promise<void> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    await repo.upsert(this.processInfoToRow(processInfo));
  }

  async updateProcess(
    pid: number,
    updates: Partial<ProcessInfo>,
  ): Promise<void> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    const process = await repo.findByPid(pid);
    if (process) {
      const current = this.rowToProcessInfo(process);
      await repo.upsert(this.processInfoToRow({ ...current, ...updates }));
    }
  }

  async removeProcess(pid: number): Promise<void> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    await repo.delete(pid);
  }

  async getProcess(pid: number): Promise<ProcessInfo | undefined> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    const row = await repo.findByPid(pid);

    if (!row) {
      return undefined;
    }

    const process = this.rowToProcessInfo(row);

    // If process is marked as running, verify it's actually running
    if (process.status === "running") {
      const isAlive = await this.isProcessAlive(process);
      if (!isAlive) {
        process.status = "stopped";
        await repo.upsert(this.processInfoToRow(process));
      }
    }

    return process;
  }

  async getProcessByServerName(
    serverName: string,
  ): Promise<ProcessInfo | undefined> {
    await this.ensureInitialized();
    const repo = getProcessRepository();

    // Helper function to check if a process is actually running
    const isActuallyRunning = async (process: ProcessInfo): Promise<boolean> => {
      if (process.status !== "running") {
        return false;
      }
      // Verify the process is actually running
      const isAlive = await this.isProcessAlive(process);
      if (!isAlive) {
        process.status = "stopped";
        await repo.upsert(this.processInfoToRow(process));
        return false;
      }
      return true;
    };

    // First, try exact match on serverName
    const exactMatch = await repo.findByServerName(serverName);
    if (exactMatch) {
      const p = this.rowToProcessInfo(exactMatch);
      if (await isActuallyRunning(p)) {
        return p;
      }
    }

    // Support for owner/project format (e.g., "Joooook/12306-mcp")
    if (serverName.includes("/")) {
      const parts = serverName.split("/");
      if (parts.length === 2) {
        const projectName = parts[1]; // e.g., "12306-mcp"

        // Try exact match with project name
        const projectMatch = await repo.findByServerName(projectName);
        if (projectMatch) {
          const p = this.rowToProcessInfo(projectMatch);
          if (await isActuallyRunning(p)) {
            return p;
          }
        }

        // Try variations of project name
        const possibleNames = [
          projectName,
          projectName.replace("-mcp", ""),
          projectName.replace("-server", ""),
          `mcp-${projectName}`,
          `${projectName}-mcp`,
          `${projectName}-server`,
        ];

        for (const name of possibleNames) {
          const match = await repo.findByServerName(name);
          if (match) {
            const p = this.rowToProcessInfo(match);
            if (await isActuallyRunning(p)) {
              return p;
            }
          }
        }
      }
    }

    // If no exact match, try to find by manifest.name (alias discovery) in all processes
    const all = await repo.list();
    for (const row of all) {
      const p = this.rowToProcessInfo(row);
      if (
        (await isActuallyRunning(p)) &&
        p.manifest &&
        p.manifest.name === serverName
      ) {
        return p;
      }
    }

    return undefined;
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    const rows = await repo.list();
    
    const validProcesses: ProcessInfo[] = [];
    for (const row of rows) {
      const p = this.rowToProcessInfo(row);
      // Keep processes that are running or recently stopped
      if (p.status === "running") {
        const isAlive = await this.isProcessAlive(p);
        if (!isAlive) {
          p.status = "stopped";
          await repo.upsert(this.processInfoToRow(p));
          validProcesses.push(p);
        } else {
          validProcesses.push(p);
        }
      } else if (p.status === "stopped") {
        // Clean up obviously invalid PIDs (only for non-external services)
        if (!p.external && p.pid <= 0) {
          await repo.delete(p.pid);
          continue; // Remove invalid PID
        }

        // Clean up old stopped processes (older than 1 hour)
        const age = Date.now() - p.startTime;
        if (age > 3600000) {
          await repo.delete(p.pid);
          continue;
        }
        validProcesses.push(p);
      } else {
        validProcesses.push(p);
      }
    }

    return validProcesses;
  }

  async listRunningProcesses(): Promise<ProcessInfo[]> {
    const processes = await this.listProcesses();
    return processes.filter((p) => p.status === "running");
  }

  async clearStoppedProcesses(): Promise<void> {
    await this.ensureInitialized();
    const repo = getProcessRepository();
    const all = await repo.list();
    for (const row of all) {
      if (row.status !== "running") {
        await repo.delete(row.pid as number);
      }
    }
  }

  /**
   * Check if a process is alive based on its type.
   * For external services (HTTP/SSE), try to connect to the URL.
   * For managed processes, check PID.
   */
  private async isProcessAlive(process: ProcessInfo): Promise<boolean> {
    if (process.external) {
      return this.checkExternalServiceAlive(process);
    }
    return isProcessRunning(process.pid);
  }

  /**
   * Check if an external service (HTTP/SSE) is still alive by attempting to connect.
   */
  private async checkExternalServiceAlive(process: ProcessInfo): Promise<boolean> {
    if (!process.url || !process.transportType) {
      return false;
    }

    try {
      const client = new MCPClient({
        transport: {
          type: process.transportType as "http" | "sse",
          url: process.url,
        },
        timeout: 3000,
        maxRetries: 1,
        serverName: process.name,
      });

      await client.connect();
      await client.disconnect();
      return true;
    } catch {
      return false;
    }
  }

  private rowToProcessInfo(row: Record<string, unknown>): ProcessInfo {
    return {
      pid: row.pid as number,
      serverName: row.server_name as string,
      name: row.name as string,
      version: row.version as string,
      manifest: JSON.parse(row.manifest as string),
      startTime: row.start_time as number,
      status: row.status as ProcessInfo["status"],
      port: (row.port as number) || undefined,
      logPath: (row.log_path as string) || undefined,
      external: row.external === 1,
      transportType: (row.transport_type as string) || undefined,
      url: (row.url as string) || undefined,
      tools: row.tools ? JSON.parse(row.tools as string) : undefined,
    };
  }

  private processInfoToRow(p: ProcessInfo): Record<string, unknown> {
    return {
      pid: p.pid,
      server_name: p.serverName,
      name: p.name,
      version: p.version,
      manifest: JSON.stringify(p.manifest),
      start_time: p.startTime,
      status: p.status,
      port: p.port ?? null,
      log_path: p.logPath ?? null,
      external: p.external ? 1 : 0,
      transport_type: p.transportType ?? null,
      url: p.url ?? null,
      tools: p.tools ? JSON.stringify(p.tools) : null,
    };
  }
}
