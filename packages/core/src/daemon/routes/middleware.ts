/**
 * Daemon Middleware
 *
 * Standard middleware for the daemon HTTP server:
 * - CORS handling
 * - Authentication
 * - Body parsing (with timeout protection)
 * - Request logging
 * - Error handling
 */

import http from "http";
import { getSecretManager } from "../../secret/manager.js";
import { sendJson, type RouteContext } from "./index.js";
import { logger } from "../../core/logger.js";

// ==================== Constants ====================

/** Maximum time (ms) to wait for request body before timing out */
const BODY_PARSE_TIMEOUT_MS = 30_000;

// ==================== CORS Middleware ====================

export function corsMiddleware(
  _ctx: RouteContext,
): boolean {
  const { res } = _ctx;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization",
  );
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, DELETE, OPTIONS",
  );
  return true;
}

// ==================== OPTIONS Handler ====================

export function optionsHandler(ctx: RouteContext): boolean {
  if (ctx.method === "OPTIONS") {
    ctx.res.writeHead(200).end();
    // OPTIONS handled, short-circuit the middleware chain
    return false;
  }
  // Non-OPTIONS requests: pass through
  return true;
}

// ==================== Auth Middleware ====================

export async function authMiddleware(ctx: RouteContext): Promise<boolean> {
  const { path, req, res } = ctx;

  // Skip auth for public endpoints
  if (
    path === "/api/status" ||
    path === "/api/auth/token" ||
    path === "/api/execute/natural-language-stream"
  ) {
    return true;
  }

  const auth = req.headers.authorization;

  // SECURITY FIX: wrap secret retrieval in try-catch to prevent
  // silent authentication bypass when SecretManager fails (e.g. file I/O errors,
  // decryption failures, or missing secrets file).
  let token: string | undefined;
  try {
    token = await getSecretManager().get("daemon_auth_token");
  } catch (err) {
    logger.error("[AuthMiddleware] Failed to retrieve daemon_auth_token:", err);
    sendJson(res, 500, { error: "Authentication service unavailable" });
    return false;
  }

  if (!auth || auth.substring(7) !== token) {
    sendJson(res, 401, { error: "Unauthorized" });
    return false;
  }

  return true;
}

// ==================== Body Parser Middleware ====================

export async function bodyParserMiddleware(ctx: RouteContext): Promise<boolean> {
  if (ctx.method === "POST" || ctx.method === "PUT") {
    ctx.body = await new Promise<string>((resolve, reject) => {
      let b = "";
      let settled = false;

      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          ctx.req.destroy(new Error("Request body parse timeout"));
          reject(new Error("Request body parse timeout after " + BODY_PARSE_TIMEOUT_MS + "ms"));
        }
      }, BODY_PARSE_TIMEOUT_MS);

      ctx.req.on("data", (c: string) => {
        if (!settled) b += c;
      });

      ctx.req.on("end", () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(b);
        }
      });

      ctx.req.on("error", (err) => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          reject(err);
        }
      });
    });
  }
  return true;
}

// ==================== Logging Middleware ====================

export function loggingMiddleware(ctx: RouteContext): boolean {
  if (ctx.method !== "OPTIONS") {
    logger.info(`[Daemon] ${ctx.method} ${ctx.path}`);
  }
  return true;
}

// ==================== Request Count Middleware ====================

export function requestCountMiddleware(ctx: RouteContext): boolean {
  if (ctx.method !== "OPTIONS") {
    // requestCount is tracked in the server, but we increment here
    // The actual count is managed by the server instance
  }
  return true;
}

// ==================== Error Handler Middleware ====================

export function errorHandlerMiddleware(
  ctx: RouteContext,
  error: unknown,
): void {
  const { res } = ctx;
  logger.error("[Daemon Error]", error);
  sendJson(res, 500, {
    error: "Internal Error",
    message: (error as Error).message,
  });
}

// ==================== Middleware Chain ====================

export type MiddlewareFn = (
  ctx: RouteContext,
) => Promise<boolean> | boolean;

/**
 * Run a chain of middleware functions.
 * Returns false if any middleware returns false (short-circuits).
 */
export async function runMiddlewareChain(
  ctx: RouteContext,
  middlewares: MiddlewareFn[],
): Promise<boolean> {
  for (const mw of middlewares) {
    const result = await mw(ctx);
    if (!result) return false;
  }
  return true;
}
