#!/usr/bin/env node

import { Command } from "commander";
import { configCommand } from "./config.js";
import { secretCommand } from "./secret.js";
import { pullCommand } from "./pull.js";
import { runCommand } from "./run.js";
import { startCommand } from "./start.js";
import { stopCommand } from "./stop.js";
import { psCommand } from "./ps.js";
import { listCommand } from "./list.js";
import { logsCommand } from "./logs.js";
import { workflowCommand } from "./workflow.js";
import { daemonCommand } from "./daemon.js";
import { dashboardCommand } from "./dashboard.js";
import {
  PROGRAM_NAME,
  PROGRAM_DESCRIPTION,
  PROGRAM_VERSION,
  closeSqliteDb,
} from "@intentorch/core";

const program = new Command();

// Ensure DB is closed on exit
process.on("exit", () => {
  closeSqliteDb();
});

process.on("SIGINT", () => {
  closeSqliteDb();
  process.exit(0);
});

process.on("SIGTERM", () => {
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
