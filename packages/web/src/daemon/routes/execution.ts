import http from 'http';
import { getExecuteService, type UnifiedExecutionOptions } from '@intentorch/core';
import type { RouteContext } from './status';

/**
 * Execution routes (AI-powered intent parsing & step execution)
 * - POST /api/execute/natural-language
 * - POST /api/execute/parse-intent
 * - POST /api/execute/steps
 * - POST /api/execute/interactive/start
 * - POST /api/execute/interactive/respond
 * - POST /api/execute/interactive/execute
 * - GET  /api/execute/interactive/{sessionId}
 * - POST /api/execute/interactive/cleanup
 * - POST /api/intent/parse
 */
export async function handleExecutionRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // POST /api/execute/natural-language
  if ((path === '/api/execute/natural-language' || path === '/api/execute/naturalLanguage') && method === 'POST') {
    return handleNaturalLanguage(res, body);
  }

  // POST /api/execute/parse-intent
  if ((path === '/api/execute/parse-intent' || path === '/api/execute/parseIntent') && method === 'POST') {
    return handleParseIntent(res, body);
  }

  // POST /api/execute/steps (also support legacy paths)
  if ((path === '/api/execute/steps' || path === '/api/execute/execute-steps' || path === '/api/execute/executeSteps') && method === 'POST') {
    return handleExecuteSteps(res, body);
  }

  // POST /api/execute/interactive/start
  if (path === '/api/execute/interactive/start' && method === 'POST') {
    return handleInteractiveStart(res, body);
  }

  // POST /api/execute/interactive/respond
  if (path === '/api/execute/interactive/respond' && method === 'POST') {
    return handleInteractiveRespond(res, body);
  }

  // POST /api/execute/interactive/execute
  if (path === '/api/execute/interactive/execute' && method === 'POST') {
    return handleInteractiveExecute(res, body);
  }

  // POST /api/execute/interactive/cleanup
  if (path === '/api/execute/interactive/cleanup' && method === 'POST') {
    return handleInteractiveCleanup(res, body);
  }

  // GET /api/execute/interactive/{sessionId}
  if (path.startsWith('/api/execute/interactive/') && method === 'GET') {
    return handleInteractiveGetSession(res, path);
  }

  // POST /api/intent/parse (legacy)
  if (path === '/api/intent/parse' && method === 'POST') {
    return handleIntentParseLegacy(res, body);
  }

  return false;
}

async function handleNaturalLanguage(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { query, options } = JSON.parse(body);
    if (!query || typeof query !== 'string') {
      sendJson(res, 400, { success: false, error: 'Query is required and must be a string' });
      return true;
    }

    console.log(`[Daemon] Executing natural language query: "${query.substring(0, 100)}..."`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const executionOptions: UnifiedExecutionOptions = options || {};
    const result = await executionService.executeNaturalLanguage(query, executionOptions);
    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error('[Daemon] Error executing natural language query:', error);
    sendJson(res, 500, { success: false, error: `Failed to execute query: ${error.message}` });
  }
  return true;
}

async function handleParseIntent(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { intent, context } = JSON.parse(body);
    if (!intent || typeof intent !== 'string') {
      sendJson(res, 400, { success: false, error: 'Intent is required and must be a string' });
      return true;
    }

    console.log(`[Daemon] Parsing intent: "${intent.substring(0, 100)}..."`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    console.log('[Daemon] Execution service obtained, calling parseIntent...');
    const result = await executionService.parseIntent(intent, context);
    console.log('[Daemon] Execution service parseIntent result:', result);

    sendJson(res, 200, {
      success: true,
      data: {
        steps: result.steps,
        status: result.status,
        confidence: result.confidence,
        explanation: result.explanation
      }
    });
  } catch (error: any) {
    console.error('[Daemon] Error parsing intent:', error);
    sendJson(res, 500, { success: false, error: `Failed to parse intent: ${error.message}` });
  }
  return true;
}

async function handleExecuteSteps(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { steps, options } = JSON.parse(body);
    if (!steps || !Array.isArray(steps) || steps.length === 0) {
      sendJson(res, 400, { success: false, error: 'Steps are required and must be a non-empty array' });
      return true;
    }

    console.log(`[Daemon] Executing ${steps.length} pre-parsed steps`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const executionOptions: UnifiedExecutionOptions = options || {};
    const result = await executionService.executeSteps(steps, executionOptions);
    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error('[Daemon] Error executing pre-parsed steps:', error);
    sendJson(res, 500, { success: false, error: `Failed to execute steps: ${error.message}` });
  }
  return true;
}

async function handleInteractiveStart(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { query, userId } = JSON.parse(body);
    if (!query || typeof query !== 'string') {
      sendJson(res, 400, { success: false, error: 'Query is required and must be a string' });
      return true;
    }

    console.log(`[Daemon] Starting interactive session for query: "${query.substring(0, 100)}..."`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const result = await executionService.startInteractiveSession(query, userId);
    console.log(`[Daemon] Interactive session started: ${result.sessionId}`);
    sendJson(res, 200, { success: true, sessionId: result.sessionId, guidance: result.guidance, session: result.session });
  } catch (error: any) {
    console.error('[Daemon] Error starting interactive session:', error);
    sendJson(res, 500, { success: false, error: `Failed to start interactive session: ${error.message}` });
  }
  return true;
}

async function handleInteractiveRespond(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { sessionId, response } = JSON.parse(body);
    if (!sessionId || typeof sessionId !== 'string') {
      sendJson(res, 400, { success: false, error: 'Session ID is required and must be a string' });
      return true;
    }
    if (!response || typeof response !== 'object') {
      sendJson(res, 400, { success: false, error: 'Response is required and must be an object' });
      return true;
    }

    console.log(`[Daemon] Processing feedback for session: ${sessionId}`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const result = await executionService.processInteractiveFeedback(sessionId, response);
    if (!result.success) {
      sendJson(res, 404, { success: false, error: 'Session not found or invalid' });
      return true;
    }

    sendJson(res, 200, { success: true, guidance: result.guidance, session: result.session, readyForExecution: result.readyForExecution });
  } catch (error: any) {
    console.error('[Daemon] Error processing interactive feedback:', error);
    sendJson(res, 500, { success: false, error: `Failed to process interactive feedback: ${error.message}` });
  }
  return true;
}

async function handleInteractiveExecute(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { sessionId, options = {} } = JSON.parse(body);
    if (!sessionId || typeof sessionId !== 'string') {
      sendJson(res, 400, { success: false, error: 'Session ID is required and must be a string' });
      return true;
    }

    console.log(`[Daemon] Executing interactive session: ${sessionId}`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const result = await executionService.executeInteractiveSession(sessionId, options);
    sendJson(res, result.success ? 200 : 500, {
      success: result.success,
      result: result.result,
      executionSteps: result.executionSteps,
      statistics: result.statistics,
      error: result.error,
    });
  } catch (error: any) {
    console.error('[Daemon] Error executing interactive session:', error);
    sendJson(res, 500, { success: false, error: `Failed to execute interactive session: ${error.message}` });
  }
  return true;
}

async function handleInteractiveCleanup(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { maxAgeMs = 3600000 } = JSON.parse(body);
    console.log(`[Daemon] Cleaning up old interactive sessions (max age: ${maxAgeMs}ms)`);
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
      return true;
    }

    const cleanedCount = executionService.cleanupInteractiveSessions(maxAgeMs);
    sendJson(res, 200, { success: true, cleanedCount, message: `Cleaned up ${cleanedCount} old sessions` });
  } catch (error: any) {
    console.error('[Daemon] Error cleaning up interactive sessions:', error);
    sendJson(res, 500, { success: false, error: `Failed to cleanup interactive sessions: ${error.message}` });
  }
  return true;
}

async function handleInteractiveGetSession(res: http.ServerResponse, path: string): Promise<true> {
  const sessionId = path.substring('/api/execute/interactive/'.length);
  if (!sessionId) {
    const executionService = getExecuteService();
    if (!executionService) {
      sendJson(res, 503, { success: false, error: 'Execution service is not available' });
      return true;
    }
    const sessions = executionService.getActiveInteractiveSessions();
    sendJson(res, 200, { success: true, sessions });
    return true;
  }

  console.log(`[Daemon] Getting interactive session: ${sessionId}`);
  const executionService = getExecuteService();
  if (!executionService) {
    sendJson(res, 503, { success: false, error: 'Execution service is not available. Please check service configuration.' });
    return true;
  }

  const session = executionService.getInteractiveSession(sessionId);
  if (!session) {
    sendJson(res, 404, { success: false, error: 'Session not found' });
    return true;
  }

  sendJson(res, 200, { success: true, session });
  return true;
}

async function handleIntentParseLegacy(res: http.ServerResponse, body: string): Promise<true> {
  try {
    const { intent, context } = JSON.parse(body);
    if (!intent || typeof intent !== 'string') {
      sendJson(res, 400, { success: false, error: 'Intent is required and must be a string' });
      return true;
    }

    const { getAIConfig, getIntentService } = await import('@intentorch/core');
    const aiConfig = await getAIConfig();
    const intentService = getIntentService(aiConfig);
    const result = await intentService.parseIntent({ intent, context });
    sendJson(res, result.success ? 200 : 400, result);
  } catch (error: any) {
    console.error('[Daemon] Error parsing intent:', error);
    sendJson(res, 500, { success: false, error: `Failed to parse intent: ${error.message}` });
  }
  return true;
}

function sendJson(res: http.ServerResponse, c: number, d: any) {
  if (!res.headersSent) {
    res.writeHead(c, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d));
  }
}
