import http from 'http';
import type { RouteContext } from './status';

/**
 * Notification routes
 * - GET /api/notifications
 * - POST /api/notifications/{id}/read
 */
export async function handleNotificationRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res } = ctx;

  // GET /api/notifications
  if (path === '/api/notifications' && method === 'GET') {
    sendJson(res, 200, { notifications: [] });
    return true;
  }

  // POST /api/notifications/{id}/read
  if (path.startsWith('/api/notifications/') && path.endsWith('/read') && method === 'POST') {
    sendJson(res, 200, { success: true });
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
