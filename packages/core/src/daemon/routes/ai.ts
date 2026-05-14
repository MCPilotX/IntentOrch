/**
 * AI Test Routes
 *
 * - POST /api/ai/test — Test AI configuration
 */

import { getAIConfig } from "../../utils/config.js";
import { getLLMClient } from "../../ai/llm-client.js";
import { sendJson, type RouteContext } from "./index.js";

export async function handleAIRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // POST /api/ai/test
  if (path === "/api/ai/test" && method === "POST") {
    try {
      const { provider, model, apiKey, apiEndpoint, baseUrl } = JSON.parse(body);

      const config = await getAIConfig();
      const testProvider = provider || config.provider;
      const testModel = model || config.model;
      const testApiKey = apiKey || config.apiKey;
      const testApiEndpoint = apiEndpoint || baseUrl || config.apiEndpoint;

      if (!testApiKey) {
        sendJson(res, 400, {
          success: false,
          error: "API key is required",
          message:
            "Please provide an API key or configure it in settings",
        });
        return true;
      }

      const llmClient = getLLMClient();
      llmClient.configure({
        provider: testProvider,
        model: testModel,
        apiKey: testApiKey,
        apiEndpoint: testApiEndpoint,
      });
      const result = await llmClient.testConnection();

      sendJson(res, 200, {
        success: result.success,
        message: result.success
          ? "AI connection successful"
          : "AI connection failed",
        details: result,
      });
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        sendJson(res, 400, {
          success: false,
          error: "Invalid JSON",
          message: "Request body must be valid JSON",
        });
      } else {
        sendJson(res, 500, {
          success: false,
          error: "AI Test Failed",
          message: (error instanceof Error ? error.message : String(error)),
        });
      }
    }
    return true;
  }

  return false;
}
