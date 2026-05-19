import { getConfigRepository } from "../utils/sqlite.js";
import { logger } from "./logger.js";

/**
 * Sandbox Security Policy
 * 
 * Defines rules for tool execution to prevent accidental or malicious 
 * system damage. This serves as the "brain" for the SandboxInterceptor.
 */

export interface SandboxPolicy {
  /** List of tool name patterns that are strictly forbidden */
  forbiddenTools: string[];
  
  /** List of server names that are considered high-risk */
  highRiskServers: string[];
  
  /** Whether to require explicit user confirmation for high-risk operations */
  requireConfirmationForHighRisk: boolean;
  
  /** Maximum allowed depth for nested tool calls (prevents recursive loops) */
  maxExecutionDepth: number;
}

export const DEFAULT_SANDBOX_POLICY: SandboxPolicy = {
  forbiddenTools: [
    // Shell/System dangerous commands
    "rm", "rmdir", "format", "mkfs", "kill", "pkill", "shutdown", "reboot",
    // File system destructive operations (if not scoped)
    "delete_file", "remove_directory", "write_to_system_config"
  ],
  
  highRiskServers: [
    "modelcontextprotocol/server-filesystem",
    "modelcontextprotocol/server-postgres",
    "modelcontextprotocol/server-sqlite",
    "modelcontextprotocol/server-shell"
  ],
  
  requireConfirmationForHighRisk: true,
  maxExecutionDepth: 5
};

// ==================== Config keys ====================

const CONFIG_KEY_PREFIX = "sandbox_policy_";
const CONFIG_KEY_FORBIDDEN_TOOLS = `${CONFIG_KEY_PREFIX}forbidden_tools`;
const CONFIG_KEY_HIGH_RISK_SERVERS = `${CONFIG_KEY_PREFIX}high_risk_servers`;
const CONFIG_KEY_REQUIRE_CONFIRMATION = `${CONFIG_KEY_PREFIX}require_confirmation`;
const CONFIG_KEY_MAX_DEPTH = `${CONFIG_KEY_PREFIX}max_depth`;

/**
 * Load the sandbox policy from the persistent config store.
 * Falls back to DEFAULT_SANDBOX_POLICY if no overrides exist.
 */
export async function loadSandboxPolicy(): Promise<SandboxPolicy> {
  try {
    const config = getConfigRepository();

    const [forbiddenRaw, serversRaw, confirmationRaw, depthRaw] = await Promise.all([
      config.get(CONFIG_KEY_FORBIDDEN_TOOLS),
      config.get(CONFIG_KEY_HIGH_RISK_SERVERS),
      config.get(CONFIG_KEY_REQUIRE_CONFIRMATION),
      config.get(CONFIG_KEY_MAX_DEPTH),
    ]);

    return {
      forbiddenTools: forbiddenRaw ? JSON.parse(forbiddenRaw) : DEFAULT_SANDBOX_POLICY.forbiddenTools,
      highRiskServers: serversRaw ? JSON.parse(serversRaw) : DEFAULT_SANDBOX_POLICY.highRiskServers,
      requireConfirmationForHighRisk: confirmationRaw ? confirmationRaw === "true" : DEFAULT_SANDBOX_POLICY.requireConfirmationForHighRisk,
      maxExecutionDepth: depthRaw ? parseInt(depthRaw, 10) : DEFAULT_SANDBOX_POLICY.maxExecutionDepth,
    };
  } catch (error) {
    logger.warn(
      `[SandboxPolicy] Failed to load policy from config, using defaults: ${error instanceof Error ? error.message : String(error)}`,
    );
    return { ...DEFAULT_SANDBOX_POLICY };
  }
}

/**
 * Persist the sandbox policy to the config store.
 */
export async function saveSandboxPolicy(policy: SandboxPolicy): Promise<void> {
  const config = getConfigRepository();

  await Promise.all([
    config.set(CONFIG_KEY_FORBIDDEN_TOOLS, JSON.stringify(policy.forbiddenTools)),
    config.set(CONFIG_KEY_HIGH_RISK_SERVERS, JSON.stringify(policy.highRiskServers)),
    config.set(CONFIG_KEY_REQUIRE_CONFIRMATION, String(policy.requireConfirmationForHighRisk)),
    config.set(CONFIG_KEY_MAX_DEPTH, String(policy.maxExecutionDepth)),
  ]);

  logger.info("[SandboxPolicy] Policy saved to config store");
}

/**
 * Check if a tool call is safe according to the policy
 */
export function isToolCallSafe(
  toolName: string, 
  serverName: string | undefined, 
  policy: SandboxPolicy = DEFAULT_SANDBOX_POLICY
): { safe: boolean; reason?: string; isHighRisk: boolean } {
  // 1. Check forbidden tools (exact match or pattern)
  const isForbidden = policy.forbiddenTools.some(pattern => 
    toolName.toLowerCase().includes(pattern.toLowerCase())
  );
  
  if (isForbidden) {
    return { safe: false, reason: `Tool "${toolName}" is forbidden by sandbox policy`, isHighRisk: true };
  }
  
  // 2. Check high risk servers
  const isHighRisk = serverName ? policy.highRiskServers.includes(serverName) : false;
  
  // For now, we consider all non-forbidden tools as safe, 
  // but they might be flagged as high-risk for audit logging.
  return { safe: true, isHighRisk };
}
