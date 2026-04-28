import type { 
  ProcessInfo as CoreProcessInfo, 
  Workflow as CoreWorkflow, 
  WorkflowStep as CoreWorkflowStep,
  WorkflowInput as CoreWorkflowInput,
  Config as CoreConfig,
  AIConfig as CoreAIConfig,
  DaemonResponse as CoreDaemonResponse,
  RuntimeType
} from '@intentorch/core';

// Re-export core types for convenience
export type { CoreProcessInfo, CoreWorkflow, CoreWorkflowStep, CoreConfig, CoreAIConfig, CoreDaemonResponse };

// MCP Server related types
export interface MCPServer {
  id: string;
  name: string;
  version: string;
  description?: string;
  runtime: {
    type: string | RuntimeType;
    command: string;
    args?: string[];
    env?: string[];
  };
  capabilities?: {
    tools?: any[];
  };
  status: 'not_pulled' | 'pulled' | 'running' | 'stopped' | 'error';
  pulledAt?: string;
  lastStartedAt?: string;
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
  currentValue: any;
  suggestions?: string[];
  validationError?: string;
}

export interface UserFeedbackResponse {
  type: 'parameter_value' | 'clarification' | 'confirmation' | 'cancellation';
  parameterName?: string;
  value?: any;
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
    value?: any;
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
    suggestedValue?: any;
  }>;
  conversationHistory: Array<{
    role: 'user' | 'system' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
  executionResult?: any;
  error?: string;
  confidence: number;
  turnCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
  parsedIntents?: any[];
  toolSelections?: any[];
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

export interface ApiResponse<T = any> {
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
  parameters?: Record<string, any>;
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
