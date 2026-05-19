export interface DaemonConfig {
  port: number;
  host: string;
  pidFile: string;
  logFile: string;
}

export interface ServerInfo {
  pid: number;
  serverName: string;
  name: string;
  version: string;
  status: "running" | "stopped" | "error";
  startTime: number;
  logPath: string;
  external?: boolean;
  transportType?: string;
  url?: string;
}

export interface StartServerRequest {
  serverNameOrUrl: string;
}

export interface StartServerResponse {
  pid: number;
  serverName: string;
  name: string;
  version: string;
  status: string;
  logPath: string;
  alreadyRunning?: boolean;
  external?: boolean;
}

export interface StopServerRequest {
  pid: number;
}

export interface StopServerResponse {
  success: boolean;
  message: string;
}

export interface ListServersResponse {
  servers: ServerInfo[];
}

export interface ServerLogsResponse {
  logs: string;
}

export interface DaemonStatusResponse {
  running: boolean;
  pid?: number;
  config: DaemonConfig;
  uptime?: number;
}

export interface ErrorResponse {
  error: string;
  message: string;
}

import type { ExecutionSession } from "../execution/types.js";

// ==================== Session API Types ====================

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
  statistics?: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    totalDuration: number;
    averageStepDuration: number;
  };
}

export interface SessionFeedbackResponse {
  success: boolean;
  session: ExecutionSession;
}

export interface SessionGetResponse {
  success: boolean;
  session: ExecutionSession;
}

export interface SessionListResponse {
  success: boolean;
  sessions: ExecutionSession[];
  total: number;
}

export interface SessionCancelResponse {
  success: boolean;
  session: ExecutionSession;
}
