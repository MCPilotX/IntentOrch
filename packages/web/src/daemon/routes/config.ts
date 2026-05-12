import http from 'http';
import { getConfigService } from '@intentorch/core';
import type { RouteContext } from './status';

/**
 * Configuration routes
 * - GET /api/config
 * - PUT /api/config
 */
export async function handleConfigRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // GET /api/config
  if (path === '/api/config' && method === 'GET') {
    try {
      const configService = getConfigService();
      const config = await configService.getAppConfig();
      sendJson(res, 200, { config });
    } catch (error: any) {
      console.error('[Daemon] Error getting config:', error);
      sendJson(res, 500, { error: 'Failed to get configuration', message: error.message });
    }
    return true;
  }

  // PUT /api/config
  if (path === '/api/config' && method === 'PUT') {
    try {
      const request = JSON.parse(body);
      const configService = getConfigService();
      const config = request.config || request;

      if (config.ai) {
        if (config.ai.provider) await configService.setAIProvider(config.ai.provider);
        if (config.ai.apiKey !== undefined) await configService.setAIAPIKey(config.ai.apiKey || '');
        if (config.ai.model) await configService.setAIModel(config.ai.model);
        if (config.ai.apiEndpoint !== undefined) await configService.setAIEndpoint(config.ai.apiEndpoint || '');
      }
      if (config.registry) {
        if (config.registry.default) await configService.setRegistryDefault(config.registry.default);
        if (config.registry.fallback) await configService.setRegistryFallback(config.registry.fallback);
      }

      const updatedConfig = await configService.getAppConfig();
      sendJson(res, 200, { config: updatedConfig });
    } catch (error: any) {
      console.error('[Daemon] Error updating config:', error);
      sendJson(res, 500, { error: 'Failed to update configuration', message: error.message });
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
