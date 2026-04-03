import { ServiceConfig } from '../core/types';

export interface RuntimeAdapter {
  getSpawnArgs(config: ServiceConfig): { command: string; args: string[] };
  setup(config: ServiceConfig): Promise<void>;
}
