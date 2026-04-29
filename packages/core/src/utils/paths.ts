import path from "path";
import os from "os";

export function getInTorchDir(): string {
  return path.join(os.homedir(), ".intorch");
}

export function getConfigPath(): string {
  return path.join(getInTorchDir(), "config.json");
}

export function getSecretsPath(): string {
  return path.join(getInTorchDir(), "secrets.json.enc");
}

export function getProcessesPath(): string {
  return path.join(getInTorchDir(), "processes.json");
}

export function getLogsDir(): string {
  return path.join(getInTorchDir(), "logs");
}

export function getLogPath(pid: number): string {
  return path.join(getLogsDir(), `${pid}.log`);
}

export function getCacheDir(): string {
  return path.join(getInTorchDir(), "cache");
}

export function getManifestCachePath(serverName: string): string {
  // Encode special characters to preserve them for decoding in ManifestCache.list()
  // Use patterns that can be decoded back: _at_ for @, _slash_ for /, _dash_ for -, _dot_ for .
  const safeName = serverName
    .replace(/@/g, "_at_")
    .replace(/\//g, "_slash_")
    .replace(/-/g, "_dash_")
    .replace(/\./g, "_dot_")
    // Replace any other non-alphanumeric characters with _
    .replace(/[^a-zA-Z0-9]/g, "_");
  return path.join(getCacheDir(), "manifests", `${safeName}.json`);
}

import fs from "fs";

export function ensureInTorchDir(): void {
  const dir = getInTorchDir();
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const cacheDir = getCacheDir();
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const manifestsDir = path.join(cacheDir, "manifests");
  if (!fs.existsSync(manifestsDir)) {
    fs.mkdirSync(manifestsDir, { recursive: true });
  }

  const logsDir = getLogsDir();
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  const workflowsDir = path.join(dir, "workflows");
  if (!fs.existsSync(workflowsDir)) {
    fs.mkdirSync(workflowsDir, { recursive: true });
  }
}

export function getDaemonPidPath(): string {
  return path.join(getInTorchDir(), "daemon.pid");
}

export function getDaemonLogPath(): string {
  return path.join(getLogsDir(), "daemon.log");
}

export function getDaemonSocketPath(): string {
  return path.join(getInTorchDir(), "daemon.sock");
}
