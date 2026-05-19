/**
 * Telemetry Routes
 *
 * Provides API endpoints for:
 * - GET  /api/telemetry/traces
 * - GET  /api/telemetry/traces/:sessionId
 * - GET  /api/telemetry/spans/:traceId
 * - GET  /api/telemetry/metrics
 * - GET  /api/telemetry/ai-records/:traceId
 */

import { telemetry } from "../../telemetry/index.js";
import { getTraceRepository } from "../../utils/sqlite.js";
import { sendJson } from "./index.js";
import type { RouteContext } from "./index.js";

// ==================== Route Handler ====================

export async function handleTelemetryRoutes(ctx: RouteContext): Promise<boolean> {
  const { path, method, parsedUrl } = ctx;

  // POST /api/telemetry/init — Initialize telemetry (called by daemon startup)
  if (path === "/api/telemetry/init" && method === "POST") {
    const { initTelemetry } = await import("../../telemetry/index.js");
    await initTelemetry();
    sendJson(ctx.res, 200, { success: true });
    return true;
  }

  // GET /api/telemetry/spans/:traceId — Get detailed spans from SQLite
  const spansMatch = path.match(/^\/api\/telemetry\/spans\/([a-zA-Z0-9_-]+)$/);
  if (spansMatch && method === "GET") {
    const traceId = spansMatch[1];
    const repo = getTraceRepository();
    const spans = await repo.listByTraceId(traceId);
    
    // Parse JSON strings in metadata and input/output for the frontend
    const parsedSpans = spans.map(s => ({
      ...s,
      metadata: s.metadata ? JSON.parse(s.metadata as string) : {},
      input: s.input ? JSON.parse(s.input as string) : undefined,
      output: s.output ? JSON.parse(s.output as string) : undefined,
    }));
    
    sendJson(ctx.res, 200, { traceId, spans: parsedSpans });
    return true;
  }

  // GET /api/telemetry/traces/:sessionId — Get traces for a session (DEPRECATED)
  const tracesSessionMatch = path.match(/^\/api\/telemetry\/traces\/([a-zA-Z0-9_-]+)$/);
  if (tracesSessionMatch && method === "GET") {
    // Return empty array as legacy in-memory tracer is disabled
    sendJson(ctx.res, 200, []);
    return true;
  }

  // GET /api/telemetry/traces — Get recent traces list (DEPRECATED)
  if (path === "/api/telemetry/traces" && method === "GET") {
    // Return empty array as legacy in-memory tracer is disabled
    sendJson(ctx.res, 200, []);
    return true;
  }

  // GET /api/telemetry/metrics — Get current metrics
  if (path === "/api/telemetry/metrics" && method === "GET") {
    const metrics = telemetry.metrics.getMetrics();
    sendJson(ctx.res, 200, metrics);
    return true;
  }

  // GET /api/telemetry/ai-records/:traceId — Get AI records by trace
  const aiRecordsMatch = path.match(/^\/api\/telemetry\/ai-records\/([a-zA-Z0-9_-]+)$/);
  if (aiRecordsMatch && method === "GET") {
    const traceId = aiRecordsMatch[1];
    const records = telemetry.promptRecorder.getAIRecordsByTrace(traceId);
    sendJson(ctx.res, 200, records);
    return true;
  }

  // GET /api/telemetry/ai-records — Get latest AI records
  if (path === "/api/telemetry/ai-records" && method === "GET") {
    const limitParam = parsedUrl.searchParams.get("limit");
    const limit = limitParam ? parseInt(limitParam, 10) : 10;
    const records = telemetry.promptRecorder.getLatestRecords(limit);
    sendJson(ctx.res, 200, records);
    return true;
  }

  return false; // Route not matched
}
