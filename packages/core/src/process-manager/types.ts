export interface ProcessInfo {
  pid: number;
  serverName: string;
  name: string;
  version: string;
  manifest: {
    name: string;
    version: string;
    runtime: {
      type: string;
      command: string;
      args?: string[];
      env?: string[];
      cwd?: string;
    };
  };
  startTime: number;
  startedAt?: string; // ISO string for web compatibility
  status: 'running' | 'stopped' | 'error';
  serverId?: string; // For web compatibility
  port?: number;
  stdout?: string;
  stderr?: string;
  logPath?: string;
}

export interface ProcessStore {
  processes: ProcessInfo[];
}