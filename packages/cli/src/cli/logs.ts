import { Command } from "commander";
import fs from "fs";
import { spawn } from "child_process";
import { getProcessManager } from "@intentorch/core";
import { getLogPath } from "@intentorch/core";
import { isWindows } from "@intentorch/core";

export function logsCommand(): Command {
  const command = new Command("logs")
    .description("View or stream logs from a running MCP Server")
    .argument("<identifier>", "PID or server name")
    .option("-f, --follow", "Follow log output", false)
    .option("-n, --lines <number>", "Number of lines to show", "100")
    .action(async (identifier: string, options) => {
      try {
        const processManager = getProcessManager();
        let pid: number | undefined;

        // Try to parse identifier as PID
        const parsedPid = parseInt(identifier, 10);
        if (!isNaN(parsedPid)) {
          pid = parsedPid;
        } else {
          // Try to find process by server name
          const proc = await processManager.getByServerName(identifier);
          if (proc) {
            pid = proc.pid;
          }
        }

        if (!pid) {
          console.error(`❌ Process not found for identifier: ${identifier}`);
          return;
        }

        const logPath = getLogPath(pid);
        if (!fs.existsSync(logPath)) {
          console.error(`❌ Log file not found at: ${logPath}`);
          return;
        }

        console.log(`📑 Showing logs for PID ${pid} (${logPath}):\n`);

        if (options.follow) {
          // Stream logs
          followLogs(logPath, parseInt(options.lines, 10));
        } else {
          // Just read the file
          const content = fs.readFileSync(logPath, "utf-8");
          const lines = content.split("\n");
          const numLines = parseInt(options.lines, 10);
          console.log(lines.slice(-numLines).join("\n"));
        }
      } catch (error: any) {
        console.error("❌ Error reading logs:", error.message);
      }
    });

  return command;
}

function followLogs(filePath: string, lines: number) {
  if (isWindows()) {
    // Windows: Use native FS watching

    // 1. Initial read of last N lines
    const content = fs.readFileSync(filePath, "utf-8");
    const initialLines = content.split("\n").slice(-lines).join("\n");
    process.stdout.write(initialLines + "\n");

    // 2. Watch for changes and stream new content
    let fileSize = fs.statSync(filePath).size;
    fs.watch(filePath, (event) => {
      if (event === "change") {
        try {
          const stats = fs.statSync(filePath);
          if (stats.size > fileSize) {
            const stream = fs.createReadStream(filePath, {
              start: fileSize,
              end: stats.size,
            });
            stream.pipe(process.stdout);
            fileSize = stats.size;
          } else if (stats.size < fileSize) {
            // File was truncated or rotated
            fileSize = stats.size;
          }
        } catch (e) {}
      }
    });
  } else {
    // Unix: Fallback to efficient tail -f
    const tail = spawn("tail", ["-n", lines.toString(), "-f", filePath]);
    tail.stdout.pipe(process.stdout);
    tail.stderr.pipe(process.stderr);

    process.on("SIGINT", () => {
      tail.kill();
      process.exit();
    });
  }
}
