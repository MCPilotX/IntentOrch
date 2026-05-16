/**
 * API Compatibility Tests (Black-Box)
 *
 * These tests directly hit a running local daemon instance without mocking.
 * They verify that the HTTP API responses maintain the expected contract/structure.
 *
 * Prerequisites:
 *   1. Start the daemon: intorch daemon start  (default port 9658)
 *   2. Auth token default is "intorch"
 *
 * Usage:
 *   DAEMON_URL=http://localhost:9658 npx jest tests/core/api-compatibility.test.ts
 *
 * Design Principles:
 *  - No mocking — tests must work against a real daemon
 *  - Verify response STRUCTURE, not specific values
 *  - Each endpoint tested independently
 *  - Tests are READ-ONLY by default (GET endpoints)
 *  - Mutating tests (POST/DELETE) are opt-in via env var ALLOW_MUTATING=true
 */

import http from "http";

// ==================== Configuration ====================

const DAEMON_URL = process.env.DAEMON_URL || "http://localhost:9658";
const AUTH_TOKEN = process.env.AUTH_TOKEN || "UNSET";
const ALLOW_MUTATING = process.env.ALLOW_MUTATING === "true";

// Auto-detect auth token by calling the public /api/auth/token endpoint
let detectedToken: string | undefined;

interface RequestOptions {
  method?: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
}

// ==================== HTTP Helper ====================

async function request<T = unknown>(opts: RequestOptions): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
  body: T;
}> {
  const url = new URL(opts.path, DAEMON_URL);
  const effectiveToken = AUTH_TOKEN !== "UNSET" ? AUTH_TOKEN : (detectedToken || "");
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${effectiveToken}`,
    ...opts.headers,
  };

  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        hostname: url.hostname,
        port: Number(url.port) || 9658,
        path: url.pathname + url.search,
        method: opts.method || "GET",
        headers,
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          let body: T;
          try {
            body = JSON.parse(data) as T;
          } catch {
            body = data as unknown as T;
          }
          resolve({
            status: res.statusCode || 0,
            headers: res.headers,
            body,
          });
        });
      },
    );
    req.on("error", reject);

    if (opts.body !== undefined) {
      req.write(JSON.stringify(opts.body));
    }
    req.end();
  });
}

function itIf(condition: boolean, name: string, fn: () => void | Promise<void>) {
  if (condition) {
    it(name, fn);
  } else {
    it.skip(name, fn);
  }
}

// ==================== Pre-flight Check ====================

beforeAll(async () => {
  // Quick check that daemon is reachable
  try {
    await request({ path: "/api/status" });
  } catch (e) {
    throw new Error(
      `Daemon not reachable at ${DAEMON_URL}. Start the daemon first.` +
      `\n  intorch daemon start` +
      `\n  Original error: ${(e as Error).message}`
    );
  }

  // Auto-detect auth token if not explicitly set
  if (AUTH_TOKEN === "UNSET") {
    try {
      const { body } = await request<{ token?: string }>({ path: "/api/auth/token" });
      detectedToken = body.token;
      if (!detectedToken) {
        console.warn("Could not auto-detect auth token from /api/auth/token");
      }
    } catch (e) {
      console.warn("Failed to auto-detect auth token:", (e as Error).message);
    }
  }
});
  } catch (e) {
    throw new Error(
      `Daemon not reachable at ${DAEMON_URL}. Start the daemon first.` +
      `
  intorch daemon start` +
      `
  Original error: ${(e as Error).message}`
    );
  }
});

// ==================== Status & System ====================

describe("GET /api/status", () => {
  it("returns 200 with running=true and version", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/status",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("running", true);
    expect(body).toHaveProperty("version");
    expect(typeof body.version).toBe("string");
    expect(body).toHaveProperty("pid");
    expect(typeof body.pid).toBe("number");
    expect(body).toHaveProperty("uptime");
    expect(typeof body.uptime).toBe("number");
    expect(body).toHaveProperty("config");
    expect(body.config).toHaveProperty("port");
    expect(body.config).toHaveProperty("host");
    expect(body).toHaveProperty("stats");
    expect((body.stats as Record<string, unknown>)).toHaveProperty("totalRequests");
  });
});

// Note: /api/system/stats and /api/dashboard are handled inside handleStatusRoutes
// but the router pattern /^\/api\/status/ does NOT match them.
// This is a known routing issue — the regex pattern should be /^\/api\/(status|system|dashboard)/
// Until fixed, these endpoints are unreachable and omitted from these tests.



// ==================== Auth ====================

describe("GET /api/auth/verify", () => {
  it("returns 200 with verified=true", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/auth/verify",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("verified", true);
    expect(body).toHaveProperty("message");
  });
});

describe("GET /api/auth/token", () => {
  it("returns 200 with a token", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/auth/token",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("token");
  });
});

// ==================== Servers ====================

describe("GET /api/servers", () => {
  it("returns 200 with a servers array", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/servers",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("servers");
    expect(Array.isArray(body.servers)).toBe(true);

    // Each server should have a consistent shape
    const servers = body.servers as Record<string, unknown>[];
    for (const server of servers) {
      expect(server).toHaveProperty("name");
      expect(server).toHaveProperty("serverName");
      expect(server).toHaveProperty("status");
      expect(server).toHaveProperty("source");
      // Tools array should always be present
      expect(server).toHaveProperty("tools");
      expect(Array.isArray(server.tools)).toBe(true);
    }
  });
});

describe("GET /api/servers/cached", () => {
  it("returns 200 with services array and total", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/servers/cached",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("services");
    expect(Array.isArray(body.services)).toBe(true);
    expect(body).toHaveProperty("total");
    expect(typeof body.total).toBe("number");
    expect(body).toHaveProperty("source");
    expect(body).toHaveProperty("hasMore", false);

    const services = body.services as Record<string, unknown>[];
    for (const svc of services) {
      expect(svc).toHaveProperty("name");
      expect(svc).toHaveProperty("description");
      expect(svc).toHaveProperty("version");
      expect(svc).toHaveProperty("source");
    }
  });
});

describe("GET /api/servers/search", () => {
  it("returns 200 with search results (empty query)", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/servers/search?q=",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("services");
    expect(Array.isArray((body as any).services)).toBe(true);
  }, 60000);

  it("returns 200 with search results (specific query)", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/servers/search?q=filesystem",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("services");
    expect(Array.isArray((body as any).services)).toBe(true);
  }, 60000);
});

// ==================== Sessions ====================

describe("GET /api/execute/sessions", () => {
  it("returns 200 with sessions array", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/execute/sessions",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("sessions");
    expect(Array.isArray(body.sessions)).toBe(true);
    expect(body).toHaveProperty("total");
    expect(typeof body.total).toBe("number");
  });
});

describe("GET /api/execute/session/:id (not found)", () => {
  it("returns 404 with success=false for non-existent session", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/execute/session/non-existent-session-id",
    });

    expect(status).toBe(404);
    expect(body).toHaveProperty("success", false);
    expect(body).toHaveProperty("error");
  });
});

// ==================== Config ====================

describe("GET /api/config", () => {
  it("returns 200 with config object", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/config",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("config");
  });
});

// ==================== Secrets ====================

describe("GET /api/secrets", () => {
  it("returns 200 with secrets array", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/secrets",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("secrets");
    expect(Array.isArray(body.secrets)).toBe(true);
  });
});

// ==================== Workflows ====================

describe("GET /api/workflows", () => {
  it("returns 200 with workflows array", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/workflows",
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("workflows");
    expect(Array.isArray(body.workflows)).toBe(true);
  });
});

// ==================== 404 Handling ====================

describe("Unknown route", () => {
  it("returns 404 for non-existent path", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      path: "/api/non-existent-route",
    });

    expect(status).toBe(404);
    expect(body).toHaveProperty("error", "Not Found");
    expect(body).toHaveProperty("path");
  });
});

// ==================== Mutating Tests (opt-in) ====================

describe("Mutating endpoints (opt-in via ALLOW_MUTATING=true)", () => {
  // ==================== Session Create ====================

  itIf(ALLOW_MUTATING, "POST /api/execute/session/create - direct session", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/execute/session/create",
      body: { query: "test compatibility query", type: "direct" },
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("success", true);
    expect(body).toHaveProperty("sessionId");
    expect(typeof body.sessionId).toBe("string");
    expect(body).toHaveProperty("session");
    const session = body.session as Record<string, unknown>;
    expect(session).toHaveProperty("id");
    expect(session).toHaveProperty("type", "direct");
    expect(session).toHaveProperty("state", "planning");
    expect(session).toHaveProperty("query", "test compatibility query");
  });

  itIf(ALLOW_MUTATING, "POST /api/execute/session/create - validation error", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/execute/session/create",
      body: { query: "", type: "direct" },
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty("success", false);
    expect(body).toHaveProperty("error");
  });

  // ==================== Session Cancel ====================

  itIf(ALLOW_MUTATING, "POST /api/execute/session/:id/cancel - non-existent", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/execute/session/non-existent-session/cancel",
    });

    expect(status).toBe(500);
    expect(body).toHaveProperty("success", false);
    expect(body).toHaveProperty("error");
  });

  // ==================== Server Start (destructive — commented out by default) ====================

  itIf(ALLOW_MUTATING, "POST /api/servers - validation: empty body", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/servers",
      body: {},
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty("error", "Bad Request");
  });

  itIf(ALLOW_MUTATING, "POST /api/servers - validation: invalid server", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/servers",
      body: { serverNameOrUrl: "this-server-does-not-exist-xyz-123" },
    });

    // Should fail gracefully, not crash
    expect([400, 500]).toContain(status);
    expect(body).toHaveProperty("error");
  });

  // ==================== Server Pull ====================

  itIf(ALLOW_MUTATING, "POST /api/servers/pull - validation: empty body", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/servers/pull",
      body: {},
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty("error");
  });

  itIf(ALLOW_MUTATING, "POST /api/servers/pull - invalid server", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/servers/pull",
      body: { serverNameOrUrl: "this-server-does-not-exist-xyz-123" },
    });

    // Should fail gracefully
    expect([400, 500]).toContain(status);
    expect(body).toHaveProperty("error");
  });

  // ==================== Secrets ====================

  let testSecretKey = "__test_compat_secret__";

  itIf(ALLOW_MUTATING, "POST /api/secrets - set a test secret", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/secrets",
      body: { key: testSecretKey, value: "test-value" },
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("success", true);
  });

  itIf(ALLOW_MUTATING, "POST /api/secrets - validation: missing value", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/secrets",
      body: { key: "test-key" },
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty("error", "Bad Request");
  });

  itIf(ALLOW_MUTATING, "DELETE /api/secrets/:key - cleanup test secret", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "DELETE",
      path: `/api/secrets/${encodeURIComponent(testSecretKey)}`,
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("success", true);
  });

  // ==================== Workflows ====================

  let testWorkflowId: string | undefined;

  itIf(ALLOW_MUTATING, "POST /api/workflows - save a workflow", async () => {
    const { status, body } = await request<Record<string, unknown>>({
      method: "POST",
      path: "/api/workflows",
      body: {
        name: "__test_compat_workflow__",
        description: "Test workflow for compatibility (safe to delete)",
        steps: [],
      },
    });

    expect(status).toBe(201);
    expect(body).toHaveProperty("workflow");
    const wf = body.workflow as Record<string, unknown>;
    expect(wf).toHaveProperty("id");
    testWorkflowId = wf.id as string;
  });

  itIf(ALLOW_MUTATING, "DELETE /api/workflows/:id - cleanup", async () => {
    if (!testWorkflowId) return; // skip if create didn't run

    const { status, body } = await request<Record<string, unknown>>({
      method: "DELETE",
      path: `/api/workflows/${encodeURIComponent(testWorkflowId)}`,
    });

    expect(status).toBe(200);
    expect(body).toHaveProperty("success", true);
  });

  // ==================== Config Update ====================

  itIf(ALLOW_MUTATING, "PUT /api/config - validation: invalid JSON body", async () => {
    // Send raw invalid JSON via custom request
    const url = new URL("/api/config", DAEMON_URL);
    const { status, body } = await new Promise<{ status: number; body: Record<string, unknown> }>((resolve, reject) => {
      const req = http.request(
        {
          hostname: url.hostname,
          port: Number(url.port) || 9658,
          path: url.pathname,
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${AUTH_TOKEN}`,
          },
        },
        (res) => {
          let data = "";
          res.on("data", (chunk) => (data += chunk));
          res.on("end", () => {
            try {
              resolve({ status: res.statusCode || 0, body: JSON.parse(data) });
            } catch {
              resolve({ status: res.statusCode || 0, body: { raw: data } });
            }
          });
        },
      );
      req.on("error", reject);
      // Send malformed JSON
      req.write("not-valid-json{");
      req.end();
    });

    expect(status).toBe(400);
    expect(body).toHaveProperty("error", "Invalid JSON");
  });
});
