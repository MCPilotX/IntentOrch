import { Command } from "commander";
import {
  getProcessManager,
  DaemonClient,
  PROGRAM_NAME,
  getDisplayName,
} from "@intentorch/core";
import Table from "cli-table3";

interface ProcessInfo {
  pid: number;
  serverName: string;
  name: string;
  version: string;
  manifest: {
    name: string;
    version: string;
    runtime: { type: string; command: string; args: string[] };
  };
  startTime: number;
  status: string;
  logPath: string;
  external?: boolean;
  transportType?: string;
  url?: string;
}

function renderProcessTable(
  processes: ProcessInfo[],
  title: string,
  subtitle?: string,
): void {
  if (processes.length === 0) {
    console.log("No processes found");
    return;
  }

  const table = new Table({
    head: ["PID", "Status", "Type", "Server Name", "Version", "Started At"],
    style: { head: ["cyan"], border: ["gray"] },
  });

  processes.forEach((p) => {
    const startTime = new Date(p.startTime).toLocaleTimeString();
    let statusText = p.status.toUpperCase();

    let displayName = "Unknown";
    try {
      displayName = getDisplayName(p.serverName);
    } catch (error) {
      const err = error as Error;
      console.warn(
        `Warning: Failed to get display name for server ${p.pid}: ${err.message}`,
      );
      displayName = p.name || `Server-${p.pid}`;
    }

    if (p.status === "running") {
      statusText = `\u2705 ${statusText}`;
    } else if (p.status === "stopped") {
      statusText = `\u23F9\uFE0F ${statusText}`;
    } else {
      statusText = `\u274C ${statusText}`;
    }

    const transportType = p.external
      ? (p.transportType || "EXT").toUpperCase()
      : "STDIO";

    table.push([
      p.pid.toString(),
      statusText,
      transportType,
      displayName,
      p.version || p.manifest.version,
      startTime,
    ]);
  });

  console.log(`=== ${title} ===`);
  if (subtitle) console.log(subtitle);
  console.log(table.toString());
  console.log(`Total: ${processes.length}\n`);
}

export function psCommand(): Command {
  const command = new Command("ps")
    .description("List all MCP Server processes")
    .option("-r, --running", "Show only running processes")
    .option("--no-daemon", "Force local mode even if daemon is running")
    .action(async (options) => {
      try {
        const useDaemon = options.daemon;

        if (!useDaemon) {
          // User explicitly requested no daemon, use local mode
          const processManager = getProcessManager();
          const processes = options.running
            ? await processManager.listRunning()
            : await processManager.list();

          if (processes.length === 0) {
            console.log("No processes found (local mode)");
            return;
          }

          renderProcessTable(
            processes as ProcessInfo[],
            "MCP SERVER PROCESSES (LOCAL MODE)",
            "Note: Showing local processes only (not managed by daemon)",
          );
          return;
        }

        // Try daemon mode
        try {
          const client = new DaemonClient();
          const isDaemonRunning = await client.isDaemonRunning();
          if (!isDaemonRunning) {
            console.error("Daemon is not running.");
            console.error("\nTo start the daemon:");
            console.error(`   ${PROGRAM_NAME} daemon start`);
            console.error("\nOr use local mode:");
            console.error(`   ${PROGRAM_NAME} ps --no-daemon`);
            return;
          }

          const response = await client.listServers();

          // Validate response format
          if (!response || typeof response !== "object") {
            throw new Error("Invalid response from daemon: expected object");
          }

          if (!Array.isArray(response.servers)) {
            throw new Error(
              "Invalid response from daemon: servers must be an array",
            );
          }

          // Filter by running status if requested
          let servers = response.servers;
          if (options.running) {
            servers = servers.filter((s) => s && s.status === "running");
          }

          // Convert to ProcessInfo format with validation
          const processes: ProcessInfo[] = servers.map((s) => {
            if (!s || typeof s !== "object") {
              return {
                pid: 0,
                serverName: "Invalid Server Data",
                name: "Invalid Server Data",
                version: "0.0.0",
                manifest: {
                  name: "Invalid Server Data",
                  version: "0.0.0",
                  runtime: { type: "unknown", command: "", args: [] },
                },
                startTime: Date.now(),
                status: "error",
                logPath: "",
              };
            }

            return {
              pid: Number(s.pid) || 0,
              serverName: String(s.serverName || s.name || "Unknown"),
              name: String(s.name || "Unknown"),
              version: String(s.version || "0.0.0"),
              manifest: {
                name: String(s.name || "Unknown"),
                version: String(s.version || "0.0.0"),
                runtime: { type: "unknown", command: "", args: [] },
              },
              startTime: Number(s.startTime) || Date.now(),
              status: ["running", "stopped", "error"].includes(s.status)
                ? s.status
                : "unknown",
              logPath: String(s.logPath || ""),
              external: Boolean(s.external),
              transportType: s.transportType ? String(s.transportType) : undefined,
              url: s.url ? String(s.url) : undefined,
            };
          });

          renderProcessTable(processes, "MCP SERVER PROCESSES (DAEMON MODE)");
        } catch (daemonError) {
          const error = daemonError as Error;
          console.error("Daemon mode failed:", error.message);

          if (
            error.message.includes("Cannot read properties of undefined") ||
            error.message.includes("includes")
          ) {
            console.error(
              "\nThis indicates a data format issue with the daemon.",
            );
            console.error("   Possible causes:");
            console.error("   1. Daemon returned invalid data");
            console.error("   2. Network connectivity issue");
            console.error("   3. Daemon version mismatch");
            console.error("\nTry restarting the daemon:");
            console.error(
              `   ${PROGRAM_NAME} daemon stop && ${PROGRAM_NAME} daemon start`,
            );
          } else if (
            error.message.includes("connect") ||
            error.message.includes("ECONNREFUSED") ||
            error.message.includes("network")
          ) {
            console.error("\nCannot connect to daemon.");
            console.error("   Make sure the daemon is running:");
            console.error(`   ${PROGRAM_NAME} daemon start`);
          } else {
            console.error("\nPlease start the daemon first:");
            console.error(`   ${PROGRAM_NAME} daemon start`);
          }

          console.error("\nOr use local mode as fallback:");
          console.error(`   ${PROGRAM_NAME} ps --no-daemon`);

          process.exit(1);
        }
      } catch (error) {
        console.error("Failed to list processes:", (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
