import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import { Workflow } from './types';
import { getInTorchDir, ensureInTorchDir } from '../utils/paths';

export class WorkflowManager {
  private workflowsDir: string;
  private indexFile: string;

  constructor() {
    this.workflowsDir = path.join(getInTorchDir(), 'workflows');
    this.indexFile = path.join(this.workflowsDir, '_index.json');
  }

  async ensureDir(): Promise<void> {
    ensureInTorchDir();
    try {
      await fs.mkdir(this.workflowsDir, { recursive: true });
    } catch (e) {}
  }

  async save(workflow: Workflow): Promise<string> {
    await this.ensureDir();
    
    let workflowId = workflow.id;
    let filePath: string;
    
    if (workflowId) {
      // Existing workflow: check if it exists
      const existingFilePath = path.join(this.workflowsDir, `${workflowId}.json`);
      try {
        await fs.access(existingFilePath);
        // File exists, use existing ID and path
        filePath = existingFilePath;
      } catch {
        // File doesn't exist, treat as new workflow
        workflowId = uuidv4();
        filePath = path.join(this.workflowsDir, `${workflowId}.json`);
      }
    } else {
      // New workflow: generate UUID
      workflowId = uuidv4();
      filePath = path.join(this.workflowsDir, `${workflowId}.json`);
    }
    
    // Ensure workflow has the correct ID
    const workflowToSave = {
      ...workflow,
      id: workflowId, // Use the determined ID
      originalName: workflow.name, // Store original name for reference
      updatedAt: new Date().toISOString(), // Always update timestamp
    };
    
    // Ensure createdAt is set for new workflows
    if (!workflowToSave.createdAt) {
      workflowToSave.createdAt = new Date().toISOString();
    }
    
    await fs.writeFile(filePath, JSON.stringify(workflowToSave, null, 2), 'utf-8');
    
    // Update index
    await this.updateIndex(workflowId, workflow.name);
    
    return workflowId; // Return the workflow ID
  }

  async load(id: string): Promise<Workflow> {
    await this.ensureDir();
    
    // First try to load by UUID (direct file)
    const uuidFilePath = path.join(this.workflowsDir, `${id}.json`);
    try {
      const data = await fs.readFile(uuidFilePath, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      // If not found by UUID, try to find by name in index
      const index = await this.loadIndex();
      const uuid = this.findUUIDByName(id, index);
      if (uuid) {
        const filePath = path.join(this.workflowsDir, `${uuid}.json`);
        const data = await fs.readFile(filePath, 'utf-8');
        return JSON.parse(data);
      }
      throw new Error(`Workflow not found: ${id}`);
    }
  }

  async list(): Promise<Workflow[]> {
    await this.ensureDir();
    try {
      const files = await fs.readdir(this.workflowsDir);
      const workflows: Workflow[] = [];
      
      for (const file of files) {
        if (file.endsWith('.json') && file !== '_index.json') {
          try {
            const filePath = path.join(this.workflowsDir, file);
            const data = await fs.readFile(filePath, 'utf-8');
            const workflow = JSON.parse(data);
            workflows.push(workflow);
          } catch (e) {
            // Skip corrupted files
            console.warn(`Skipping corrupted workflow file: ${file}`);
          }
        }
      }
      
      return workflows;
    } catch (e) {
      return [];
    }
  }

  async delete(id: string): Promise<void> {
    await this.ensureDir();
    
    // First try to delete by UUID
    const uuidFilePath = path.join(this.workflowsDir, `${id}.json`);
    try {
      await fs.unlink(uuidFilePath);
      // Remove from index
      await this.removeFromIndex(id);
      return;
    } catch (e) {
      // If not found by UUID, try to find by name in index
      const index = await this.loadIndex();
      const uuid = this.findUUIDByName(id, index);
      if (uuid) {
        const filePath = path.join(this.workflowsDir, `${uuid}.json`);
        await fs.unlink(filePath);
        await this.removeFromIndex(uuid);
        return;
      }
      throw new Error(`Workflow not found: ${id}`);
    }
  }

  async exists(id: string): Promise<boolean> {
    await this.ensureDir();
    
    // Check by UUID
    const uuidFilePath = path.join(this.workflowsDir, `${id}.json`);
    try {
      await fs.access(uuidFilePath);
      return true;
    } catch (e) {
      // Check by name in index
      const index = await this.loadIndex();
      const uuid = this.findUUIDByName(id, index);
      return !!uuid;
    }
  }

  // Private helper methods
  private async loadIndex(): Promise<Record<string, string>> {
    try {
      const data = await fs.readFile(this.indexFile, 'utf-8');
      return JSON.parse(data);
    } catch (e) {
      return {};
    }
  }

  private async saveIndex(index: Record<string, string>): Promise<void> {
    await fs.writeFile(this.indexFile, JSON.stringify(index, null, 2), 'utf-8');
  }

  private async updateIndex(uuid: string, name: string): Promise<void> {
    const index = await this.loadIndex();
    index[uuid] = name;
    await this.saveIndex(index);
  }

  private async removeFromIndex(uuid: string): Promise<void> {
    const index = await this.loadIndex();
    delete index[uuid];
    await this.saveIndex(index);
  }

  private findUUIDByName(name: string, index: Record<string, string>): string | null {
    for (const [uuid, workflowName] of Object.entries(index)) {
      if (workflowName === name) {
        return uuid;
      }
    }
    return null;
  }
}

// Singleton instance
let workflowManager: WorkflowManager | null = null;

export function getWorkflowManager(): WorkflowManager {
  if (!workflowManager) {
    workflowManager = new WorkflowManager();
  }
  return workflowManager;
}
