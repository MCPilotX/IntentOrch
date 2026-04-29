import { ServiceConfig } from "../core/types.js";

export interface RuntimeAdapter {
  getSpawnArgs(config: ServiceConfig): { command: string; args: string[] };
  setup(config: ServiceConfig): Promise<void>;
}
