/**
 * Execution Routes (AI-powered intent parsing & step execution)
 *
 * - POST /api/execute/natural-language
 * - POST /api/execute/parse-intent
 * - POST /api/execute/steps
 * - POST /api/execute/interactive/start
 * - POST /api/execute/interactive/respond
 * - POST /api/execute/interactive/execute
 * - GET  /api/execute/interactive/:sessionId
 * - POST /api/execute/interactive/cleanup
 * - POST /api/intent/parse
 */

import { getExecuteService } from "../../ai/execute-service.js";
import type { UnifiedExecutionOptions } from "../../ai/execute-service.js";
import { sendJson, type RouteContext } from "./index.js";

export async function handleExecutionRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // ==================== POST /api/execute/natural-language ====================
  if (
    (path === "/api/execute/natural-language" ||
      path === "/api/execute/naturalLanguage") &&
    method === "POST"
  ) {
    return handleNaturalLanguage(res, body);
  }

  // ==================== POST /api/execute/parse-intent ====================
  if (
    (path === "/api/execute/parse-intent" ||
      path === "/api/execute/parseIntent") &&
    method === "POST"
  ) {
    return handleParseIntent(res, body);
  }

  // ==================== POST /api/execute/steps ====================
  if (
    (path === "/api/execute/steps" ||
      path === "/api/execute/execute-steps" ||
      path === "/api/execute/executeSteps") &&
    method === "POST"
  ) {
    return handleExecuteSteps(res, body);
  }

  // ==================== POST /api/execute/interactive/start ====================
  if (path === "/api/execute/interactive/start" && method === "POST") {
    return handleInteractiveStart(res, body);
  }

  // ==================== POST /api/execute/interactive/respond ====================
  if (path === "/api/execute/interactive/respond" && method === "POST") {
    return handleInteractiveRespond(res, body);
  }

  // ==================== POST /api/execute/interactive/execute ====================
  if (path === "/api/execute/interactive/execute" && method === "POST") {
    return handleInteractiveExecute(res, body);
  }

  // ==================== POST /api/execute/interactive/cleanup ====================
  if (path === "/api/execute/interactive/cleanup" && method === "POST") {
    return handleInteractiveCleanup(res, body);
  }

  // ==================== GET /api/execute/interactive/:sessionId ====================
  const sessionMatch = path.match(
    /^\/api\/execute\/interactive\/([^\/]+)$/,
  );
  if (sessionMatch && method === "GET") {
    return handleGetInteractiveSession(res, sessionMatch[1]);
  }

  // ==================== POST /api/intent/parse ====================
  if (path === "/api/intent/parse" && method === "POST") {
    return handleIntentParse(res, body);
  }

  return false;
}

// ==================== Handler Implementations ====================

async function handleNaturalLanguage(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { query, options } = JSON.parse(body);

    if (!query || typeof query !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Query is required and must be a string",
      });
      return true;
    }

    console.log(
      `[Daemon] Executing natural language query: "${query.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const executionOptions: UnifiedExecutionOptions = options || {};
    const result = await executionService.executeNaturalLanguage(
      query,
      executionOptions,
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error(
      "[Daemon] Error executing natural language query:",
      error,
    );
    console.error("[Daemon] Error stack:", error.stack);
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute query: ${error.message}`,
    });
  }
  return true;
}

async function handleParseIntent(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { intent, context } = JSON.parse(body);

    if (!intent || typeof intent !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Intent is required and must be a string",
      });
      return true;
    }

    console.log(
      `[Daemon] Parsing intent: "${intent.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    console.log(
      "[Daemon] Execution service obtained, calling parseIntent...",
    );

    const result = await executionService.parseIntent(intent, context);

    console.log("[Daemon] Execution service parseIntent result:", result);

    sendJson(res, 200, {
      success: true,
      data: {
        steps: result.steps,
        status: result.status,
        confidence: result.confidence,
        explanation: result.explanation,
      },
    });
  } catch (error: any) {
    console.error("[Daemon] Error parsing intent:", error);
    console.error("[Daemon] Error stack:", error.stack);
    console.error(
      "[Daemon] Error details:",
      JSON.stringify(error, null, 2),
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to parse intent: ${error.message}`,
    });
  }
  return true;
}

async function handleExecuteSteps(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { steps, options } = JSON.parse(body);

    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      sendJson(res, 400, {
        success: false,
        error: "Steps are required and must be a non-empty array",
      });
      return true;
    }

    console.log(`[Daemon] Executing ${steps.length} pre-parsed steps`);

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const executionOptions: UnifiedExecutionOptions = options || {};
    const result = await executionService.executeSteps(
      steps,
      executionOptions,
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error("[Daemon] Error executing pre-parsed steps:", error);
    console.error("[Daemon] Error stack:", error.stack);
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute steps: ${error.message}`,
    });
  }
  return true;
}

async function handleInteractiveStart(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { query, userId } = JSON.parse(body);

    if (!query || typeof query !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Query is required and must be a string",
      });
      return true;
    }

    console.log(
      `[Daemon] Starting interactive session for query: "${query.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const result = await executionService.startInteractiveSession(
      query,
      userId,
    );

    console.log(
      `[Daemon] Interactive session started: ${result.sessionId}`,
    );

    sendJson(res, 200, {
      success: true,
      sessionId: result.sessionId,
      guidance: result.guidance,
      session: result.session,
    });
  } catch (error: any) {
    console.error(
      "[Daemon] Error starting interactive session:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to start interactive session: ${error.message}`,
    });
  }
  return true;
}

async function handleInteractiveRespond(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { sessionId, response } = JSON.parse(body);

    if (!sessionId || typeof sessionId !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Session ID is required and must be a string",
      });
      return true;
    }

    if (!response || typeof response !== "object") {
      sendJson(res, 400, {
        success: false,
        error: "Response is required and must be an object",
      });
      return true;
    }

    console.log(
      `[Daemon] Processing feedback for session: ${sessionId}`,
    );

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const result = await executionService.processInteractiveFeedback(
      sessionId,
      response,
    );

    if (!result.success) {
      sendJson(res, 404, {
        success: false,
        error: "Session not found or invalid",
      });
      return true;
    }

    sendJson(res, 200, {
      success: true,
      guidance: result.guidance,
      session: result.session,
      readyForExecution: result.readyForExecution,
    });
  } catch (error: any) {
    console.error(
      "[Daemon] Error processing interactive feedback:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to process interactive feedback: ${error.message}`,
    });
  }
  return true;
}

async function handleInteractiveExecute(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { sessionId, options = {} } = JSON.parse(body);

    if (!sessionId || typeof sessionId !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Session ID is required and must be a string",
      });
      return true;
    }

    console.log(
      `[Daemon] Executing interactive session: ${sessionId}`,
    );

    const executionService = getExecuteService();

    if (!executionService) {
      console.error("[Daemon] Execution service is not available");
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const result = await executionService.executeInteractiveSession(
      sessionId,
      options,
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error(
      "[Daemon] Error executing interactive session:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute interactive session: ${error.message}`,
    });
  }
  return true;
}

async function handleInteractiveCleanup(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { maxAgeMs } = JSON.parse(body);
    const executionService = getExecuteService();

    if (!executionService) {
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const cleaned =
      executionService.cleanupInteractiveSessions(maxAgeMs || 3600000);
    sendJson(res, 200, {
      success: true,
      cleanedSessions: cleaned,
    });
  } catch (error: any) {
    sendJson(res, 500, {
      success: false,
      error: `Failed to cleanup sessions: ${error.message}`,
    });
  }
  return true;
}

async function handleGetInteractiveSession(
  res: any,
  sessionId: string,
): Promise<boolean> {
  const executionService = getExecuteService();

  if (!executionService) {
    sendJson(res, 503, {
      success: false,
      error:
        "Execution service is not available. Please check service configuration.",
    });
    return true;
  }

  const session = executionService.getInteractiveSession(sessionId);
  if (!session) {
    sendJson(res, 404, {
      success: false,
      error: "Session not found",
    });
    return true;
  }

  sendJson(res, 200, { success: true, session });
  return true;
}

async function handleIntentParse(
  res: any,
  body: string,
): Promise<boolean> {
  try {
    const { intent, context } = JSON.parse(body);

    if (!intent || typeof intent !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Intent is required and must be a string",
      });
      return true;
    }

    const executionService = getExecuteService();

    if (!executionService) {
      sendJson(res, 503, {
        success: false,
        error:
          "Execution service is not available. Please check service configuration.",
      });
      return true;
    }

    const result = await executionService.parseIntent(intent, context);

    sendJson(res, 200, {
      success: true,
      data: {
        steps: result.steps,
        status: result.status,
        confidence: result.confidence,
        explanation: result.explanation,
      },
    });
  } catch (error: any) {
    console.error("[Daemon] Error parsing intent:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to parse intent: ${error.message}`,
    });
  }
  return true;
}
