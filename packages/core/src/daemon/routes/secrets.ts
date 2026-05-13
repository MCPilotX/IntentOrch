/**
 * Secrets Management Routes
 *
 * - GET    /api/secrets       — List all secret keys
 * - POST   /api/secrets       — Set a secret
 * - DELETE /api/secrets/:key  — Delete a secret
 */

import { getSecretManager } from "../../secret/manager.js";
import { sendJson, type RouteContext } from "./index.js";

export async function handleSecretsRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // GET /api/secrets
  if (path === "/api/secrets" && method === "GET") {
    try {
      const secretManager = getSecretManager();
      const keys = await secretManager.list();
      sendJson(res, 200, { secrets: keys });
    } catch (error: unknown) {
      sendJson(res, 500, {
        error: "Failed to list secrets",
        message: (error instanceof Error ? error.message : String(error)),
      });
    }
    return true;
  }

  // POST /api/secrets
  if (path === "/api/secrets" && method === "POST") {
    try {
      const { key, value } = JSON.parse(body);

      if (!key || typeof key !== "string") {
        sendJson(res, 400, {
          error: "Bad Request",
          message: "key is required and must be a string",
        });
        return true;
      }

      if (value === undefined || value === null) {
        sendJson(res, 400, {
          error: "Bad Request",
          message: "value is required",
        });
        return true;
      }

      await getSecretManager().set(key, String(value));
      sendJson(res, 200, {
        success: true,
        message: `Secret '${key}' set successfully`,
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 500, {
          error: "Failed to set secret",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }
    return true;
  }

  // DELETE /api/secrets/:key
  const deleteMatch = path.match(/^\/api\/secrets\/(.+)$/);
  if (deleteMatch && method === "DELETE") {
    const key = decodeURIComponent(deleteMatch[1]);
    try {
      await getSecretManager().remove(key);
      sendJson(res, 200, {
        success: true,
        message: `Secret '${key}' deleted successfully`,
      });
    } catch (error: unknown) {
      sendJson(res, 500, {
        error: "Failed to delete secret",
        message: (error instanceof Error ? error.message : String(error)),
      });
    }
    return true;
  }

  return false;
}
