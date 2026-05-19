import { RuntimeAdapter } from "./adapter.js";
import { ServiceConfig } from "../core/types.js";
import { VENVS_DIR } from "../core/constants.js";
import * as path from "path";
import * as fs from "fs";
import { exec } from "child_process";
import { promisify } from "util";
import { logger } from "../core/logger.js";

const defaultExecAsync = promisify(exec);

export type ExecAsyncFunction = (
  command: string,
) => Promise<{ stdout: string; stderr: string }>;

export class PythonAdapter implements RuntimeAdapter {
  private execAsync: ExecAsyncFunction;

  constructor(execAsync?: ExecAsyncFunction) {
    this.execAsync = execAsync || defaultExecAsync;
  }
  getSpawnArgs(config: ServiceConfig): { command: string; args: string[] } {
    const venvPath = path.join(VENVS_DIR, config.name);
    const pythonPath = path.join(venvPath, "bin", "python");
    const entry = config.entry || "main.py";
    return {
      command: pythonPath,
      args: [entry, ...(config.args || [])],
    };
  }

  async setup(config: ServiceConfig) {
    const venvPath = path.join(VENVS_DIR, config.name);

    try {
      // Ensure virtual environment directory exists
      if (!fs.existsSync(VENVS_DIR)) {
        fs.mkdirSync(VENVS_DIR, { recursive: true });
        logger.info(`Created virtual environments directory: ${VENVS_DIR}`);
      }

      // Check if virtual environment already exists
      const venvExists =
        fs.existsSync(venvPath) &&
        fs.existsSync(path.join(venvPath, "bin", "python"));

      if (!venvExists) {
        logger.info(
          `Creating Python virtual environment for ${config.name} at ${venvPath}`,
        );

        // Create virtual environment
        const { stdout: _stdout, stderr } = await this.execAsync(
          `python3 -m venv "${venvPath}"`,
        );

        if (stderr && !stderr.includes("created virtual environment")) {
          logger.warn(`Virtual environment creation warnings: ${stderr}`);
        }

        logger.info(
          `Virtual environment created successfully for ${config.name}`,
        );
      } else {
        logger.info(
          `Using existing virtual environment for ${config.name} at ${venvPath}`,
        );
      }

      // Install dependencies (if requirements are configured)
      const pythonConfig = config.runtimeConfig?.python;
      if (pythonConfig?.dependencies) {
        await this.installDependencies(config, venvPath);
      }

      logger.info(`Python setup completed for ${config.name}`);
    } catch (error: unknown) {
      logger.error(
        `Failed to setup Python environment for ${config.name}: ${(error instanceof Error ? error.message : String(error))}`,
        {
          stack: error instanceof Error ? error.stack : undefined,
        },
      );
      throw new Error(`Python environment setup failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }

  private async installDependencies(config: ServiceConfig, venvPath: string) {
    const pipPath = path.join(venvPath, "bin", "pip");

    try {
      // Check if pip is available
      await this.execAsync(`${pipPath} --version`);

      const pythonConfig = config.runtimeConfig?.python;
      const deps = pythonConfig?.dependencies;

      if (Array.isArray(deps) && deps.length > 0) {
        logger.info(
          `Installing Python dependencies for ${config.name}: ${deps.join(", ")}`,
        );

        // Install each dependency
        for (const dep of deps) {
          try {
            const { stdout: _stdout, stderr } = await this.execAsync(
              `${pipPath} install "${dep}"`,
            );
            logger.info(`Installed dependency: ${dep}`);

            if (stderr && stderr.includes("WARNING")) {
              logger.warn(`Installation warnings for ${dep}: ${stderr}`);
            }
          } catch (depError: unknown) {
            logger.error(
              `Failed to install dependency ${dep}: ${depError instanceof Error ? depError.message : String(depError)}`,
            );
            // Continue installing other dependencies
          }
        }

        logger.info(`All dependencies installed for ${config.name}`);
      } else if (
        typeof deps === "string" &&
        (deps as string).trim().endsWith(".txt")
      ) {
        // Handle requirements.txt file
        const requirementsPath = path.isAbsolute(deps)
          ? deps
          : path.join(process.cwd(), deps);

        if (fs.existsSync(requirementsPath)) {
          logger.info(
            `Installing dependencies from requirements file: ${requirementsPath}`,
          );
          const { stdout: _stdout, stderr } = await this.execAsync(
            `${pipPath} install -r "${requirementsPath}"`,
          );

          if (stderr && stderr.includes("WARNING")) {
            logger.warn(`Requirements installation warnings: ${stderr}`);
          }

          logger.info(
            `Dependencies installed from requirements file for ${config.name}`,
          );
        } else {
          logger.warn(`Requirements file not found: ${requirementsPath}`);
        }
      }
    } catch (error: unknown) {
      logger.error(
        `Failed to install dependencies for ${config.name}: ${(error instanceof Error ? error.message : String(error))}`,
      );
      throw new Error(`Dependency installation failed: ${(error instanceof Error ? error.message : String(error))}`);
    }
  }
}
