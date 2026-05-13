import fs from "fs/promises";
import { logger } from "../core/logger.js";

/**
 * Robust file-based locking mechanism.
 * Handles stale locks and atomic creation.
 */
export class FSLock {
  /**
   * Acquire a lock on a file.
   * @param lockPath Path to the lock file
   * @param ttlMs Time-to-live for the lock (to detect stale locks)
   * @returns true if lock acquired, false otherwise
   */
  static async acquire(lockPath: string, ttlMs: number = 30000): Promise<boolean> {
    try {
      // Try atomic creation with flag 'wx'
      await fs.writeFile(lockPath, process.pid.toString(), { flag: "wx" });
      return true;
    } catch (err: unknown) {
      if ((err as NodeJS.ErrnoException).code !== "EEXIST") throw err;

      // Check for stale lock
      try {
        const stats = await fs.stat(lockPath);
        const now = Date.now();
        const mtime = stats.mtimeMs;

        if (now - mtime > ttlMs) {
          logger.warn(`[FSLock] Stale lock detected at ${lockPath}, breaking it.`);
          // Try to read the PID and check if the process is still running
          try {
            const pidStr = await fs.readFile(lockPath, "utf-8");
            const pid = parseInt(pidStr, 10);
            if (!isNaN(pid)) {
              try {
                process.kill(pid, 0); // Check if process exists
                logger.info(`[FSLock] Process ${pid} is still running, cannot break lock.`);
                return false;
              } catch (e) {
                // Process doesn't exist, safe to break
              }
            }
          } catch (e) {
            // Error reading PID, proceed with breaking based on TTL
          }

          await fs.unlink(lockPath);
          // Try acquiring again after unlinking
          return await this.acquire(lockPath, ttlMs);
        }
      } catch (statErr) {
        // Lock might have been removed between EEXIST and stat
        return await this.acquire(lockPath, ttlMs);
      }
      return false;
    }
  }

  /**
   * Release a lock.
   */
  static async release(lockPath: string): Promise<void> {
    try {
      // Only release if the PID in the lock file matches ours
      const pidStr = await fs.readFile(lockPath, "utf-8").catch(() => null);
      if (pidStr && parseInt(pidStr, 10) === process.pid) {
        await fs.unlink(lockPath);
      }
    } catch (e) {
      // Ignore release errors
    }
  }

  /**
   * Update the lock's timestamp to prevent it from becoming stale.
   */
  static async touch(lockPath: string): Promise<void> {
    try {
      const now = new Date();
      await fs.utimes(lockPath, now, now);
    } catch (e) {}
  }
}
