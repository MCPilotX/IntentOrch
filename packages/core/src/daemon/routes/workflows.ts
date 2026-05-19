/**
 * Workflow Routes
 *
 * - GET    /api/workflows            — List all workflows
 * - POST   /api/workflows            — Save a workflow
 * - GET    /api/workflows/:id        — Load a workflow
 * - DELETE /api/workflows/:id        — Delete a workflow
 * - POST   /api/workflows/:id/execute — Execute a workflow
 */

import { getWorkflowManager } from "../../workflow/manager.js";
import { getProcessManager } from "../../process-manager/manager.js";
import { getRegistryClient } from "../../registry/client.js";
import { MCPClient } from "../../mcp/client.js";
import { sendJson, type RouteContext } from "./index.js";
import { logger } from "../../core/logger.js";

export async function handleWorkflowRoutes(
  ctx: RouteContext,
): Promise<boolean> {
  const { path, method, res, body } = ctx;

  // ==================== GET /api/workflows ====================
  if (
    (path === "/api/workflows" || path === "/api/workflows/") &&
    method === "GET"
  ) {
    sendJson(res, 200, {
      workflows: await getWorkflowManager().list(),
    });
    return true;
  }

  // ==================== POST /api/workflows ====================
  if (
    (path === "/api/workflows" || path === "/api/workflows/") &&
    method === "POST"
  ) {
    const data = JSON.parse(body);
    const id = await getWorkflowManager().save(data);
    const workflowWithId = { ...data, id };
    sendJson(res, 201, { workflow: workflowWithId });
    return true;
  }

  // ==================== GET|DELETE /api/workflows/:id ====================
  const workflowIdMatch = path.match(/^\/api\/workflows\/([^\/]+)$/);
  if (workflowIdMatch) {
    const id = decodeURIComponent(workflowIdMatch[1]);

    if (method === "GET") {
      try {
        const workflow = await getWorkflowManager().load(id);
        if (!workflow) {
          sendJson(res, 404, {
            error: "Not Found",
            message: `Workflow with ID ${id} not found`,
          });
          return true;
        }
        sendJson(res, 200, { workflow });
      } catch (error: unknown) {
        sendJson(res, 500, {
          error: "Internal Server Error",
          message: `Failed to load workflow: ${(error instanceof Error ? error.message : String(error))}`,
        });
      }
      return true;
    }

    if (method === "DELETE") {
      try {
        await getWorkflowManager().delete(id);
        sendJson(res, 200, {
          success: true,
          message: `Workflow ${id} deleted successfully`,
        });
      } catch (error: unknown) {
        sendJson(res, 500, {
          error: "Internal Server Error",
          message: `Failed to delete workflow: ${(error instanceof Error ? error.message : String(error))}`,
        });
      }
      return true;
    }
  }

  // ==================== POST /api/workflows/:id/execute ====================
  if (
    path.startsWith("/api/workflows/") &&
    path.endsWith("/execute") &&
    method === "POST"
  ) {
    const id = path.replace("/api/workflows/", "").replace("/execute", "");
    const wf = await getWorkflowManager().load(id);
    if (!wf) {
      sendJson(res, 404, { error: "Not Found" });
      return true;
    }

    const results = [];
    const runningServers = await getProcessManager().list();

    for (const s of wf.steps || []) {
      const sid = s.serverId || s.serverName;
      if (!sid) continue;
      try {
        let manifest = null;

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
            type: "stdio",
            command: manifest.runtime.command,
            args: manifest.runtime.args || [],
            env: { ...process.env } as Record<string, string>,
          },
        });

        client.on("error", (error: unknown) => {
          logger.warn(
            `[Daemon] MCP Client error for ${sid}: ${(error instanceof Error ? error.message : String(error)) || error}`,
          );
        });

        await client.connect();
        const out = await client.callTool(
          s.toolName,
          s.parameters || {},
        );
        results.push({
          toolName: s.toolName,
          status: "success",
          output: out,
        });
        await client.disconnect();
      } catch (e: unknown) {
        results.push({
          toolName: s.toolName,
          status: "error",
          error: (e instanceof Error ? e.message : String(e)),
        });
      }
    }

    // Update workflow's lastExecutedAt timestamp
    try {
      const updatedWorkflow = {
        ...wf,
        lastExecutedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      await getWorkflowManager().save(updatedWorkflow);
    } catch (updateError) {
      logger.error(
        "[Daemon] Failed to update workflow lastExecutedAt:",
        updateError,
      );
    }

    sendJson(res, 200, {
      success: true,
      results,
      totalSteps: results.length,
    });
    return true;
  }

  return false;
}
