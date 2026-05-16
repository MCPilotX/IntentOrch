import type { 
  ProcessInfo as CoreProcessInfo, 
  Workflow as CoreWorkflow, 
  WorkflowStep as CoreWorkflowStep,
  WorkflowInput as CoreWorkflowInput,
  Config as CoreConfig,
  AIConfig as CoreAIConfig,
  DaemonResponse as CoreDaemonResponse,
  RuntimeType,
  ExecutionSession as CoreExecutionSession,
  SessionType,
} from '@intentorch/core';

// Re-export core types for convenience
// IMPORTANT: SessionState is imported directly from @intentorch/core to ensure
// consistency between frontend and backend state machine definitions.
export type { 
  CoreProcessInfo, 
  CoreWorkflow, 
  CoreWorkflowStep, 
  CoreConfig, 
  CoreAIConfig, 
  CoreDaemonResponse,
  CoreExecutionSession as ExecutionSession,
  SessionType,
};

// Re-export SessionState from core — using `import type` + re-export alias
// ensures frontend and backend always agree on the state machine.
import type { SessionState as CoreSessionState } from '@intentorch/core';
export type SessionState = CoreSessionState;

// MCP Server related types
export interface MCPServer {
  id: string;
  name: string;
  displayName?: string;
  version: string;
  description?: string;
  runtime: {
    type: string | RuntimeType;
    command: string;
    args?: string[];
    env?: string[];
  };
  capabilities?: {
    tools?: Record<string, unknown>[];
  };
  tools?: Array<{
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
    inputSchema?: Record<string, unknown>;
  }>;
  status: 'not_pulled' | 'pulled' | 'running' | 'stopped' | 'error' | 'starting';
  pulledAt?: string;
  lastStartedAt?: string;
  // External service fields (for HTTP/SSE transport types)
  transportType?: string;
  url?: string;
  external?: boolean;
}

// Map Core ProcessInfo to Web's simplified ProcessInfo if needed, 
// or just use CoreProcessInfo directly in the app.
export type ProcessInfo = CoreProcessInfo;

export type Config = CoreConfig;

export interface Secret {
  name: string;
  value?: string;
  lastUpdated: string;
  description?: string;
}

export interface MissingParameter {
  toolName: string;
  parameterName: string;
  description: string;
  required: boolean;
  currentValue: unknown;
  suggestions?: string[];
  validationError?: string;
}

export interface UserFeedbackResponse {
  type: 'parameter_value' | 'clarification' | 'confirmation' | 'cancellation';
  parameterName?: string;
  value?: unknown;
  clarification?: string;
  confirmed?: boolean;
  timestamp: Date;
}

export interface UserGuidanceMessage {
  type: 'parameter_request' | 'clarification_request' | 'confirmation_request' | 'suggestion';
  message: string;
  parameters?: MissingParameter[];
  options?: Array<{
    id: string;
    label: string;
    description?: string;
    value?: unknown;
  }>;
  requiresResponse: boolean;
  timestamp: Date;
}

/**
 * InteractiveSession — legacy type that predates the unified ExecutionSession.
 * 
 * DEPRECATED: New code should use ExecutionSession from @intentorch/core directly.
 * This type is retained only for backward compatibility with the legacy interactive
 * test scripts (test-interactive.js, test-interactive-simple.js).
 * 
 * @deprecated Use ExecutionSession (@intentorch/core) instead.
 */
export interface InteractiveSession {
  sessionId: string;
  userId?: string;
  state: SessionState;
  originalQuery: string;
  currentQuery?: string;
  missingParameters: MissingParameter[];
  validationResults: Array<{
    toolName: string;
    parameterName: string;
    isValid: boolean;
    message?: string;
    suggestedValue?: unknown;
  }>;
  conversationHistory: Array<{
    role: 'user' | 'system' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, unknown>;
  }>;
  executionResult?: unknown;
  error?: string;
  confidence: number;
  turnCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  parsedIntents?: Record<string, unknown>[];
  toolSelections?: Record<string, unknown>[];
}

export type Workflow = CoreWorkflow;
export type WorkflowStep = CoreWorkflowStep;
export type WorkflowInput = CoreWorkflowInput;

export interface SystemStats {
  totalServers: number;
  runningServers: number;
  totalProcesses: number;
  diskUsage: number;
}

/** Aggregated payload returned by GET /api/dashboard — one request, all data. */
export interface DashboardData {
  alive: boolean;
  stats: {
    totalServers: number;
    runningServers: number;
    totalProcesses: number;
    uptime: number;
    requestCount: number;
  };
  processes: ProcessInfo[];
  logs: string;
  /** Monotonic timestamp to detect changes without deep-equality checks. */
  version: number;
}

export interface SessionCreateResponse {
  success: boolean;
  sessionId: string;
  session: CoreExecutionSession;
}

export interface SessionExecuteResponse {
  success: boolean;
  result?: unknown;
  executionSteps?: Record<string, unknown>[];
  steps?: Record<string, unknown>[];
  status?: string;
  confidence?: number;
  error?: string;
  session?: CoreExecutionSession;
}

export interface SessionListResponse {
  success: boolean;
  sessions: CoreExecutionSession[];
  total: number;
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

// API request types
export interface PullServerRequest {
  serverName: string;
}

export interface StartServerRequest {
  serverId: string;
}

export interface StopProcessRequest {
  pid: number;
}

export interface UpdateConfigRequest {
  config: Partial<Config>;
}

export interface CreateSecretRequest {
  name: string;
  value: string;
  description?: string;
}

export interface ExecuteWorkflowRequest {
  workflowId: string;
  parameters?: Record<string, unknown>;
}

// Notification types
export interface Notification {
  id: string;
  type: 'info' | 'success' | 'warning' | 'error' | 'system';
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  source: 'server' | 'process' | 'workflow' | 'system';
  sourceId?: string;
  actionUrl?: string;
}

export interface NotificationStats {
  total: number;
  unread: number;
  byType: {
    info: number;
    success: number;
    warning: number;
    error: number;
    system: number;
  };
  bySource: {
    server: number;
    process: number;
    workflow: number;
    system: number;
  };
}
