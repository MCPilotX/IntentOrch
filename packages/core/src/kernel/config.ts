/**
 * Kernel-X Configuration
 *
 * Central configuration for all Kernel-X modules.
 * All features are opt-in via `enabled` flag to ensure backward compatibility.
 */

export interface KernelConfig {
  /** Master switch - all kernel features disabled by default */
  enabled: boolean;

  /** Semantic Gateway configuration */
  semanticGateway?: {
    /** Number of top tools to inject into LLM prompt (default: 5) */
    topK: number;
    /** FTS5 keyword search weight (0-1, default: 0.3) */
    keywordWeight: number;
    /** VSS semantic search weight (0-1, default: 0.7) */
    semanticWeight: number;
    /** Minimum confidence threshold for tool selection (default: 0.3) */
    minConfidence: number;
  };

  /** Logic Flow Scheduler configuration */
  logicFlow?: {
    /** Enable dependency injection (default: true) */
    enableDependencyInjection: boolean;
    /** Enable recursive planning for missing params (default: true) */
    enableRecursivePlanning: boolean;
    /** Enable schema-level validation (default: true) */
    enableSchemaValidation: boolean;
    /** Max recursion depth for planning (default: 3) */
    maxRecursionDepth: number;
    /** Enable LLM-based parameter regeneration when schema validation fails (default: false) */
    enableLLMRegeneration?: boolean;
    /** AI configuration for LLM regeneration */
    aiConfig?: {
      provider: string;
      apiKey?: string;
      apiEndpoint?: string;
      model?: string;
    };
  };

  /** Sandbox Kernel configuration */
  sandboxKernel?: {
    /** Tool execution timeout in ms (default: 5000) */
    executionTimeout: number;
    /** Health score decay rate per failure (default: 0.2) */
    healthDecayRate: number;
    /** Health score recovery rate per success (default: 0.1) */
    healthRecoveryRate: number;
    /** Minimum health score before circuit opens (default: 0.3) */
    minHealthScore: number;
    /** Enable shadow logging (default: true) */
    enableShadowLogging: boolean;
  };

  /** Health Check Scheduler configuration */
  healthCheck?: {
    /** Interval between health checks in ms (default: 60000) */
    interval: number;
    /** Number of consecutive failures before marking as degraded (default: 3) */
    failureThreshold: number;
    /** Whether to auto-recover servers after they come back (default: true) */
    autoRecover: boolean;
    /** Timeout for each health check ping in ms (default: 5000) */
    checkTimeout: number;
  };

  /** Circuit-Aware Selector configuration */
  circuitAwareSelector?: {
    /** Whether to enable circuit-aware selection (default: true) */
    enabled: boolean;
    /** Whether to attempt fallback to alternative tools (default: true) */
    enableFallback: boolean;
    /** Whether to log skipped tools (default: true) */
    logSkipped: boolean;
  };

  /** Kernel History configuration */
  kernelHistory?: {
    /** Enable history tracking (default: true) */
    enabled: boolean;
    /** Maximum number of history records to keep (default: 1000) */
    maxRecords: number;
  };

  /** ReAct Agent configuration */
  reactAgent?: {
    /** Maximum number of Thought-Action-Observation cycles (default: 10) */
    maxCycles: number;
    /** Whether to enable the ReAct loop (default: false) */
    enabled: boolean;
    /** AI configuration for generating thoughts */
    aiConfig?: {
      provider: string;
      apiKey?: string;
      apiEndpoint?: string;
      model?: string;
    };
    /** Temperature for thought generation (default: 0.3) */
    temperature: number;
    /** Whether to log all steps in detail (default: true) */
    verboseLogging: boolean;
  };

  /** Error Self-Diagnosis configuration */
  errorSelfDiagnosis?: {
    /** Whether error self-diagnosis is enabled (default: true) */
    enabled: boolean;
    /** Maximum number of retry attempts (default: 3) */
    maxRetries: number;
    /** AI configuration for error analysis */
    aiConfig?: {
      provider: string;
      apiKey?: string;
      apiEndpoint?: string;
      model?: string;
    };
    /** Whether to log all diagnosis details (default: true) */
    verboseLogging: boolean;
  };

  /** Auto Dependency Inferrer configuration */
  autoDependencyInferrer?: {
    /** Whether auto dependency inference is enabled (default: false) */
    enabled: boolean;
    /** Minimum confidence threshold for auto-registration (default: 0.5) */
    minConfidence: number;
    /** Whether to auto-register inferred dependencies as LogicFlow rules (default: true) */
    autoRegister: boolean;
    /** Whether to detect circular dependencies (default: true) */
    detectCircular: boolean;
    /** Whether to log all inference details (default: true) */
    verboseLogging: boolean;
  };

  /** Global Error Boundary configuration */
  errorBoundary?: {
    /** Whether error boundary is enabled (default: true) */
    enabled: boolean;
    /** Maximum retry attempts for retryable errors (default: 3) */
    maxRetries: number;
    /** Whether to enable circuit breaker integration (default: true) */
    enableCircuitBreaker: boolean;
    /** Whether to attempt automatic recovery (default: true) */
    enableAutoRecovery: boolean;
    /** Whether to log all errors in detail (default: true) */
    verboseLogging: boolean;
  };

  /** Slot Filling Agent configuration */
  slotFilling?: {
    /** Whether slot filling is enabled (default: true) */
    enabled: boolean;
    /** Maximum number of questions to ask in one turn (default: 3) */
    maxQuestionsPerTurn: number;
    /** Whether to suggest values based on schema (default: true) */
    enableSuggestions: boolean;
    /** Whether to auto-fill parameters with defaults (default: true) */
    autoFillDefaults: boolean;
    /** Whether to validate parameter types (default: true) */
    enableTypeValidation: boolean;
  };
}

const DEFAULT_CONFIG: KernelConfig = {
  enabled: false,
  semanticGateway: {
    topK: 5,
    keywordWeight: 0.5,
    semanticWeight: 0.5,
    minConfidence: 0.3,
  },
  logicFlow: {
    enableDependencyInjection: true,
    enableRecursivePlanning: true,
    enableSchemaValidation: true,
    maxRecursionDepth: 3,
  },
  sandboxKernel: {
    executionTimeout: 5000,
    healthDecayRate: 0.2,
    healthRecoveryRate: 0.1,
    minHealthScore: 0.3,
    enableShadowLogging: true,
  },
  kernelHistory: {
    enabled: true,
    maxRecords: 1000,
  },
  healthCheck: {
    interval: 60000,
    failureThreshold: 3,
    autoRecover: true,
    checkTimeout: 5000,
  },
  circuitAwareSelector: {
    enabled: true,
    enableFallback: true,
    logSkipped: true,
  },
  errorSelfDiagnosis: {
    enabled: true,
    maxRetries: 3,
    verboseLogging: true,
  },
  slotFilling: {
    enabled: true,
    maxQuestionsPerTurn: 3,
    enableSuggestions: true,
    autoFillDefaults: true,
    enableTypeValidation: true,
  },
};


let kernelConfig: KernelConfig = { ...DEFAULT_CONFIG };

export function getKernelConfig(): KernelConfig {
  return kernelConfig;
}

export function setKernelConfig(config: Partial<KernelConfig>): void {
  kernelConfig = {
    ...kernelConfig,
    ...config,
    semanticGateway: { ...DEFAULT_CONFIG.semanticGateway, ...config.semanticGateway } as KernelConfig['semanticGateway'],
    logicFlow: { ...DEFAULT_CONFIG.logicFlow, ...config.logicFlow } as KernelConfig['logicFlow'],
    sandboxKernel: { ...DEFAULT_CONFIG.sandboxKernel, ...config.sandboxKernel } as KernelConfig['sandboxKernel'],
    kernelHistory: { ...DEFAULT_CONFIG.kernelHistory, ...config.kernelHistory } as KernelConfig['kernelHistory'],
    healthCheck: { ...DEFAULT_CONFIG.healthCheck, ...config.healthCheck } as KernelConfig['healthCheck'],
    circuitAwareSelector: { ...DEFAULT_CONFIG.circuitAwareSelector, ...config.circuitAwareSelector } as KernelConfig['circuitAwareSelector'],
  };
}

export function isKernelEnabled(): boolean {
  return kernelConfig.enabled;
}
