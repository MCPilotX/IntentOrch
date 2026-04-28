import { Command } from 'commander';
import { getProcessManager, DaemonClient, PROGRAM_NAME } from '@intentorch/core';

function handleDaemonError(daemonError: unknown): never {
  console.error('❌ Daemon mode failed:', (daemonError as Error).message);
  console.error('\n💡 Please start the daemon first:');
  console.error(`   ${PROGRAM_NAME} daemon start`);
  console.error('\nOr use --no-daemon flag to force local mode.');
  process.exit(1);
}

export function stopCommand(): Command {
  const command = new Command('stop')
    .description('Stop a running MCP Server')
    .argument('<target>', 'Process ID or Server name (e.g., 1234 or Joooook/12306-mcp)')
    .option('--no-daemon', 'Force local mode even if daemon is running')
    .action(async (target: string, options) => {
      try {
        const useDaemon = options.daemon;
        let pid: number;
        let serverName: string | undefined;

        // Try to parse as PID
        const parsedPid = parseInt(target, 10);
        if (!isNaN(parsedPid) && parsedPid.toString() === target) {
          pid = parsedPid;
        } else {
          // It's a server name, find all matching running PIDs
          serverName = target;
          const processManager = getProcessManager();
          const runningServers = await processManager.listRunning();
          const matchingServers = runningServers.filter(s => s.serverName === serverName);
          
          if (matchingServers.length === 0) {
            // Check if there are any stopped processes with this name (for better error message)
            const allProcesses = await processManager.list();
            const stoppedProcesses = allProcesses.filter(s => s.serverName === serverName && s.status === 'stopped');
            if (stoppedProcesses.length > 0) {
              console.error(`✗ MCP Server "${serverName}" is not running. (${stoppedProcesses.length} stopped instance(s) found)`);
            } else {
              console.error(`✗ MCP Server "${serverName}" is not running.`);
            }
            process.exit(1);
          }
          
          if (matchingServers.length > 1) {
            // Multiple instances found - stop all of them
            console.log(`ℹ️  Found ${matchingServers.length} running instances of "${serverName}"`);
            for (const server of matchingServers) {
              if (!useDaemon) {
                const pm = getProcessManager();
                await pm.stop(server.pid);
                console.log(`✓ Process ${server.pid} (${serverName}) stopped in local mode`);
              } else {
                const client = new DaemonClient();
                const isDaemonRunning = await client.isDaemonRunning();
                if (!isDaemonRunning) {
                  handleDaemonError(new Error('Daemon is not running'));
                }
                const response = await client.stopServer(server.pid);
                console.log(`✓ ${response.message} (${serverName})`);
              }
            }
            return;
          }
          
          pid = matchingServers[0].pid;
        }

        if (!useDaemon) {
          // User explicitly requested no daemon, use local mode
          const processManager = getProcessManager();
          
          // Check if process is already stopped before attempting to stop
          const processInfo = await processManager.get(pid);
          if (processInfo && processInfo.status === 'stopped') {
            console.log(`ℹ️  Process ${pid} ${serverName ? `(${serverName}) ` : ''}is already stopped.`);
            return;
          }
          
          await processManager.stop(pid);
          console.log(`✓ Process ${pid} ${serverName ? `(${serverName}) ` : ''}stopped in local mode`);
          console.log(`⚠️  Note: Process was not managed by daemon`);
          return;
        }
        
        // Try daemon mode
        const client = new DaemonClient();
        const isDaemonRunning = await client.isDaemonRunning();
        if (!isDaemonRunning) {
          handleDaemonError(new Error('Daemon is not running'));
        }
        
        // Check if process is already stopped before attempting to stop via daemon
        try {
          const serverStatus = await client.getServerStatus(pid);
          if (serverStatus && serverStatus.status === 'stopped') {
            console.log(`ℹ️  Process ${pid} ${serverName ? `(${serverName}) ` : ''}is already stopped.`);
            return;
          }
        } catch {
          // If status check fails, proceed with stop anyway
        }
        
        const response = await client.stopServer(pid);
        console.log(`✓ ${response.message}${serverName ? ` (${serverName})` : ''}`);      } catch (error) {
        console.error(`✗ Failed to stop "${target}":`, (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
