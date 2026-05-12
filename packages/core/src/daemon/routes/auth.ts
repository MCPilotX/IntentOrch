/**
 * Auth Routes
 *
 * - GET /api/auth/verify
 */

import { sendJson, type RouteContext } from "./index.js";

export async function handleAuthRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res } = ctx;

  // GET /api/auth/verify
  if (path === "/api/auth/verify" && method === "GET") {
    sendJson(res, 200, { verified: true, message: "Token is valid" });
    return true;
  }

  return false;
}
