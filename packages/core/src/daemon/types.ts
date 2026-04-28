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
  status: 'running' | 'stopped' | 'error';
  startTime: number;
  logPath: string;
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
