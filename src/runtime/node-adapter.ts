import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { execSync } from 'child_process';

export class NodeAdapter implements RuntimeAdapter {
  getSpawnArgs(config: ServiceConfig) {
    // Auto-detect runtime: try bun first, fallback to node
    let command = 'bun';
    try {
      execSync('which bun', { stdio: 'ignore' });
      command = 'bun';
    } catch {
      command = 'node';
    }
    
    const args = command === 'bun' ? [config.entry, ...(config.args || [])] : [config.entry, ...(config.args || [])];
    
    return {
      command,
      args
    };
  }
  
  async setup(config: ServiceConfig) {
    // No special setup needed for Node/Bun
  }
}
