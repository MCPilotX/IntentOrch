import os from "os";
import { execSync } from "child_process";

/**
 * Cross-platform process liveness check.
 * Uses multiple methods for reliability.
 */
export function isProcessRunning(pid: number): boolean {
  // Check for obviously invalid PIDs
  if (pid <= 0) {
    return false;
  }

  // Method 1: Try signal 0 (fastest)
  try {
    // On Windows and POSIX, signal 0 can be used to test for the existence of a process.
    process.kill(pid, 0);
    return true;
  } catch (error: unknown) {
    // ESRCH means the process does not exist.
    // EPERM means the process exists but we don't have permission to send a signal to it.
    if ((error && typeof error === "object" && "code" in error ? (error as { code: string }).code : undefined) === "EPERM") {
      return true;
    }
    // If signal 0 fails with ESRCH, process doesn't exist
    if ((error && typeof error === "object" && "code" in error ? (error as { code: string }).code : undefined) === "ESRCH") {
      return false;
    }
    // For other errors, try other methods
  }

  // Method 2: Try ps command (more reliable on Unix)
  try {
    if (isWindows()) {
      // Windows: use tasklist command
      const output = execSync(`tasklist /FI "PID eq ${pid}"`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"], // Ignore stderr
      });
      return output.includes(`${pid}`);
    } else {
      // Unix-like: use ps command with more reliable options
      const output = execSync(`ps -p ${pid} -o pid= -o comm=`, {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "ignore"], // Ignore stderr
      });
      return output.trim().length > 0 && output.includes(`${pid}`);
    }
  } catch (error) {
    // Command failed or process not found
    return false;
  }
}

/**
 * Enhanced process check with retry logic for recently started processes
 */
export function isProcessRunningWithRetry(
  pid: number,
  maxRetries: number = 3,
  delayMs: number = 500,
): Promise<boolean> {
  return new Promise((resolve) => {
    let retries = 0;

    const check = () => {
      if (isProcessRunning(pid)) {
        resolve(true);
        return;
      }

      retries++;
      if (retries >= maxRetries) {
        resolve(false);
        return;
      }

      setTimeout(check, delayMs);
    };

    check();
  });
}

export function isWindows(): boolean {
  return os.platform() === "win32";
}
