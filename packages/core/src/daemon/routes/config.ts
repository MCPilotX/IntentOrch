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
    } catch (error: unknown) {
      sendJson(res, 500, {
        error: "Failed to get configuration",
        message: (error instanceof Error ? error.message : String(error)),
      });
    }
    return true;
  }

  // PUT /api/config
  if (path === "/api/config" && method === "PUT") {
    try {
      const data = JSON.parse(body);
      const configService = getConfigService();

      // Support both {ai: ...} and {config: {ai: ...}} structures
      const appConfig = data.config || data;

      // Update AI config fields if provided
      if (appConfig.ai) {
        if (appConfig.ai.provider) {
          await configService.setAIProvider(appConfig.ai.provider);
        }
        if (appConfig.ai.apiKey !== undefined) {
          await configService.setAIAPIKey(appConfig.ai.apiKey);
        }
        if (appConfig.ai.model) {
          await configService.setAIModel(appConfig.ai.model);
        }
        if (appConfig.ai.apiEndpoint !== undefined) {
          await configService.setAIEndpoint(appConfig.ai.apiEndpoint);
        }
      }

      // Update registry config fields if provided
      if (appConfig.registry) {
        if (appConfig.registry.default) {
          await configService.setRegistryDefault(appConfig.registry.default);
        }
        if (appConfig.registry.fallback) {
          await configService.setRegistryFallback(appConfig.registry.fallback);
        }
        if (appConfig.registry.preferred) {
          await configService.setRegistryDefault(appConfig.registry.preferred);
        }
      }

      sendJson(res, 200, {
        success: true,
        message: "Configuration updated successfully",
        config: await configService.getAppConfig(),
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 500, {
          error: "Failed to update configuration",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }
    return true;
  }

  return false;
}
