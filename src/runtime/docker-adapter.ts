import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { spawn, type ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';

export class DockerAdapter implements RuntimeAdapter {
  private process: ChildProcess | null = null;
  private containerName: string;

  constructor() {
    this.containerName = '';
  }

  getSpawnArgs(config: ServiceConfig) {
    // Docker adapter doesn't use traditional spawn, but starts containers
    this.containerName = `mcp-${config.name}-${Date.now()}`;

    const args = ['run', '-d', '--rm', '--name', this.containerName];

    // Add environment variables
    if (config.env) {
      Object.entries(config.env).forEach(([key, value]) => {
        args.push('-e', `${key}=${value}`);
      });
    }

    // Add port mappings
    if (config.ports) {
      config.ports.forEach(port => {
        args.push('-p', `${port}:${port}`);
      });
    }

    // Add volume mappings
    if (config.volumes) {
      config.volumes.forEach(volume => {
        args.push('-v', volume);
      });
    }

    // Add working directory
    if (config.workdir) {
      args.push('-w', config.workdir);
    }

    // Add image and command
    args.push(config.image || config.name);

    if (config.args && config.args.length > 0) {
      args.push(...config.args);
    }

    return {
      command: 'docker',
      args: args,
    };
  }

  async setup(config: ServiceConfig): Promise<void> {
    console.log(`[Docker] Setting up service: ${config.name}`);

    // Check if Docker is installed
    try {
      const { execSync } = require('child_process');
      execSync('docker --version', { stdio: 'ignore' });
    } catch (error) {
      throw new Error('Docker is not installed or not in PATH');
    }

    // Check if image exists, pull if not
    if (config.image) {
      try {
        const { execSync } = require('child_process');
        execSync(`docker image inspect ${config.image}`, { stdio: 'ignore' });
        console.log(`[Docker] Image ${config.image} already exists`);
      } catch (error) {
        console.log(`[Docker] Pulling image: ${config.image}`);
        try {
          const { execSync } = require('child_process');
          execSync(`docker pull ${config.image}`, { stdio: 'inherit' });
        } catch (pullError) {
          throw new Error(`Failed to pull Docker image ${config.image}: ${pullError.message}`);
        }
      }
    }

    // If Dockerfile exists, build image
    if (config.dockerfile) {
      const dockerfilePath = path.join(config.path || '.', config.dockerfile);
      if (fs.existsSync(dockerfilePath)) {
        console.log(`[Docker] Building image from ${dockerfilePath}`);
        try {
          const { execSync } = require('child_process');
          const buildContext = config.buildContext || path.dirname(dockerfilePath);
          execSync(`docker build -t ${config.name} -f ${dockerfilePath} ${buildContext}`, {
            stdio: 'inherit',
            cwd: config.path || '.',
          });
        } catch (buildError) {
          throw new Error(`Failed to build Docker image: ${buildError.message}`);
        }
      } else {
        // Dockerfile specified but doesn't exist - just log a warning
        console.warn(`[Docker] Dockerfile not found at ${dockerfilePath}, skipping build`);
        // Continue without building - user may have pre-built image or will pull from registry
      }
    }

    console.log(`[Docker] Setup completed for service: ${config.name}`);
  }

  async startContainer(config: ServiceConfig): Promise<ChildProcess> {
    const { command, args } = this.getSpawnArgs(config);

    console.log(`[Docker] Starting container: ${this.containerName}`);
    console.log(`[Docker] Command: ${command} ${args.join(' ')}`);

    const process = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
      detached: false,
    });

    process.stdout?.on('data', (data) => {
      console.log(`[Docker:${config.name}] ${data.toString().trim()}`);
    });

    process.stderr?.on('data', (data) => {
      console.error(`[Docker:${config.name}] ERR: ${data.toString().trim()}`);
    });

    process.on('error', (error) => {
      console.error(`[Docker:${config.name}] Failed to start: ${error.message}`);
    });

    process.on('exit', (code, signal) => {
      console.log(`[Docker:${config.name}] Container exited with code ${code}, signal ${signal}`);
      this.process = null;
    });

    this.process = process;
    return process;
  }

  async stopContainer(): Promise<void> {
    if (this.process) {
      console.log(`[Docker] Stopping container: ${this.containerName}`);

      try {
        const { execSync } = require('child_process');
        execSync(`docker stop ${this.containerName}`, { stdio: 'ignore' });
      } catch (error) {
        // Container may already be stopped
      }

      this.process.kill();
      this.process = null;
    }
  }

  async getContainerStatus(): Promise<string> {
    if (!this.containerName) {
      return 'not_created';
    }

    try {
      const { execSync } = require('child_process');
      const output = execSync(`docker ps -a --filter "name=${this.containerName}" --format "{{.Status}}"`, {
        encoding: 'utf-8',
      }).trim();

      if (output.includes('Up')) {
        return 'running';
      } else if (output.includes('Exited')) {
        return 'stopped';
      } else {
        return 'not_found';
      }
    } catch (error) {
      return 'error';
    }
  }

  async getContainerLogs(tail: number = 50): Promise<string> {
    if (!this.containerName) {
      return 'Container not created';
    }

    try {
      const { execSync } = require('child_process');
      return execSync(`docker logs --tail ${tail} ${this.containerName}`, {
        encoding: 'utf-8',
      });
    } catch (error) {
      return `Failed to get logs: ${error.message}`;
    }
  }
}
