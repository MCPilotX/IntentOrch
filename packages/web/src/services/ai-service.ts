/**
 * Enhanced AI Service
 * 
 * Uses the new unified execution service API which provides the same
 * capabilities as the CLI run command.
 * 
 * Features:
 * - Uses the new /api/execute/parseIntent endpoint (same as CLI run command)
 * - Falls back to legacy /api/intent/parse endpoint if needed
 * - Provides better error handling and logging
 */

import type { WorkflowStep } from '../types';

// Helper function to get auth token
async function getAuthToken(): Promise<string | null> {
  try {
    // First check localStorage
    let token = localStorage.getItem('auth_token');
    
    // If no token, try to get one from daemon automatically
    if (!token) {
      console.log('[AI Enhanced Service] No auth token found, attempting to get one from daemon...');
      const tokenResponse = await fetch('http://localhost:9658/api/auth/token');
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        if (tokenData && tokenData.token) {
          token = tokenData.token;
          if (token) {
            localStorage.setItem('auth_token', token);
            console.log('[AI Enhanced Service] Successfully obtained and stored auth token');
          }
        }
      }
    }
    
    return token;
  } catch (tokenError) {
    console.warn('[AI Enhanced Service] Failed to get auth token from daemon:', tokenError);
    return null;
  }
}

// Helper function to call backend API with auth
async function callBackendAPI<T>(
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE',
  body?: any
): Promise<T> {
  try {
    const token = await getAuthToken();
    
    const headers: Record<string, string> = { 
      'Content-Type': 'application/json'
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(`http://localhost:9658${endpoint}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined
    });
    
    const responseData = await response.json();
    
    if (!response.ok) {
      // Try to extract error message from response body
      const errorMessage = responseData?.error || responseData?.message || `Backend API error: ${response.status} ${response.statusText}`;
      throw new Error(errorMessage);
    }
    
    return responseData;
  } catch (error) {
    console.error(`[AI Enhanced Service] Error calling backend API ${endpoint}:`, error);
    throw error;
  }
}

// Call the new unified execution service API
async function callUnifiedIntentAPI(intent: string, context?: any): Promise<any> {
  console.log('[AI Enhanced Service] Calling unified execution service API...');
  
  try {
    const result = await callBackendAPI('/api/execute/parseIntent', 'POST', {
      intent,
      context
    });
    
    console.log('[AI Enhanced Service] Unified API response:', result);
    return result;
  } catch (error) {
    console.warn('[AI Enhanced Service] Unified API failed, will try legacy API:', error);
    throw error; // Let caller handle fallback
  }
}

// Call the legacy intent parsing API (fallback)
async function callLegacyIntentAPI(intent: string): Promise<any> {
  console.log('[AI Enhanced Service] Falling back to legacy intent API...');
  
  try {
    const result = await callBackendAPI('/api/intent/parse', 'POST', {
      intent
    });
    
    console.log('[AI Enhanced Service] Legacy API response:', result);
    return result;
  } catch (error) {
    console.error('[AI Enhanced Service] Legacy API also failed:', error);
    throw error;
  }
}

// Execute natural language query using unified execution service
async function executeNaturalLanguageAPI(query: string, options?: any): Promise<any> {
  console.log('[AI Enhanced Service] Executing natural language query...');
  
  try {
    const result = await callBackendAPI('/api/execute/naturalLanguage', 'POST', {
      query,
      options
    });
    
    console.log('[AI Enhanced Service] Execution result:', result);
    return result;
  } catch (error) {
    console.error('[AI Enhanced Service] Execution failed:', error);
    throw error;
  }
}

// Main enhanced AI service
export const aiEnhancedService = {
  /**
   * Parse intent using unified execution service (same as CLI run command)
   */
  async parseIntent(intent: string, context?: any): Promise<{ 
    steps: WorkflowStep[], 
    status: 'success' | 'capability_missing' | 'partial',
    confidence?: number,
    explanation?: string
  }> {
    console.log(`[AI Enhanced Service] Parsing intent: "${intent}"`);
    
    try {
      // First try the new unified execution service API
      console.log('[AI Enhanced Service] Trying unified execution service API...');
      const unifiedResult = await callUnifiedIntentAPI(intent, context);
      
      if (unifiedResult.success && unifiedResult.data) {
        console.log(`[AI Enhanced Service] Unified API success, returning ${unifiedResult.data.steps.length} steps`);
        
        // Ensure steps use serverName instead of serverId
        const steps = unifiedResult.data.steps.map((step: any) => {
          if (step.serverId) {
            return {
              ...step,
              serverName: step.serverId,
              serverId: undefined
            };
          }
          return step;
        });
        
        return {
          steps,
          status: unifiedResult.data.status,
          confidence: unifiedResult.data.confidence,
          explanation: unifiedResult.data.explanation
        };
      }
      
      // If unified API didn't return success data, try legacy API
      console.log('[AI Enhanced Service] Unified API did not return success data, trying legacy API...');
      const legacyResult = await callLegacyIntentAPI(intent);
      
      if (legacyResult.success && legacyResult.data) {
        console.log(`[AI Enhanced Service] Legacy API success, returning ${legacyResult.data.steps.length} steps`);
        
        // Ensure steps use serverName instead of serverId
        const steps = legacyResult.data.steps.map((step: any) => {
          if (step.serverId) {
            return {
              ...step,
              serverName: step.serverId,
              serverId: undefined
            };
          }
          return step;
        });
        
        return {
          steps,
          status: legacyResult.data.status,
          confidence: legacyResult.data.confidence,
          explanation: legacyResult.data.explanation
        };
      }
      
      console.log('[AI Enhanced Service] Both APIs failed to return success data');
      return { 
        status: 'capability_missing', 
        steps: [],
        confidence: 0,
        explanation: 'Unable to parse intent. Please try again or check server configuration.'
      };
      
    } catch (error) {
      // Network error or backend unavailable
      console.error('[AI Enhanced Service] All intent parsing APIs unavailable:', error);
      return { 
        status: 'capability_missing', 
        steps: [],
        confidence: 0,
        explanation: 'Intent parsing service unavailable. Please check if the daemon is running.'
      };
    }
  },
  
  /**
   * Execute natural language query (same as CLI run command)
   */
  async executeNaturalLanguage(
    query: string, 
    options?: {
      autoStart?: boolean;
      keepAlive?: boolean;
      silent?: boolean;
      simulate?: boolean;
      params?: Record<string, any>;
    }
  ): Promise<{
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
  }> {
    console.log(`[AI Enhanced Service] Executing natural language query: "${query.substring(0, 100)}..."`);
    
    try {
      const result = await executeNaturalLanguageAPI(query, options);
      return result;
    } catch (error: any) {
      console.error('[AI Enhanced Service] Execution failed:', error);
      return {
        success: false,
        error: error.message || 'Execution failed'
      };
    }
  },

  /**
   * Execute pre-parsed workflow steps directly (no re-parsing)
   * 
   * This is the key method that ensures Web UI execution matches CLI:
   * - Takes already-parsed steps from parseIntent
   * - Executes them without calling parseAndPlan again
   * - Returns the same UnifiedExecutionResult format as executeNaturalLanguage
   */
  async executeSteps(
    steps: any[],
    options?: {
      autoStart?: boolean;
      keepAlive?: boolean;
      silent?: boolean;
      simulate?: boolean;
    }
  ): Promise<{
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
  }> {
    console.log(`[AI Enhanced Service] Executing ${steps.length} pre-parsed steps...`);
    
    try {
      const result = await callBackendAPI<{
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
      }>('/api/execute/executeSteps', 'POST', {
        steps,
        options
      });
      
      console.log('[AI Enhanced Service] Steps execution result:', result);
      return result;
    } catch (error: any) {
      console.error('[AI Enhanced Service] Steps execution failed:', error);
      return {
        success: false,
        error: error.message || 'Steps execution failed'
      };
    }
  },

  
  /**
   * Check if unified execution service is available
   */
  async checkServiceAvailability(): Promise<{
    unifiedService: boolean;
    legacyService: boolean;
    message: string;
  }> {
    try {
      // Try to get status from daemon
      const statusResponse = await fetch('http://localhost:9658/api/status');
      const isDaemonRunning = statusResponse.ok;
      
      if (!isDaemonRunning) {
        return {
          unifiedService: false,
          legacyService: false,
          message: 'Daemon is not running'
        };
      }
      
      // Try unified service endpoint
      let unifiedAvailable = false;
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        // Just make a HEAD request to check if endpoint exists
        const unifiedResponse = await fetch('http://localhost:9658/api/execute/parseIntent', {
          method: 'HEAD',
          headers
        });
        unifiedAvailable = unifiedResponse.status !== 404;
      } catch {
        unifiedAvailable = false;
      }
      
      // Try legacy endpoint
      let legacyAvailable = false;
      try {
        const token = await getAuthToken();
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        
        const legacyResponse = await fetch('http://localhost:9658/api/intent/parse', {
          method: 'HEAD',
          headers
        });
        legacyAvailable = legacyResponse.status !== 404;
      } catch {
        legacyAvailable = false;
      }
      
      return {
        unifiedService: unifiedAvailable,
        legacyService: legacyAvailable,
        message: unifiedAvailable 
          ? 'Unified execution service available (CLI run command capabilities)' 
          : legacyAvailable 
            ? 'Legacy intent service available' 
            : 'No intent parsing services available'
      };
    } catch (error) {
      console.error('[AI Enhanced Service] Service availability check failed:', error);
      return {
        unifiedService: false,
        legacyService: false,
        message: 'Unable to check service availability'
      };
    }
  },

  /**
   * Interactive intent parsing service
   */
  interactive: {
    /**
     * Start an interactive session for intent parsing
     */
    async startSession(query: string, userId?: string) {
      console.log('[AI Interactive Service] Starting interactive session for query:', query.substring(0, 100));
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          sessionId: string;
          guidance?: any;
          session: any;
        }>('/api/execute/interactive/start', 'POST', { query, userId });
        
        if (!result.success) {
          throw new Error('Failed to start interactive session');
        }
        
        console.log('[AI Interactive Service] Interactive session started:', result.sessionId);
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to start interactive session:', error);
        throw error;
      }
    },

    /**
     * Process user feedback in interactive session
     */
    async processFeedback(sessionId: string, response: any) {
      console.log('[AI Interactive Service] Processing feedback for session:', sessionId);
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          guidance?: any;
          session?: any;
          readyForExecution?: boolean;
        }>('/api/execute/interactive/respond', 'POST', { sessionId, response });
        
        if (!result.success) {
          throw new Error('Failed to process feedback');
        }
        
        console.log('[AI Interactive Service] Feedback processed successfully');
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to process feedback:', error);
        throw error;
      }
    },

    /**
     * Execute interactive session workflow
     */
    async executeSession(sessionId: string, options: any = {}) {
      console.log('[AI Interactive Service] Executing session:', sessionId);
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          result?: any;
          executionSteps?: any[];
          statistics?: any;
          error?: string;
        }>('/api/execute/interactive/execute', 'POST', { sessionId, options });
        
        console.log('[AI Interactive Service] Session execution result:', result.success ? 'success' : 'failed');
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to execute session:', error);
        throw error;
      }
    },

    /**
     * Get interactive session by ID
     */
    async getSession(sessionId: string) {
      console.log('[AI Interactive Service] Getting session:', sessionId);
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          session?: any;
        }>(`/api/execute/interactive/${sessionId}`, 'GET');
        
        if (!result.success) {
          throw new Error('Failed to get session');
        }
        
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to get session:', error);
        throw error;
      }
    },

    /**
     * Get all active interactive sessions
     */
    async getActiveSessions() {
      console.log('[AI Interactive Service] Getting active sessions');
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          sessions: any[];
        }>('/api/execute/interactive/', 'GET');
        
        if (!result.success) {
          throw new Error('Failed to get active sessions');
        }
        
        console.log(`[AI Interactive Service] Found ${result.sessions.length} active sessions`);
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to get active sessions:', error);
        throw error;
      }
    },

    /**
     * Clean up old interactive sessions
     */
    async cleanupSessions(maxAgeMs: number = 3600000) {
      console.log('[AI Interactive Service] Cleaning up old sessions');
      
      try {
        const result = await callBackendAPI<{
          success: boolean;
          cleanedCount: number;
          message: string;
        }>('/api/execute/interactive/cleanup', 'POST', { maxAgeMs });
        
        if (!result.success) {
          throw new Error('Failed to cleanup sessions');
        }
        
        console.log(`[AI Interactive Service] Cleaned up ${result.cleanedCount} sessions`);
        return result;
      } catch (error: any) {
        console.error('[AI Interactive Service] Failed to cleanup sessions:', error);
        throw error;
      }
    },

    /**
     * Check if interactive service is available
     */
    async checkAvailability() {
      console.log('[AI Interactive Service] Checking availability');
      
      try {
        // Try to start a test session
        const testResult = await callBackendAPI<{
          success: boolean;
          sessionId: string;
        }>('/api/execute/interactive/start', 'POST', { query: 'test' });
        
        return {
          available: testResult.success,
          message: testResult.success 
            ? 'Interactive intent parsing service available' 
            : 'Interactive intent parsing service not available'
        };
      } catch (error: any) {
        console.log('[AI Interactive Service] Interactive service not available:', error.message);
        return {
          available: false,
          message: 'Interactive intent parsing service not available'
        };
      }
    }
  }
};

// Export both services for backward compatibility
export { aiEnhancedService as aiService };
