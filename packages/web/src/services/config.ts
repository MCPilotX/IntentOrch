/**
 * Web application configuration
 * Centralized configuration for the web frontend
 */

// Daemon API base URL - configurable via environment variable or auto-detection
function getApiBaseUrl(): string {
  // 1. Check environment variable (Vite convention)
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL as string;
  }

  // 2. Check if running in development mode with a custom port
  if (import.meta.env.DEV && import.meta.env.VITE_DAEMON_PORT) {
    return `http://localhost:${import.meta.env.VITE_DAEMON_PORT}`;
  }

  // 3. Default
  return 'http://localhost:9658';
}

export const API_BASE_URL = getApiBaseUrl();

export const config = {
  api: {
    baseUrl: API_BASE_URL,
    timeout: 60000,
  },
  orchestration: {
    autoExecute: false, // Default: manual execution only
    confidenceThreshold: 0.1,
    autoExecuteDelay: 800,
  },
  chat: {
    storageKey: 'intorch_chat_history',
    maxStoredMessages: 100,
  },
};
