import { Interceptor, InterceptorContext } from "../interceptor.js";
import { logger } from "../logger.js";
import { getToolExecutor } from "../../execution/tool-executor/index.js";
import type { ToolInterceptorInput } from "./auto-repair.js";

/**
 * EnvironmentAnomaliesInterceptor provides self-healing for infrastructural failures.
 * It detects when a tool call fails due to a disconnected MCP server or connection error
 * (EPIPE, ECONNREFUSED, etc.) and attempts to automatically restart the server.
 */
export class EnvironmentAnomaliesInterceptor implements Interceptor<ToolInterceptorInput, any> {
  name = "EnvironmentAnomalies";
  private maxRetries = 1;

  async onError(
    ctx: InterceptorContext<ToolInterceptorInput, any>,
    error: Error
  ): Promise<any | void> {
    const { input, span, metadata } = ctx;
    
    const retryCount = (metadata.environmentRetries || 0);
    if (retryCount >= this.maxRetries) {
      return undefined;
    }

    // Identify connection-related errors
    const errorMessage = error.message.toLowerCase();
    const isConnectionError = 
      errorMessage.includes("disconnected") || 
      errorMessage.includes("connection lost") || 
      errorMessage.includes("epipe") || 
      errorMessage.includes("econnrefused") ||
      errorMessage.includes("closed") ||
      errorMessage.includes("not connected");

    if (!isConnectionError) {
      return undefined;
    }

    const toolExecutor = getToolExecutor();
    const serverName = input.toolMetadata?.serverName || toolExecutor.resolveServerName(input.toolName);

    if (!serverName) {
      logger.warn(`[EnvironmentAnomalies] ⚠️ Could not resolve server name for tool "${input.toolName}", skipping auto-restart.`);
      return undefined;
    }

    logger.info(`[EnvironmentAnomalies] 🛠️ Detected environment anomaly for server "${serverName}": ${error.message}. Attempting auto-restart...`);
    
    if (span) {
      span.metadata.anomalyDetected = true;
      span.metadata.anomalyReason = error.message;
      span.metadata.targetServer = serverName;
    }

    try {
      // 1. Attempt to restart the server
      await toolExecutor.restartServer(serverName);
      
      logger.info(`[EnvironmentAnomalies] ✨ Server "${serverName}" restarted successfully. Retrying tool call...`);

      // 2. Retry the execution
      const executeToolFn = metadata.executeToolFn as (toolName: string, params: Record<string, unknown>) => Promise<any>;
      if (!executeToolFn) {
        logger.warn("[EnvironmentAnomalies] executeToolFn not found in context metadata, cannot retry");
        return undefined;
      }

      // Increment retry count
      metadata.environmentRetries = retryCount + 1;
      
      const result = await executeToolFn(input.toolName, input.arguments);
      
      logger.info(`[EnvironmentAnomalies] ✅ Successfully recovered from anomaly and executed tool "${input.toolName}"`);
      
      if (span) {
        span.metadata.anomalyRecovered = true;
      }

      return result;
    } catch (restartError: unknown) {
      const msg = restartError instanceof Error ? restartError.message : String(restartError);
      logger.error(`[EnvironmentAnomalies] ❌ Auto-restart failed for "${serverName}": ${msg}`);
      if (span) {
        span.metadata.anomalyRecoveryFailed = true;
        span.metadata.anomalyRecoveryError = msg;
      }
      return undefined;
    }
  }
}
