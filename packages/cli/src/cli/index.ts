#!/usr/bin/env node

import { Command } from 'commander';
import { configCommand } from './config';
import { secretCommand } from './secret';
import { pullCommand } from './pull';
import { runCommand } from './run';
import { startCommand } from './start';
import { stopCommand } from './stop';
import { psCommand } from './ps';
import { listCommand } from './list';
import { logsCommand } from './logs';
import { workflowCommand } from './workflow';
import { daemonCommand } from './daemon';
import { dashboardCommand } from './dashboard';
import { PROGRAM_NAME, PROGRAM_DESCRIPTION, PROGRAM_VERSION, closeSqliteDb } from '@intentorch/core';

const program = new Command();

// Ensure DB is closed on exit
process.on('exit', () => {
  closeSqliteDb();
});

process.on('SIGINT', () => {
  closeSqliteDb();
  process.exit(0);
});

process.on('SIGTERM', () => {
  closeSqliteDb();
  process.exit(0);
});

program
  .name(PROGRAM_NAME)
  .description(PROGRAM_DESCRIPTION)
  .version(PROGRAM_VERSION);

// Add subcommands
program.addCommand(configCommand());
program.addCommand(secretCommand());
program.addCommand(pullCommand());
program.addCommand(runCommand());
program.addCommand(startCommand());
program.addCommand(stopCommand());
program.addCommand(psCommand());
program.addCommand(listCommand());
program.addCommand(logsCommand());
program.addCommand(workflowCommand());
program.addCommand(daemonCommand());
program.addCommand(dashboardCommand());

program.parse(process.argv);
