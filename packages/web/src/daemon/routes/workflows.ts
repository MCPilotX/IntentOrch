import http from 'http';
import { getWorkflowManager, getProcessManager, getRegistryClient, MCPClient } from '@intentorch/core';
import type { RouteContext } from './status';

/**
 * Workflow management routes
 * - GET /api/workflows
 * - POST /api/workflows
 * - GET /api/workflows/{id}
 * - DELETE /api/workflows/{id}
 * - POST /api/workflows/{id}/execute
 */
export async function handleWorkflowRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // GET /api/workflows
  if ((path === '/api/workflows' || path === '/api/workflows/') && method === 'GET') {
    sendJson(res, 200, { workflows: await getWorkflowManager().list() });
    return true;
  }

  // POST /api/workflows
  if ((path === '/api/workflows' || path === '/api/workflows/') && method === 'POST') {
    const data = JSON.parse(body);
    const id = await getWorkflowManager().save(data);
    sendJson(res, 201, { workflow: { ...data, id } });
    return true;
  }

  // POST /api/workflows/{id}/execute
  if (path.startsWith('/api/workflows/') && path.endsWith('/execute') && method === 'POST') {
    return handleExecuteWorkflow(res, path);
  }

  // GET/DELETE /api/workflows/{id}
  const workflowIdMatch = path.match(/^\/api\/workflows\/([^\/]+)$/);
  if (workflowIdMatch) {
    const id = decodeURIComponent(workflowIdMatch[1]);

    if (method === 'GET') {
      try {
        const workflow = await getWorkflowManager().load(id);
        if (!workflow) {
          sendJson(res, 404, { error: 'Not Found', message: `Workflow with ID ${id} not found` });
        } else {
          sendJson(res, 200, { workflow });
        }
      } catch (error: any) {
        sendJson(res, 500, { error: 'Internal Server Error', message: `Failed to load workflow: ${error.message}` });
      }
      return true;
    }

    if (method === 'DELETE') {
      try {
        await getWorkflowManager().delete(id);
        sendJson(res, 200, { success: true, message: `Workflow ${id} deleted successfully` });
      } catch (error: any) {
        sendJson(res, 500, { error: 'Internal Server Error', message: `Failed to delete workflow: ${error.message}` });
      }
      return true;
    }
  }

  return false;
}

async function handleExecuteWorkflow(res: http.ServerResponse, path: string): Promise<true> {
  const id = path.replace('/api/workflows/', '').replace('/execute', '');
  const wf = await getWorkflowManager().load(id);
  if (!wf) {
    sendJson(res, 404, { error: 'Not Found' });
    return true;
  }

  const results: any[] = [];
  const runningServers = await getProcessManager().list();

  for (const s of (wf.steps || [])) {
    const sid = s.serverId || s.serverName;
    if (!sid) continue;
    try {
      let manifest: any = null;

      for (const server of runningServers) {
        if (server.manifest && server.manifest.name === sid) {
          manifest = server.manifest;
          break;
        }
      }

      if (!manifest) {
        manifest = await getRegistryClient().fetchManifest(sid);
      }

      const client = new MCPClient({
        transport: {
          type: 'stdio',
          command: manifest.runtime.command,
          args: manifest.runtime.args || [],
          env: { ...process.env } as Record<string, string>
        }
      });

      client.on('error', (error) => {
        console.warn(`[Daemon] MCP Client error for ${sid}: ${error.message || error}`);
      });

      await client.connect();
      const out = await client.callTool(s.toolName, s.parameters || {});
      results.push({ toolName: s.toolName, status: 'success', output: out });
      await client.disconnect();
    } catch (e) {
      results.push({ toolName: s.toolName, status: 'error', error: (e as Error).message });
    }
  }

  try {
    const updatedWorkflow = { ...wf, lastExecutedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await getWorkflowManager().save(updatedWorkflow);
  } catch (updateError) {
    console.error('[Daemon] Failed to update workflow lastExecutedAt:', updateError);
  }

  sendJson(res, 200, { success: true, results, totalSteps: results.length });
  return true;
}

function sendJson(res: http.ServerResponse, c: number, d: any) {
  if (!res.headersSent) {
    res.writeHead(c, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(d));
  }
}
