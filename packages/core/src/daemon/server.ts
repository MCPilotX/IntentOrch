import http from 'http';
import fs from 'fs/promises';
import { getProcessManager } from '../process-manager/manager';
import { getSecretManager } from '../secret/manager';
import { getWorkflowManager } from '../workflow/manager';
import { getRegistryClient } from '../registry/client';
import { getToolRegistry } from '../tool-registry/registry';
import { getIntentService } from '../ai/intent-service';
import { getAIConfig, getConfigManager } from '../utils/config';
import { ensureInTorchDir, getDaemonPidPath, getDaemonLogPath, getLogPath } from '../utils/paths';
import { DaemonConfig } from './types';
import { MCPClient } from '../mcp/client';

export class DaemonServer {
  private server: http.Server;
  private config: DaemonConfig;
  private startTime: number;
  private requestCount: number;

  constructor(config: Partial<DaemonConfig> = { /* Intentionally empty */ }) {
    this.config = { port: config.port || 9658, host: config.host || 'localhost', pidFile: config.pidFile || getDaemonPidPath(), logFile: config.logFile || getDaemonLogPath() };
    this.startTime = Date.now();
    this.requestCount = 0;
    this.server = this.createServer();
  }

  private createServer() {
    return http.createServer(async (req, res) => {
      try { await this.handleRequest(req, res); }
      catch (e) { 
        console.error('[Daemon Error]', e);
        this.sendJson(res, 500, { error: 'Internal Error', message: (e as Error).message });
      }
    });
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse) {
    const method = req.method || 'GET';
    const parsedUrl = new URL(req.url || '/', 'http://localhost');
    const path = parsedUrl.pathname;

    // Increment request count for all requests except OPTIONS
    if (method !== 'OPTIONS') {
      this.requestCount++;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');

    if (method === 'OPTIONS') return res.writeHead(200).end();
    
    console.log(`[Daemon] ${method} ${path}`);

    if (!(path === '/api/status' || path === '/api/auth/token')) {
        const auth = req.headers.authorization;
        const token = await getSecretManager().get('daemon_auth_token');
        if (!auth || auth.substring(7) !== token) return this.sendJson(res, 401, { error: 'Unauthorized' });
    }

    let body = '';
    if (method === 'POST' || method === 'PUT') {
        body = await new Promise((resolve, reject) => {
            let b = '';
            req.on('data', c => b += c);
            req.on('end', () => resolve(b));
            req.on('error', reject);
        });
    }

  // --- Routes ---
  if (path === '/api/status' && method === 'GET') {
    const status = {
      running: true,
      pid: process.pid,
      config: this.config,
      uptime: Date.now() - this.startTime,
      version: '0.8.0', // Hardcoded version to avoid path resolution issues
      stats: {
        activeConnections: 0, // TODO: Implement connection tracking
        totalRequests: this.requestCount
      }
    };
    return this.sendJson(res, 200, status);
  }
  
  // Handle /api/system/stats - same as /api/status for backward compatibility
  if ((path === '/api/system/stats' || path === '/api/system/stats/') && method === 'GET') {
    const status = {
      running: true,
      pid: process.pid,
      config: this.config,
      uptime: Date.now() - this.startTime,
      version: '0.8.0',
      stats: {
        activeConnections: 0,
        totalRequests: this.requestCount
      }
    };
    return this.sendJson(res, 200, status);
  }
  
  // Handle /api/system/logs - return daemon logs
  if ((path === '/api/system/logs' || path === '/api/system/logs/') && method === 'GET') {
    try {
      const fs = await import('fs/promises');
      const logContent = await fs.readFile(this.config.logFile, 'utf-8');
      return this.sendJson(res, 200, { 
        logs: logContent,
        logFile: this.config.logFile,
        lastUpdated: new Date().toISOString()
      });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return this.sendJson(res, 404, { 
          error: 'Logs Not Found', 
          message: `Log file not found: ${this.config.logFile}` 
        });
      }
      return this.sendJson(res, 500, { 
        error: 'Internal Server Error', 
        message: `Failed to read logs: ${error.message}` 
      });
    }
  }
  if (path === '/api/auth/token' && method === 'GET') return this.sendJson(res, 200, { token: await getSecretManager().get('daemon_auth_token') });
    
    if (path === '/api/servers' && method === 'GET') return this.sendJson(res, 200, { servers: await getProcessManager().list() });
    if (path === '/api/servers' && method === 'POST') {
        try {
            const { serverNameOrUrl } = JSON.parse(body);
            
            if (!serverNameOrUrl || typeof serverNameOrUrl !== 'string') {
                return this.sendJson(res, 400, {
                    error: 'Bad Request',
                    message: 'serverNameOrUrl is required and must be a string'
                });
            }
            
            // First fetch and cache the manifest
            const manifest = await getRegistryClient().fetchManifest(serverNameOrUrl);

            // Register tools
            await getToolRegistry().registerToolsFromManifest(serverNameOrUrl, manifest);

            // Then start the server
            const pid = await getProcessManager().start(serverNameOrUrl);
            const processInfo = await getProcessManager().get(pid);
            
            if (!processInfo) {
                return this.sendJson(res, 500, {
                    error: 'Server Startup Failed',
                    message: `Failed to retrieve process info for PID ${pid}`,
                    suggestion: 'Check if the process started successfully'
                });
            }
            
            return this.sendJson(res, 201, {
                pid: processInfo.pid,
                name: processInfo.name || processInfo.manifest.name,
                version: processInfo.version || processInfo.manifest.version,
                status: processInfo.status,
                logPath: processInfo.logPath || getLogPath(processInfo.pid)
            });
        } catch (error: any) {
            // Handle JSON parsing errors
            if (error instanceof SyntaxError) {
                return this.sendJson(res, 400, {
                    error: 'Invalid JSON',
                    message: 'Request body must be valid JSON'
                });
            }
            
            // If starting fails, still return the cached manifest info
            try {
                const { serverNameOrUrl } = JSON.parse(body);
                const manifest = await getRegistryClient().getCachedManifest(serverNameOrUrl);
                if (manifest) {
                    return this.sendJson(res, 500, {
                        error: 'Server Startup Failed',
                        message: `Failed to start server: ${error.message}`,
                        details: {
                            manifestName: manifest.name,
                            manifestVersion: manifest.version,
                            manifestDescription: manifest.description,
                            suggestion: 'Check server configuration and required secrets'
                        }
                    });
                }
            } catch (cacheError) {
                // Ignore cache error
            }
            
            return this.sendJson(res, 500, { 
                error: 'Server Startup Failed',
                message: `Failed to start server: ${error.message}`,
                suggestion: 'Check if the server name/URL is valid and all required secrets are set'
            });
        }
    }
    
    if (path === '/api/servers/pull' && method === 'POST') {
        try {
            const { serverNameOrUrl } = JSON.parse(body);
            
            if (!serverNameOrUrl || typeof serverNameOrUrl !== 'string') {
                return this.sendJson(res, 400, {
                    error: 'Bad Request',
                    message: 'serverNameOrUrl is required and must be a string'
                });
            }
            
            // Just fetch and cache the manifest without starting the server
            const manifest = await getRegistryClient().fetchManifest(serverNameOrUrl);
            console.log('[Daemon] Pulled manifest:', JSON.stringify(manifest, null, 2).substring(0, 500));

            // Register tools
            await getToolRegistry().registerToolsFromManifest(serverNameOrUrl, manifest);

            return this.sendJson(res, 200, { 
                success: true, 
                message: `Successfully pulled and cached manifest for ${manifest.name}`,
                manifest: {
                    name: manifest.name,
                    version: manifest.version,
                    description: manifest.description
                }
            });
        } catch (error: any) {
            // Handle JSON parsing errors
            if (error instanceof SyntaxError) {
                return this.sendJson(res, 400, {
                    error: 'Invalid JSON',
                    message: 'Request body must be valid JSON'
                });
            }
            
            return this.sendJson(res, 400, { 
                success: false, 
                error: 'Manifest Pull Failed',
                message: `Failed to pull manifest: ${error.message}`,
                suggestion: 'Check if the server name/URL is valid and accessible'
            });
        }
    }
    if (path === '/api/servers/search' && method === 'GET') {
        const query = parsedUrl.searchParams.get('q') || '';
        const source = parsedUrl.searchParams.get('source') || 'all';
        return this.sendJson(res, 200, await getRegistryClient().searchServices({ query, source }));
    }
    
    if (path === '/api/servers/cached' && method === 'GET') {
        const cachedManifests = await getRegistryClient().listCachedManifests();
        // Convert manifest names to service info format
        const services = cachedManifests.map(name => ({
            name,
            description: `Cached MCP Server: ${name}`,
            version: 'unknown',
            source: 'local',
            tags: ['cached', 'local'],
            lastUpdated: new Date().toISOString().split('T')[0] // Today's date in YYYY-MM-DD format
        }));
        return this.sendJson(res, 200, { 
            services, 
            total: services.length, 
            source: 'local', 
            hasMore: false 
        });
    }

    // Server detail and management endpoints
    if (path.startsWith('/api/servers/') && method === 'GET') {
        const match = path.match(/^\/api\/servers\/(\d+)$/);
        if (match) {
            const pid = parseInt(match[1], 10);
            const processInfo = await getProcessManager().get(pid);
            if (!processInfo) {
                return this.sendJson(res, 404, { 
                    error: 'Not Found', 
                    message: `Server with PID ${pid} not found` 
                });
            }
            return this.sendJson(res, 200, processInfo);
        }
        
        // Check for logs endpoint
        const logsMatch = path.match(/^\/api\/servers\/(\d+)\/logs$/);
        if (logsMatch) {
            const pid = parseInt(logsMatch[1], 10);
            const processInfo = await getProcessManager().get(pid);
            if (!processInfo) {
                return this.sendJson(res, 404, { 
                    error: 'Not Found', 
                    message: `Server with PID ${pid} not found` 
                });
            }
            
            try {
                const fs = await import('fs/promises');
                const { getLogPath } = await import('../utils/paths');
                const logPath = getLogPath(pid);
                const logContent = await fs.readFile(logPath, 'utf-8');
                return this.sendJson(res, 200, { 
                    pid, 
                    logs: logContent,
                    logPath 
                });
            } catch (error: any) {
                if (error.code === 'ENOENT') {
                    return this.sendJson(res, 404, { 
                        error: 'Logs Not Found', 
                        message: `Log file for PID ${pid} not found` 
                    });
                }
                return this.sendJson(res, 500, { 
                    error: 'Internal Server Error', 
                    message: `Failed to read logs: ${error.message}` 
                });
            }
        }
    }
    
    if (path.startsWith('/api/servers/') && method === 'DELETE') {
        const match = path.match(/^\/api\/servers\/(\d+)$/);
        if (match) {
            const pid = parseInt(match[1], 10);
            const processInfo = await getProcessManager().get(pid);
            if (!processInfo) {
                return this.sendJson(res, 404, { 
                    error: 'Not Found', 
                    message: `Server with PID ${pid} not found` 
                });
            }
            
            try {
                await getProcessManager().stop(pid);
                return this.sendJson(res, 200, { 
                    success: true, 
                    message: `Server with PID ${pid} stopped successfully`,
                    pid 
                });
            } catch (error: any) {
                return this.sendJson(res, 500, { 
                    error: 'Failed to Stop Server', 
                    message: `Failed to stop server: ${error.message}` 
                });
            }
        }
    }

    if ((path === '/api/workflows' || path === '/api/workflows/') && method === 'GET') return this.sendJson(res, 200, { workflows: await getWorkflowManager().list() });
    if ((path === '/api/workflows' || path === '/api/workflows/') && method === 'POST') {
        const data = JSON.parse(body);
        const id = await getWorkflowManager().save(data);
        // Ensure the workflow object has the correct ID
        const workflowWithId = { ...data, id };
        return this.sendJson(res, 201, { workflow: workflowWithId });
    }
    
    // GET /api/workflows/{id}
    const workflowIdMatch = path.match(/^\/api\/workflows\/([^\/]+)$/);
    if (workflowIdMatch) {
        const id = decodeURIComponent(workflowIdMatch[1]);
        
        if (method === 'GET') {
            try {
                const workflow = await getWorkflowManager().load(id);
                if (!workflow) {
                    return this.sendJson(res, 404, { 
                        error: 'Not Found', 
                        message: `Workflow with ID ${id} not found` 
                    });
                }
                return this.sendJson(res, 200, { workflow });
            } catch (error: any) {
                return this.sendJson(res, 500, { 
                    error: 'Internal Server Error', 
                    message: `Failed to load workflow: ${error.message}` 
                });
            }
        }
        
        if (method === 'DELETE') {
            try {
                await getWorkflowManager().delete(id);
                return this.sendJson(res, 200, { 
                    success: true, 
                    message: `Workflow ${id} deleted successfully` 
                });
            } catch (error: any) {
                return this.sendJson(res, 500, { 
                    error: 'Internal Server Error', 
                    message: `Failed to delete workflow: ${error.message}` 
                });
            }
        }
    }
    if (path.includes('/execute') && method === 'POST') {
        const id = path.replace('/api/workflows/', '').replace('/execute', '');
        const wf = await getWorkflowManager().load(id);
        if (!wf) return this.sendJson(res, 404, { error: 'Not Found' });
        const results = [];
        
        // Get all running servers
        const runningServers = await getProcessManager().list();
        
        for (const s of (wf.steps || [])) {
            const sid = s.serverId || s.serverName;
            if (!sid) continue;
            try {
                // First, try to find the manifest from running servers
                let manifest = null;
                
                // Look for a running server that matches the serverId
                for (const server of runningServers) {
                    if (server.manifest && server.manifest.name === sid) {
                        manifest = server.manifest;
                        break;
                    }
                }
                
                // If not found in running servers, try to fetch from registry
                if (!manifest) {
                    manifest = await getRegistryClient().fetchManifest(sid);
                }
                
                const client = new MCPClient({
                    transport: {
                        type: 'stdio',
                        command: manifest.runtime.command,
                        args: manifest.runtime.args || [],
                        env: { ...process.env } as Record<string, string>
                    }
                });
                await client.connect();
                const out = await client.callTool(s.toolName, s.parameters || { /* Intentionally empty */ });
                results.push({ toolName: s.toolName, status: 'success', output: out });
                await client.disconnect();
            } catch (e) {
                results.push({ toolName: s.toolName, status: 'error', error: (e as Error).message });
            }
        }
        
        // Update workflow's lastExecutedAt timestamp
        try {
            const updatedWorkflow = {
                ...wf,
                lastExecutedAt: new Date().toISOString(),
                updatedAt: new Date().toISOString()
            };
            await getWorkflowManager().save(updatedWorkflow);
        } catch (updateError) {
            console.error('[Daemon] Failed to update workflow lastExecutedAt:', updateError);
            // Continue execution even if update fails
        }
        
        return this.sendJson(res, 200, { success: true, results, totalSteps: results.length });
    }

    if (path === '/api/intent/parse' && method === 'POST') {
        try {
            const { intent, context } = JSON.parse(body);
            
            if (!intent || typeof intent !== 'string') {
                return this.sendJson(res, 400, { 
                    success: false, 
                    error: 'Intent is required and must be a string' 
                });
            }
            
            // Get AI configuration from system config
            const aiConfig = await getAIConfig();
            
            // Use universal intent service (LLM-driven, language-agnostic)
            const intentService = getIntentService(aiConfig);
            const result = await intentService.parseIntent({ intent, context });
            
            return this.sendJson(res, result.success ? 200 : 400, result);
        } catch (error: any) {
            console.error('[Daemon] Error parsing intent:', error);
            return this.sendJson(res, 500, { 
                success: false, 
                error: `Failed to parse intent: ${error.message}` 
            });
        }
    }

    // Configuration endpoints
    if (path === '/api/config' && method === 'GET') {
        try {
            const configManager = getConfigManager();
            const config = await configManager.getAll();
            return this.sendJson(res, 200, { config });
        } catch (error: any) {
            console.error('[Daemon] Error getting config:', error);
            return this.sendJson(res, 500, { 
                error: 'Failed to get configuration',
                message: error.message 
            });
        }
    }

    if (path === '/api/config' && method === 'PUT') {
        try {
            const request = JSON.parse(body);
            const configManager = getConfigManager();
            
            // Update AI configuration
            if (request.ai) {
                if (request.ai.provider) await configManager.setAIProvider(request.ai.provider);
                if (request.ai.apiKey) await configManager.setAIAPIKey(request.ai.apiKey);
                if (request.ai.model) await configManager.setAIModel(request.ai.model);
            }
            
            // Update registry configuration
            if (request.registry) {
                if (request.registry.default) await configManager.setRegistryDefault(request.registry.default);
                if (request.registry.fallback) await configManager.setRegistryFallback(request.registry.fallback);
            }
            
            const updatedConfig = await configManager.getAll();
            return this.sendJson(res, 200, { config: updatedConfig });
        } catch (error: any) {
            console.error('[Daemon] Error updating config:', error);
            return this.sendJson(res, 500, { 
                error: 'Failed to update configuration',
                message: error.message 
            });
        }
    }

    // Secrets endpoints
    if (path === '/api/secrets' && method === 'GET') {
        try {
            const secretManager = getSecretManager();
            const allSecrets = await secretManager.getAll();
            const secrets = Array.from(allSecrets.entries()).map(([name, _value]) => ({
                name,
                value: '••••••••••••••••', // Mask the actual value
                lastUpdated: new Date().toISOString()
            }));
            return this.sendJson(res, 200, { secrets });
        } catch (error: any) {
            console.error('[Daemon] Error getting secrets:', error);
            return this.sendJson(res, 500, { 
                error: 'Failed to get secrets',
                message: error.message 
            });
        }
    }

    if (path === '/api/secrets' && method === 'POST') {
        try {
            const request = JSON.parse(body);
            if (!request.name || !request.value) {
                return this.sendJson(res, 400, { 
                    error: 'Bad Request',
                    message: 'name and value are required' 
                });
            }
            
            const secretManager = getSecretManager();
            await secretManager.set(request.name, request.value);
            
            return this.sendJson(res, 201, { 
                secret: {
                    name: request.name,
                    value: '••••••••••••••••', // Mask the actual value
                    lastUpdated: new Date().toISOString()
                }
            });
        } catch (error: any) {
            console.error('[Daemon] Error creating secret:', error);
            return this.sendJson(res, 500, { 
                error: 'Failed to create secret',
                message: error.message 
            });
        }
    }

    if (path.startsWith('/api/secrets/') && method === 'DELETE') {
        try {
            const name = decodeURIComponent(path.substring('/api/secrets/'.length));
            const secretManager = getSecretManager();
            await secretManager.remove(name);
            return this.sendJson(res, 200, { success: true });
        } catch (error: any) {
            console.error('[Daemon] Error deleting secret:', error);
            return this.sendJson(res, 500, { 
                error: 'Failed to delete secret',
                message: error.message 
            });
        }
    }

    return this.sendJson(res, 404, { error: 'Not Found', path });
  }

  private sendJson(res: http.ServerResponse, c: number, d: any) {
    if (!res.headersSent) {
      res.writeHead(c, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(d));
    }
  }

  async start() {
    ensureInTorchDir();
    await fs.writeFile(this.config.pidFile, process.pid.toString());
    
    // Start the HTTP server
    return new Promise<void>(async (resolve) => {
      this.server.listen(this.config.port, this.config.host, async () => {
        console.log(`[Daemon] Server started on ${this.config.host}:${this.config.port}`);
        
        // Auto-start configured MCP servers in background
        this.autoStartServers().catch(error => {
          console.error('[Daemon] Error auto-starting servers:', error);
        });
        
        resolve();
      });
    });
  }
  
  /**
   * Auto-start configured MCP servers
   */
  private async autoStartServers(): Promise<void> {
    try {
      console.log('[Daemon] Starting auto-start manager for MCP servers...');
      
      // Import AutoStartManager
      const { AutoStartManager } = await import('../utils/auto-start-manager');
      const autoStartManager = new AutoStartManager();
      
      // Get configured servers from environment or config file
      const configuredServers = await this.getConfiguredServers();
      
      if (configuredServers.length === 0) {
        console.log('[Daemon] No servers configured for auto-start');
        return;
      }
      
      console.log(`[Daemon] Found ${configuredServers.length} configured servers: ${configuredServers.join(', ')}`);
      
      // Ensure servers are running
      const results = await autoStartManager.ensureServersRunning(configuredServers);
      
      // Print results
      const summary = autoStartManager.getResultsSummary(results);
      console.log(`[Daemon] Auto-start completed: ${summary.successful} started, ${summary.alreadyRunning} already running, ${summary.failed} failed`);
      
      if (summary.failed > 0) {
        console.warn('[Daemon] Some servers failed to start. Check logs for details.');
      }
      
      // After servers are started, ensure tools are registered
      // Wait longer for servers to fully initialize
      await new Promise(resolve => setTimeout(resolve, 5000));
      await this.ensureToolsRegistered(configuredServers);
      
    } catch (error) {
      console.error('[Daemon] Failed to auto-start servers:', error);
    }
  }
  
  /**
   * Get configured servers from environment or config file
   */
  private async getConfiguredServers(): Promise<string[]> {
    // First, check environment variable (for backward compatibility)
    const envServers = process.env.INTORCH_AUTO_START_SERVERS;
    if (envServers) {
      return envServers.split(',').map(s => s.trim()).filter(s => s.length > 0);
    }
    
    // Then check configuration file
    try {
      const configManager = getConfigManager();
      const config = await configManager.getAll();
      if (config.services && config.services.autoStart && Array.isArray(config.services.autoStart)) {
        return config.services.autoStart;
      }
    } catch (error) {
      console.warn('[Daemon] Failed to read auto-start configuration:', error);
    }
    
    // Default servers if none configured
    // Note: This is a generic default, not hardcoded to specific services
    return [];
  }

  /**
   * Ensure tools are registered for running servers
   */
  private async ensureToolsRegistered(serverNames: string[]): Promise<void> {
    try {
      console.log('[Daemon] Ensuring tools are registered for servers...');
      
      const processManager = getProcessManager();
      const toolRegistry = getToolRegistry();
      const registryClient = getRegistryClient();
      
      // Wait a moment for servers to fully start
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Get all running servers
      const runningServers = await processManager.list();
      console.log(`[Daemon] Found ${runningServers.length} running servers`);
      
      for (const serverName of serverNames) {
        try {
          // Try to find server by name (exact match or partial match)
          // Since we have multiple instances with same name, use the first running one
          const serverInfo = runningServers.find(s => 
            s.status === 'running' && (
              s.serverName === serverName || 
              s.name === serverName ||
              (s.manifest && s.manifest.name && serverName.includes(s.manifest.name)) ||
              serverName.includes(s.name || '')
            )
          );
          
          if (!serverInfo) {
            console.log(`[Daemon] Server ${serverName} is not running or not found, skipping tool registration`);
            console.log(`[Daemon] Available servers: ${runningServers.map(s => `${s.serverName || s.name} (PID: ${s.pid}, status: ${s.status})`).join(', ')}`);
            continue;
          }
          
          console.log(`[Daemon] Registering tools for server: ${serverName} (PID: ${serverInfo.pid})`);
          
          // Get manifest
          const manifest = await registryClient.getCachedManifest(serverName);
          if (!manifest) {
            console.warn(`[Daemon] No manifest found for server ${serverName}`);
            continue;
          }
          
          // Check if manifest has tools
          const hasTools = manifest.tools || (manifest.capabilities && manifest.capabilities.tools);
          if (!hasTools) {
            console.log(`[Daemon] Manifest for ${serverName} has no tools field, trying dynamic discovery`);
            // Try to discover tools dynamically
            await this.discoverToolsDynamically(serverInfo);
          } else {
            // Register tools from manifest
            await toolRegistry.registerToolsFromManifest(serverName, manifest);
            console.log(`[Daemon] Tools registered from manifest for server: ${serverName}`);
          }
          
        } catch (serverError) {
          console.error(`[Daemon] Error registering tools for server ${serverName}:`, serverError);
        }
      }
      
      console.log('[Daemon] Tool registration completed');
      
    } catch (error) {
      console.error('[Daemon] Failed to ensure tools are registered:', error);
    }
  }
  
  /**
   * Discover tools dynamically from a running MCP server
   */
  private async discoverToolsDynamically(serverInfo: any): Promise<void> {
    try {
      console.log(`[Daemon] Attempting dynamic tool discovery for server: ${serverInfo.name}`);
      
      // Import MCPClient
      const { MCPClient } = await import('../mcp/client');
      
      // Create client configuration from server manifest
      const client = new MCPClient({
        transport: {
          type: 'stdio',
          command: serverInfo.manifest.runtime.command,
          args: serverInfo.manifest.runtime.args || [],
          env: { ...process.env } as Record<string, string>
        }
      });
      
      // Connect to server
      await client.connect();
      
      // List tools
      const tools = await client.listTools();
      console.log(`[Daemon] Discovered ${tools.length} tools dynamically from server ${serverInfo.name}`);
      
      // Register tools using registerDynamicTools method
      const toolRegistry = getToolRegistry();
      const toolMetadataArray = tools.map(tool => ({
        name: tool.name,
        description: tool.description || '',
        serverName: serverInfo.serverName,
        actualServerName: serverInfo.name,
        parameters: tool.inputSchema?.properties || {},
        isDynamic: true,
        discoveryTime: new Date().toISOString()
      }));
      
      await toolRegistry.registerDynamicTools(serverInfo.serverName, toolMetadataArray);
      
      await client.disconnect();
      console.log(`[Daemon] Dynamic tool discovery completed for ${serverInfo.name}`);
      
    } catch (error) {
      console.error(`[Daemon] Failed to discover tools dynamically for ${serverInfo.name}:`, error);
    }
  }

  async stop() {
    return new Promise<void>(r => this.server.close(() => r()));
  }
}
