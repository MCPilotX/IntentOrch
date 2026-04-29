import { Command } from "commander";
import { DaemonClient } from "@intentorch/core";
import { getSecretManager } from "@intentorch/core";
import { spawn } from "child_process";
import os from "os";

export function dashboardCommand(): Command {
  const command = new Command("dashboard")
    .description("Open the InTorch Web Dashboard")
    .option(
      "-p, --port <port>",
      "Dashboard port (default: 5173 for dev, 9658 for prod)",
      "5173",
    )
    .action(async (options) => {
      try {
        const client = new DaemonClient();

        // 1. Ensure Daemon is running
        if (!(await client.isDaemonRunning())) {
          console.log("🔌 Daemon is not running. Starting daemon...");
          // Start daemon in background
          const scriptPath = process.argv[1];
          spawn(
            process.execPath,
            [scriptPath, "daemon", "start", "--detached"],
            {
              detached: true,
              stdio: "ignore",
            },
          ).unref();

          // Wait for daemon to start
          await new Promise((resolve) => setTimeout(resolve, 3000));
        }

        // 2. Get Auth Token
        const secretManager = getSecretManager();
        const token = await secretManager.get("daemon_auth_token");

        if (!token) {
          throw new Error("Could not retrieve daemon authentication token");
        }

        // 3. Determine URL
        // In dev mode, it's 5173. In production, it might be served by Daemon on 9658.
        const url = `http://localhost:${options.port}/?token=${token}`;

        console.log("🚀 Opening InTorch Dashboard...");
        console.log(`🔗 URL: ${url}`);
        console.log(
          "💡 Note: The dashboard uses your secure local daemon token for authentication.",
        );

        // 4. Open browser based on OS
        const platform = os.platform();
        if (platform === "darwin") {
          spawn("open", [url]);
        } else if (platform === "win32") {
          spawn("start", [url], { shell: true });
        } else {
          spawn("xdg-open", [url]);
        }
      } catch (error) {
        console.error("✗ Failed to open dashboard:", (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
