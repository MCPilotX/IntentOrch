/**
 * Daemon Delegator
 *
 * Handles delegation of execution to the daemon process.
 * Extracted from ExecuteService to isolate the daemon delegation logic.
 *
 * Responsibilities:
 * - Check if daemon process is running
 * - Delegate execution to daemon for better performance
 * - Fall back to local execution on daemon failure
 */

import { logger } from "../../core/logger.js";
import type { UnifiedExecutionOptions, UnifiedExecutionResult } from "../execute-service.js";

export class DaemonDelegator {
  /**
   * Try to delegate execution to the daemon process.
   * Returns the result if delegation succeeded, or null if it should fall back to local execution.
   */
  async tryDelegate(
    query: string,
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult | null> {
    const isDaemonProcess = process.env.INTORCH_DAEMON === "true";
    const skipDelegation = options.simulate || options.skipDaemonDelegation;

    if (isDaemonProcess || skipDelegation) {
      return null;
    }

    try {
      const { DaemonClient } = await import("../../daemon/client.js");
      const daemonClient = new DaemonClient();

      const isRunning = await daemonClient.isDaemonRunning();
      logger.info(`[DaemonDelegator] Checking daemon status via API: ${isRunning ? "Online" : "Offline"}`);

      if (isRunning) {
        logger.info("[DaemonDelegator] Daemon is online, delegating execution for better performance");
        try {
          const result = await daemonClient.executeNaturalLanguage(query, options as Record<string, unknown>);
          logger.info("[DaemonDelegator] Execution delegated to daemon successfully");
          return result as UnifiedExecutionResult;
        } catch (daemonError: unknown) {
          const errMsg = daemonError instanceof Error ? daemonError.message : String(daemonError);
          logger.warn(`[DaemonDelegator] Daemon delegation failed: ${errMsg}, falling back to local execution`);
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.info(`[DaemonDelegator] Failed to check daemon status: ${errMsg}`);
    }

    return null;
  }
}
