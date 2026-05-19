import { Interceptor, InterceptorContext } from "../interceptor.js";
import { isToolCallSafe, loadSandboxPolicy } from "../sandbox-policy.js";
import type { SandboxPolicy } from "../sandbox-policy.js";
import { logger } from "../logger.js";
import { getSessionManager } from "../../execution/session-manager.js";
import { IntentOrchError, ErrorCode } from "../error-handler.js";

/**
 * SandboxInterceptor provides security enforcement before tool execution.
 * It inspects the planned tool calls and blocks those that violate safety policies.
 * Policy is loaded lazily from the config store on first execution, with
 * a static fallback to the built-in defaults.
 */
export class SandboxInterceptor implements Interceptor<{ sessionId: string }> {
  name = "SandboxSecurity";
  private policy: SandboxPolicy | null = null;

  async before(ctx: InterceptorContext<{ sessionId: string }>): Promise<void> {
    // Lazily load policy on first execution
    if (!this.policy) {
      this.policy = await loadSandboxPolicy();
      logger.debug(`[Sandbox] Policy loaded: ${this.policy.forbiddenTools.length} forbidden, ${this.policy.highRiskServers.length} high-risk servers`);
    }

    const { input, span } = ctx;
    const sessionManager = getSessionManager();
    const session = await sessionManager.getSession(input.sessionId);

    if (!session || !session.plan) {
      return;
    }

    logger.debug(`[Sandbox] Validating plan for session ${input.sessionId}...`);

    for (const step of session.plan.steps) {
      const securityCheck = isToolCallSafe(step.toolName, step.serverName, this.policy);
      
      if (!securityCheck.safe) {
        const errorMsg = securityCheck.reason || `Tool ${step.toolName} is not allowed.`;
        logger.warn(`[Sandbox] 🛡️ Security Violation Blocked: ${errorMsg}`);
        
        if (span) {
          span.metadata.securityViolation = true;
          span.metadata.blockedTool = step.toolName;
        }

        // Interrupt the execution by throwing a security error
        throw new IntentOrchError(
          ErrorCode.PERMISSION_DENIED,
          `Security Sandbox: ${errorMsg}`
        );
      }

      if (securityCheck.isHighRisk) {
        logger.info(`[Sandbox] ⚠️ High-risk tool detected: ${step.toolName} from ${step.serverName}. Audit record will be created.`);
        if (span) {
          span.metadata.highRiskDetected = true;
        }
      }
    }

    logger.debug(`[Sandbox] ✅ All tools in plan passed security validation.`);
  }
}
