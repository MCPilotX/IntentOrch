import { logger } from "../core/logger";
import { Workflow, WorkflowContext, WorkflowStep } from './types';
import { ExpressionEvaluator } from './evaluator';
import { getProcessManager } from '../process-manager/manager';
import { getSecretManager } from '../secret/manager';
import { MCPClient } from '../mcp/client';
import { getInTorchDir } from '../utils/paths';
import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';

export class WorkflowEngine {
  private clients: Map<string, MCPClient> = new Map();

  async execute(workflow: Workflow, userInputs: Record<string, any>): Promise<any> {
    // Force reload secrets from disk to ensure we have the latest data
    const sm = getSecretManager();
    await sm.load();

    const context: WorkflowContext = {
      inputs: await this.resolveInputs(workflow, userInputs),
      state: {},
      secrets: await this.loadRequiredSecrets(),
    };

    try {
      // 1. Pre-flight: Ensure Servers are Running
      const requiredServers = workflow.requirements?.servers || [];
      await this.ensureServersRunning(requiredServers);

      // 2. Step Execution Loop
      const steps = workflow.steps || [];
      for (const step of steps) {
        if (step.if && !(await ExpressionEvaluator.evaluateCondition(step.if, context))) {
          logger.info(`⏭️ Skipping step ${step.id} (condition not met)`);
          continue;
        }

        // Ensure server for this step is running
        if (step.serverName) {
          await this.ensureServerRunning(step.serverName);
        }

        const result = await this.executeStep(step, context);
        context.state[step.id] = result;
      }

      // 3. Final Outputs
      return this.resolveOutputs(workflow, context);
    } finally {
      // Cleanup connections
      for (const client of this.clients.values()) {
        await client.disconnect();
      }
      this.clients.clear();
    }
  }

  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<any> {
    const resolvedArgs = ExpressionEvaluator.resolve(step.parameters || {}, context);
    
    // Support both serverName and serverId (for backward compatibility)
    let serverName = step.serverName;
    
    if (!serverName && step.serverId) {
      // Try to map serverId to serverName
      const mappedName = await this.mapServerIdToServerName(step.serverId);
      if (mappedName) {
        serverName = mappedName;
        logger.info(`🔧 Mapped serverId "${step.serverId}" to serverName "${serverName}"`);
      }
    }
    
    if (!serverName) {
      throw new Error(`Step ${step.id} is missing serverName (and serverId could not be mapped)`);
    }

    const client = this.clients.get(serverName);
    if (!client) {
      // MCP client not found in cache - server needs to be started first
      throw new Error(`MCP server "${serverName}" is not running. Please start the server before executing workflow steps.`);
    }

    const toolName = step.toolName;
    if (!toolName) {
      throw new Error(`Step ${step.id} is missing toolName`);
    }

    logger.info(`🚀 Executing step ${step.id} (Tool: ${toolName} on ${serverName})...`);
    
    let attempt = 0;
    const maxAttempts = step.retry?.maxAttempts || 1;
    
    while (attempt < maxAttempts) {
      try {
        const response = await client.callTool(toolName, resolvedArgs);
        return response;
      } catch (error: any) {
        attempt++;
        if (attempt >= maxAttempts) {
          logger.error(`❌ Step ${step.id} failed after ${maxAttempts} attempts: ${error.message}`);
          throw error;
        }
        logger.warn(`⚠️  Step ${step.id} failed, retrying (${attempt}/${maxAttempts})...`);
        await new Promise(r => setTimeout(r, step.retry?.delayMs || 1000));
      }
    }
  }

  private async ensureServersRunning(servers: string[]) {
    const pm = getProcessManager();
    for (const server of servers) {
      const isRunning = await pm.getByServerName(server);
      if (!isRunning) {
        logger.info(`🔌 Auto-starting required server: ${server}`);
        await pm.start(server);
      }
      
      // Create MCP client for the server if not already in cache
      if (!this.clients.has(server)) {
        await this.createMCPClientForServer(server);
      }
    }
  }

  private async ensureServerRunning(serverName: string): Promise<void> {
    // Check if client already exists in cache
    if (this.clients.has(serverName)) {
      return;
    }
    
    const pm = getProcessManager();
    const isRunning = await pm.getByServerName(serverName);
    
    if (!isRunning) {
      logger.info(`🔌 Auto-starting server for step: ${serverName}`);
      await pm.start(serverName);
    }
    
    // Create MCP client for the server
    await this.createMCPClientForServer(serverName);
  }

  private async resolveInputs(workflow: Workflow, userInputs: Record<string, any>) {
    const resolved: any = {};
    const inputs = workflow.inputs || [];
    for (const input of inputs) {
      const value = userInputs[input.id] ?? input.default;
      if (input.required && value === undefined) {
        throw new Error(`Missing required input: ${input.id}`);
      }
      resolved[input.id] = value;
    }
    return resolved;
  }

  private async loadRequiredSecrets() {
    const sm = getSecretManager();
    const all = await sm.getAll();
    return Object.fromEntries(all);
  }

  private resolveOutputs(workflow: Workflow, context: WorkflowContext) {
    if (!workflow.outputs) return context.state;
    return ExpressionEvaluator.resolve(workflow.outputs, context);
  }

  /**
   * Create MCP client for a server
   */
  private async createMCPClientForServer(serverName: string): Promise<void> {
    try {
      logger.info(`🔌 Creating MCP client for server: ${serverName}`);
      
      // Get registry client to fetch manifest
      const { getRegistryClient } = await import('../registry/client');
      const registryClient = getRegistryClient();
      
      // Fetch manifest for the server
      const manifest = await registryClient.fetchManifest(serverName);
      
      if (!manifest || !manifest.runtime || !manifest.runtime.command) {
        throw new Error(`Invalid manifest for server ${serverName}: missing runtime configuration`);
      }
      
      // Create MCP client with transport configuration from manifest
      const client = new MCPClient({
        transport: {
          type: 'stdio',
          command: manifest.runtime.command,
          args: manifest.runtime.args || [],
          env: { ...process.env } as Record<string, string>
        }
      });
      
      // Handle transport errors to prevent process crash
      client.on('error', (error) => {
        logger.warn(`⚠️ MCP Client error for ${serverName}: ${error.message || error}`);
      });

      // Connect the client
      await client.connect();
      
      // Add to cache
      this.clients.set(serverName, client);
      
      logger.info(`✅ MCP client created and connected for server: ${serverName}`);
    } catch (error: any) {
      logger.error(`❌ Failed to create MCP client for server ${serverName}:`, error.message);
      throw new Error(`Failed to create MCP client for server ${serverName}: ${error.message}`);
    }
  }

  /**
   * Map serverId to serverName for backward compatibility
   * Supports multiple formats:
   * 1. owner/project format (e.g., "Joooook/12306-mcp")
   * 2. source:server-name format (e.g., "github:12306-mcp")
   * 3. simple server-name format (e.g., "12306-mcp")
   * 
   * Uses tool registry and running servers to find the actual server name
   */
  private async mapServerIdToServerName(serverId: string): Promise<string | null> {
    try {
      logger.info(`🔍 Attempting to map serverId: "${serverId}"`);
      
      // First, try to load tool registry to find actualServerName
      const toolRegistryPath = path.join(getInTorchDir(), 'tool-registry.json');
      
      if (fsSync.existsSync(toolRegistryPath)) {
        const data = await fs.readFile(toolRegistryPath, 'utf-8');
        const registry = JSON.parse(data);
        
        // Search for tools with matching serverName (serverId)
        for (const tool of registry.tools || []) {
          if (tool.serverName === serverId && tool.actualServerName) {
            logger.info(`🔍 Found mapping in tool registry: ${serverId} -> ${tool.actualServerName}`);
            return tool.actualServerName;
          }
        }
      }
      
      const pm = getProcessManager();
      const runningServers = await pm.listRunning();
      
      // Strategy 1: Check if serverId is already a running server name
      for (const server of runningServers) {
        if (server.serverName === serverId) {
          logger.info(`🔍 Exact match found: "${serverId}" is already a running server`);
          return serverId;
        }
      }
      
      // Strategy 2: Handle owner/project format (e.g., "Joooook/12306-mcp")
      if (serverId.includes('/')) {
        const parts = serverId.split('/');
        if (parts.length === 2) {
          const projectName = parts[1]; // e.g., "12306-mcp"
          
          // Try exact project name match
          for (const server of runningServers) {
            if (server.serverName === projectName) {
              logger.info(`🔍 Mapped owner/project "${serverId}" -> "${projectName}"`);
              return projectName;
            }
          }
          
          // Try variations of project name
          const possibleNames = [
            projectName,
            projectName.replace('-mcp', ''),
            projectName.replace('-server', ''),
            `mcp-${projectName}`,
            `${projectName}-mcp`,
            `${projectName}-server`
          ];
          
          for (const name of possibleNames) {
            for (const server of runningServers) {
              if (server.serverName === name) {
                logger.info(`🔍 Mapped owner/project "${serverId}" -> "${name}" (variation)`);
                return name;
              }
            }
          }
        }
      }
      
      // Strategy 3: Handle source:server-name format
      const parts = serverId.split(':');
      if (parts.length === 2) {
        const serverPart = parts[1];
        
        // Try exact match first
        for (const server of runningServers) {
          if (server.serverName === serverPart) {
            logger.info(`🔍 Mapped source:server "${serverId}" -> "${serverPart}"`);
            return serverPart;
          }
        }
        
        // Try with common suffixes
        const possibleNames = [
          serverPart,
          `${serverPart}-mcp`,
          `${serverPart}-server`,
          `mcp-${serverPart}`
        ];
        
        for (const name of possibleNames) {
          for (const server of runningServers) {
            if (server.serverName === name) {
              logger.info(`🔍 Mapped source:server "${serverId}" -> "${name}" (with suffix)`);
              return name;
            }
          }
        }
      }
      
      // Strategy 4: Check for partial matches
      for (const server of runningServers) {
        // Check if serverId is contained in serverName or vice versa
        if (server.serverName.includes(serverId) || serverId.includes(server.serverName)) {
          logger.info(`🔍 Found partial match: "${serverId}" -> "${server.serverName}"`);
          return server.serverName;
        }
      }
      
      // Strategy 5: Try to start the server if not running
      logger.info(`🔍 Attempting to start server: "${serverId}"`);
      try {
        const pid = await pm.start(serverId);
        const serverProcess = await pm.get(pid);
        if (serverProcess && serverProcess.serverName) {
          logger.info(`🔍 Successfully started server: "${serverId}" -> "${serverProcess.serverName}"`);
          return serverProcess.serverName;
        } else {
          logger.warn(`⚠️  Started server but couldn't get process info for PID: ${pid}`);
        }
      } catch (startError) {
        logger.warn(`⚠️  Failed to start server "${serverId}": ${startError}`);
      }
      
      logger.warn(`⚠️  Could not map serverId "${serverId}" to any running server`);
      return null;
      
    } catch (error) {
      logger.warn(`⚠️  Failed to map serverId "${serverId}": ${error}`);
      return null;
    }
  }
}
