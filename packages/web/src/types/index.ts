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
  SessionState as CoreSessionState,
  ToolExecutionPlan,
  PlanStep
} from '@intentorch/core';

// Re-export core types for convenience
export type { 
  CoreProcessInfo, 
  CoreWorkflow, 
  CoreWorkflowStep, 
  CoreConfig, 
  CoreAIConfig, 
  CoreDaemonResponse,
  CoreExecutionSession as ExecutionSession,
  SessionType,
  CoreSessionState as SessionState,
  ToolExecutionPlan,
  PlanStep
};

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
  status: 'not_pulled' | 'pulled' | 'running' | 'stopped' | 'error';
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

// Interactive session types
export type SessionState = 
  | 'initializing'
  | 'parsing'
  | 'validating'
  | 'awaiting_feedback'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'cancelled';

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

export interface SessionCreateResponse {
  success: boolean;
  sessionId: string;
  session: ExecutionSession;
}

export interface SessionExecuteResponse {
  success: boolean;
  result?: unknown;
  executionSteps?: Record<string, unknown>[];
  steps?: Record<string, unknown>[];
  status?: string;
  confidence?: number;
  error?: string;
  session?: ExecutionSession;
}

export interface SessionListResponse {
  success: boolean;
  sessions: ExecutionSession[];
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
