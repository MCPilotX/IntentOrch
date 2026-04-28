import { logger } from "../core/logger";
/**
 * Uses local CloudIntentEngine for LLM-driven intent parsing
 */

import { CloudIntentEngine } from './cloud-intent-engine';
import { getToolRegistry } from '../tool-registry/registry';
import type { WorkflowStep } from '../workflow/types';
import type { AIConfig } from '../utils/config';
import { createCloudIntentEngine } from '../utils/cloud-intent-engine-factory';
import { ParameterPostProcessor } from './parameter-post-processor';

export interface IntentParseRequest {
  intent: string;
  context?: {
    previousSteps?: any[];
    availableServers?: string[];
    userPreferences?: Record<string, any>;
  };
}

export interface IntentParseResponse {
  success: boolean;
  data?: {
    steps: WorkflowStep[];
    status: 'success' | 'capability_missing' | 'partial';
    confidence?: number;
    explanation?: string;
  };
  error?: string;
}

export class IntentService {
  private cloudIntentEngine: CloudIntentEngine;
  private toolRegistry: any;
  private aiConfig: AIConfig;
  private initPromise: Promise<void> | null = null;
  
  constructor(aiConfig?: AIConfig) {
    // Use provided AI config or load from environment variables as fallback
    this.aiConfig = aiConfig || this.loadConfigFromEnvironment();
    
    // Initialize CloudIntentEngine using the unified factory
    // Note: We'll create the engine in parseIntent to handle async initialization
    this.cloudIntentEngine = null as any; // Will be initialized in parseIntent
    
    // Get the tool registry instance
    this.toolRegistry = getToolRegistry();
  }
  
  /**
   * Load AI configuration from environment variables (fallback method)
   */
  private loadConfigFromEnvironment(): AIConfig {
    return {
      provider: process.env.LLM_PROVIDER as any || 'none',
      apiKey: process.env.LLM_API_KEY,
      model: process.env.LLM_MODEL || 'none'
    };
  }
  
  /**
   * Initialize the CloudIntentEngine if not already initialized
   */
  private async initializeEngine(): Promise<void> {
    if (!this.cloudIntentEngine) {
      // Create CloudIntentEngine using the unified factory
      this.cloudIntentEngine = await createCloudIntentEngine({
        aiConfig: this.aiConfig
      });
      
      logger.info('[IntentService] CloudIntentEngine initialized');
    }
  }
  
  async parseIntent(request: IntentParseRequest): Promise<IntentParseResponse> {
    const { intent, context } = request;
    
    try {
      logger.info(`[IntentService] Parsing intent: "${intent}"`);
      
      // Initialize if needed
      if (!this.initPromise) {
        this.initPromise = (async () => {
          if (this.aiConfig.apiKey) {
            logger.info(`[IntentService] Configuring AI with provider: ${this.aiConfig.provider || 'openai'}, model: ${this.aiConfig.model || 'gpt-3.5-turbo'}`);
          }
          await this.toolRegistry.load();
          
          // Initialize the CloudIntentEngine
          await this.initializeEngine();
        })();
      }
      
      await this.initPromise;
      
      // Get all available tools from the registry
      const allTools = await this.toolRegistry.getAllTools();
      
      // Convert ToolMetadata to the format expected by @mcpilotx/core
      const tools = allTools.map((toolMetadata: any) => ({
        name: toolMetadata.name,
        description: toolMetadata.description,
        inputSchema: {
          type: 'object',
          properties: toolMetadata.parameters || {},
          required: Object.entries(toolMetadata.parameters || {})
            .filter(([_, schema]: [string, any]) => schema.required)
            .map(([name]) => name)
        },
        examples: toolMetadata.examples || undefined,
      }));
      
      if (tools.length === 0) {
        return {
          success: true,
          data: {
            steps: [],
            status: 'capability_missing',
            confidence: 0,
            explanation: 'No MCP tools available. Please start some MCP servers first.'
          }
        };
      }
      
      logger.info(`[IntentService] Found ${tools.length} available tools`);
      
      // Set available tools for the intent engine
      this.cloudIntentEngine.setAvailableTools(tools);
      
      // Parse and plan the intent using CloudIntentEngine (Plan → Confirm → Execute pipeline)
      logger.info('[IntentService] Calling planQuery...');
      const plan = await this.cloudIntentEngine.planQuery(intent);
      
      // Convert the plan to workflow steps
      const steps = await this.convertToWorkflowSteps(plan, context);
      
      return {
        success: true,
        data: {
          steps,
          status: steps.length > 0 ? 'success' : 'partial',
          confidence: this.calculateConfidence(plan),
          explanation: this.generateExplanation(plan, tools.length)
        }
      };
      
    } catch (error: any) {
      logger.error('[IntentService] Error parsing intent:', error);
      return {
        success: false,
        error: `Failed to parse intent: ${error.message}`
      };
    }
  }
  
  private async convertToWorkflowSteps(plan: any, context?: any): Promise<WorkflowStep[]> {
    const steps: WorkflowStep[] = [];
    
    if (!plan || !plan.steps || plan.steps.length === 0) {
      return steps;
    }
    
    for (const planStep of plan.steps) {
      const stepId = `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      
      if (planStep.toolName) {
        const serverId = await this.extractServerId(planStep.toolName, context);
        const step: WorkflowStep = {
          id: stepId,
          type: 'tool',
          serverId: serverId,
          toolName: planStep.toolName,
          parameters: await this.adaptParameters(planStep.arguments || {}, { name: planStep.toolName })
        };
        
        steps.push(step);
      }
    }
    
    return steps;
  }
  
  /**
   * Normalize server name to owner/project format.
   * Handles various formats:
   * - URL: https://gitee.com/owner/project/... -> owner/project
   * - owner/project -> owner/project
   * - github:owner/project -> owner/project
   */
  private normalizeServerName(serverName: string): string {
    // Try to extract owner/project from URL format
    // e.g., https://gitee.com/mcpilotx/mcp-server-hub/raw/master/modelcontextprotocol/server-filesystem/mcp.json
    // -> modelcontextprotocol/server-filesystem
    const urlMatch = serverName.match(/https?:\/\/[^\/]+\/([^\/]+)\/([^\/]+)/);
    if (urlMatch) {
      return `${urlMatch[1]}/${urlMatch[2]}`;
    }
    
    // Remove protocol prefixes (github:, gitee:, gitlab:)
    let normalized = serverName.replace(/^(github:|gitee:|gitlab:)/, '');
    
    // If it already looks like owner/project, return as is
    if (normalized.includes('/')) {
      return normalized;
    }
    
    // Fallback: return as is
    return normalized;
  }

  private async extractServerId(toolName: string, context?: any): Promise<string> {
    try {
      const allTools = await this.toolRegistry.getAllTools();
      if (allTools && Array.isArray(allTools)) {
        const toolMetadata = allTools.find((tool: any) => tool.name === toolName);
        if (toolMetadata) {
          // Prefer actualServerName if available (clean name for execution)
          if (toolMetadata.actualServerName) {
            return this.normalizeServerName(toolMetadata.actualServerName);
          }
          if (toolMetadata.serverName) {
            return this.normalizeServerName(toolMetadata.serverName);
          }
        }
      }
    } catch (error) {
      logger.warn(`[IntentService] Failed to get server from registry for tool "${toolName}":`, error);
    }
    
    if (context?.availableServers && context.availableServers.length > 0) {
      for (const server of context.availableServers) {
        if (toolName.includes(server) || server.includes(toolName.split('.')[0])) {
          return this.normalizeServerName(server);
        }
      }
      return this.normalizeServerName(context.availableServers[0]);
    }
    
    return 'generic-service';
  }
  
  private async adaptParameters(intentParams: Record<string, any>, tool: any): Promise<Record<string, any>> {
    const toolName = tool.name || '';
    const adapted: Record<string, any> = {};
    
    try {
      const allTools = await this.toolRegistry.getAllTools();
      const toolMetadata = allTools.find((t: any) => t.name === toolName);
      
      if (toolMetadata && toolMetadata.parameters) {
        const actualSchema = toolMetadata.parameters;
        const actualParamNames = Object.keys(actualSchema);
        
        for (const [intentKey, intentValue] of Object.entries(intentParams)) {
          // 1. Direct match
          if (actualSchema[intentKey]) {
            adapted[intentKey] = intentValue;
            continue;
          }
          
          // 2. Normalized match
          let mapped = false;
          const intentKeyLower = intentKey.toLowerCase().replace(/[_-]/g, '');
          for (const schemaKey of actualParamNames) {
            const schemaKeyLower = schemaKey.toLowerCase().replace(/[_-]/g, '');
            if (intentKeyLower === schemaKeyLower) {
              adapted[schemaKey] = intentValue;
              mapped = true;
              break;
            }
          }
          if (mapped) continue;
          
          // 3. Description match
          for (const [schemaKey, paramSchema] of Object.entries(actualSchema)) {
            const paramInfo = paramSchema as any;
            if (paramInfo.description && paramInfo.description.toLowerCase().includes(intentKey.toLowerCase())) {
              adapted[schemaKey] = intentValue;
              mapped = true;
              break;
            }
          }
        }
        
        // Date normalization
        for (const [key, value] of Object.entries(adapted)) {
          if (typeof value === 'string' && (key.toLowerCase().includes('date') || this.looksLikeDate(value))) {
            const normalizedDate = this.normalizeDate(value);
            if (normalizedDate !== value) {
              adapted[key] = normalizedDate;
            }
          }
        }
        
        // Final post-processing with ParameterPostProcessor (Smart extraction)
        const processed = ParameterPostProcessor.process(adapted, { properties: actualSchema });
        logger.info(`[IntentService] Final adapted parameters for ${toolName}:`, JSON.stringify(processed.params));
        return processed.params;
        
      }
      return intentParams;
    } catch (error) {
      return intentParams;
    }
  }
  
  private looksLikeDate(str: string): boolean {
    if (!str || typeof str !== 'string') return false;
    const trimmed = str.trim().toLowerCase();
    const relativeDates = ['today', 'tomorrow', 'yesterday'];
    if (relativeDates.includes(trimmed)) return true;
    return /^\d{4}[-/]\d{1,2}[-/]\d{1,2}/.test(trimmed) || /^\d{1,2}[-/]\d{1,2}/.test(trimmed);
  }
  
  private normalizeDate(dateStr: string): string {
    if (!dateStr) return dateStr;
    const trimmed = dateStr.trim();
    
    // 1. Date formats with separators (e.g., 2024-12-25, 2024/12/25)
    const chineseDateMatch = trimmed.match(/(?:(\d{4})[-/])?(\d{1,2})[-/](\d{1,2})/);
    if (chineseDateMatch) {
      const year = chineseDateMatch[1] ? parseInt(chineseDateMatch[1]) : new Date().getFullYear();
      const month = parseInt(chineseDateMatch[2]);
      const day = parseInt(chineseDateMatch[3]);
      const date = new Date(year, month - 1, day);
      if (!isNaN(date.getTime())) return this.formatDateAsYYYYMMDD(date);
    }

    // 2. Relative dates
    const now = new Date();
    if (trimmed.toLowerCase() === 'today') return this.formatDateAsYYYYMMDD(now);
    if (trimmed.toLowerCase() === 'tomorrow') {
      now.setDate(now.getDate() + 1);
      return this.formatDateAsYYYYMMDD(now);
    }
    
    return trimmed;
  }
  
  private formatDateAsYYYYMMDD(date: Date): string {
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  
  private ensureRequiredParameters(adaptedParams: Record<string, any>, actualSchema: Record<string, any>, toolName: string): void {
    for (const [paramName, paramSchema] of Object.entries(actualSchema)) {
      if ((paramSchema as any).required && !adaptedParams[paramName]) {
        logger.warn(`[IntentService] Missing required parameter: "${paramName}" for tool "${toolName}"`);
      }
    }
  }
  
  private calculateConfidence(plan: any): number {
    if (!plan || !plan.steps || plan.steps.length === 0) return 0;
    let confidence = 0.6;
    if (plan.steps.length > 0) confidence += 0.2;
    return Math.min(confidence, 0.95);
  }
  
  private generateExplanation(plan: any, toolCount: number): string {
    if (!plan || !plan.steps || plan.steps.length === 0) return 'Unable to parse intent.';
    return `Parsed ${plan.steps.length} steps with ${toolCount} tools available.`;
  }
}

let intentServiceInstance: IntentService | null = null;
export function getIntentService(aiConfig?: AIConfig): IntentService {
  if (!intentServiceInstance) intentServiceInstance = new IntentService(aiConfig);
  return intentServiceInstance;
}
