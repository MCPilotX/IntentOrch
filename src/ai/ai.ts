/**
 * Simplified AI Core Service
 * Focused on converting natural language to MCP tool calls
 */

import chalk from 'chalk';
import { logger } from '../core/logger';

// Simplified AI configuration
export interface SimpleAIConfig {
  provider: 'openai' | 'ollama' | 'none';
  apiKey?: string;
  endpoint?: string;
  model?: string;
}

// Query result
export interface AskResult {
  type: 'tool_call' | 'suggestions' | 'error';
  tool?: ToolCall;
  suggestions?: string[];
  message?: string;
  help?: string;
  confidence?: number;
}

// Tool call
export interface ToolCall {
  service: string;
  tool: string;
  params: Record<string, any>;
}

// Intent analysis result
interface Intent {
  action: string;
  target: string;
  params: Record<string, any>;
  confidence: number;
}

// Simplified AI error
export class AIError extends Error {
  constructor(
    public code: string,
    override message: string,
    public category: 'config' | 'connection' | 'execution',
    public suggestions: string[] = []
  ) {
    super(message);
    this.name = 'AIError';
  }
}

/**
 * Simplified AI Core Service
 */
export class SimpleAI {
  private config: SimpleAIConfig | null = null;
  private enabled: boolean = false;
  private client: any = null;
  
  constructor() {
    logger.info('[AI] Initializing simplified AI service');
  }
  
  /**
   * Configure AI service
   */
  async configure(config: SimpleAIConfig): Promise<void> {
    logger.info(`[AI] Configuring AI provider: ${config.provider}`);
    
    // Simple validation
    if (config.provider === 'openai' && !config.apiKey) {
      throw new AIError(
        'AI_CONFIG_ERROR',
        'OpenAI requires API key',
        'config',
        [
          'Run: mcp ai configure openai YOUR_API_KEY',
          'Get API key: https://platform.openai.com/api-keys'
        ]
      );
    }
    
    this.config = config;
    
    // Initialize client
    await this.initializeClient();
    
    this.enabled = true;
    logger.info(`[AI] ${config.provider} configuration completed`);
  }
  
  /**
   * Initialize AI client
   */
  private async initializeClient(): Promise<void> {
    if (!this.config || this.config.provider === 'none') {
      this.enabled = false;
      return;
    }
    
    try {
      switch (this.config.provider) {
        case 'openai':
          // Simplified OpenAI client
          this.client = {
            provider: 'openai',
            config: this.config
          };
          break;
          
        case 'ollama':
          // Simplified Ollama client
          this.client = {
            provider: 'ollama',
            endpoint: this.config.endpoint || 'http://localhost:11434',
            config: this.config
          };
          break;
          
        default:
          this.enabled = false;
          return;
      }
      
      // Test connection
      await this.testConnection();
      
    } catch (error: any) {
      logger.warn(`[AI] Client initialization failed: ${error.message}`);
      this.enabled = false;
      throw new AIError(
        'AI_INIT_ERROR',
        `AI initialization failed: ${error.message}`,
        'connection',
        [
          'Check network connection',
          'Verify configuration',
          'Run: mcp ai test to test connection'
        ]
      );
    }
  }
  
  /**
   * Test AI connection
   */
  async testConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config || this.config.provider === 'none') {
      return {
        success: false,
        message: 'AI not configured'
      };
    }
    
    try {
      switch (this.config.provider) {
        case 'openai':
          // Simple OpenAI connection test
          const openaiTest = await this.testOpenAIConnection();
          return openaiTest;
          
        case 'ollama':
          // Simple Ollama connection test
          const ollamaTest = await this.testOllamaConnection();
          return ollamaTest;
          
        default:
          return {
            success: false,
            message: `Unsupported provider: ${this.config.provider}`
          };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Connection test failed: ${error.message}`
      };
    }
  }
  
  /**
   * Test OpenAI connection
   */
  private async testOpenAIConnection(): Promise<{ success: boolean; message: string }> {
    if (!this.config?.apiKey) {
      return {
        success: false,
        message: 'Missing API key'
      };
    }
    
    try {
      // Simple HTTP request test
      const response = await fetch('https://api.openai.com/v1/models', {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        return {
          success: true,
          message: 'OpenAI connection OK'
        };
      } else {
        return {
          success: false,
          message: `API returned error: ${response.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Network error: ${error.message}`
      };
    }
  }
  
  /**
   * Test Ollama connection
   */
  private async testOllamaConnection(): Promise<{ success: boolean; message: string }> {
    const endpoint = this.config?.endpoint || 'http://localhost:11434';
    
    try {
      const response = await fetch(`${endpoint}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (response.ok) {
        return {
          success: true,
          message: `Ollama connection OK (${endpoint})`
        };
      } else {
        return {
          success: false,
          message: `Ollama service error: ${response.status}`
        };
      }
    } catch (error: any) {
      return {
        success: false,
        message: `Cannot connect to Ollama: ${error.message}`
      };
    }
  }
  
  /**
   * Process natural language query
   */
  async ask(query: string): Promise<AskResult> {
    logger.info(`[AI] Processing query: "${query}"`);
    
    // Check if AI is enabled
    if (!this.enabled || !this.config || this.config.provider === 'none') {
      throw new AIError(
        'AI_NOT_CONFIGURED',
        'AI provider not configured. Please call configureAI() with a valid API key.',
        'config',
        [
          'Run: mcpilot.configureAI({ provider: "openai", apiKey: "YOUR_API_KEY" })',
          'Get OpenAI API key: https://platform.openai.com/api-keys',
          'Or use Ollama: mcpilot.configureAI({ provider: "ollama", endpoint: "http://localhost:11434" })'
        ]
      );
    }
    
    try {
      // 1. Analyze intent
      const intent = await this.analyzeIntent(query);
      
      // 2. Map to tool call
      const toolCall = this.mapIntentToTool(intent);
      
      // 3. Return tool call
      return {
        type: 'tool_call',
        tool: toolCall,
        confidence: intent.confidence
      };
      
    } catch (error: any) {
      logger.warn(`[AI] Intent analysis failed: ${error.message}`);
      
      // Fallback to command suggestions when AI fails
      return this.getFallbackSuggestions(query);
    }
  }
  
  /**
   * Analyze intent (simplified version)
   */
  private async analyzeIntent(query: string): Promise<Intent> {
    // Simplified intent analysis: keyword matching
    
    const queryLower = query.toLowerCase();
    
    // Common intent patterns
    const patterns = [
      // File operations
      { 
        regex: /(list|show|display).*(file|directory|folder)/i,
        action: 'list',
        target: 'files',
        confidence: 0.8
      },
      { 
        regex: /(read|view|open).*file/i,
        action: 'read',
        target: 'file',
        confidence: 0.7
      },
      
      // Service operations
      { 
        regex: /(start|launch|run).*service/i,
        action: 'start',
        target: 'service',
        confidence: 0.9
      },
      { 
        regex: /(stop|halt|terminate).*service/i,
        action: 'stop',
        target: 'service',
        confidence: 0.9
      },
      { 
        regex: /(status|check).*service/i,
        action: 'status',
        target: 'service',
        confidence: 0.8
      },
      
      // General queries
      { 
        regex: /(help|what can you do)/i,
        action: 'help',
        target: 'general',
        confidence: 0.9
      }
    ];
    
    // Find matching pattern
    for (const pattern of patterns) {
      if (pattern.regex.test(query)) {
        return {
          action: pattern.action,
          target: pattern.target,
          params: this.extractParams(query),
          confidence: pattern.confidence
        };
      }
    }
    
    // If no match, use LLM analysis (if available)
    if (this.config?.provider !== 'none' && this.client) {
      return await this.analyzeWithLLM(query);
    }
    
    // Default intent
    return {
      action: 'unknown',
      target: 'unknown',
      params: {},
      confidence: 0.3
    };
  }
  
  /**
   * Analyze intent with LLM (optional)
   */
  private async analyzeWithLLM(query: string): Promise<Intent> {
    // Simplified LLM intent analysis
    // In actual implementation, this would call real AI API
    
    logger.info(`[AI] Analyzing intent with ${this.config?.provider}`);
    
    // Simulate LLM analysis
    return {
      action: 'analyze',
      target: 'query',
      params: { query },
      confidence: 0.6
    };
  }
  
  /**
   * Extract parameters from query
   */
  private extractParams(query: string): Record<string, any> {
    const params: Record<string, any> = {};
    
    // Extract path parameter
    const pathMatch = query.match(/(\/[^\s]+|\.[^\s]+)/);
    if (pathMatch) {
      params.path = pathMatch[0];
    }
    
    // Extract service name
    const serviceMatch = query.match(/([a-zA-Z0-9_-]+)\s+service/i);
    if (serviceMatch) {
      params.service = serviceMatch[1];
    }
    
    return params;
  }
  
  /**
   * Map intent to tool call
   */
  private mapIntentToTool(intent: Intent): ToolCall {
    // Simplified mapping logic
    
    switch (intent.action) {
      case 'list':
        return {
          service: 'filesystem',
          tool: 'list_directory',
          params: { path: intent.params.path || '.' }
        };
        
      case 'read':
        return {
          service: 'filesystem',
          tool: 'read_file',
          params: { path: intent.params.path || 'README.md' }
        };
        
      case 'start':
        return {
          service: 'service_manager',
          tool: 'start_service',
          params: { name: intent.params.service || 'default' }
        };
        
      case 'stop':
        return {
          service: 'service_manager',
          tool: 'stop_service',
          params: { name: intent.params.service || 'default' }
        };
        
      case 'status':
        return {
          service: 'service_manager',
          tool: 'get_status',
          params: { name: intent.params.service }
        };
        
      case 'help':
        return {
          service: 'system',
          tool: 'show_help',
          params: {}
        };
        
      default:
        return {
          service: 'system',
          tool: 'unknown',
          params: { intent }
        };
    }
  }
  
  /**
   * Get fallback suggestions (when AI is not available)
   */
  private getFallbackSuggestions(query: string): AskResult {
    const suggestions: string[] = [];
    
    // Analyze query to provide traditional command suggestions
    const queryLower = query.toLowerCase();
    
    if (queryLower.includes('file') || queryLower.includes('directory')) {
      suggestions.push('mcp service list');
      suggestions.push('List files: ls or dir');
    }
    
    if (queryLower.includes('service') && queryLower.includes('start')) {
      suggestions.push('mcp service start <service-name>');
    }
    
    if (queryLower.includes('service') && queryLower.includes('stop')) {
      suggestions.push('mcp service stop <service-name>');
    }
    
    if (queryLower.includes('status') || queryLower.includes('check')) {
      suggestions.push('mcp service status');
    }
    
    if (suggestions.length === 0) {
      suggestions.push('mcp --help to see all commands');
      suggestions.push('mcp service --help to see service commands');
    }
    
    return {
      type: 'suggestions',
      message: 'AI feature not enabled or configured incorrectly',
      suggestions,
      help: 'You can:'
    };
  }
  
  /**
   * Get AI status
   */
  getStatus(): {
    enabled: boolean;
    provider: string;
    configured: boolean;
  } {
    return {
      enabled: this.enabled,
      provider: this.config?.provider || 'none',
      configured: !!this.config && this.config.provider !== 'none'
    };
  }
  
  /**
   * Reset configuration
   */
  reset(): void {
    this.config = null;
    this.enabled = false;
    this.client = null;
    logger.info('[AI] Configuration reset');
  }
  
  /**
   * Get friendly error message
   */
  static getFriendlyError(error: AIError): string {
    const lines = [
      chalk.red(`❌ ${error.message}`),
      chalk.gray(`Error code: ${error.code}`)
    ];
    
    if (error.suggestions.length > 0) {
      lines.push(chalk.yellow('\n🔧 Fix suggestions:'));
      error.suggestions.forEach((suggestion, i) => {
        lines.push(`  ${i + 1}. ${suggestion}`);
      });
    }
    
    return lines.join('\n');
  }
}