import http from "http";
import { getDaemonPidPath } from "../utils/paths.js";
import fs from "fs/promises";
import { getSecretManager } from "../secret/manager.js";
import {
  DaemonStatusResponse,
  StartServerRequest,
  StartServerResponse,
  StopServerResponse,
  ListServersResponse,
  ServerLogsResponse,
  ErrorResponse,
  SessionCreateResponse,
  SessionExecuteResponse,
  SessionFeedbackResponse,
  SessionGetResponse,
  SessionListResponse,
  SessionCancelResponse,
} from "./types.js";

export class DaemonClient {
  private baseUrl: string;

  constructor(host: string = "localhost", port: number = 9658) {
    this.baseUrl = `http://${host}:${port}`;
  }

  private async request<T>(
    method: string,
    path: string,
    data?: Record<string, unknown>,
  ): Promise<T> {
    // Get authentication token for daemon requests
    const secretManager = getSecretManager();
    const token = await secretManager.get("daemon_auth_token");

    return new Promise((resolve, reject) => {
      try {
        const url = `${this.baseUrl}${path}`;
        const headers: Record<string, string> = {
          "Content-Type": "application/json",
          "X-Local-Pid": process.pid.toString(),
        };

        // Add Authorization header if token is a valid non-empty string and path is not /api/status
        if (
          token &&
          typeof token === "string" &&
          token.trim() !== "" &&
          path !== "/api/status"
        ) {
          headers["Authorization"] = `Bearer ${token.trim()}`;
        }

        const options: http.RequestOptions = {
          method,
          headers,
          agent: false, // Disable proxy and connection pooling for local reliability
        };

        const req = http.request(url, options, (res) => {
          let responseData = "";

          res.on("data", (chunk) => {
            responseData += chunk;
          });

          res.on("end", () => {
            try {
              const parsed = JSON.parse(responseData);
              if (res.statusCode && res.statusCode >= 400) {
                const error = parsed as ErrorResponse;
                const errorMsg = error.message
                  ? `${error.error}: ${error.message}`
                  : `${error.error}`;
                reject(new Error(errorMsg));
              } else {
                resolve(parsed as T);
              }
            } catch (_error) {
              reject(new Error(`Failed to parse response: ${responseData}`));
            }
          });
        });

        req.on("error", (error) => {
          reject(new Error(`Request failed: ${error.message}`));
        });

        if (data) {
          req.write(JSON.stringify(data));
        }

        req.end();
      } catch (error) {
        reject(
          new Error(`Failed to prepare request: ${(error as Error).message}`),
        );
      }
    });
  }

  async getStatus(): Promise<DaemonStatusResponse> {
    return this.request<DaemonStatusResponse>("GET", "/api/status");
  }

  async startServer(serverNameOrUrl: string): Promise<StartServerResponse> {
    const request: StartServerRequest = { serverNameOrUrl };
    return this.request<StartServerResponse>("POST", "/api/servers", request as unknown as Record<string, unknown>);
  }

  async stopServer(pid: number): Promise<StopServerResponse> {
    return this.request<StopServerResponse>("DELETE", `/api/servers/${pid}`);
  }

  async listServers(): Promise<ListServersResponse> {
    return this.request<ListServersResponse>("GET", "/api/servers");
  }

  async getServerStatus(pid: number): Promise<unknown> {
    return this.request<unknown>("GET", `/api/servers/${pid}`);
  }

  async getServerLogs(pid: number): Promise<ServerLogsResponse> {
    return this.request<ServerLogsResponse>("GET", `/api/servers/${pid}/logs`);
  }

  // ==================== Session-Based API ====================

  /**
   * Create a new execution session via daemon.
   */
  async createSession(
    query: string,
    type: "direct" | "interactive" = "direct",
    metadata?: Record<string, unknown>,
  ): Promise<SessionCreateResponse> {
    return this.request<SessionCreateResponse>("POST", "/api/execute/session/create", {
      query,
      type,
      metadata,
    });
  }

  /**
   * Execute a session by ID via daemon.
   */
  async executeSession(sessionId: string, options?: Record<string, unknown>): Promise<SessionExecuteResponse> {
    return this.request<SessionExecuteResponse>(
      "POST",
      `/api/execute/session/${sessionId}/execute`,
      { options },
    );
  }

  /**
   * Send feedback for an interactive session via daemon.
   */
  async sendFeedback(
    sessionId: string,
    type: string,
    message?: string,
    modifiedPlan?: Record<string, unknown>,
  ): Promise<SessionFeedbackResponse> {
    return this.request<SessionFeedbackResponse>(
      "POST",
      `/api/execute/session/${sessionId}/feedback`,
      { type, message, modifiedPlan },
    );
  }

  /**
   * Get a session by ID via daemon.
   */
  async getSession(sessionId: string): Promise<SessionGetResponse> {
    return this.request<SessionGetResponse>("GET", `/api/execute/session/${sessionId}`);
  }

  /**
   * List all sessions via daemon.
   */
  async listSessions(): Promise<SessionListResponse> {
    return this.request<SessionListResponse>("GET", "/api/execute/sessions");
  }

  /**
   * Cancel a session via daemon.
   */
  async cancelSession(sessionId: string): Promise<SessionCancelResponse> {
    return this.request<SessionCancelResponse>(
      "POST",
      `/api/execute/session/${sessionId}/cancel`,
    );
  }

  // ==================== Legacy API (kept for backward compatibility) ====================

  /**
   * Execute natural language query via daemon
   */
  async executeNaturalLanguage(query: string, options?: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>("POST", "/api/execute/natural-language", {
      query,
      options,
    });
  }

  /**
   * Parse intent via daemon
   */
  async parseIntent(intent: string, context?: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>("POST", "/api/execute/parse-intent", {
      intent,
      context,
    });
  }

  /**
   * Execute pre-parsed steps via daemon
   */
  async executeSteps(steps: Record<string, unknown>[], options?: Record<string, unknown>): Promise<unknown> {
    return this.request<unknown>("POST", "/api/execute/steps", { steps, options });
  }

  async isDaemonRunning(): Promise<boolean> {
    try {
      await this.getStatus();
      return true;
    } catch (_error) {
      return false;
    }
  }

  static async getDaemonPid(): Promise<number | null> {
    try {
      const pidFile = getDaemonPidPath();
      const pidStr = await fs.readFile(pidFile, "utf-8");
      const pid = parseInt(pidStr.trim(), 10);
      return isNaN(pid) ? null : pid;
    } catch (_error) {
      return null;
    }
  }

  static async isDaemonProcessRunning(): Promise<boolean> {
    const pid = await this.getDaemonPid();
    if (!pid) return false;

    try {
      // Try to send signal 0 to check if process exists
      process.kill(pid, 0);
      return true;
    } catch (_error) {
      return false;
    }
  }
}
