/**
 * Test utilities for MCPilot SDK Core tests
 */

import { MCPilotSDK } from '../src/sdk';
import { ToolResult } from '../src/mcp/types';
import { RuntimeType } from '../src/core/types';

/**
 * Creates a mock SDK instance for testing
 */
export function createMockSDK(options: {
  autoInit?: boolean;
  hasTools?: boolean;
  hasAI?: boolean;
} = {}): MCPilotSDK {
  const sdk = new MCPilotSDK({ autoInit: false });
  
  // Mock internal components
  const mockToolRegistry = {
    executeTool: jest.fn(),
    registerTool: jest.fn(),
    getAllTools: jest.fn().mockReturnValue(options.hasTools ? [
      { 
        tool: { name: 'test-tool-1', description: 'Test tool 1', inputSchema: {} },
        metadata: { serverName: 'test-server', toolId: 'test-tool-1' },
        executor: jest.fn()
      },
      { 
        tool: { name: 'test-tool-2', description: 'Test tool 2', inputSchema: {} },
        metadata: { serverName: 'test-server', toolId: 'test-tool-2' },
        executor: jest.fn()
      }
    ] : []),
    searchTools: jest.fn().mockReturnValue(options.hasTools ? [
      { 
        tool: { name: 'test-tool-1', description: 'Test tool 1', inputSchema: {} },
        metadata: { serverName: 'test-server', serverId: 'test-server', toolId: 'test-tool-1' },
        executor: jest.fn()
      }
    ] : []),
    getTool: jest.fn()
  };
  
  (sdk as any).toolRegistry = mockToolRegistry;
  
  // Mock AI configuration
  if (options.hasAI) {
    (sdk as any).ai = {
      isConfigured: true,
      provider: 'deepseek',
      model: 'deepseek-chat'
    };
  }
  
  if (options.autoInit !== false) {
    sdk.init();
  }
  
  return sdk;
}

/**
 * Creates a mock ToolResult for testing
 */
export function createMockToolResult(options: {
  content?: Array<{ type: 'text' | 'image' | 'resource'; text?: string; data?: any }>;
  isError?: boolean;
} = {}): ToolResult {
  return {
    content: options.content || [{ type: 'text', text: 'Test result' }],
    isError: options.isError || false
  };
}

/**
 * Creates a mock runtime detection result
 */
export function createMockDetectionResult(options: {
  runtime?: RuntimeType;
  confidence?: number;
  source?: string;
  evidence?: Record<string, any>;
} = {}) {
  return {
    runtime: options.runtime || 'node',
    confidence: options.confidence || 0.9,
    source: options.source || 'enhanced',
    evidence: options.evidence || {}
  };
}

/**
 * Creates a mock service status
 */
export function createMockServiceStatus(options: {
  name?: string;
  status?: 'running' | 'stopped' | 'error' | 'unknown';
  pid?: number;
  uptime?: number;
} = {}) {
  return {
    name: options.name || 'test-service',
    status: options.status || 'running',
    pid: options.pid || 12345,
    uptime: options.uptime || 3600
  };
}

/**
 * Creates a mock AI configuration
 */
export function createMockAIConfig(options: {
  provider?: string;
  apiKey?: string;
  model?: string;
  enabled?: boolean;
} = {}) {
  return {
    provider: options.provider || 'deepseek',
    apiKey: options.apiKey || 'test-api-key',
    model: options.model || 'deepseek-chat',
    enabled: options.enabled !== false
  };
}

/**
 * Creates a mock logger
 */
export function createMockLogger() {
  return {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    log: jest.fn()
  };
}

/**
 * Waits for a specified time (useful for async tests)
 */
export function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Creates a mock performance monitor
 */
export function createMockPerformanceMonitor() {
  return {
    start: jest.fn(),
    stop: jest.fn(),
    recordServiceRequest: jest.fn(),
    getMetrics: jest.fn().mockReturnValue([]),
    clear: jest.fn()
  };
}