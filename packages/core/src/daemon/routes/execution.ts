/**
 * Execution Routes (AI-powered intent parsing & step execution)
 *
 * Session-based API (recommended):
 * - POST /api/execute/session/create
 * - POST /api/execute/session/:sessionId/execute
 * - POST /api/execute/session/:sessionId/feedback
 * - GET  /api/execute/session/:sessionId
 * - GET  /api/execute/sessions
 * - POST /api/execute/session/:sessionId/cancel
 *
 * Legacy endpoints (kept for backward compatibility):
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

import http from "http";
import { getExecuteService } from "../../ai/execute-service.js";
import type { UnifiedExecutionOptions } from "../../ai/execute-service.js";
import type { StepStreamEvent, StreamCallback } from "../../ai/executor/react-loop-engine.js";
import { sendJson, type RouteContext } from "./index.js";
import { logger } from "../../core/logger.js";

export async function handleExecutionRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // ==================== Session-Based API (New) ====================

  // POST /api/execute/session/create
  if (path === "/api/execute/session/create" && method === "POST") {
    return handleSessionCreate(res, body);
  }

  // POST /api/execute/session/:sessionId/execute
  const executeMatch = path.match(
    /^\/api\/execute\/session\/([^\/]+)\/execute$/,
  );
  if (executeMatch && method === "POST") {
    return handleSessionExecute(res, executeMatch[1], body);
  }

  // POST /api/execute/session/:sessionId/feedback
  const feedbackMatch = path.match(
    /^\/api\/execute\/session\/([^\/]+)\/feedback$/,
  );
  if (feedbackMatch && method === "POST") {
    return handleSessionFeedback(res, feedbackMatch[1], body);
  }

  // GET /api/execute/session/:sessionId
  const getSessionMatch = path.match(
    /^\/api\/execute\/session\/([^\/]+)$/,
  );
  if (getSessionMatch && method === "GET") {
    return handleGetSession(res, getSessionMatch[1]);
  }

  // GET /api/execute/sessions
  if (path === "/api/execute/sessions" && method === "GET") {
    return handleListSessions(res);
  }

  // POST /api/execute/session/:sessionId/cancel
  const cancelMatch = path.match(
    /^\/api\/execute\/session\/([^\/]+)\/cancel$/,
  );
  if (cancelMatch && method === "POST") {
    return handleSessionCancel(res, cancelMatch[1]);
  }

  // ==================== Legacy Endpoints (deprecated) ====================
  // These endpoints are kept for backward compatibility only.
  // They delegate to the Session API internally.
  // Will be removed in a future major version.
  // New clients should use the Session API endpoints above.

  // POST /api/execute/natural-language-stream (SSE streaming)
  if (
    path === "/api/execute/natural-language-stream" &&
    method === "POST"
  ) {
    return handleNaturalLanguageStream(res, body);
  }

  // POST /api/execute/natural-language
  if (
    (path === "/api/execute/natural-language" ||
      path === "/api/execute/naturalLanguage") &&
    method === "POST"
  ) {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/create instead.`);
    return handleNaturalLanguage(res, body);
  }

  // POST /api/execute/parse-intent
  if (
    (path === "/api/execute/parse-intent" ||
      path === "/api/execute/parseIntent") &&
    method === "POST"
  ) {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/create instead.`);
    return handleParseIntent(res, body);
  }

  // POST /api/execute/steps
  if (
    (path === "/api/execute/steps" ||
      path === "/api/execute/execute-steps" ||
      path === "/api/execute/executeSteps") &&
    method === "POST"
  ) {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/create instead.`);
    return handleExecuteSteps(res, body);
  }

  // POST /api/execute/interactive/start
  if (path === "/api/execute/interactive/start" && method === "POST") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/create instead.`);
    return handleInteractiveStart(res, body);
  }

  // POST /api/execute/interactive/respond
  if (path === "/api/execute/interactive/respond" && method === "POST") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/:id/feedback instead.`);
    return handleInteractiveRespond(res, body);
  }

  // POST /api/execute/interactive/execute
  if (path === "/api/execute/interactive/execute" && method === "POST") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/:id/execute instead.`);
    return handleInteractiveExecute(res, body);
  }

  // POST /api/execute/interactive/cleanup
  if (path === "/api/execute/interactive/cleanup" && method === "POST") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Cleanup is now automatic via SessionStore.`);
    return handleInteractiveCleanup(res, body);
  }

  // GET /api/execute/interactive/:sessionId
  const sessionMatch = path.match(
    /^\/api\/execute\/interactive\/([^\/]+)$/,
  );
  if (sessionMatch && method === "GET") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use GET /api/execute/session/:id instead.`);
    return handleGetInteractiveSession(res, sessionMatch[1]);
  }

  // POST /api/intent/parse
  if (path === "/api/intent/parse" && method === "POST") {
    logger.debug(`[Daemon] DEPRECATED endpoint called: ${path}. Use POST /api/execute/session/create instead.`);
    return handleIntentParse(res, body);
  }

  return false;
}

// ==================== Session-Based API Handlers ====================

async function handleSessionCreate(
  res: http.ServerResponse,
  body: string,
): Promise<boolean> {
  try {
    const { query, type, metadata } = JSON.parse(body);

    if (!query || typeof query !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Query is required and must be a string",
      });
      return true;
    }

    const sessionType = type === "interactive" ? "interactive" : "direct";

    logger.info(
      `[Daemon] Creating ${sessionType} session for query: "${query.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();
    const session = await executionService.createSession(
      query,
      sessionType,
      metadata,
    );

    sendJson(res, 200, {
      success: true,
      sessionId: session.id,
      session,
    });
  } catch (error: unknown) {
    logger.error("[Daemon] Error creating session:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to create session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleSessionExecute(
  res: http.ServerResponse,
  sessionId: string,
  body: string,
): Promise<boolean> {
  try {
    const { options } = body ? JSON.parse(body) : {};

    logger.info(`[Daemon] Executing session: ${sessionId}`);

    const executionService = getExecuteService();
    const result = await executionService.executeSession(
      sessionId,
      options || {},
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: unknown) {
    logger.error("[Daemon] Error executing session:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleSessionFeedback(
  res: http.ServerResponse,
  sessionId: string,
  body: string,
): Promise<boolean> {
  try {
    const { type, message, modifiedPlan } = JSON.parse(body);

    if (!type || typeof type !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Feedback type is required and must be a string",
      });
      return true;
    }

    logger.info(
      `[Daemon] Sending feedback for session ${sessionId}: ${type}`,
    );

    const executionService = getExecuteService();
    const session = await executionService.sendFeedback(sessionId, {
      type: type as "confirm" | "modify" | "reject" | "regenerate",
      message,
      modifiedPlan,
    });

    sendJson(res, 200, {
      success: true,
      session,
    });
  } catch (error: unknown) {
    logger.error("[Daemon] Error sending feedback:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to send feedback: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleGetSession(
  res: http.ServerResponse,
  sessionId: string,
): Promise<boolean> {
  try {
    const executionService = getExecuteService();
    const session = await executionService.getSession(sessionId);

    if (!session) {
      sendJson(res, 404, {
        success: false,
        error: "Session not found",
      });
      return true;
    }

    sendJson(res, 200, { success: true, session });
  } catch (error: unknown) {
    logger.error("[Daemon] Error getting session:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to get session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleListSessions(res: http.ServerResponse): Promise<boolean> {
  try {
    const executionService = getExecuteService();
    const result = await executionService.getActiveInteractiveSessions();

    sendJson(res, 200, {
      success: true,
      sessions: result,
      total: result.length,
    });
  } catch (error: unknown) {
    logger.error("[Daemon] Error listing sessions:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to list sessions: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleSessionCancel(
  res: http.ServerResponse,
  sessionId: string,
): Promise<boolean> {
  try {
    const executionService = getExecuteService();
    const session = await executionService.sendFeedback(sessionId, {
      type: "reject",
      message: "Cancelled by user",
    });

    sendJson(res, 200, {
      success: true,
      session,
    });
  } catch (error: unknown) {
    logger.error("[Daemon] Error cancelling session:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to cancel session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

// ==================== Legacy Handler Implementations ====================

async function handleNaturalLanguage(
  res: http.ServerResponse,
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

    logger.info(
      `[Daemon] Executing natural language query: "${query.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();
    const executionOptions: UnifiedExecutionOptions = {
      ...(options || {}),
      skipDaemonDelegation: true, // Running inside daemon — don't delegate back to self
    };
    const result = await executionService.executeNaturalLanguage(
      query,
      executionOptions,
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: unknown) {
    logger.error(
      "[Daemon] Error executing natural language query:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute query: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleNaturalLanguageStream(
  res: http.ServerResponse,
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

    logger.info(
      `[Daemon] Executing natural language query (SSE): \"${query.substring(0, 100)}...\"`,
    );

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });

    const executionService = getExecuteService();
    const executionOptions: UnifiedExecutionOptions = {
      ...(options || {}),
      skipDaemonDelegation: true,
    };

    // Create stream callback that writes SSE events
    const onStep: StreamCallback = async (event: StepStreamEvent) => {
      const sseData = JSON.stringify(event);
      res.write(`data: ${sseData}\n\n`);
    };

    // Execute with streaming
    const result = await executionService.executeNaturalLanguageStream(
      query,
      onStep,
      executionOptions,
    );

    // Send completion event
    const completeEvent = JSON.stringify({
      type: "complete",
      success: result.success,
      result: result.result,
      executionSteps: result.executionSteps,
      statistics: result.statistics,
      error: result.error,
    });
    res.write(`data: ${completeEvent}\n\n`);
    res.write(`data: [DONE]\n\n`);
    res.end();
  } catch (error: unknown) {
    logger.error("[Daemon] Error executing SSE query:", error);
    // Try to send error as SSE if headers already sent
    try {
      const errorEvent = JSON.stringify({
        type: "error",
        error: error instanceof Error ? error.message : String(error),
      });
      res.write(`data: ${errorEvent}\n\n`);
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch {
      sendJson(res, 500, {
        success: false,
        error: `Failed to execute query: ${(error instanceof Error ? error.message : String(error))}`,
      });
    }
  }
  return true;
}

async function handleParseIntent(
  res: http.ServerResponse,
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

    logger.info(
      `[Daemon] Parsing intent: "${intent.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();
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
  } catch (error: unknown) {
    logger.error("[Daemon] Error parsing intent:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to parse intent: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

async function handleExecuteSteps(
  res: http.ServerResponse,
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

    logger.info(`[Daemon] Executing ${steps.length} pre-parsed steps`);

    const executionService = getExecuteService();
    const executionOptions: UnifiedExecutionOptions = options || {};
    const result = await executionService.executeSteps(
      steps,
      executionOptions,
    );

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: unknown) {
    logger.error("[Daemon] Error executing pre-parsed steps:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute steps: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

/**
 * Legacy POST /api/execute/interactive/start
 * Delegates to Session API: createSession(query, 'interactive')
 */
async function handleInteractiveStart(
  res: http.ServerResponse,
  body: string,
): Promise<boolean> {
  try {
    const { query } = JSON.parse(body);

    if (!query || typeof query !== "string") {
      sendJson(res, 400, {
        success: false,
        error: "Query is required and must be a string",
      });
      return true;
    }

    logger.info(
      `[Daemon] Legacy interactive start -> creating interactive session for: "${query.substring(0, 100)}..."`,
    );

    const executionService = getExecuteService();
    const session = await executionService.createSession(query, "interactive");

    sendJson(res, 200, {
      success: true,
      sessionId: session.id,
      session,
    });
  } catch (error: unknown) {
    logger.error(
      "[Daemon] Error in legacy interactive start:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to start interactive session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

/**
 * Legacy POST /api/execute/interactive/respond
 * Delegates to Session API: sendFeedback(sessionId, feedback)
 */
async function handleInteractiveRespond(
  res: http.ServerResponse,
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

    logger.info(
      `[Daemon] Legacy interactive respond -> sending feedback for session: ${sessionId}`,
    );

    const executionService = getExecuteService();

    // Map legacy response format to Session API feedback format
    let feedbackType: "confirm" | "modify" | "reject" | "regenerate" = "confirm";
    if (response?.type === "parameter_value" || response?.type === "clarification") {
      feedbackType = "modify";
    } else if (response?.type === "cancellation") {
      feedbackType = "reject";
    }

    const session = await executionService.sendFeedback(sessionId, {
      type: feedbackType,
      message: response?.clarification || response?.parameters ? JSON.stringify(response.parameters) : undefined,
    });

    sendJson(res, 200, { success: true, session });
  } catch (error: unknown) {
    logger.error(
      "[Daemon] Error in legacy interactive respond:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to process interactive feedback: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

/**
 * Legacy POST /api/execute/interactive/execute
 * Delegates to Session API: executeSession(sessionId, options)
 */
async function handleInteractiveExecute(
  res: http.ServerResponse,
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

    logger.info(
      `[Daemon] Legacy interactive execute -> executing session: ${sessionId}`,
    );

    const executionService = getExecuteService();
    const result = await executionService.executeSession(sessionId, options);

    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: unknown) {
    logger.error(
      "[Daemon] Error in legacy interactive execute:",
      error,
    );
    sendJson(res, 500, {
      success: false,
      error: `Failed to execute interactive session: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}

/**
 * Legacy POST /api/execute/interactive/cleanup
 * Now handled by SessionStore auto-cleanup, just return success.
 */
async function handleInteractiveCleanup(
  res: http.ServerResponse,
  body: string,
): Promise<boolean> {
  logger.info("[Daemon] Legacy interactive cleanup -> handled by SessionStore auto-cleanup");
  sendJson(res, 200, {
    success: true,
    cleanedCount: 0,
    message: "Auto-cleanup is managed by SessionStore",
  });
  return true;
}

/**
 * Legacy GET /api/execute/interactive/:sessionId
 * Delegates to Session API: getSession(sessionId)
 */
async function handleGetInteractiveSession(
  res: http.ServerResponse,
  sessionId: string,
): Promise<boolean> {
  logger.info(`[Daemon] Legacy interactive get session -> getting session: ${sessionId}`);
  const executionService = getExecuteService();
  const session = await executionService.getSession(sessionId);

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
  res: http.ServerResponse,
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
  } catch (error: unknown) {
    logger.error("[Daemon] Error parsing intent:", error);
    sendJson(res, 500, {
      success: false,
      error: `Failed to parse intent: ${(error instanceof Error ? error.message : String(error))}`,
    });
  }
  return true;
}
