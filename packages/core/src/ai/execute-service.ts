/**
 * Execute Service
 * 
 * Provides a unified interface for both CLI and Web to use the same underlying
 * execution capabilities as the CLI run command.
 * 
 * This service bridges the gap between:
 * 1. CLI's powerful run command (using CloudIntentEngine directly)
 * 2. Web's limited intent parsing (using IntentService)
 * 
 * Key features:
 * - Full CloudIntentEngine capabilities for both CLI and Web
 * - Automatic server management and connection
 * - Complete workflow execution with tracking
 * - Support for natural language, JSON files, and named workflows
 */

import { CloudIntentEngine } from './cloud-intent-engine';
import { InteractiveSessionManager, InteractiveSession, UserFeedbackResponse, UserGuidanceMessage } from './interactive-session-manager';
import { getToolRegistry } from '../tool-registry/registry';
import { getProcessManager } from '../process-manager/manager';
import { getRegistryClient } from '../registry/client';
import { getWorkflowManager } from '../workflow/manager';
import { WorkflowEngine } from '../workflow/engine';
import { AutoStartManager } from '../utils/auto-start-manager';
import { getAIConfig } from '../utils/config';
import { createCloudIntentEngine } from '../utils/cloud-intent-engine-factory';
import { MCPClient } from '../mcp/client';
import { logger } from '../core/logger';
import type { AIConfig } from '../core/types';
import type { WorkflowStep } from '../workflow/types';

// Server connection info
interface ConnectedServer {
  name: string;
  client: MCPClient;
}

// Execution options
export interface UnifiedExecutionOptions {
  autoStart?: boolean;
  keepAlive?: boolean;
  silent?: boolean;
  simulate?: boolean;
  params?: Record<string, any>;
}

// Execution result
export interface UnifiedExecutionResult {
  success: boolean;
  result?: any;
  executionSteps?: any[];
  error?: string;
  statistics?: {
    totalSteps: number;
    successfulSteps: number;
    failedSteps: number;
    totalDuration: number;
    averageStepDuration: number;
  };
}

// Workflow execution result
export interface WorkflowExecutionResult {
  success: boolean;
  results?: any;
  error?: string;
}

/**
 * Execute Service
 */
export class ExecuteService {
  private cloudIntentEngine: CloudIntentEngine | null = null;
  private interactiveSessionManager: InteractiveSessionManager;
  private connectedServers: Map<string, ConnectedServer> = new Map();
  private aiConfig: AIConfig | null = null;
  private initPromise: Promise<void> | null = null;

  constructor() {
    logger.debug('[ExecuteService] Creating service instance');
    this.interactiveSessionManager = new InteractiveSessionManager();
  }

  /**
   * Initialize the service with AI configuration
   */
  async initialize(aiConfig?: AIConfig): Promise<void> {
    logger.info('[ExecuteService] Initializing service');
    
    if (!this.initPromise) {
      this.initPromise = (async () => {
        // Use provided AI config or get from system
        this.aiConfig = aiConfig || await getAIConfig();
        
        if (!this.aiConfig.provider || !this.aiConfig.apiKey) {
          throw new Error('AI configuration not set. Please configure AI provider and API key.');
        }

        // Create CloudIntentEngine using the unified factory
        this.cloudIntentEngine = await createCloudIntentEngine({
          aiConfig: this.aiConfig
        });

        logger.debug('[ExecuteService] Service initialized successfully');
      })();
    }

    await this.initPromise;
  }

  /**
   * Execute natural language query (similar to CLI run command)
   */
  async executeNaturalLanguage(
    query: string,
    options: UnifiedExecutionOptions = {}
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing natural language query: "${query.substring(0, 100)}..."`);
    
    try {
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.cloudIntentEngine) {
        throw new Error('CloudIntentEngine not initialized');
      }

      // Handle auto-start if requested
      if (options.autoStart) {
        await this.handleAutoStart(query, options);
      }

      // Connect to running MCP servers or use simulation mode
      if (!options.simulate) {
        await this.connectToRunningServers(options);
      }

      // Get available tools and set them in the engine
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // Create tool executor
      const toolExecutor = this.createToolExecutor();

      // Parse and execute the workflow
      const plan = await this.cloudIntentEngine.parseAndPlan(query);
      
      const result = await this.cloudIntentEngine.executeWorkflowWithTracking(
        plan.parsedIntents,
        plan.toolSelections,
        plan.dependencies,
        toolExecutor
      );

      // Cleanup if not keeping connection alive
      if (!options.keepAlive) {
        await this.cleanupConnections();
      }

      return {
        success: result.success,
        result: result.finalResult,
        executionSteps: result.executionSteps,
        statistics: result.statistics,
        error: result.success ? undefined : result.finalResult
      };

    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute natural language query: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute workflow from JSON file
   */
  async executeWorkflowFromFile(
    filePath: string,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {}
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[ExecuteService] Executing workflow from file: ${filePath}`);
    
    try {
      const fs = await import('fs/promises');
      const data = await fs.readFile(filePath, 'utf-8');
      const workflow = JSON.parse(data);
      
      return await this.executeWorkflow(workflow, params, options);
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute workflow from file: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute named workflow
   */
  async executeNamedWorkflow(
    workflowName: string,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {}
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[ExecuteService] Executing named workflow: "${workflowName}"`);
    
    try {
      const workflowManager = getWorkflowManager();
      
      if (!await workflowManager.exists(workflowName)) {
        throw new Error(`Workflow "${workflowName}" not found`);
      }
      
      const workflow = await workflowManager.load(workflowName);
      return await this.executeWorkflow(workflow, params, options);
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute named workflow: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Execute workflow object
   */
  async executeWorkflow(
    workflow: any,
    params: Record<string, any> = {},
    options: UnifiedExecutionOptions = {}
  ): Promise<WorkflowExecutionResult> {
    logger.info(`[ExecuteService] Executing workflow: ${workflow.name || 'unnamed'}`);
    
    try {
      const workflowEngine = new WorkflowEngine();
      
      // Handle auto-start if requested
      if (options.autoStart) {
        await this.ensureServersForWorkflow(workflow, options);
      }

      // Connect to running servers if not in simulation mode
      if (!options.simulate) {
        await this.connectToRunningServers(options);
      }

      // Execute the workflow
      const results = await workflowEngine.execute(workflow, params);

      // Cleanup if not keeping connection alive
      if (!options.keepAlive) {
        await this.cleanupConnections();
      }

      return {
        success: true,
        results
      };
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute workflow: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Parse intent and return workflow steps (for Web UI)
   * 
   * Now connects to running MCP servers to get tools, ensuring consistency
   * with executeNaturalLanguage and executeSteps methods.
   */
  async parseIntent(
    intent: string,
    context?: any
  ): Promise<{
    steps: WorkflowStep[];
    status: 'success' | 'capability_missing' | 'partial';
    confidence?: number;
    explanation?: string;
  }> {
    logger.info(`[ExecuteService] Parsing intent: "${intent.substring(0, 100)}..."`);
    
    try {
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.cloudIntentEngine) {
        throw new Error('CloudIntentEngine not initialized');
      }

      // First try to connect to running MCP servers (same as executeNaturalLanguage)
      await this.connectToRunningServers({ silent: true });
      
      // Get tools from connected servers first (same source as executeNaturalLanguage)
      let tools = await this.getAvailableTools();
      
      // If no connected servers, fallback to tool registry
      if (tools.length === 0) {
        console.log('[ExecuteService] No connected servers, falling back to tool registry for parseIntent');
        const toolRegistry = getToolRegistry();
        await toolRegistry.load();
        
        // Inject ToolRegistry for enhanced searching capabilities
        if (this.cloudIntentEngine.setToolRegistry) {
          this.cloudIntentEngine.setToolRegistry(toolRegistry as any);
        }
        
        const allTools = await toolRegistry.getAllTools();
        
        if (allTools.length === 0) {
          return {
            steps: [],
            status: 'capability_missing',
            confidence: 0,
            explanation: 'No MCP tools available. Please start some MCP servers first.'
          };
        }

        // Convert tools to CloudIntentEngine format
        tools = allTools.map((toolMetadata: any) => {
          const tool = toolMetadata.tool || toolMetadata;
          
          let inputSchema = tool.inputSchema;
          if (!inputSchema || !inputSchema.properties) {
            inputSchema = {
              type: 'object' as const,
              properties: tool.parameters || {},
              required: Object.entries(tool.parameters || {})
                .filter(([_, schema]: [string, any]) => schema.required)
                .map(([name]) => name)
            };
          }
          
          if (typeof inputSchema.properties !== 'object' || inputSchema.properties === null) {
            inputSchema.properties = {};
          }
          
          return {
            name: tool.name,
            description: tool.description,
            inputSchema,
            examples: tool.examples || undefined,
          };
        });
      }

      // Set available tools
      this.cloudIntentEngine.setAvailableTools(tools);

      // Parse and plan
      console.log(`[ExecuteService] Calling cloudIntentEngine.parseAndPlan for intent: "${intent}"`);
      const plan = await this.cloudIntentEngine.parseAndPlan(intent);
      console.log(`[ExecuteService] parseAndPlan returned plan with ${plan.parsedIntents.length} intents and ${plan.toolSelections?.length || 0} tool selections`);

      // Convert to workflow steps
      const steps: WorkflowStep[] = [];
      for (const atomicIntent of plan.parsedIntents) {
        const toolSelection = plan.toolSelections?.find(
          (selection: any) => selection.intentId === atomicIntent.id
        );

        if (toolSelection && toolSelection.toolName) {
          const serverId = await this.extractServerId(toolSelection.toolName, context);
          const step: WorkflowStep = {
            id: `step_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            type: 'tool',
            serverId: serverId,
            toolName: toolSelection.toolName,
            parameters: toolSelection.mappedParameters || atomicIntent.parameters
          };
          
          steps.push(step);
        }
      }

      const status = steps.length > 0 ? 'success' : 'partial';
      const confidence = this.calculateConfidence(plan);
      const explanation = this.generateExplanation(plan, tools.length);

      return {
        steps,
        status,
        confidence,
        explanation
      };

    } catch (error: any) {
      console.log(`[ExecuteService] Caught error in parseIntent: ${error.message}`);
      console.log(`[ExecuteService] Error stack: ${error.stack}`);
      logger.error(`[ExecuteService] Failed to parse intent: ${error.message}`);
      return {
        steps: [],
        status: 'capability_missing',
        confidence: 0,
        explanation: `Failed to parse intent: ${error.message}`
      };
    }
  }

  /**
   * Execute pre-parsed workflow steps directly (for Web UI)
   * 
   * This method takes already-parsed steps (from parseIntent) and executes them
   * without re-parsing the intent. This ensures the executed steps are exactly
   * the same as what the user saw in the preview.
   * 
   * This is the key method that bridges the gap between Web UI and CLI:
   * - CLI: executeNaturalLanguage (parse + execute in one call)
   * - Web: parseIntent (preview) → executeSteps (execute without re-parsing)
   */
  async executeSteps(
    steps: WorkflowStep[],
    options: UnifiedExecutionOptions = {}
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing ${steps.length} pre-parsed steps`);
    
    try {
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.cloudIntentEngine) {
        throw new Error('CloudIntentEngine not initialized');
      }

      // Handle auto-start if requested
      // For pre-parsed steps, we use the tool names to infer required servers
      if (options.autoStart) {
        logger.debug('[ExecuteService] Auto-start requested for pre-parsed steps, inferring servers from tool names...');
        const toolNames = steps.map(s => s.toolName).filter(Boolean);
        if (toolNames.length > 0) {
          await this.handleAutoStartForTools(toolNames, options);
        }
      }

      // Connect to running MCP servers

      if (!options.simulate) {
        await this.connectToRunningServers(options);
      }

      // Get available tools and set them in the engine
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);

      // Create tool executor
      const toolExecutor = this.createToolExecutor();

      // Convert steps to parsedIntents format for executeWorkflowWithTracking
      const parsedIntents = steps.map((step, index) => ({
        id: `A${index + 1}`,
        type: step.toolName,
        description: `Execute ${step.toolName}`,
        parameters: step.parameters || {},
      }));

      // Create tool selections from steps
      const toolSelections = steps.map((step, index) => ({
        intentId: `A${index + 1}`,
        toolName: step.toolName,
        toolDescription: `Execute ${step.toolName}`,
        mappedParameters: step.parameters || {},
        confidence: 1.0,
      }));

      // Execute the workflow with tracking
      const result = await this.cloudIntentEngine.executeWorkflowWithTracking(
        parsedIntents,
        toolSelections,
        [], // No dependencies for pre-parsed steps
        toolExecutor
      );

      // Cleanup if not keeping connection alive
      if (!options.keepAlive) {
        await this.cleanupConnections();
      }

      // Simplify the response: only return the final result and statistics
      // executionSteps contain duplicate information that is not needed by the user
      const errorMessage = result.success 
        ? undefined 
        : (result.finalResult || `Execution completed with ${result.statistics?.failedSteps || 0} failed step(s) out of ${result.statistics?.totalSteps || 0} total step(s)`);
      
      return {
        success: result.success,
        result: result.finalResult,
        statistics: result.statistics,
        error: errorMessage
      };

    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute steps: ${error.message}`);
      return {
        success: false,
        error: error.message
      };
    }
  }


  /**
   * Start an interactive session for intent parsing
   */
  async startInteractiveSession(
    query: string,
    userId?: string,
  ): Promise<{
    sessionId: string;
    guidance?: UserGuidanceMessage;
    session: InteractiveSession;
  }> {
    logger.info(`[ExecuteService] Starting interactive session for query: "${query.substring(0, 100)}..."`);
    
    try {
      // Create session
      const session = this.interactiveSessionManager.createSession(query, userId);
      
      // Update session state
      this.interactiveSessionManager.updateSessionState(session.sessionId, 'parsing');
      
      // Parse intent
      const parseResult = await this.parseIntent(query);
      
      // Get available tools for validation
      const toolRegistry = getToolRegistry();
      await toolRegistry.load();
      const allTools = await toolRegistry.getAllTools();
      
      // Update session with parsing results
      if (parseResult.steps.length > 0) {
        // Convert steps to tool selections format
        const toolSelections = parseResult.steps.map(step => ({
          intentId: step.id,
          toolName: step.toolName,
          toolDescription: '',
          mappedParameters: step.parameters,
          confidence: parseResult.confidence || 0.5,
        }));
        
        this.interactiveSessionManager.updateParsingResults(
          session.sessionId,
          [], // We don't have AtomicIntent objects here
          toolSelections,
          parseResult.confidence || 0.5,
        );
        
        // Analyze missing parameters - convert ToolMetadata to Tool format
        const missingParams = this.interactiveSessionManager.analyzeMissingParameters(
          session.sessionId,
          allTools.map(t => ({
            name: t.name,
            description: t.description,
            inputSchema: {
              type: 'object' as const,
              properties: t.parameters || {},
              required: Object.entries(t.parameters || {})
                .filter(([_, schema]: [string, any]) => schema.required)
                .map(([name]) => name)
            },
          })),
        );
        
        if (missingParams.length > 0) {
          this.interactiveSessionManager.updateSessionState(session.sessionId, 'awaiting_feedback');
        } else {
          this.interactiveSessionManager.updateSessionState(session.sessionId, 'validating');
        }
      } else {
        this.interactiveSessionManager.updateSessionState(session.sessionId, 'awaiting_feedback');
      }
      
      // Generate guidance
      const guidance = this.interactiveSessionManager.generateUserGuidance(session.sessionId);
      
      return {
        sessionId: session.sessionId,
        guidance: guidance || undefined,
        session: this.interactiveSessionManager.getSession(session.sessionId)!,
      };
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to start interactive session: ${error.message}`);
      throw error;
    }
  }

  /**
   * Process user feedback in interactive session
   */
  async processInteractiveFeedback(
    sessionId: string,
    response: UserFeedbackResponse,
  ): Promise<{
    success: boolean;
    guidance?: UserGuidanceMessage;
    session?: InteractiveSession;
    readyForExecution?: boolean;
  }> {
    logger.info(`[ExecuteService] Processing feedback for session ${sessionId}`);
    
    try {
      // Process feedback
      const result = this.interactiveSessionManager.processUserFeedback(sessionId, response);
      
      if (!result.success) {
        return { success: false };
      }
      
      // If user provided clarification, re-parse
      if (response.type === 'clarification' && response.clarification) {
        const session = result.session!;
        
        // Re-parse with clarified query
        const parseResult = await this.parseIntent(response.clarification);
        
        // Get available tools
        const toolRegistry = getToolRegistry();
        await toolRegistry.load();
        const allTools = await toolRegistry.getAllTools();
        
        if (parseResult.steps.length > 0) {
          // Update tool selections
          const toolSelections = parseResult.steps.map(step => ({
            intentId: step.id,
            toolName: step.toolName,
            toolDescription: '',
            mappedParameters: step.parameters,
            confidence: parseResult.confidence || 0.5,
          }));
          
          this.interactiveSessionManager.updateParsingResults(
            sessionId,
            [],
            toolSelections,
            parseResult.confidence || 0.5,
          );
          
          // Re-analyze missing parameters - convert ToolMetadata to Tool format
          this.interactiveSessionManager.analyzeMissingParameters(
            sessionId,
            allTools.map(t => ({
              name: t.name,
              description: t.description,
              inputSchema: {
                type: 'object' as const,
                properties: t.parameters || {},
                required: Object.entries(t.parameters || {})
                  .filter(([_, schema]: [string, any]) => schema.required)
                  .map(([name]) => name)
              },
            })),
          );
        }
      }
      
      // Check if ready for execution
      const session = this.interactiveSessionManager.getSession(sessionId);
      const readyForExecution = session && 
        session.state === 'validating' && 
        session.missingParameters.length === 0;
      
      return {
        success: true,
        guidance: result.nextGuidance,
        session: result.session,
        readyForExecution,
      };
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to process interactive feedback: ${error.message}`);
      return { success: false };
    }
  }

  /**
   * Execute interactive session workflow
   */
  async executeInteractiveSession(
    sessionId: string,
    options: UnifiedExecutionOptions = {},
  ): Promise<UnifiedExecutionResult> {
    logger.info(`[ExecuteService] Executing interactive session ${sessionId}`);
    
    try {
      const session = this.interactiveSessionManager.getSession(sessionId);
      if (!session) {
        throw new Error(`Session ${sessionId} not found`);
      }
      
      if (session.state !== 'validating' || session.missingParameters.length > 0) {
        throw new Error('Session not ready for execution');
      }
      
      if (!session.toolSelections || session.toolSelections.length === 0) {
        throw new Error('No tool selections available for execution');
      }
      
      // Update session state
      this.interactiveSessionManager.updateSessionState(sessionId, 'executing');
      
      // Ensure service is initialized
      await this.initialize();
      
      if (!this.cloudIntentEngine) {
        throw new Error('CloudIntentEngine not initialized');
      }
      
      // Handle auto-start if requested
      if (options.autoStart) {
        await this.handleAutoStart(session.originalQuery, options);
      }
      
      // Connect to running servers
      if (!options.simulate) {
        await this.connectToRunningServers(options);
      }
      
      // Get available tools
      const tools = await this.getAvailableTools();
      this.cloudIntentEngine.setAvailableTools(tools);
      
      // Create tool executor
      const toolExecutor = this.createToolExecutor();
      
      // Create workflow from tool selections
      const parsedIntents = session.toolSelections.map((selection, index) => ({
        id: `A${index + 1}`,
        type: selection.toolName,
        description: `Execute ${selection.toolName}`,
        parameters: selection.mappedParameters,
      }));
      
      const dependencies: any[] = [];
      
      // Execute workflow
      const result = await this.cloudIntentEngine.executeWorkflowWithTracking(
        parsedIntents,
        session.toolSelections,
        dependencies,
        toolExecutor,
      );
      
      // Update session with result
      this.interactiveSessionManager.updateExecutionResult(
        sessionId,
        result.finalResult,
        result.success ? undefined : result.finalResult,
      );
      
      // Cleanup if not keeping connection alive
      if (!options.keepAlive) {
        await this.cleanupConnections();
      }
      
      return {
        success: result.success,
        result: result.finalResult,
        executionSteps: result.executionSteps,
        statistics: result.statistics,
        error: result.success ? undefined : result.finalResult,
      };
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to execute interactive session: ${error.message}`);
      
      // Update session with error
      this.interactiveSessionManager.updateExecutionResult(sessionId, null, error.message);
      
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * Get interactive session by ID
   */
  getInteractiveSession(sessionId: string): InteractiveSession | undefined {
    return this.interactiveSessionManager.getSession(sessionId);
  }

  /**
   * Get all active interactive sessions
   */
  getActiveInteractiveSessions(): InteractiveSession[] {
    return this.interactiveSessionManager.getActiveSessions();
  }

  /**
   * Clean up old interactive sessions
   */
  cleanupInteractiveSessions(maxAgeMs: number = 3600000): number {
    return this.interactiveSessionManager.cleanupOldSessions(maxAgeMs);
  }

  // ==================== Private Methods ====================

  private async handleAutoStart(query: string, options: UnifiedExecutionOptions): Promise<void> {
    if (!options.autoStart) return;
    
    logger.debug('[ExecuteService] Handling auto-start');
    
    const autoStartManager = new AutoStartManager();
    const requiredServers = await autoStartManager.analyzeIntentForServers(query);
    
    if (requiredServers.length > 0) {
      const results = await autoStartManager.ensureServersRunning(requiredServers);
      
      if (!autoStartManager.areAllServersReady(results)) {
        throw new Error('Some required servers failed to start');
      }
      
      logger.debug(`[ExecuteService] Auto-started ${requiredServers.length} servers`);
    }
  }

  /**
   * Handle auto-start for pre-parsed steps by inferring required servers from tool names.
   * Uses the tool registry to find which server provides each tool.
   */
  private async handleAutoStartForTools(toolNames: string[], options: UnifiedExecutionOptions): Promise<void> {
    if (!options.autoStart || toolNames.length === 0) return;
    
    logger.debug(`[ExecuteService] Handling auto-start for tools: ${toolNames.join(', ')}`);
    
    try {
      const toolRegistry = getToolRegistry();
      await toolRegistry.load();
      
      // Find which servers provide these tools
      const requiredServers = new Set<string>();
      const allTools = await toolRegistry.getAllTools();
      
      for (const toolName of toolNames) {
        const toolMetadata = allTools.find((t: any) => 
          t.name === toolName || (t.tool && t.tool.name === toolName)
        );
        
        if (toolMetadata) {
          const serverName = toolMetadata.serverName || (toolMetadata as any).server;
          if (serverName) {
            requiredServers.add(serverName);
          }
        }

      }
      
      if (requiredServers.size > 0) {
        logger.debug(`[ExecuteService] Required servers for tools: ${Array.from(requiredServers).join(', ')}`);
        const autoStartManager = new AutoStartManager();
        const results = await autoStartManager.ensureServersRunning(Array.from(requiredServers));
        
        if (!autoStartManager.areAllServersReady(results)) {
          logger.warn('[ExecuteService] Some required servers failed to start, continuing anyway...');
        } else {
          logger.debug(`[ExecuteService] Auto-started ${requiredServers.size} servers for tools`);
        }
      } else {
        logger.debug('[ExecuteService] Could not determine required servers from tool names, skipping auto-start');
      }
    } catch (error: any) {
      logger.warn(`[ExecuteService] Failed to auto-start servers for tools: ${error.message}`);
      // Don't throw - let execution continue with whatever servers are available
    }
  }


  private async connectToRunningServers(options: UnifiedExecutionOptions): Promise<void> {
    const processManager = getProcessManager();
    const runningServers = await processManager.listRunning();
    
    if (runningServers.length === 0) {
      logger.warn('[ExecuteService] No running MCP servers found');
      return;
    }
    
    logger.debug(`[ExecuteService] Connecting to ${runningServers.length} running servers`);
    
    for (const server of runningServers) {
      try {
        const registryClient = getRegistryClient();
        let manifest = await registryClient.getCachedManifest(server.serverName);
        
        // If manifest is not cached, try to fetch it
        if (!manifest) {
          logger.debug(`[ExecuteService] Manifest not cached for ${server.serverName}, fetching...`);
          try {
            manifest = await registryClient.fetchManifest(server.serverName);
          } catch (fetchError: any) {
            logger.warn(`[ExecuteService] Failed to fetch manifest for ${server.serverName}: ${fetchError.message}`);
            continue;
          }
        }
        
        if (manifest) {
          await this.connectToServer(server.serverName, manifest);
        }
      } catch (error: any) {
        logger.warn(`[ExecuteService] Failed to connect to ${server.serverName}: ${error.message}`);
      }

    }
  }




  private async connectToServer(serverName: string, manifest: any): Promise<void> {
    if (this.connectedServers.has(serverName)) {
      return; // Already connected
    }
    
    try {
      const client = new MCPClient({
        transport: {
          type: 'stdio' as const,
          command: manifest.runtime.command,
          args: manifest.runtime.args || [],
          env: { ...process.env } as Record<string, string>
        }
      });

      await client.connect();
      
      this.connectedServers.set(serverName, {
        name: serverName,
        client
      });
      
      logger.debug(`[ExecuteService] Connected to server: ${serverName}`);
    } catch (error: any) {
      logger.error(`[ExecuteService] Failed to connect to server ${serverName}: ${error.message}`);
      throw error;
    }
  }

  private async getAvailableTools(): Promise<any[]> {
    const tools: any[] = [];
    const TOOL_LIST_TIMEOUT = 15000; // 15 seconds timeout per server
    
    for (const [name, server] of this.connectedServers) {
      try {
        // Add timeout to prevent one slow server from blocking all others
        const serverTools = await Promise.race([
          server.client.listTools(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Request timeout after 15000ms')), TOOL_LIST_TIMEOUT)
          )
        ]);
        tools.push(...serverTools.map((tool: any) => ({
          ...tool,
          serverName: name
        })));
      } catch (error: any) {
        logger.warn(`[ExecuteService] Failed to list tools for server ${name}: ${error.message}`);
        // Continue with other servers - don't let one slow server block everything
      }
    }
    
    return tools;
  }

  private createToolExecutor(): (toolName: string, params: Record<string, any>) => Promise<any> {
    return async (toolName: string, params: Record<string, any>): Promise<any> => {
      // Find which server has this tool
      for (const [serverName, server] of this.connectedServers) {
        const serverTools = await server.client.listTools();
        const tool = serverTools.find((t: any) => t.name === toolName);
        
        if (tool) {
          logger.info(`[ExecuteService] Calling tool ${toolName} on server ${serverName}`);
          return await server.client.callTool(toolName, params);
        }
      }
      
      throw new Error(`Tool ${toolName} not found in any connected server`);
    };
  }

  private async ensureServersForWorkflow(workflow: any, options: UnifiedExecutionOptions): Promise<void> {
    const requiredServers = new Set<string>();
    
    for (const step of workflow.steps || []) {
      if (step.serverId || step.serverName) {
        requiredServers.add(step.serverId || step.serverName);
      }
    }
    
    if (requiredServers.size > 0) {
      const autoStartManager = new AutoStartManager();
      const results = await autoStartManager.ensureServersRunning(Array.from(requiredServers));
      
      if (!autoStartManager.areAllServersReady(results)) {
        throw new Error('Some required servers failed to start');
      }
    }
  }

  private async cleanupConnections(): Promise<void> {
    logger.debug('[ExecuteService] Cleaning up connections');
    
    const disconnectPromises: Promise<void>[] = [];
    for (const [name] of this.connectedServers) {
      disconnectPromises.push(this.disconnectServer(name));
    }
    
    await Promise.allSettled(disconnectPromises);
    this.connectedServers.clear();
  }

  private async disconnectServer(serverName: string): Promise<void> {
    const server = this.connectedServers.get(serverName);
    if (server) {
      try {
        await server.client.disconnect();
        logger.debug(`[ExecuteService] Disconnected from server: ${serverName}`);
      } catch (error: any) {
        logger.error(`[ExecuteService] Failed to disconnect from server ${serverName}: ${error.message}`);
      }
    }
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
    // Priority 1: Try to find the server from connected servers (most accurate)
    // The connectedServers map has the actual server names used for execution
    for (const [serverName, server] of this.connectedServers) {
      try {
        const serverTools = await server.client.listTools();
        const hasTool = serverTools.some((t: any) => t.name === toolName);
        if (hasTool) {
          const normalizedName = this.normalizeServerName(serverName);
          logger.debug(`[ExecuteService] Found tool "${toolName}" on connected server: ${serverName} -> normalized: ${normalizedName}`);
          return normalizedName;
        }
      } catch {
        // Skip servers that fail to list tools
        continue;
      }
    }
    
    // Priority 2: Try to get server name from tool registry
    try {
      const toolRegistry = getToolRegistry();
      const allTools = await toolRegistry.getAllTools();
      const toolMetadata = allTools.find((tool: any) => tool.name === toolName);
      
      if (toolMetadata) {
        // Prefer actualServerName if available (clean name for execution)
        if (toolMetadata.actualServerName) {
          const normalizedName = this.normalizeServerName(toolMetadata.actualServerName);
          logger.debug(`[ExecuteService] Found tool "${toolName}" in registry with actualServerName: ${normalizedName}`);
          return normalizedName;
        }
        if (toolMetadata.serverName) {
          const normalizedName = this.normalizeServerName(toolMetadata.serverName);
          logger.debug(`[ExecuteService] Found tool "${toolName}" in registry with serverName: ${normalizedName}`);
          return normalizedName;
        }
      }
    } catch (error) {
      logger.warn(`[ExecuteService] Failed to get server from registry for tool "${toolName}":`, error);
    }
    
    // Priority 3: Fallback to context
    if (context?.availableServers && context.availableServers.length > 0) {
      return context.availableServers[0];
    }
    
    // Priority 4: Last resort fallback
    logger.warn(`[ExecuteService] Could not determine server for tool "${toolName}", using "generic-service" as fallback`);
    return 'generic-service';
  }

  private calculateConfidence(plan: any): number {
    if (!plan || !plan.parsedIntents || plan.parsedIntents.length === 0) {
      return 0;
    }
    
    let confidence = 0.5;
    confidence += plan.parsedIntents.length * 0.1;
    
    if (plan.toolSelections && plan.toolSelections.length > 0) {
      confidence += 0.2;
    }
    
    return Math.min(confidence, 0.95);
  }

  private generateExplanation(plan: any, toolCount: number): string {
    if (!plan || !plan.parsedIntents || plan.parsedIntents.length === 0) {
      return 'Unable to parse intent. Please try rephrasing your request.';
    }
    
    const intentCount = plan.parsedIntents.length;
    const toolSelectionCount = plan.toolSelections?.length || 0;
    
    let explanation = `Parsed ${intentCount} intent${intentCount > 1 ? 's' : ''} `;
    explanation += `from ${toolCount} available tool${toolCount > 1 ? 's' : ''}. `;
    
    if (toolSelectionCount > 0) {
      explanation += `Selected ${toolSelectionCount} tool${toolSelectionCount > 1 ? 's' : ''} for execution.`;
    } else {
      explanation += 'No specific tools selected. Using generic execution.';
    }
    
    return explanation;
  }
}

// Singleton instance for easy access
let unifiedExecutionServiceInstance: ExecuteService | null = null;

export function getExecuteService(): ExecuteService {
  if (!unifiedExecutionServiceInstance) {
    unifiedExecutionServiceInstance = new ExecuteService();
  }
  return unifiedExecutionServiceInstance;
}

export function createExecuteService(): ExecuteService {
  return new ExecuteService();
}