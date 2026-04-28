import http from 'http';
import fs from 'fs/promises';
import { getProcessManager, getRegistryClient, getSecretManager } from '@intentorch/core';

export interface RouteContext {
  req: http.IncomingMessage;
  res: http.ServerResponse;
  path: string;
  method: string;
  body: string;
  parsedUrl: URL;
  config: { port: number; host: string; pidFile: string; logFile: string };
  startTime: number;
  requestCount: number;
}

/**
 * Status & System routes
 * - GET /api/status
 * - GET /api/system/stats
 * - GET /api/system/logs
 * - GET /api/auth/token
 */
export async function handleStatusRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, config, startTime, requestCount } = ctx;

  // GET /api/status
  if (path === '/api/status' && method === 'GET') {
    const status = {
      running: true,
      pid: process.pid,
      config,
      uptime: Date.now() - startTime,
      version: require('../../../package.json').version,
      stats: {
        activeConnections: 0,
        totalRequests: requestCount
      }
    };
    sendJson(res, 200, status);
    return true;
  }

  // GET /api/system/stats
  if ((path === '/api/system/stats' || path === '/api/system/stats/') && method === 'GET') {
    try {
      const processManager = getProcessManager();
      const allProcesses = await processManager.list();
      const runningProcesses = allProcesses.filter(p => p.status === 'running');
      const registryClient = getRegistryClient();
      const cachedManifests = await registryClient.listCachedManifests();

      sendJson(res, 200, {
        stats: {
          totalServers: cachedManifests.length,
          runningServers: runningProcesses.length,
          totalProcesses: allProcesses.length,
          diskUsage: 0,
          uptime: Date.now() - startTime,
          requestCount
        }
      });
    } catch (error: any) {
      console.error('[Daemon] Error getting system stats:', error);
      sendJson(res, 500, { error: 'Failed to get system statistics', message: error.message });
    }
    return true;
  }

  // GET /api/system/logs
  if ((path === '/api/system/logs' || path === '/api/system/logs/') && method === 'GET') {
    try {
      const logContent = await fs.readFile(config.logFile, 'utf-8');
      sendJson(res, 200, { logs: logContent, logFile: config.logFile, lastUpdated: new Date().toISOString() });
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        sendJson(res, 404, { error: 'Logs Not Found', message: `Log file not found: ${config.logFile}` });
      } else {
        sendJson(res, 500, { error: 'Internal Server Error', message: `Failed to read logs: ${error.message}` });
      }
    }
    return true;
  }

  // GET /api/auth/token
  if (path === '/api/auth/token' && method === 'GET') {
    sendJson(res, 200, { token: await getSecretManager().get('daemon_auth_token') });
    return true;
  }

  return false;
}

function sendJson(res: http.ServerResponse, c: number, d: any) {
  if (!res.headersSent) {
    res.writeHead(c, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d));
  }
}
