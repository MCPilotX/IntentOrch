import { Command } from 'commander';
import { getProcessManager, DaemonClient, PROGRAM_NAME, getDisplayName } from '@intentorch/core';

function handleDaemonError(daemonError: unknown): never {
  console.error('❌ Daemon mode failed:', (daemonError as Error).message);
  console.error('\n💡 Please start the daemon first:');
  console.error(`   ${PROGRAM_NAME} daemon start`);
  console.error('\nOr use --no-daemon flag to force local mode.');
  process.exit(1);
}

export function startCommand(): Command {
  const command = new Command('start')
    .description('Start an MCP Server')
    .argument('<server>', 'Server name or URL (e.g., Joooook/12306-mcp)')
    .option('--no-daemon', 'Force local mode even if daemon is running')
    .action(async (server: string, options) => {
      try {
        const useDaemon = options.daemon;
        const displayName = getDisplayName(server);
        
        if (!useDaemon) {
          // User explicitly requested no daemon, use local mode
          const processManager = getProcessManager();
          const pid = await processManager.start(server);
          console.log(`✓ Started ${displayName} in local mode (PID: ${pid})`);
          console.log(`⚠️  Note: Process is not managed by daemon`);
          return;
        }
        
        // Try daemon mode
        const client = new DaemonClient();
        const isDaemonRunning = await client.isDaemonRunning();
        if (!isDaemonRunning) {
          handleDaemonError(new Error('Daemon is not running'));
        }
        
        const response = await client.startServer(server);
        
        // Check if the server was already running (daemon returned existing process)
        if (response.alreadyRunning) {
          console.log(`ℹ️  ${displayName} v${response.version} is already running (PID: ${response.pid})`);
          console.log(`  Logs: ${response.logPath}`);
          console.log(`  Status: ${response.status}`);
        } else {
          console.log(`✓ Started ${displayName} v${response.version} (PID: ${response.pid})`);
          console.log(`  Logs: ${response.logPath}`);
          console.log(`  Status: ${response.status}`);
        }
      } catch (error) {
        console.error(`✗ Failed to start ${getDisplayName(server)}:`, (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
