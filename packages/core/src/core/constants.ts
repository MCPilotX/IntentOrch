// Import path module for path constants
import * as path from 'path';

/**
 * Application-wide constants and enumerations
 * This file centralizes all magic strings and provides type-safe constants
 */

// ==================== AI Providers ====================
export const AIProviders = {
  NONE: 'none' as const,
  OPENAI: 'openai' as const,
  ANTHROPIC: 'anthropic' as const,
  GOOGLE: 'google' as const,
  AZURE: 'azure' as const,
  DEEPSEEK: 'deepseek' as const,
  COHERE: 'cohere' as const,
  OLLAMA: 'ollama' as const,
  LOCAL: 'local' as const,
  CUSTOM: 'custom' as const,
} as const;

export type AIProvider = typeof AIProviders[keyof typeof AIProviders];

// ==================== Registry Sources ====================
export const RegistrySources = {
  GITEE: 'gitee' as const,
  GITHUB: 'github' as const,
  OFFICIAL: 'official' as const,
  DIRECT: 'direct' as const,
  LOCAL: 'local' as const,
} as const;

export type RegistrySource = typeof RegistrySources[keyof typeof RegistrySources];

// ==================== Runtime Types ====================
export const RuntimeTypes = {
  NODE: 'node' as const,
  PYTHON: 'python' as const,
  GO: 'go' as const,
  RUST: 'rust' as const,
  DOCKER: 'docker' as const,
  BINARY: 'binary' as const,
  JAVA: 'java' as const,
} as const;

export type RuntimeType = typeof RuntimeTypes[keyof typeof RuntimeTypes];

// ==================== Configuration Defaults ====================
export const ConfigDefaults = {
  AI_PROVIDER: AIProviders.NONE,
  AI_MODEL: 'none' as const,
  REGISTRY_DEFAULT: RegistrySources.GITEE,
  REGISTRY_FALLBACK: RegistrySources.GITHUB,
} as const;

// ==================== Error Messages ====================
export const ErrorMessages = {
  // Configuration errors
  CONFIG_NOT_FOUND: (key: string) => `Configuration "${key}" not found`,
  AI_NOT_CONFIGURED: 'AI provider is not configured. Please run: intorch config set provider <provider>',
  API_KEY_REQUIRED: (provider: string) => `${provider} requires an API key. Please run: intorch config set apiKey <key>`,

  // Registry errors
  REGISTRY_SOURCE_NOT_FOUND: (source: string) => `Registry source "${source}" not found`,
  MANIFEST_NOT_FOUND: (server: string) => `MCP Server "${server}" not found in registry`,

  // Runtime errors
  RUNTIME_NOT_SUPPORTED: (runtime: string) => `Runtime "${runtime}" is not supported`,
  PROCESS_NOT_FOUND: (name: string) => `Process "${name}" is not running`,

  // Validation errors
  INVALID_PROVIDER: (provider: string, valid: string[]) => 
    `Invalid provider: "${provider}". Valid providers: ${valid.join(', ')}`,
  MISSING_REQUIRED_PARAM: (param: string) => `Missing required parameter: "${param}"`,
} as const;

// ==================== Path Constants ====================
// Use ~/.intorch as the unified configuration directory
export const INTORCH_HOME = process.env.INTORCH_HOME || 
  (process.platform === 'win32' 
    ? path.join(process.env.APPDATA || process.env.HOME || '', '.intorch')
    : path.join(process.env.HOME || '', '.intorch'));

export const CONFIG_PATH = path.join(INTORCH_HOME, 'config.json');
export const LOGS_DIR = path.join(INTORCH_HOME, 'logs');
export const VENVS_DIR = path.join(INTORCH_HOME, 'venvs');

// ==================== Default Configuration ====================
export const DEFAULT_CONFIG = {
  ai: {
    provider: ConfigDefaults.AI_PROVIDER,
    apiKey: '',
    model: ConfigDefaults.AI_MODEL,
    apiEndpoint: '',
  },
  registry: {
    default: ConfigDefaults.REGISTRY_DEFAULT,
    fallback: ConfigDefaults.REGISTRY_FALLBACK,
  },
} as const;

// ==================== Timeout Constants (ms) ====================
export const Timeouts = {
  /** Default LLM request timeout */
  LLM_REQUEST: 30_000,
  /** Default LLM request max tokens */
  LLM_MAX_TOKENS: 2048,
  /** Default LLM temperature */
  LLM_TEMPERATURE: 0.1,
  /** Default LLM max retries */
  LLM_MAX_RETRIES: 3,
  /** Tool list timeout per server */
  TOOL_LIST: 60_000,
  /** Tool execution timeout */
  TOOL_EXECUTION: 60_000,
  /** Process graceful shutdown wait */
  PROCESS_SHUTDOWN: 1_000,
  /** Process force kill wait */
  PROCESS_FORCE_KILL: 1_000,
  /** Server startup wait before tool registration */
  SERVER_STARTUP_WAIT: 5_000,
  /** Server initialization wait */
  SERVER_INIT_WAIT: 2_000,
  /** Health check interval */
  HEALTH_CHECK_INTERVAL: 30_000,
  /** Health check timeout */
  HEALTH_CHECK_TIMEOUT: 10_000,
  /** Retry base delay */
  RETRY_BASE_DELAY: 1_000,
  /** Retry max delay */
  RETRY_MAX_DELAY: 10_000,
  /** Default retry attempts */
  RETRY_ATTEMPTS: 3,
  /** Interactive session cleanup default max age */
  INTERACTIVE_SESSION_MAX_AGE: 3_600_000,
  /** Multi-turn LLM max turns */
  MULTI_TURN_MAX_TURNS: 5,
  /** Plan query max tokens */
  PLAN_MAX_TOKENS: 4096,
  /** Plan query temperature */
  PLAN_TEMPERATURE: 0.2,
} as const;

// ==================== Daemon Defaults ====================
export const DaemonDefaults = {
  PORT: 9658,
  HOST: 'localhost',
  VERSION: '0.8.0',
} as const;

// ==================== LLM Model Defaults ====================
export const LLMDefaults = {
  MODEL: 'gpt-3.5-turbo',
  MODEL_FALLBACK: 'gpt-4o-mini',
  TEMPERATURE: 0.1,
  MAX_TOKENS: 2048,
  TIMEOUT: 30_000,
  MAX_RETRIES: 3,
} as const;

// ==================== Execution Defaults ====================
export const ExecutionDefaults = {
  MAX_CONCURRENT_TOOLS: 10,
  TIMEOUT: 60_000,
  RETRY_ATTEMPTS: 2,
  RETRY_DELAY: 1_000,
} as const;

// ==================== Known Server Names ====================
export const KnownServers = [
  'Joooook/12306-mcp',
  'modelcontextprotocol/server-filesystem',
  'modelcontextprotocol/server-github',
  'modelcontextprotocol/server-postgres',
  'modelcontextprotocol/server-sqlite',
  'modelcontextprotocol/server-puppeteer',
] as const;
