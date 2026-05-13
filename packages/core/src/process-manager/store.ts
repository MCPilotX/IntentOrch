import fs from "fs/promises";
import { getProcessesPath, ensureInTorchDir } from "../utils/paths.js";
import { ProcessInfo, ProcessStore } from "./types.js";
import { isProcessRunning } from "../utils/system.js";
import { MCPClient } from "../mcp/client.js";

export class ProcessStoreManager {
  private storePath: string;

  constructor() {
    this.storePath = getProcessesPath();
  }

  async load(): Promise<ProcessStore> {
    try {
      ensureInTorchDir();
      const data = await fs.readFile(this.storePath, "utf-8");
      return JSON.parse(data);
    } catch (err) {
      // Return empty storage when file doesn't exist
      return { processes: [] };
    }
  }

  async save(store: ProcessStore): Promise<void> {
    const lockPath = this.storePath + ".lock";
    try {
      ensureInTorchDir();

      // Simple file locking with stale lock cleanup
      try {
        // Check if existing lock is stale (older than 10 seconds)
        try {
          const lockStat = await fs.stat(lockPath);
          const lockAge = Date.now() - lockStat.mtimeMs;
          if (lockAge > 10000) {
            // Lock is stale, remove it
            await fs.unlink(lockPath);
          }
        } catch (e) {
          // Lock file doesn't exist or can't be read, proceed
        }
      } catch (e) {
        // Ignore errors during stale lock check
      }
      await fs.writeFile(lockPath, process.pid.toString(), { flag: "wx" });

      await fs.writeFile(
        this.storePath,
        JSON.stringify(store, null, 2),
        "utf-8",
      );
    } catch (err: unknown) {
      if ((err && typeof err === "object" && "code" in err ? (err as { code: string }).code : undefined) === "EEXIST") {
        throw new Error("Process storage is locked by another process.");
      }
      throw err;
    } finally {
      try {
        await fs.unlink(lockPath);
      } catch (e) {}
    }
  }

  async addProcess(processInfo: ProcessInfo): Promise<void> {
    const store = await this.load();
    store.processes.push(processInfo);
    await this.save(store);
  }

  async updateProcess(
    pid: number,
    updates: Partial<ProcessInfo>,
  ): Promise<void> {
    const store = await this.load();
    const index = store.processes.findIndex((p) => p.pid === pid);
    if (index !== -1) {
      store.processes[index] = { ...store.processes[index], ...updates };
      await this.save(store);
    }
  }

  async removeProcess(pid: number): Promise<void> {
    const store = await this.load();
    store.processes = store.processes.filter((p) => p.pid !== pid);
    await this.save(store);
  }

  async getProcess(pid: number): Promise<ProcessInfo | undefined> {
    const store = await this.load();
    const process = store.processes.find((p) => p.pid === pid);

    if (!process) {
      return undefined;
    }

    // If process is marked as running, verify it's actually running
    if (process.status === "running") {
      const isAlive = await this.isProcessAlive(process);
      if (!isAlive) {
        process.status = "stopped";
        await this.save(store);
      }
    }

    return process;
  }

  async getProcessByServerName(
    serverName: string,
  ): Promise<ProcessInfo | undefined> {
    const store = await this.load();

    // Helper function to check if a process is actually running
    const isActuallyRunning = async (process: ProcessInfo): Promise<boolean> => {
      if (process.status !== "running") {
        return false;
      }
      // Verify the process is actually running
      const isAlive = await this.isProcessAlive(process);
      if (!isAlive) {
        process.status = "stopped";
        return false;
      }
      return true;
    };

    // First, try exact match on serverName
    for (const p of store.processes) {
      if (p.serverName === serverName && (await isActuallyRunning(p))) {
        return p;
      }
    }

    // Support for owner/project format (e.g., "Joooook/12306-mcp")
    if (serverName.includes("/")) {
      const parts = serverName.split("/");
      if (parts.length === 2) {
        const projectName = parts[1]; // e.g., "12306-mcp"

        // Try exact match with project name
        for (const p of store.processes) {
          if (p.serverName === projectName && (await isActuallyRunning(p))) {
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
          for (const p of store.processes) {
            if (p.serverName === name && (await isActuallyRunning(p))) {
              return p;
            }
          }
        }
      }
    }

    // If no exact match, try to find by manifest.name (alias discovery)
    for (const p of store.processes) {
      if (
        (await isActuallyRunning(p)) &&
        p.manifest &&
        p.manifest.name === serverName
      ) {
        // Save store if any processes were updated
        const needsSave = store.processes.some(
          (proc) => proc.status === "stopped",
        );
        if (needsSave) {
          await this.save(store);
        }
        return p;
      }
    }

    // Save store if any processes were updated
    const needsSave = store.processes.some(
      (p) => p.status === "stopped",
    );
    if (needsSave) {
      await this.save(store);
    }

    return undefined;
  }

  async listProcesses(): Promise<ProcessInfo[]> {
    const store = await this.load();
    let changed = false;

    // Filter out invalid processes
    const validProcesses: ProcessInfo[] = [];
    for (const p of store.processes) {
      // Keep processes that are running or recently stopped
      if (p.status === "running") {
        const isAlive = await this.isProcessAlive(p);
        if (!isAlive) {
          p.status = "stopped";
          changed = true;
          // Keep stopped processes for a while
          validProcesses.push(p);
        } else {
          validProcesses.push(p);
        }
      } else if (p.status === "stopped") {
        // Clean up obviously invalid PIDs (only for non-external services)
        if (!p.external && p.pid <= 0) {
          changed = true;
          continue; // Remove invalid PID
        }

        // Clean up old stopped processes (older than 1 hour)
        const age = Date.now() - p.startTime;
        if (age > 3600000) {
          changed = true;
          continue;
        }
        validProcesses.push(p);
      } else {
        validProcesses.push(p);
      }
    }

    if (changed) {
      store.processes = validProcesses;
      await this.save(store);
    }

    return validProcesses;
  }

  async listRunningProcesses(): Promise<ProcessInfo[]> {
    const processes = await this.listProcesses();
    return processes.filter((p) => p.status === "running");
  }

  async clearStoppedProcesses(): Promise<void> {
    const store = await this.load();
    store.processes = store.processes.filter((p) => p.status === "running");
    await this.save(store);
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
}
