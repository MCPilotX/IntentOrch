import axios from 'axios';
import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import {
  MCPServer,
  ProcessInfo,
  Config,
  Secret,
  Workflow,
  SystemStats,
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
  UnifiedExecutionResult 
} from '@intentorch/core';

import { API_BASE_URL } from './config';

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
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
    this.client.interceptors.response.use(
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
  }

  // Server management
  async getServers(): Promise<MCPServer[]> {
    const response = await this.client.get<{ servers: Record<string, unknown>[] }>('/api/servers');
    const data = response as { servers?: Record<string, unknown>[] };
    const servers = data.servers || [];
    
    return servers.map((server: Record<string, unknown>) => {
      const manifest = server.manifest || {};
      // serverName is the unique key (e.g. smithery:namespace/repo or github:owner/repo)
      // name is the display name from manifest
      const serverIdentity = server.serverName || server.name || manifest.name || 'unknown';
      const displayName = manifest.name || server.name || 'unknown';
      
      const version = manifest.version || server.version || 'unknown';
      const description = manifest.description || server.description || '';
      const runtime = manifest.runtime || server.runtime || {
        type: 'unknown',
        command: '',
        args: [],
        env: []
      };
      
      return {
        id: server.id || server.pid?.toString() || serverIdentity,
        name: serverIdentity, // Use identity as name for pull/start consistency
        displayName: displayName, // Store friendly name separately
        version: version,
        description: description,
        runtime: runtime,
        capabilities: manifest.capabilities || server.capabilities || {},
        tools: server.tools || [],
        status: server.status || 'stopped',
        lastStartedAt: server.startTime ? new Date(server.startTime).toISOString() : undefined,
        transportType: server.transportType,
        url: server.url,
        external: server.external,
      };
    });
  }

  async getServer(id: string): Promise<MCPServer> {
    const data = await this.client.get<Record<string, unknown>>(`/api/servers/${id}`);
    const server = (data as Record<string, unknown>).server as Record<string, unknown> || data;
    
    return {
      id: server.pid?.toString() || server.id || id,
      name: server.manifest?.name || server.name || server.serverName,
      version: server.manifest?.version || server.version,
      description: server.manifest?.description || server.description,
      runtime: server.manifest?.runtime || server.runtime,
      capabilities: server.manifest?.capabilities || server.capabilities,
      status: server.status,
      lastStartedAt: server.startTime ? new Date(server.startTime).toISOString() : undefined
    };
  }

  async pullServer(request: PullServerRequest): Promise<MCPServer> {
    const backendRequest = { serverNameOrUrl: request.serverName };
    const data = await this.client.post<Record<string, unknown>>('/api/servers/pull', backendRequest);
    
    const server = (data as Record<string, unknown>).server as Record<string, unknown> || data;
    const result: MCPServer = {
      id: server.pid?.toString() || '0',
      name: server.manifest?.name || server.name || server.serverName,
      version: server.manifest?.version || server.version || 'unknown',
      description: server.manifest?.description || server.description || '',
      runtime: server.manifest?.runtime || server.runtime || { type: 'unknown', command: '', args: [], env: [] },
      capabilities: server.manifest?.capabilities || server.capabilities || {},
      status: server.status || 'pulled',
      lastStartedAt: server.startTime ? new Date(server.startTime).toISOString() : undefined
    };

    return result;
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
      pid: data.pid,
      serverName: data.name,
      name: data.name,
      version: data.version,
      status: data.status,
      logPath: data.logPath,
      startTime: Date.now(),
      manifest: {
        name: data.name,
        version: data.version,
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

  // Process management
  async getProcesses(): Promise<ProcessInfo[]> {
    const data = await this.client.get<{ servers: Record<string, unknown>[] }>('/api/servers');
    const servers = data.servers || [];
    return servers.map(server => ({
      ...server,
      serverId: (server.pid?.toString() as string) || '0',
      serverName: (server.name as string) || (server.serverName as string),
      status: (server.status as string) || 'running',
      startedAt: server.startTime ? new Date(server.startTime as string).toISOString() : new Date().toISOString()
    } as unknown as ProcessInfo));
  }

  async stopProcess(request: StopProcessRequest): Promise<void> {
    await this.client.delete(`/api/servers/${request.pid}`);
  }

  async getProcessLogs(pid: number): Promise<string> {
    const data = await this.client.get<{ logs?: string }>(`/api/servers/${pid}/logs`);
    return data.logs || '';
  }

  // Configuration management
  async getConfig(): Promise<Config> {
    return await this.client.get<Config>('/api/config');
  }

  async updateConfig(request: UpdateConfigRequest): Promise<Config> {
    return await this.client.put<Config>('/api/config', request);
  }

  // Secrets management
  async getSecrets(): Promise<Secret[]> {
    const data = await this.client.get<{ secrets: Secret[] }>('/api/secrets');
    return data.secrets || [];
  }

  async createSecret(request: CreateSecretRequest): Promise<Secret> {
    const data = await this.client.post<{ secret: Secret }>('/api/secrets', request);
    return data.secret;
  }

  async deleteSecret(name: string): Promise<void> {
    await this.client.delete(`/api/secrets/${name}`);
  }

  // Workflow management
  async getWorkflows(): Promise<Workflow[]> {
    const data = await this.client.get<{ workflows: Workflow[] }>('/api/workflows');
    return data.workflows || [];
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const encodedId = encodeURIComponent(id);
    const data = await this.client.get<{ workflow: Workflow }>(`/api/workflows/${encodedId}`);
    return data.workflow;
  }

  async saveWorkflow(workflow: Workflow): Promise<Workflow> {
    const response = await this.client.post<Workflow | { workflow: Workflow }>('/api/workflows', workflow);
    return (response as { workflow?: Workflow }).workflow || (response as Workflow);
  }

  async deleteWorkflow(id: string): Promise<void> {
    const encodedId = encodeURIComponent(id);
    await this.client.delete(`/api/workflows/${encodedId}`);
  }

  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<unknown> {
    const encodedId = encodeURIComponent(request.workflowId);
    return await this.client.post<unknown>(`/api/workflows/${encodedId}/execute`, request.parameters || {});
  }

  // System information
  async getSystemStats(): Promise<SystemStats> {
    const data = await this.client.get<{ stats: SystemStats }>('/api/system/stats');
    return data.stats;
  }

  async getSystemLogs(): Promise<string> {
    const data = await this.client.get<{ logs?: string }>('/api/system/logs');
    return data.logs || '';
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
      const data = await this.client.post<{ message?: string }>('/api/ai/test', config);
      return { success: true, message: data.message || 'Configuration test successful' };
    } catch (error: unknown) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Configuration test failed'
      };
    }
  }

  // Notification management
  async getNotifications(): Promise<Notification[]> {
    try {
      const data = await this.client.get<{ notifications: Notification[] }>('/api/notifications');
      return data.notifications || [];
    } catch {
      return [];
    }
  }

  async markNotificationAsRead(id: string): Promise<void> {
    await this.client.post(`/api/notifications/${id}/read`);
  }

  // Search logic (Kept for compatibility, but simplified)
  async searchServices(query: string, source?: string, limit?: number, offset?: number): Promise<Record<string, unknown>> {
    const params: Record<string, unknown> = { q: query, source, limit, offset };
    try {
      return await this.client.get<Record<string, unknown>>('/api/servers/search', { params });
    } catch {
      return { services: [], total: 0, source: source || 'unknown', hasMore: false };
    }
  }
}

export const apiService = new ApiService();
