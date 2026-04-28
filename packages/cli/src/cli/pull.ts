import { Command } from 'commander';
import { getRegistryClient } from '@intentorch/core';
import { getToolRegistry } from '@intentorch/core';
import { getDisplayName } from '@intentorch/core';
import { toLightweightManifest, supportsDynamicDiscovery } from '@intentorch/core';

export function pullCommand(): Command {
  const command = new Command('pull')
    .description('Pull MCP Server configuration from Registry')
    .argument('<server>', `Server name or URL
      Examples:
        - Joooook/12306-mcp (GitHub repository)
        - mcp/12306 (official registry)
        - https://example.com/mcp.json (direct URL)
        - owner/repo@main (GitHub with branch)
        - owner/repo:dist/mcp.json (GitHub with custom path)
        - owner/repo@develop:src/mcp.json (GitHub with branch and custom path)`)
    .action(async (server: string) => {
      try {
        const registryClient = getRegistryClient();
        const displayName = getDisplayName(server);
        
        // Check if manifest is already cached
        let manifest: any;
        const cachedManifest = await registryClient.getCachedManifest(server);
        
        if (cachedManifest) {
          console.log(`ℹ️  Configuration for ${displayName} v${cachedManifest.version} is already cached`);
          manifest = cachedManifest;
        } else {
          manifest = await registryClient.fetchManifest(server);
          console.log(`✓ Pulled configuration for ${displayName} v${manifest.version}`);
        }
        
        console.log(`  Runtime: ${manifest.runtime.type}`);
        console.log(`  Command: ${manifest.runtime.command} ${manifest.runtime.args?.join(' ') || ''}`);
        
        if (manifest.runtime.env && manifest.runtime.env.length > 0) {
          console.log(`  Required environment variables: ${manifest.runtime.env.join(', ')}`);
        }
        
        // Check if this server supports dynamic tool discovery
        const supportsDynamic = supportsDynamicDiscovery(manifest);
        
        if (supportsDynamic) {
          console.log(`  Tool discovery: Will discover tools dynamically when server starts`);
          
          // Convert to lightweight manifest and cache it
          const lightweightManifest = toLightweightManifest(manifest);
          await registryClient.cacheManifest(server, lightweightManifest);
        } else {
          // Check if manifest has valid tools (with name) or just empty/invalid entries
          const hasValidTools = (tools: any[]) => tools && tools.length > 0 && tools.some(t => t.name);
          
          const manifestTools = manifest.tools || [];
          const capabilitiesTools = manifest.capabilities?.tools || [];
          const hasValidStaticTools = hasValidTools(manifestTools) || hasValidTools(capabilitiesTools);
          
          if (hasValidStaticTools) {
            console.log(`  Tool discovery: Using static tool definitions from manifest`);
            
            // Register tools from manifest
            const toolRegistry = getToolRegistry();
            await toolRegistry.registerToolsFromManifest(server, manifest);
            
            const validTools = manifestTools.filter((t: any) => t.name).length > 0 
              ? manifestTools.filter((t: any) => t.name)
              : capabilitiesTools.filter((t: any) => t.name);
            console.log(`  Tools: ${validTools.length} tools registered (static)`);
            for (const tool of validTools.slice(0, 3)) {
              console.log(`    - ${tool.name}: ${tool.description || 'No description'}`);
            }
            if (validTools.length > 3) {
              console.log(`    ... and ${validTools.length - 3} more`);
            }
          } else {
            // Manifest has no valid tools - will discover dynamically at start
            console.log(`  Tool discovery: Will discover tools dynamically when server starts`);
            
            // Convert to lightweight manifest and cache it
            const lightweightManifest = toLightweightManifest(manifest);
            await registryClient.cacheManifest(server, lightweightManifest);
          }
        }
        
        console.log(`\n💡 Next steps:`);
        console.log(`   1. Set any required secrets: intorch secret set <name> <value>`);
        console.log(`   2. Start the server: intorch start ${displayName}`);
        console.log(`   3. Tools will be automatically discovered after server starts`);
      } catch (error) {
        console.error(`Failed to pull ${getDisplayName(server)}:`, (error as Error).message);
        process.exit(1);
      }
    });

  return command;
}
