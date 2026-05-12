/**
 * Configuration Routes
 *
 * - GET /api/config  — Get current configuration
 * - PUT /api/config  — Update configuration
 */

import { getConfigService } from "../../core/config-service.js";
import { sendJson, type RouteContext } from "./index.js";

export async function handleConfigRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // GET /api/config
  if (path === "/api/config" && method === "GET") {
    try {
      const configService = getConfigService();
      const config = await configService.getAppConfig();
      sendJson(res, 200, { config });
    } catch (error: any) {
      sendJson(res, 500, {
        error: "Failed to get configuration",
        message: error.message,
      });
    }
    return true;
  }

  // PUT /api/config
  if (path === "/api/config" && method === "PUT") {
    try {
      const data = JSON.parse(body);
      const configService = getConfigService();

      // Update AI config fields if provided
      if (data.ai) {
        if (data.ai.provider) {
          await configService.setAIProvider(data.ai.provider);
        }
        if (data.ai.apiKey) {
          await configService.setAIAPIKey(data.ai.apiKey);
        }
        if (data.ai.model) {
          await configService.setAIModel(data.ai.model);
        }
      }

      // Update registry config fields if provided
      if (data.registry) {
        if (data.registry.default) {
          await configService.setRegistryDefault(data.registry.default);
        }
        if (data.registry.fallback) {
          await configService.setRegistryFallback(data.registry.fallback);
        }
      }

      sendJson(res, 200, {
        success: true,
        message: "Configuration updated successfully",
      });
    } catch (error: any) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 500, {
          error: "Failed to update configuration",
          message: error.message,
        });
      }
    }
    return true;
  }

  return false;
}
