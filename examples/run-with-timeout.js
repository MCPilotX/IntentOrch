#!/usr/bin/env node

/**
 * Node.js timeout wrapper for running examples
 * This provides cross-platform timeout functionality
 */

import { spawn } from 'child_process';

function runWithTimeout(command, args, timeoutMs) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: true
    });

    const timeoutId = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`Timeout after ${timeoutMs}ms`));
    }, timeoutMs);

    child.on('close', (code, signal) => {
      clearTimeout(timeoutId);
      
      if (signal === 'SIGTERM') {
        reject(new Error(`Process terminated due to timeout (${timeoutMs}ms)`));
      } else if (code !== 0) {
        reject(new Error(`Process exited with code ${code}`));
      } else {
        resolve();
      }
    });

    child.on('error', (err) => {
      clearTimeout(timeoutId);
      reject(err);
    });
  });
}

// Main function
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.error('Usage: node run-with-timeout.js <timeout-seconds> <command> [args...]');
    console.error('Example: node run-with-timeout.js 30 node example.js');
    process.exit(1);
  }

  const timeoutSeconds = parseInt(args[0], 10);
  const command = args[1];
  const commandArgs = args.slice(2);

  if (isNaN(timeoutSeconds) || timeoutSeconds <= 0) {
    console.error('Error: Timeout must be a positive number');
    process.exit(1);
  }

  try {
    await runWithTimeout(command, commandArgs, timeoutSeconds * 1000);
    process.exit(0);
  } catch (error) {
    if (error.message.includes('Timeout')) {
      console.error(`⚠ ${error.message}`);
      process.exit(124); // Same exit code as GNU timeout
    } else {
      console.error(`⚠ ${error.message}`);
      process.exit(1);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}

export { runWithTimeout };
