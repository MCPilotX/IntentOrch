import { Command } from 'commander';
import { getRegistryClient, getProcessManager } from '@intentorch/core';

export function listCommand(): Command {
  const command = new Command('list')
    .description('List locally cached MCP Server manifests')
    .alias('ls')  // Add 'ls' as an alias
    .action(async () => {
      try {
        const registryClient = getRegistryClient();
        const cachedManifests = await registryClient.listCachedManifests();
        
        if (cachedManifests.length === 0) {
          console.log('No cached manifests found.');
          console.log('\nTo cache a manifest, use:');
          console.log('  intorch pull <server>');
          console.log('\nTo see running servers, use:');
          console.log('  intorch ps');
          return;
        }
        
        // Get running processes to show status alongside cached manifests
        let runningServers: any[] = [];
        try {
          const processManager = getProcessManager();
          runningServers = await processManager.listRunning();
        } catch (err) {
          // Ignore errors when getting running servers
        }
        
        console.log(`Found ${cachedManifests.length} cached manifest(s):`);
        console.log('='.repeat(60));
        
        for (const serverName of cachedManifests) {
          // Check if this server is currently running
          const runningInstance = runningServers.find(s => 
            s.serverName === serverName || 
            (s.manifest && s.manifest.name === serverName)
          );
          
          const statusIcon = runningInstance ? '🟢' : '⚪';
          console.log(`${statusIcon} ${serverName}`);
          
          // Try to get manifest details
          try {
            const manifest = await registryClient.getCachedManifest(serverName);
            if (manifest) {
              console.log(`  Version: ${manifest.version}`);
              console.log(`  Command: ${manifest.runtime.command} ${manifest.runtime.args?.join(' ') || ''}`);
              if (manifest.runtime.env && manifest.runtime.env.length > 0) {
                console.log(`  Env vars: ${manifest.runtime.env.join(', ')}`);
              }
              if (runningInstance) {
                console.log(`  Status: ✅ Running (PID: ${runningInstance.pid})`);
              } else {
                console.log(`  Status: ⏹️  Stopped`);
              }
            }
          } catch (err) {
            // Ignore errors when reading manifest
          }
          
          console.log('');
        }
        
        console.log('='.repeat(60));
        console.log(`Total: ${cachedManifests.length} cached manifest(s)`);
        console.log(`Running: ${runningServers.length} server(s)`);
        
      } catch (error) {
        console.error('✗ Failed to list cached manifests:', (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
