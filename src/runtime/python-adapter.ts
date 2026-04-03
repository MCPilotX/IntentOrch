import { RuntimeAdapter } from './adapter';
import { ServiceConfig } from '../core/types';
import { VENVS_DIR } from '../core/constants';
import * as path from 'path';
import * as fs from 'fs';
import { exec } from 'child_process';
import { promisify } from 'util';
import { logger } from '../core/logger';

const execAsync = promisify(exec);

export class PythonAdapter implements RuntimeAdapter {
  getSpawnArgs(config: ServiceConfig) {
    const venvPath = path.join(VENVS_DIR, config.name);
    const pythonPath = path.join(venvPath, 'bin', 'python');
    return {
      command: pythonPath,
      args: [config.entry, ...(config.args || [])]
    };
  }

  async setup(config: ServiceConfig) {
    const venvPath = path.join(VENVS_DIR, config.name);
    
    try {
      // 确保虚拟环境目录存在
      if (!fs.existsSync(VENVS_DIR)) {
        fs.mkdirSync(VENVS_DIR, { recursive: true });
        logger.info(`Created virtual environments directory: ${VENVS_DIR}`);
      }

      // Check是否已存在虚拟环境
      const venvExists = fs.existsSync(venvPath) && 
                        fs.existsSync(path.join(venvPath, 'bin', 'python'));

      if (!venvExists) {
        logger.info(`Creating Python virtual environment for ${config.name} at ${venvPath}`);
        
        // 创建虚拟环境
        const { stdout, stderr } = await execAsync(`python3 -m venv "${venvPath}"`);
        
        if (stderr && !stderr.includes('created virtual environment')) {
          logger.warn(`Virtual environment creation warnings: ${stderr}`);
        }
        
        logger.info(`Virtual environment created successfully for ${config.name}`);
      } else {
        logger.info(`Using existing virtual environment for ${config.name} at ${venvPath}`);
      }

      // 安装依赖（如果配置了requirements）
      const pythonConfig = config.runtimeConfig?.python;
      if (pythonConfig?.dependencies) {
        await this.installDependencies(config, venvPath);
      }

      logger.info(`Python setup completed for ${config.name}`);
    } catch (error: any) {
      logger.error(`Failed to setup Python environment for ${config.name}: ${error.message}`, {
        stack: error.stack
      });
      throw new Error(`Python environment setup failed: ${error.message}`);
    }
  }

  private async installDependencies(config: ServiceConfig, venvPath: string) {
    const pythonPath = path.join(venvPath, 'bin', 'python');
    const pipPath = path.join(venvPath, 'bin', 'pip');
    
    try {
      // Checkpip是否可用
      await execAsync(`${pipPath} --version`);
      
      const pythonConfig = config.runtimeConfig?.python;
      const deps = pythonConfig?.dependencies;
      
      if (Array.isArray(deps) && deps.length > 0) {
        logger.info(`Installing Python dependencies for ${config.name}: ${deps.join(', ')}`);
        
        // 安装每个依赖
        for (const dep of deps) {
          try {
            const { stdout, stderr } = await execAsync(`${pipPath} install "${dep}"`);
            logger.info(`Installed dependency: ${dep}`);
            
            if (stderr && stderr.includes('WARNING')) {
              logger.warn(`Installation warnings for ${dep}: ${stderr}`);
            }
          } catch (depError: any) {
            logger.error(`Failed to install dependency ${dep}: ${depError.message}`);
            // 继续安装其他依赖
          }
        }
        
        logger.info(`All dependencies installed for ${config.name}`);
      } else if (typeof deps === 'string' && (deps as string).trim().endsWith('.txt')) {
        // 处理requirements.txtfile
        const requirementsPath = path.isAbsolute(deps) ? deps : path.join(process.cwd(), deps);
        
        if (fs.existsSync(requirementsPath)) {
          logger.info(`Installing dependencies from requirements file: ${requirementsPath}`);
          const { stdout, stderr } = await execAsync(`${pipPath} install -r "${requirementsPath}"`);
          
          if (stderr && stderr.includes('WARNING')) {
            logger.warn(`Requirements installation warnings: ${stderr}`);
          }
          
          logger.info(`Dependencies installed from requirements file for ${config.name}`);
        } else {
          logger.warn(`Requirements file not found: ${requirementsPath}`);
        }
      }
    } catch (error: any) {
      logger.error(`Failed to install dependencies for ${config.name}: ${error.message}`);
      throw new Error(`Dependency installation failed: ${error.message}`);
    }
  }
}