/**
 * Daemon Route Types & Middleware
 *
 * Shared types for the daemon route system.
 */

import http from "http";

// ==================== Route Context ====================

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

// ==================== Middleware ====================

export type Middleware = (
  ctx: RouteContext,
) => Promise<boolean> | boolean;

// ==================== Route Handler ====================

export type RouteHandler = (ctx: RouteContext) => Promise<boolean>;

// ==================== Utility ====================

export function sendJson(
  res: http.ServerResponse,
  statusCode: number,
  data: unknown,
): void {
  if (!res.headersSent) {
    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(JSON.stringify(data));
  }
}

export function parseBody(req: http.IncomingMessage): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    let b = "";
    req.on("data", (c: string) => (b += c));
    req.on("end", () => resolve(b));
    req.on("error", reject);
  });
}
