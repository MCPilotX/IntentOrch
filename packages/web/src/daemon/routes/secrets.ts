import http from 'http';
import { getSecretManager } from '@intentorch/core';
import type { RouteContext } from './status';

/**
 * Secrets management routes
 * - GET /api/secrets
 * - POST /api/secrets
 * - DELETE /api/secrets/{name}
 */
export async function handleSecretsRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // GET /api/secrets
  if (path === '/api/secrets' && method === 'GET') {
    try {
      const secretManager = getSecretManager();
      const allSecrets = await secretManager.getAll();
      const secrets = Array.from(allSecrets.entries()).map(([name]) => ({
        name,
        value: '••••••••••••••••',
        lastUpdated: new Date().toISOString()
      }));
      sendJson(res, 200, { secrets });
    } catch (error: any) {
      console.error('[Daemon] Error getting secrets:', error);
      sendJson(res, 500, { error: 'Failed to get secrets', message: error.message });
    }
    return true;
  }

  // POST /api/secrets
  if (path === '/api/secrets' && method === 'POST') {
    try {
      const request = JSON.parse(body);
      if (!request.name || !request.value) {
        sendJson(res, 400, { error: 'Bad Request', message: 'name and value are required' });
        return true;
      }

      const secretManager = getSecretManager();
      await secretManager.set(request.name, request.value);

      sendJson(res, 201, {
        secret: {
          name: request.name,
          value: '••••••••••••••••',
          lastUpdated: new Date().toISOString()
        }
      });
    } catch (error: any) {
      console.error('[Daemon] Error creating secret:', error);
      sendJson(res, 500, { error: 'Failed to create secret', message: error.message });
    }
    return true;
  }

  // DELETE /api/secrets/{name}
  if (path.startsWith('/api/secrets/') && method === 'DELETE') {
    try {
      const name = decodeURIComponent(path.substring('/api/secrets/'.length));
      const secretManager = getSecretManager();
      await secretManager.remove(name);
      sendJson(res, 200, { success: true });
    } catch (error: any) {
      console.error('[Daemon] Error deleting secret:', error);
      sendJson(res, 500, { error: 'Failed to delete secret', message: error.message });
    }
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
