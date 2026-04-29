import { RuntimeAdapter } from "./adapter.js";
import { ServiceConfig } from "../core/types.js";
import { execSync } from "child_process";

export class NodeAdapter implements RuntimeAdapter {
  getSpawnArgs(config: ServiceConfig): { command: string; args: string[] } {
    // Auto-detect runtime: try bun first, fallback to node
    let command = "bun";
    try {
      execSync("which bun", { stdio: "ignore" });
      command = "bun";
    } catch {
      command = "node";
    }

    const entry = config.entry || "index.js";
    const args =
      command === "bun"
        ? [entry, ...(config.args || [])]
        : [entry, ...(config.args || [])];

    return {
      command,
      args,
    };
  }

  async setup(_config: ServiceConfig) {
    // No special setup needed for Node/Bun
  }
}
