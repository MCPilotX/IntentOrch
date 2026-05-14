import { Command } from "commander";
import {
  getProcessManager,
  DaemonClient,
  PROGRAM_NAME,
  getDisplayName,
} from "@intentorch/core";

function handleDaemonError(daemonError: unknown): never {
  console.error("❌ Daemon mode failed:", (daemonError as Error).message);
  console.error("\n💡 Please start the daemon first:");
  console.error(`   ${PROGRAM_NAME} daemon start`);
  console.error("\nOr use --no-daemon flag to force local mode.");
  process.exit(1);
}

export function startCommand(): Command {
  const command = new Command("start")
    .description("Start an MCP Server")
    .argument("<server>", "Server name or URL (e.g., Joooook/12306-mcp)")
    .option("--no-daemon", "Force local mode even if daemon is running")
    .action(async (server: string, options) => {
      try {
        const useDaemon = options.daemon;
        const displayName = getDisplayName(server);

        if (!useDaemon) {
          // User explicitly requested no daemon, use local mode
          const processManager = getProcessManager();
          const pid = await processManager.start(server);
          console.log(`✓ Started ${displayName} in local mode (PID: ${pid})`);
          console.log(`⚠️  Note: Use "${PROGRAM_NAME} ps --no-daemon" to view this process`);
          return;
        }

        // Try daemon mode
        const client = new DaemonClient();
        const isDaemonRunning = await client.isDaemonRunning();
        if (!isDaemonRunning) {
          // Daemon not running — fall back to local mode instead of erroring out
          const processManager = getProcessManager();
          const pid = await processManager.start(server);
          console.log(`✓ Started ${displayName} v${await getDisplayName(server)} (PID: ${pid})`);
          console.log(`  Status: running`);
          console.log(`⚠️  Daemon not running — started in local mode.`);
          console.log(`   Use "${PROGRAM_NAME} ps --no-daemon" to view this process.`);
          return;
        }

        const response = await client.startServer(server);
        const isExternal = response.external;

        // Check if the server was already running (daemon returned existing process)
        if (response.alreadyRunning) {
          if (isExternal) {
            console.log(
              `ℹ️  ${displayName} v${response.version} is already connected`,
            );
            console.log(`  Status: ${response.status}`);
          } else {
            console.log(
              `ℹ️  ${displayName} v${response.version} is already running (PID: ${response.pid})`,
            );
            console.log(`  Logs: ${response.logPath}`);
            console.log(`  Status: ${response.status}`);
          }
        } else {
          if (isExternal) {
            console.log(
              `✓ Connected to ${displayName} v${response.version}`,
            );
            console.log(`  Status: ${response.status}`);
          } else {
            console.log(
              `✓ Started ${displayName} v${response.version} (PID: ${response.pid})`,
            );
            console.log(`  Logs: ${response.logPath}`);
            console.log(`  Status: ${response.status}`);
          }
        }
      } catch (error) {
        console.error(
          `✗ Failed to start ${getDisplayName(server)}:`,
          (error as Error).message,
        );
        process.exit(1);
      }
    });

  return command;
}
