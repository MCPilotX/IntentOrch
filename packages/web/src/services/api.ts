import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import type {
  MCPServer,
  ProcessInfo,
  Config,
  Secret,
  Workflow,
  SystemStats,
  DashboardData,
  PullServerRequest,
  StartServerRequest,
  StopProcessRequest,
  UpdateConfigRequest,
  CreateSecretRequest,
  ExecuteWorkflowRequest,
  Notification,
  NotificationStats,
  ExecutionSession,
  SessionCreateResponse,
  SessionExecuteResponse,
  SessionListResponse,
} from '../types';

import type { 
  UnifiedExecutionOptions, 
  UnifiedExecutionResult,
} from '@intentorch/core';

import { API_BASE_URL } from './config';

/**
 * Generic wrapper type for daemon API responses that wrap data in an envelope.
 */
interface EnvelopeResponse<T> {
  success?: boolean;
  error?: string;
}

/** Response envelope for endpoints that return a single server object. */
interface ServerEnvelopeResponse {
  server?: Record<string, unknown>;
}

/** Response envelope for endpoints that return a servers list. */
interface ServersEnvelopeResponse {
  servers?: Record<string, unknown>[];
}

/** Response envelope for endpoints that return a session object. */
interface SessionEnvelopeResponse {
  session: ExecutionSession;
}

/** Response envelope for endpoints that return a workflow object. */
interface WorkflowEnvelopeResponse {
  workflow: Workflow;
}

/** Response envelope for endpoints that return logs. */
interface LogsEnvelopeResponse {
  logs?: string;
}

/**
 * HTTP client wrapper whose methods already account for the response interceptor
 * that unwraps `response.data`.  `client.get<T>(url)` returns `Promise<T>`
 * rather than the default axios `Promise<AxiosResponse<T>>`.
 */
interface UnwrappedHttpClient {
  get<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T>;
  post<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T>;
  put<T = unknown>(url: string, data?: unknown, config?: Record<string, unknown>): Promise<T>;
  delete<T = unknown>(url: string, config?: Record<string, unknown>): Promise<T>;
}

class ApiService {
  private client: UnwrappedHttpClient;

  constructor() {
    const rawClient = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    rawClient.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        // 1. Prioritize token from URL (one-time injection from CLI)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          localStorage.setItem('auth_token', urlToken);
          // Clean up URL to avoid leakage in history
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2. Add authentication token if available
        let token = localStorage.getItem('auth_token');
        
        // 3. If no token, try to get one from daemon automatically
        if (!token && config.url !== '/api/auth/token' && config.url !== '/api/status') {
          try {
            const tokenResponse = await axios.get(`${API_BASE_URL}/api/auth/token`, {
              timeout: 3000
            });
            
            if (tokenResponse.data && tokenResponse.data.token) {
              token = tokenResponse.data.token;
              if (token) {
                localStorage.setItem('auth_token', token);
              }
            }
          } catch (error) {
            console.warn('[ApiService] Failed to get auth token from daemon:', error);
          }
        }

        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor - flattening the Daemon response
    rawClient.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
        }
        const errorMessage = error.response?.data?.error || error.response?.data?.message || error.message;
        console.error('API Error:', errorMessage);
        return Promise.reject(new Error(errorMessage));
      }
    );

    // Wrap so that every method returns the unwrapped body type directly.
    // The response interceptor above already does `response => response.data`,
    // so `rawClient.get<T>(url)` resolves to the JSON body (not AxiosResponse).
    this.client = {
      get: <T>(url: string, config?: Record<string, unknown>) =>
        rawClient.get<T>(url, config as any) as Promise<T>,
      post: <T>(url: string, data?: unknown, config?: Record<string, unknown>) =>
        rawClient.post<T>(url, data, config as any) as Promise<T>,
      put: <T>(url: string, data?: unknown, config?: Record<string, unknown>) =>
        rawClient.put<T>(url, data, config as any) as Promise<T>,
      delete: <T>(url: string, config?: Record<string, unknown>) =>
        rawClient.delete<T>(url, config as any) as Promise<T>,
    };
  }

  // ==================== Server Management ====================

  /**
   * Converts a raw server record from the daemon API into a typed MCPServer.
   */
  private toMCPServer(raw: Record<string, unknown>): MCPServer {
    const manifest = (raw.manifest as Record<string, unknown> | undefined) || {};
    const serverIdentity = (raw.serverName as string) || (raw.name as string) || (manifest.name as string) || 'unknown';
    const displayName = (manifest.name as string) || (raw.name as string) || 'unknown';
    const runtimeRaw = (manifest.runtime as Record<string, unknown>) || (raw.runtime as Record<string, unknown>) || {};

    return {
      id: (raw.id as string) || String(raw.pid ?? '') || serverIdentity,
      name: serverIdentity,
      displayName,
      version: (manifest.version as string) || (raw.version as string) || 'unknown',
      description: (manifest.description as string) || (raw.description as string) || '',
      runtime: {
        type: (runtimeRaw.type as string) || 'unknown',
        command: (runtimeRaw.command as string) || '',
        args: (runtimeRaw.args as string[]) || [],
        env: (runtimeRaw.env as string[]) || [],
      },
      capabilities: (manifest.capabilities as Record<string, unknown>) || (raw.capabilities as Record<string, unknown>) || {},
      tools: (raw.tools as MCPServer['tools']) || [],
      status: (raw.status as MCPServer['status']) || 'stopped',
      lastStartedAt: raw.startTime ? new Date(raw.startTime as number).toISOString() : undefined,
      transportType: raw.transportType as string | undefined,
      url: raw.url as string | undefined,
      external: raw.external as boolean | undefined,
    };
  }

  async getServers(): Promise<MCPServer[]> {
    const data = await this.client.get<ServersEnvelopeResponse>('/api/servers');
    return (data.servers || []).map((raw) => this.toMCPServer(raw));
  }

  async getServer(id: string): Promise<MCPServer> {
    const data = await this.client.get<ServerEnvelopeResponse>(`/api/servers/${id}`);
    const raw = (data.server as Record<string, unknown>) || {};
    return this.toMCPServer(raw);
  }

  async pullServer(request: PullServerRequest): Promise<MCPServer> {
    const backendRequest = { serverNameOrUrl: request.serverName };
    const data = await this.client.post<ServerEnvelopeResponse>('/api/servers/pull', backendRequest);
    const raw = (data.server as Record<string, unknown>) || {};
    return this.toMCPServer(raw);
  }

  /**
   * Import MCP config (Claude Desktop format)
   */
  async importConfig(config: string): Promise<{ success: boolean; message: string; imported: Record<string, unknown>[]; total: number }> {
    return await this.client.post('/api/servers/import', { config });
  }

  async startServer(request: StartServerRequest): Promise<ProcessInfo> {
    const data = await this.client.post<Record<string, unknown>>(`/api/servers`, { serverNameOrUrl: request.serverId });
    return {
      pid: data.pid as number,
      serverName: data.name as string,
      name: data.name as string,
      version: data.version as string,
      status: (data.status as string) as ProcessInfo['status'],
      logPath: data.logPath as string,
      startTime: Date.now(),
      manifest: {
        name: data.name as string,
        version: data.version as string,
        runtime: { type: "unknown", command: "" }
      }
    };
  }

  async deleteServer(id: string): Promise<void> {
    await this.client.delete(`/api/servers/${id}`);
  }

  // ==================== Session-Based API ====================

  /**
   * Create a new execution session.
   */
  async createSession(query: string, type: 'direct' | 'interactive' = 'direct', metadata?: Record<string, unknown>): Promise<SessionCreateResponse> {
    return await this.client.post<SessionCreateResponse>('/api/execute/session/create', { query, type, metadata });
  }

  /**
   * Execute a session by ID.
   */
  async executeSession(sessionId: string, options?: UnifiedExecutionOptions): Promise<SessionExecuteResponse> {
    return await this.client.post<SessionExecuteResponse>(`/api/execute/session/${sessionId}/execute`, { options });
  }

  /**
   * Send feedback for an interactive session.
   */
  async sendFeedback(sessionId: string, type: string, message?: string, modifiedPlan?: Record<string, unknown>): Promise<ExecutionSession> {
    const data = await this.client.post<{ session: ExecutionSession }>(`/api/execute/session/${sessionId}/feedback`, { type, message, modifiedPlan });
    return data.session;
  }

  /**
   * Get a session by ID.
   */
  async getSession(sessionId: string): Promise<ExecutionSession> {
    const data = await this.client.get<{ session: ExecutionSession }>(`/api/execute/session/${sessionId}`);
    return data.session;
  }

  /**
   * List all sessions.
   */
  async listSessions(): Promise<SessionListResponse> {
    return await this.client.get<SessionListResponse>('/api/execute/sessions');
  }

  /**
   * Cancel a session.
   */
  async cancelSession(sessionId: string): Promise<ExecutionSession> {
    const data = await this.client.post<{ session: ExecutionSession }>(`/api/execute/session/${sessionId}/cancel`);
    return data.session;
  }

  // ==================== Legacy Execution & AI (kept for backward compatibility) ====================

  async parseIntent(intent: string, context?: Record<string, unknown>): Promise<UnifiedExecutionResult> {
    const response = await this.client.post<UnifiedExecutionResult>('/api/execute/parse-intent', { intent, context });
    return response;
  }

  async executeNaturalLanguage(query: string, options?: UnifiedExecutionOptions): Promise<UnifiedExecutionResult> {
    return await this.client.post<UnifiedExecutionResult>('/api/execute/natural-language', { query, options });
  }

  async executeSteps(request: { steps: Record<string, unknown>[]; options?: UnifiedExecutionOptions }): Promise<UnifiedExecutionResult> {
    const response = await this.client.post<UnifiedExecutionResult>('/api/execute/steps', request);
    return response;
  }

  // ==================== Process Management ====================

  async getProcesses(): Promise<ProcessInfo[]> {
    const data = await this.client.get<ServersEnvelopeResponse>('/api/servers');
    return (data.servers || []).map((raw) => {
      const pidVal = raw.pid as number | undefined;
      const name = (raw.name as string) || (raw.serverName as string) || '';
      return {
        pid: pidVal ?? 0,
        serverId: String(pidVal ?? '0'),
        serverName: name,
        name,
        version: (raw.version as string) || '',
        status: (raw.status as string) || 'running',
        logPath: (raw.logPath as string) || '',
        startTime: (raw.startTime as number) || Date.now(),
        startedAt: (raw as { startedAt?: string }).startedAt || (raw.startTime ? new Date(raw.startTime as number).toISOString() : new Date().toISOString()),
        manifest: {
          name,
          version: (raw.version as string) || '',
          runtime: { type: 'unknown', command: '' },
        },
      } as ProcessInfo;
    });
  }

  async stopProcess(request: StopProcessRequest): Promise<void> {
    await this.client.delete(`/api/servers/${request.pid}`);
  }

  async getProcessLogs(pid: number): Promise<string> {
    const data = await this.client.get<LogsEnvelopeResponse>(`/api/servers/${pid}/logs`);
    return data.logs || '';
  }

  // ==================== Configuration Management ====================

  async getConfig(): Promise<Config> {
    return await this.client.get<Config>('/api/config');
  }

  async updateConfig(request: UpdateConfigRequest): Promise<Config> {
    return await this.client.put<Config>('/api/config', request);
  }

  // ==================== Secrets Management ====================

  async getSecrets(): Promise<Secret[]> {
    const data = await this.client.get<{ secrets: unknown }>('/api/secrets');
    // Backend returns: { secrets: ["key1", "key2"] } (string array)
    // Frontend expects: [{ name, lastUpdated, description }] (object array)
    const rawSecrets = data.secrets;
    if (Array.isArray(rawSecrets)) {
      if (rawSecrets.length > 0 && typeof rawSecrets[0] === 'string') {
        return (rawSecrets as string[]).map(name => ({
          name,
          lastUpdated: new Date().toISOString(),
        }));
      }
      return rawSecrets as Secret[];
    }
    return [];
  }

  async createSecret(request: CreateSecretRequest): Promise<Secret> {
    const data = await this.client.post<{ secret: Secret }>('/api/secrets', request);
    return data.secret;
  }

  async deleteSecret(name: string): Promise<void> {
    await this.client.delete(`/api/secrets/${name}`);
  }

  // ==================== Workflow Management ====================

  async getWorkflows(): Promise<Workflow[]> {
    const data = await this.client.get<{ workflows: Workflow[] }>('/api/workflows');
    return data.workflows || [];
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const encodedId = encodeURIComponent(id);
    const data = await this.client.get<WorkflowEnvelopeResponse>(`/api/workflows/${encodedId}`);
    return data.workflow;
  }

  async saveWorkflow(workflow: Workflow): Promise<Workflow> {
    const response = await this.client.post<WorkflowEnvelopeResponse>('/api/workflows', workflow);
    return response.workflow || (response as unknown as Workflow);
  }

  async deleteWorkflow(id: string): Promise<void> {
    const encodedId = encodeURIComponent(id);
    await this.client.delete(`/api/workflows/${encodedId}`);
  }

  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<Record<string, unknown>> {
    const encodedId = encodeURIComponent(request.workflowId);
    return await this.client.post<Record<string, unknown>>(`/api/workflows/${encodedId}/execute`, request.parameters || {});
  }

  // ==================== System Information ====================

  async getSystemStats(): Promise<SystemStats> {
    const data = await this.client.get<{ stats: SystemStats }>('/api/system/stats');
    return data.stats;
  }

  async getSystemLogs(): Promise<string> {
    const data = await this.client.get<LogsEnvelopeResponse>('/api/system/logs');
    return data.logs || '';
  }

  /**
   * Aggregated dashboard data — replaces 4 separate requests with 1.
   * Returns a `version` field (monotonic timestamp) so the caller can
   * skip re-rendering when nothing has changed.
   */
  async getDashboard(): Promise<DashboardData> {
    return await this.client.get<DashboardData>('/api/dashboard');
  }

  async healthCheck(): Promise<boolean> {
    try {
      const data = await this.client.get<{ running?: boolean }>('/api/status');
      return !!data.running;
    } catch {
      return false;
    }
  }

  async verifyToken(): Promise<boolean> {
    try {
      await this.client.get('/api/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  async testAIConfig(config: { provider: string; model: string; apiKey: string; apiEndpoint?: string }): Promise<{ success: boolean; message?: string }> {
    try {
      const data = await this.client.post<{ message?: string } & Record<string, unknown>>('/api/ai/test', config);
      return { success: true, message: (data as { message?: string }).message || 'Configuration test successful' };
    } catch (error: unknown) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Configuration test failed'
      };
    }
  }

  // ==================== Telemetry & Trace = :
  async getAIRecordsByTrace(traceId: string): Promise<any[]> {
    return await this.client.get(`/api/telemetry/ai-records/${traceId}`);
  }

  async getSpansByTrace(traceId: string): Promise<{ traceId: string; spans: any[] }> {
    return await this.client.get(`/api/telemetry/spans/${traceId}`);
  }

  async markNotificationAsRead(_id: string): Promise<void> {
    // no-op
  }

  // Search logic (Kept for compatibility, but simplified)
  async searchServices(query: string, source?: string, limit?: number, offset?: number): Promise<{ services?: Record<string, unknown>[]; total?: number; source?: string; hasMore?: boolean }> {
    const params: Record<string, unknown> = { q: query, source, limit, offset };
    try {
      return await this.client.get('/api/servers/search', { params });
    } catch {
      return { services: [], total: 0, source: source || 'unknown', hasMore: false };
    }
  }
}

export const apiService = new ApiService();
