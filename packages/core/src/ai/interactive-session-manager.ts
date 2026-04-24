/**
 * Interactive Session Manager
 * 
 * Manages multi-turn interactive intent parsing sessions with user feedback.
 * Provides session management, parameter validation, and intelligent user guidance.
 */

import { logger } from '../core/logger';
import type { Tool } from '../mcp/types';
import type { AtomicIntent, ToolSelectionResult } from './cloud-intent-engine';

// ==================== Type Definitions ====================

/**
 * Missing parameter information
 */
export interface MissingParameter {
  toolName: string;
  parameterName: string;
  description: string;
  required: boolean;
  currentValue: any;
  suggestions?: string[];
  validationError?: string;
}

/**
 * Session state
 */
export type SessionState = 
  | 'initializing'    // Session created, not yet processed
  | 'parsing'         // Parsing user intent
  | 'validating'      // Validating extracted parameters
  | 'awaiting_feedback' // Waiting for user feedback
  | 'executing'       // Executing workflow
  | 'completed'       // Execution completed successfully
  | 'failed'          // Execution failed
  | 'cancelled';      // User cancelled

/**
 * User feedback response
 */
export interface UserFeedbackResponse {
  type: 'parameter_value' | 'clarification' | 'confirmation' | 'cancellation';
  parameterName?: string;
  value?: any;
  clarification?: string;
  confirmed?: boolean;
  timestamp: Date;
}

/**
 * Interactive session
 */
export interface InteractiveSession {
  // Session identification
  sessionId: string;
  userId?: string;
  
  // Session state
  state: SessionState;
  originalQuery: string;
  currentQuery?: string;
  
  // Parsing results
  parsedIntents?: AtomicIntent[];
  toolSelections?: ToolSelectionResult[];
  missingParameters: MissingParameter[];
  
  // Validation results
  validationResults: Array<{
    toolName: string;
    parameterName: string;
    isValid: boolean;
    message?: string;
    suggestedValue?: any;
  }>;
  
  // Conversation history
  conversationHistory: Array<{
    role: 'user' | 'system' | 'assistant';
    content: string;
    timestamp: Date;
    metadata?: Record<string, any>;
  }>;
  
  // Execution context
  executionResult?: any;
  error?: string;
  
  // Statistics
  confidence: number;
  turnCount: number;
  createdAt: Date;
  updatedAt: Date;
  completedAt?: Date;
}

/**
 * User guidance message
 */
export interface UserGuidanceMessage {
  type: 'parameter_request' | 'clarification_request' | 'confirmation_request' | 'suggestion';
  message: string;
  parameters?: MissingParameter[];
  options?: Array<{
    id: string;
    label: string;
    description?: string;
    value?: any;
  }>;
  requiresResponse: boolean;
  timestamp: Date;
}

/**
 * Session configuration
 */
export interface SessionConfig {
  maxTurns: number;
  timeoutMs: number;
  requireConfirmationThreshold: number;
  enableSuggestions: boolean;
  autoCancelOnTimeout: boolean;
  persistSessions: boolean;
}

// ==================== Main Manager Class ====================

export class InteractiveSessionManager {
  private sessions: Map<string, InteractiveSession> = new Map();
  private config: SessionConfig;
  
  constructor(config?: Partial<SessionConfig>) {
    this.config = {
      maxTurns: 10,
      timeoutMs: 300000, // 5 minutes
      requireConfirmationThreshold: 0.7,
      enableSuggestions: true,
      autoCancelOnTimeout: true,
      persistSessions: true,
      ...config,
    };
  }
  
  /**
   * Create a new interactive session
   */
  createSession(query: string, userId?: string): InteractiveSession {
    const sessionId = this.generateSessionId();
    const now = new Date();
    
    const session: InteractiveSession = {
      sessionId,
      userId,
      state: 'initializing',
      originalQuery: query,
      currentQuery: query,
      missingParameters: [],
      validationResults: [],
      conversationHistory: [
        {
          role: 'user',
          content: query,
          timestamp: now,
          metadata: { isOriginalQuery: true },
        },
      ],
      confidence: 0,
      turnCount: 0,
      createdAt: now,
      updatedAt: now,
    };
    
    this.sessions.set(sessionId, session);
    logger.info(`[InteractiveSessionManager] Created session ${sessionId} for query: "${query.substring(0, 100)}..."`);
    
    return session;
  }
  
  /**
   * Get session by ID
   */
  getSession(sessionId: string): InteractiveSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Update session state
   */
  updateSessionState(sessionId: string, state: SessionState): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found`);
      return false;
    }
    
    session.state = state;
    session.updatedAt = new Date();
    logger.debug(`[InteractiveSessionManager] Session ${sessionId} state updated to ${state}`);
    
    return true;
  }
  
  /**
   * Update parsing results
   */
  updateParsingResults(
    sessionId: string,
    intents: AtomicIntent[],
    toolSelections: ToolSelectionResult[],
    confidence: number,
  ): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found`);
      return false;
    }
    
    session.parsedIntents = intents;
    session.toolSelections = toolSelections;
    session.confidence = confidence;
    session.updatedAt = new Date();
    
    logger.info(`[InteractiveSessionManager] Updated parsing results for session ${sessionId}: ${intents.length} intents, confidence ${confidence}`);
    
    return true;
  }
  
  /**
   * Analyze missing parameters from tool selections
   */
  analyzeMissingParameters(
    sessionId: string,
    tools: Tool[],
  ): MissingParameter[] {
    const session = this.sessions.get(sessionId);
    if (!session || !session.toolSelections) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found or no tool selections`);
      return [];
    }
    
    const missingParams: MissingParameter[] = [];
    
    for (const toolSelection of session.toolSelections) {
      const tool = tools.find(t => t.name === toolSelection.toolName);
      if (!tool || !tool.inputSchema) {
        continue;
      }
      
      const schema = tool.inputSchema;
      const properties = schema.properties || {};
      const required = schema.required || [];
      
      for (const paramName of required) {
        const paramSchema = properties[paramName];
        if (!paramSchema) {
          continue;
        }
        
        const currentValue = toolSelection.mappedParameters[paramName];
        const isMissing = currentValue === null || currentValue === undefined || currentValue === '';
        
        if (isMissing) {
          missingParams.push({
            toolName: toolSelection.toolName,
            parameterName: paramName,
            description: paramSchema.description || `Parameter ${paramName}`,
            required: true,
            currentValue,
            suggestions: this.generateParameterSuggestions(paramName, paramSchema, session.originalQuery),
          });
        } else {
          // Validate parameter value
          const validationResult = this.validateParameterValue(paramName, currentValue, paramSchema);
          if (!validationResult.isValid) {
            missingParams.push({
              toolName: toolSelection.toolName,
              parameterName: paramName,
              description: paramSchema.description || `Parameter ${paramName}`,
              required: true,
              currentValue,
              validationError: validationResult.message,
              suggestions: validationResult.suggestions,
            });
          }
        }
      }
      
      // Check optional parameters with validation issues
      for (const [paramName, paramSchema] of Object.entries(properties)) {
        if (required.includes(paramName)) {
          continue; // Already checked above
        }
        
        const currentValue = toolSelection.mappedParameters[paramName];
        if (currentValue !== null && currentValue !== undefined && currentValue !== '') {
          const validationResult = this.validateParameterValue(paramName, currentValue, paramSchema);
          if (!validationResult.isValid) {
            missingParams.push({
              toolName: toolSelection.toolName,
              parameterName: paramName,
              description: paramSchema.description || `Parameter ${paramName}`,
              required: false,
              currentValue,
              validationError: validationResult.message,
              suggestions: validationResult.suggestions,
            });
          }
        }
      }
    }
    
    session.missingParameters = missingParams;
    session.updatedAt = new Date();
    
    logger.info(`[InteractiveSessionManager] Found ${missingParams.length} missing/invalid parameters for session ${sessionId}`);
    
    return missingParams;
  }
  
  /**
   * Generate user guidance message based on session state
   */
  generateUserGuidance(sessionId: string): UserGuidanceMessage | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found`);
      return undefined;
    }
    
    const now = new Date();
    
    // Check if session has timed out
    if (this.config.autoCancelOnTimeout) {
      const ageMs = now.getTime() - session.updatedAt.getTime();
      if (ageMs > this.config.timeoutMs) {
        this.updateSessionState(sessionId, 'cancelled');
        return {
          type: 'suggestion',
          message: 'Session timed out due to inactivity. Please start a new session.',
          requiresResponse: false,
          timestamp: now,
        };
      }
    }
    
    // Check turn limit
    if (session.turnCount >= this.config.maxTurns) {
      this.updateSessionState(sessionId, 'cancelled');
      return {
        type: 'suggestion',
        message: 'Maximum number of turns reached. Please start a new session with more specific information.',
        requiresResponse: false,
        timestamp: now,
      };
    }
    
    // Generate guidance based on missing parameters
    if (session.missingParameters.length > 0) {
      const requiredMissing = session.missingParameters.filter(p => p.required);
      
      if (requiredMissing.length > 0) {
        // Ask for required parameters first
        const param = requiredMissing[0]; // Start with the first required parameter
        
        let message = `To execute "${session.toolSelections?.[0]?.toolName || 'this action'}", I need the following information:\n\n`;
        message += `**${param.parameterName}**`;
        if (param.description) {
          message += `: ${param.description}`;
        }
        
        if (param.validationError) {
          message += `\n\nCurrent value "${param.currentValue}" is invalid: ${param.validationError}`;
        }
        
        if (param.suggestions && param.suggestions.length > 0 && this.config.enableSuggestions) {
          message += `\n\nSuggestions: ${param.suggestions.join(', ')}`;
        }
        
        message += `\n\nPlease provide the ${param.parameterName}:`;
        
        return {
          type: 'parameter_request',
          message,
          parameters: [param],
          requiresResponse: true,
          timestamp: now,
        };
      } else {
        // Only optional parameters are missing/invalid
        const optionalMissing = session.missingParameters;
        if (optionalMissing.length === 1) {
          const param = optionalMissing[0];
          return {
            type: 'confirmation_request',
            message: `The parameter "${param.parameterName}" has value "${param.currentValue}" which may be invalid: ${param.validationError}. Would you like to correct it?`,
            options: [
              { id: 'keep', label: 'Keep as-is', value: param.currentValue },
              { id: 'correct', label: 'Provide correct value' },
            ],
            requiresResponse: true,
            timestamp: now,
          };
        }
      }
    }
    
    // If no missing parameters and confidence is low, ask for confirmation
    if (session.confidence < this.config.requireConfirmationThreshold && session.toolSelections && session.toolSelections.length > 0) {
      const tool = session.toolSelections[0];
      return {
        type: 'confirmation_request',
        message: `I think you want to use "${tool.toolName}" to "${session.originalQuery}". Is this correct?`,
        options: [
          { id: 'confirm', label: 'Yes, proceed' },
          { id: 'rephrase', label: 'No, let me rephrase' },
        ],
        requiresResponse: true,
        timestamp: now,
      };
    }
    
    // No guidance needed - ready for execution
    return undefined;
  }
  
  /**
   * Process user feedback response
   */
  processUserFeedback(
    sessionId: string,
    response: UserFeedbackResponse,
  ): { success: boolean; session?: InteractiveSession; nextGuidance?: UserGuidanceMessage } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found`);
      return { success: false };
    }
    
    // Update conversation history
    session.conversationHistory.push({
      role: 'user',
      content: JSON.stringify(response),
      timestamp: response.timestamp,
      metadata: { responseType: response.type },
    });
    
    session.turnCount++;
    session.updatedAt = new Date();
    
    // Handle different response types
    switch (response.type) {
      case 'parameter_value':
        if (response.parameterName && response.value !== undefined) {
          // Update parameter value in tool selections
          this.updateParameterValue(sessionId, response.parameterName, response.value);
          
          // Re-analyze missing parameters
          // Note: We would need the tools list here, but that will be handled by the caller
        }
        break;
        
      case 'clarification':
        if (response.clarification) {
          session.currentQuery = response.clarification;
          session.state = 'parsing'; // Will trigger re-parsing
        }
        break;
        
      case 'confirmation':
        if (response.confirmed === false) {
          session.state = 'awaiting_feedback';
          // Ask user to rephrase
          const nextGuidance: UserGuidanceMessage = {
            type: 'clarification_request',
            message: 'Please rephrase your request or provide more details:',
            requiresResponse: true,
            timestamp: new Date(),
          };
          return { success: true, session, nextGuidance };
        }
        break;
        
      case 'cancellation':
        this.updateSessionState(sessionId, 'cancelled');
        return { success: true, session };
    }
    
    // Generate next guidance
    const nextGuidance = this.generateUserGuidance(sessionId);
    
    return { success: true, session, nextGuidance };
  }
  
  /**
   * Update execution result
   */
  updateExecutionResult(sessionId: string, result: any, error?: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn(`[InteractiveSessionManager] Session ${sessionId} not found`);
      return false;
    }
    
    session.executionResult = result;
    session.error = error;
    session.state = error ? 'failed' : 'completed';
    session.completedAt = new Date();
    session.updatedAt = new Date();
    
    logger.info(`[InteractiveSessionManager] Updated execution result for session ${sessionId}: ${error ? 'failed' : 'success'}`);
    
    return true;
  }
  
  /**
   * Clean up old sessions
   */
  cleanupOldSessions(maxAgeMs: number = 3600000): number { // Default 1 hour
    const now = new Date();
    let cleanedCount = 0;
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const ageMs = now.getTime() - session.updatedAt.getTime();
      if (ageMs > maxAgeMs) {
        this.sessions.delete(sessionId);
        cleanedCount++;
      }
    }
    
    if (cleanedCount > 0) {
      logger.info(`[InteractiveSessionManager] Cleaned up ${cleanedCount} old sessions`);
    }
    
    return cleanedCount;
  }
  
  /**
   * Get all active sessions
   */
  getActiveSessions(): InteractiveSession[] {
    const activeStates: SessionState[] = ['initializing', 'parsing', 'validating', 'awaiting_feedback', 'executing'];
    return Array.from(this.sessions.values())
      .filter(session => activeStates.includes(session.state))
      .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
  }
  
  // ==================== Private Methods ====================
  
  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
  
  /**
   * Generate parameter suggestions based on context
   */
  private generateParameterSuggestions(
    paramName: string,
    paramSchema: any,
    query: string,
  ): string[] {
    const suggestions: string[] = [];
    const paramNameLower = paramName.toLowerCase();
    const queryLower = query.toLowerCase();
    
    // Date parameter suggestions
    if (paramNameLower.includes('date')) {
      const today = new Date();
      suggestions.push(today.toISOString().split('T')[0]); // Today
      
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      suggestions.push(tomorrow.toISOString().split('T')[0]); // Tomorrow
      
      // Check for relative dates in query
      if (queryLower.includes('tomorrow')) {
        suggestions.unshift(tomorrow.toISOString().split('T')[0]);
      }
      if (queryLower.includes('today')) {
        suggestions.unshift(today.toISOString().split('T')[0]);
      }
    }
    
    // Location parameter suggestions
    if (paramNameLower.includes('location') || paramNameLower.includes('city') || paramNameLower.includes('address')) {
      // Extract potential location names from query (capitalized words)
      const locationPatterns = [
        /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)/g, // Capitalized words (potential city names)
      ];
      
      for (const pattern of locationPatterns) {
        const matches = query.match(pattern);
        if (matches) {
          suggestions.push(...matches);
        }
      }
    }
    
    // Filter/type parameter suggestions
    if (paramNameLower.includes('filter') || paramNameLower.includes('type') || paramNameLower.includes('flag')) {
      if (queryLower.includes('high speed')) {
        suggestions.push('high_speed');
      }
      if (queryLower.includes('express') || queryLower.includes('fast')) {
        suggestions.push('express');
      }
    }
    
    return Array.from(new Set(suggestions)).slice(0, 5); // Remove duplicates, limit to 5
  }
  
  /**
   * Validate parameter value against schema
   */
  private validateParameterValue(
    paramName: string,
    value: any,
    paramSchema: any,
  ): { isValid: boolean; message?: string; suggestions?: string[] } {
    if (value === null || value === undefined) {
      return { isValid: false, message: 'Value is required' };
    }
    
    const type = paramSchema.type || 'string';
    const paramNameLower = paramName.toLowerCase();
    
    // Type validation
    if (type === 'string' && typeof value !== 'string') {
      return { isValid: false, message: `Expected string, got ${typeof value}` };
    }
    
    if (type === 'number' && typeof value !== 'number') {
      return { isValid: false, message: `Expected number, got ${typeof value}` };
    }
    
    if (type === 'boolean' && typeof value !== 'boolean') {
      return { isValid: false, message: `Expected boolean, got ${typeof value}` };
    }
    
    if (type === 'array' && !Array.isArray(value)) {
      return { isValid: false, message: `Expected array, got ${typeof value}` };
    }
    
    if (type === 'object' && (typeof value !== 'object' || value === null || Array.isArray(value))) {
      return { isValid: false, message: `Expected object, got ${typeof value}` };
    }
    
    // Format validation for specific parameter types
    if (typeof value === 'string') {
      // Date validation
      if (paramNameLower.includes('date')) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(value)) {
          return {
            isValid: false,
            message: 'Date must be in YYYY-MM-DD format',
            suggestions: [new Date().toISOString().split('T')[0]],
          };
        }
      }
      
      // Station code validation (if we know the pattern)
      if (paramNameLower.includes('station') && paramNameLower.includes('code')) {
        // Station codes are usually uppercase letters/numbers
        if (!/^[A-Z0-9]+$/.test(value)) {
          return {
            isValid: false,
            message: 'Station code should contain only uppercase letters and numbers',
          };
        }
      }
      
      // Length validation
      if (paramSchema.minLength && value.length < paramSchema.minLength) {
        return {
          isValid: false,
          message: `Minimum length is ${paramSchema.minLength} characters`,
        };
      }
      
      if (paramSchema.maxLength && value.length > paramSchema.maxLength) {
        return {
          isValid: false,
          message: `Maximum length is ${paramSchema.maxLength} characters`,
        };
      }
      
      // Pattern validation
      if (paramSchema.pattern) {
        const regex = new RegExp(paramSchema.pattern);
        if (!regex.test(value)) {
          return {
            isValid: false,
            message: `Value does not match required pattern: ${paramSchema.pattern}`,
          };
        }
      }
    }
    
    // Number range validation
    if (type === 'number' && typeof value === 'number') {
      if (paramSchema.minimum !== undefined && value < paramSchema.minimum) {
        return {
          isValid: false,
          message: `Minimum value is ${paramSchema.minimum}`,
        };
      }
      
      if (paramSchema.maximum !== undefined && value > paramSchema.maximum) {
        return {
          isValid: false,
          message: `Maximum value is ${paramSchema.maximum}`,
        };
      }
    }
    
    // Enum validation
    if (paramSchema.enum && Array.isArray(paramSchema.enum)) {
      if (!paramSchema.enum.includes(value)) {
        return {
          isValid: false,
          message: `Value must be one of: ${paramSchema.enum.join(', ')}`,
          suggestions: paramSchema.enum.slice(0, 5),
        };
      }
    }
    
    return { isValid: true };
  }
  
  /**
   * Update parameter value in tool selections
   */
  private updateParameterValue(sessionId: string, paramName: string, value: any): void {
    const session = this.sessions.get(sessionId);
    if (!session || !session.toolSelections) {
      return;
    }
    
    // Update in all tool selections (in case same parameter appears in multiple tools)
    for (const toolSelection of session.toolSelections) {
      if (paramName in toolSelection.mappedParameters) {
        toolSelection.mappedParameters[paramName] = value;
      }
    }
    
    // Remove from missing parameters if it was there
    session.missingParameters = session.missingParameters.filter(
      p => !(p.toolName === session.toolSelections?.[0]?.toolName && p.parameterName === paramName)
    );
    
    logger.debug(`[InteractiveSessionManager] Updated parameter ${paramName} to ${value} for session ${sessionId}`);
  }
}