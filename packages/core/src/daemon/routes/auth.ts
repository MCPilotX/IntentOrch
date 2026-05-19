/**
 * Auth Routes
 *
 * - GET /api/auth/token    — Get daemon auth token (for Web UI auto-login)
 * - GET /api/auth/verify   — Verify current token is valid
 */

import { sendJson, type RouteContext } from "./index.js";
import { getSecretManager } from "../../secret/manager.js";

export async function handleAuthRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res } = ctx;

  // GET /api/auth/token
  if (path === "/api/auth/token" && method === "GET") {
    sendJson(res, 200, {
      token: await getSecretManager().get("daemon_auth_token"),
    });
    return true;
  }

  // GET /api/auth/verify
  if (path === "/api/auth/verify" && method === "GET") {
    sendJson(res, 200, { verified: true, message: "Token is valid" });
    return true;
  }

  return false;
}
