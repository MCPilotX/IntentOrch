/**
 * Simple CLI Error Formatter
 *
 * Provides consistent error formatting for CLI commands
 * without over-engineering the error handling system.
 */

/**
 * Format an error message for CLI output
 * @param message The error message
 * @param emoji Optional emoji prefix (default: '❌')
 * @returns Formatted error message
 */
export function formatError(message: string, emoji: string = "❌"): string {
  return `${emoji} ${message}`;
}

/**
 * Format a warning message for CLI output
 * @param message The warning message
 * @param emoji Optional emoji prefix (default: '⚠️')
 * @returns Formatted warning message
 */
export function formatWarning(message: string, emoji: string = "⚠️"): string {
  return `${emoji} ${message}`;
}

/**
 * Format an info message for CLI output
 * @param message The info message
 * @param emoji Optional emoji prefix (default: 'ℹ️')
 * @returns Formatted info message
 */
export function formatInfo(message: string, emoji: string = "ℹ️"): string {
  return `${emoji} ${message}`;
}

/**
 * Format a success message for CLI output
 * @param message The success message
 * @param emoji Optional emoji prefix (default: '✅')
 * @returns Formatted success message
 */
export function formatSuccess(message: string, emoji: string = "✅"): string {
  return `${emoji} ${message}`;
}

/**
 * Print formatted error to console.error
 */
export function printError(message: string, emoji: string = "❌"): void {
  console.error(formatError(message, emoji));
}

/**
 * Print formatted warning to console.warn
 */
export function printWarning(message: string, emoji: string = "⚠️"): void {
  console.warn(formatWarning(message, emoji));
}

/**
 * Print formatted info to console.info
 */
export function printInfo(message: string, emoji: string = "ℹ️"): void {
  console.info(formatInfo(message, emoji));
}

/**
 * Print formatted success to console.log
 */
export function printSuccess(message: string, emoji: string = "✅"): void {
  console.log(formatSuccess(message, emoji));
}

/**
 * Print help/suggestion message
 */
export function printSuggestion(message: string): void {
  console.log(`💡 ${message}`);
}

/**
 * Print debug message (only in debug mode)
 */
export function printDebug(message: string, context?: unknown): void {
  if (process.env.DEBUG) {
    const debugMessage = `🐛 ${message}`;
    if (context) {
      console.debug(debugMessage, context);
    } else {
      console.debug(debugMessage);
    }
  }
}
