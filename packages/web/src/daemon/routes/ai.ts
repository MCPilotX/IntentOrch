import http from 'http';
import type { RouteContext } from './status';

/**
 * AI configuration routes
 * - POST /api/ai/test
 */
export async function handleAIRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // POST /api/ai/test
  if (path === '/api/ai/test' && method === 'POST') {
    try {
      const { provider, model, apiKey } = JSON.parse(body);
      if (!provider || !model || !apiKey) {
        sendJson(res, 200, { success: false, message: 'provider, model, and apiKey are required' });
        return true;
      }

      console.log(`[Daemon] Testing AI config: provider=${provider}, model=${model}`);

      try {
        const { LLMClient } = await import('@intentorch/core');
        const client = new LLMClient();
        client.configure({ provider: provider as any, apiKey, model });
        const testResult = await client.testConnection();

        sendJson(res, 200, {
          success: testResult.success,
          message: testResult.success
            ? `Successfully connected to ${provider} using model ${model}: ${testResult.message}`
            : `Connection test failed for ${provider}: ${testResult.message}`
        });
      } catch (serviceError: any) {
        console.warn('[Daemon] AI service test failed:', serviceError.message);
        sendJson(res, 200, { success: false, message: `Connection test failed for ${provider}: ${serviceError.message}` });
      }
    } catch (error: any) {
      console.error('[Daemon] AI config test error:', error);
      sendJson(res, 200, { success: false, message: `Configuration test failed: ${error.message}` });
    }
    return true;
  }

  return false;
}

function sendJson(res: http.ServerResponse, c: number, d: any) {
  if (!res.headersSent) {
    res.writeHead(c, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d));
  }
}
