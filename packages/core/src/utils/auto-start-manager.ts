import { logger } from "../core/logger";
/**
 * Auto-start manager for MCP servers
 * Handles automatic pulling and starting of required servers
 */

import { getRegistryClient } from '../registry/client';
import { getProcessManager } from '../process-manager/manager';
import { getToolRegistry } from '../tool-registry/registry';
import { getDisplayName, isSameService } from './server-name';

export interface ServerStartResult {
  serverName: string;
  displayName: string;
  success: boolean;
  pid?: number;
  error?: string;
  alreadyRunning?: boolean;
}

export class AutoStartManager {
  private registryClient = getRegistryClient();
  private processManager = getProcessManager();
  private toolRegistry = getToolRegistry();

  /**
   * Analyze intent and determine required servers
   * Note: This previously used FlexSearch keyword matching to guess tools.
   * Now LLM function calling handles tool selection directly, so this method
   * returns an empty list (no pre-emptive server startup needed).
   */
  async analyzeIntentForServers(_intent: string): Promise<string[]> {
    // LLM function calling handles tool selection directly
    return [];
  }

  /**
   * Ensure servers are pulled and started
   */
  async ensureServersRunning(serverNames: string[]): Promise<ServerStartResult[]> {
    const results: ServerStartResult[] = [];
    
    // Check currently running servers
    const runningServers = await this.processManager.listRunning();
    const runningServerNames = runningServers.map(s => s.serverName);
    
    for (const serverName of serverNames) {
      const displayName = getDisplayName(serverName);
      const result: ServerStartResult = {
        serverName,
        displayName,
        success: false
      };
      
      try {
        // Check if server is already running
        const isAlreadyRunning = runningServerNames.some(name => 
          isSameService(name, serverName)
        );
        
        if (isAlreadyRunning) {
          logger.info(`✓ ${displayName} is already running`);
          result.success = true;
          result.alreadyRunning = true;
          results.push(result);
          continue;
        }
        
        // Step 1: Ensure manifest is pulled
        logger.info(`📥 Checking manifest for ${displayName}...`);
        const manifest = await this.registryClient.getCachedManifest(serverName);
        
        if (!manifest) {
          logger.info(`   Pulling manifest for ${displayName}...`);
          try {
            await this.registryClient.fetchManifest(serverName);
            logger.info(`   ✓ Manifest pulled successfully`);
          } catch (pullError: any) {
            logger.error(`   ❌ Failed to pull manifest: ${pullError.message}`);
            result.error = `Failed to pull manifest: ${pullError.message}`;
            results.push(result);
            continue;
          }
        } else {
          logger.info(`   ✓ Manifest already cached`);
        }
        
        // Step 2: Start the server
        logger.info(`   Starting ${displayName}...`);
        try {
          const pid = await this.processManager.start(serverName);
          logger.info(`   ✓ Started successfully (PID: ${pid})`);
          
          result.success = true;
          result.pid = pid;
          
          // Wait a moment for server to initialize
          await new Promise(resolve => setTimeout(resolve, 2000));
          
        } catch (startError: any) {
          logger.error(`   ❌ Failed to start server: ${startError.message}`);
          result.error = `Failed to start: ${startError.message}`;
        }
        
      } catch (error: any) {
        logger.error(`❌ Error processing ${displayName}: ${error.message}`);
        result.error = error.message;
      }
      
      results.push(result);
    }
    
    return results;
  }

  /**
   * Get summary of auto-start results
   */
  getResultsSummary(results: ServerStartResult[]): {
    total: number;
    successful: number;
    failed: number;
    alreadyRunning: number;
  } {
    const summary = {
      total: results.length,
      successful: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      alreadyRunning: results.filter(r => r.alreadyRunning).length
    };
    
    return summary;
  }

  /**
   * Print results in a user-friendly format
   */
  printResults(results: ServerStartResult[]): void {
    logger.info('\n' + '='.repeat(60));
    logger.info('AUTO-START RESULTS');
    logger.info('='.repeat(60));
    
    const summary = this.getResultsSummary(results);
    
    logger.info(`\nSummary:`);
    logger.info(`  Total servers: ${summary.total}`);
    logger.info(`  Already running: ${summary.alreadyRunning}`);
    logger.info(`  Successfully started: ${summary.successful}`);
    logger.info(`  Failed: ${summary.failed}`);
    
    if (summary.failed > 0) {
      logger.info(`\nFailed servers:`);
      results
        .filter(r => !r.success && !r.alreadyRunning)
        .forEach(r => {
          logger.info(`  ❌ ${r.displayName}: ${r.error}`);
        });
    }
    
    if (summary.successful > 0) {
      logger.info(`\nSuccessfully started servers:`);
      results
        .filter(r => r.success && !r.alreadyRunning)
        .forEach(r => {
          logger.info(`  ✅ ${r.displayName} (PID: ${r.pid})`);
        });
    }
    
    if (summary.alreadyRunning > 0) {
      logger.info(`\nAlready running servers:`);
      results
        .filter(r => r.alreadyRunning)
        .forEach(r => {
          logger.info(`  ⚡ ${r.displayName} (already running)`);
        });
    }
    
    logger.info('\n' + '='.repeat(60));
  }

  /**
   * Check if all required servers are ready
   */
  areAllServersReady(results: ServerStartResult[]): boolean {
    return results.every(r => r.success || r.alreadyRunning);
  }

  /**
   * Get list of successfully started server PIDs
   */
  getStartedPids(results: ServerStartResult[]): number[] {
    return results
      .filter(r => r.success && r.pid && !r.alreadyRunning)
      .map(r => r.pid!)
      .filter(pid => pid > 0);
  }
}