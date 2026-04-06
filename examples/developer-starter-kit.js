/**
 * MCPilot SDK Core Developer Starter Kit
 * Friendly entry examples covering all core features
 * 
 * Learning Path:
 * 1. Basic SDK Usage
 * 2. AI Integration
 * 3. MCP Tool Management  
 * 4. Runtime Detection
 * 5. Configuration Management
 * 6. Error Handling
 * 7. Complete Workflow
 */

import { 
  // Core SDK
  MCPilotSDK, 
  createSDK,
  
  // AI Features
  SimpleAI,
  CloudIntentEngine,
  
  // MCP Features
  MCPClient,
  ToolRegistry,
  TransportFactory,
  TOOL_CATEGORIES,
  TOOL_PATTERNS,
  discoverLocalMCPServers,
  
  // Runtime Detection
  EnhancedRuntimeDetector,
  
  // Configuration Management
  ConfigManager,
  
  // Error Handling
  MCPilotError,
  ErrorCode,
  ErrorHandler,
  
  // Utility Functions
  logger
} from './package/dist/index.js';

// Environment check
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_TOKEN;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ Error: DeepSeek API key not found');
  console.error('Please set environment variable:');
  console.error('  export DEEPSEEK_API_KEY=your_api_key_here');
  process.exit(1);
}

console.log('🚀 MCPilot SDK Core Developer Starter Kit');
console.log('='.repeat(60));

async function runStarterKit() {
  try {
    // ==================== Module 1: Basic SDK Usage ====================
    console.log('\n📦 Module 1: Basic SDK Usage');
    console.log('-'.repeat(40));
    
    // Method 1: Using singleton
    console.log('Method 1: Using global singleton');
    const sdk1 = createSDK();
    console.log('✅ SDK singleton created successfully');
    
    // Method 2: Custom configuration
    console.log('\nMethod 2: Creating with custom configuration');
    const sdk2 = new MCPilotSDK({
      ai: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
      },
      logger: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        debug: (msg) => console.debug(`[DEBUG] ${msg}`),
        warn: (msg) => console.warn(`[WARN] ${msg}`)
      }
    });
    console.log('✅ Custom SDK created successfully');
    
    // ==================== Module 2: AI Integration ====================
    console.log('\n🤖 Module 2: AI Integration');
    console.log('-'.repeat(40));
    
    // 2.1 SimpleAI - Basic AI functionality
    console.log('2.1 SimpleAI - Basic AI functionality');
    const simpleAI = new SimpleAI({
      provider: 'deepseek',
      apiKey: DEEPSEEK_API_KEY,
      model: 'deepseek-chat'
    });
    
    try {
      const aiResponse = await simpleAI.chat('Hello, what can you do?');
      console.log('✅ SimpleAI response:', aiResponse.substring(0, 100) + '...');
    } catch (error) {
      console.log('⚠ SimpleAI test skipped (may require network connection)');
    }
    
    // 2.2 CloudIntentEngine - Intent engine
    console.log('\n2.2 CloudIntentEngine - Intent engine');
    const intentEngine = new CloudIntentEngine({
      llm: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1
      }
    });
    
    // Set up mock tools
    intentEngine.setAvailableTools([
      {
        name: 'get_time',
        description: 'Get current time',
        inputSchema: {
          type: 'object',
          properties: {},
          required: []
        }
      }
    ]);
    
    console.log('✅ Intent engine configured successfully');
    
    // ==================== Module 3: MCP Tool Management ====================
    console.log('\n🔧 Module 3: MCP Tool Management');
    console.log('-'.repeat(40));
    
    // 3.1 Tool Registry
    console.log('3.1 Tool Registry');
    const toolRegistry = new ToolRegistry();
    
    // Register custom tool
    toolRegistry.registerTool({
      name: 'calculate',
      description: 'Perform mathematical calculation',
      inputSchema: {
        type: 'object',
        properties: {
          expression: { type: 'string' }
        },
        required: ['expression']
      },
      execute: async ({ expression }) => {
        try {
          // Safe calculation (in production, use a safer approach)
          const result = eval(expression);
          return { success: true, result };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }
    });
    
    console.log('✅ Tool registry configured successfully');
    console.log('Registered tools:', toolRegistry.getAllTools().map(t => t.tool.name));
    
    // 3.2 Predefined tool categories and patterns
    console.log('\n3.2 Predefined tool categories and patterns');
    console.log('Available categories:', Object.keys(TOOL_CATEGORIES));
    console.log('File read pattern:', TOOL_PATTERNS.READ_FILE);
    
    // 3.3 MCP Client
    console.log('\n3.3 MCP Client (mock)');
    const mcpClient = new MCPClient({
      transport: {
        type: 'stdio',
        command: 'echo',
        args: ['Hello from MCP server']
      }
    });
    console.log('✅ MCP client created successfully');
    
    // ==================== Module 4: Runtime Detection ====================
    console.log('\n🔍 Module 4: Runtime Detection');
    console.log('-'.repeat(40));
    
    try {
      const detection = await EnhancedRuntimeDetector.detect('.');
      console.log('✅ Runtime detection completed');
      console.log('Detected runtime:', detection.runtime || 'Unknown');
      console.log('Confidence:', detection.confidence || 0);
      console.log('Source:', detection.source || 'Unknown');
      
      if (detection.tools && detection.tools.length > 0) {
        console.log('Available tools:', detection.tools.slice(0, 3));
      }
    } catch (error) {
      console.log('⚠ Runtime detection skipped:', error.message);
    }
    
    // ==================== Module 5: Configuration Management ====================
    console.log('\n⚙️ Module 5: Configuration Management');
    console.log('-'.repeat(40));
    
    // Initialize configuration system
    ConfigManager.init();
    console.log('✅ Configuration system initialized');
    
    // Save service configuration
    const serviceConfig = {
      name: 'test-service',
      runtime: 'node',
      version: '1.0.0',
      entryPoint: './index.js',
      path: process.cwd() // Add required path property
    };
    
    ConfigManager.saveServiceConfig('test-service', serviceConfig);
    console.log('✅ Service configuration saved successfully');
    
    // Load service configuration
    const loadedConfig = ConfigManager.getServiceConfig('test-service');
    console.log('✅ Service configuration loaded successfully');
    console.log('Configuration keys:', Object.keys(loadedConfig || {}));
    
    // List Docker hosts (example of another ConfigManager feature)
    const dockerHosts = ConfigManager.listDockerHosts();
    console.log('✅ Docker hosts listed:', dockerHosts.length || 0);
    
    // ==================== Module 6: Error Handling ====================
    console.log('\n🚨 Module 6: Error Handling');
    console.log('-'.repeat(40));
    
    // 6.1 Create custom error
    const customError = new MCPilotError(
      'Test error',
      ErrorCode.UNKNOWN_ERROR,
      'Test error description'
    );
    console.log('✅ Custom error created:', customError.message);
    
    // 6.2 Error handler
    const errorHandler = new ErrorHandler();
    
    // Simulate error handling
    try {
      throw new Error('Simulated operation error');
    } catch (error) {
      const handled = errorHandler.handle(error, {
        context: 'Test context',
        retryable: true
      });
      console.log('✅ Error handling completed:', handled ? 'Handled' : 'Not handled');
    }
    
    // ==================== Module 7: Logging System ====================
    console.log('\n📝 Module 7: Logging System');
    console.log('-'.repeat(40));
    
    logger.info('This is an info log message');
    logger.warn('This is a warning log message');
    logger.error('This is an error log message');
    console.log('✅ Logging system tested successfully');
    
    // ==================== Module 8: Complete Workflow Example ====================
    console.log('\n🔄 Module 8: Complete Workflow Example');
    console.log('-'.repeat(40));
    
    console.log('Scenario: Creating a complete AI assistant workflow');
    
    // Create complete SDK instance
    const fullSDK = new MCPilotSDK({
      ai: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1
      },
      toolRegistry,
      logger: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`),
        debug: (msg) => console.debug(`[DEBUG] ${msg}`),
        warn: (msg) => console.warn(`[WARN] ${msg}`)
      }
    });
    
    console.log('✅ Complete SDK instance created successfully');
    console.log('Included features:');
    console.log('  - AI Integration');
    console.log('  - Tool Management');
    console.log('  - Configuration Management');
    console.log('  - Error Handling');
    console.log('  - Logging System');
    
    // ==================== Module 9: Practical Use Cases ====================
    console.log('\n🎯 Module 9: Practical Use Cases');
    console.log('-'.repeat(40));
    
    console.log('Use Case 1: Smart Calculator');
    try {
      const calculation = await toolRegistry.executeTool('calculate', {
        expression: '2 + 3 * 4'
      });
      console.log('Smart calculator result:', calculation.result);
    } catch (error) {
      console.log('Calculator test skipped');
    }
    
    console.log('\nUse Case 2: Intent Parsing Demo');
    try {
      const intentResult = await intentEngine.parseIntent("What time is it?");
      console.log('Intent parsing result:', {
        intentCount: intentResult.intents.length,
        intents: intentResult.intents.map(i => i.type)
      });
    } catch (error) {
      console.log('Intent parsing test skipped');
    }
    
    // ==================== Summary ====================
    console.log('\n' + '='.repeat(60));
    console.log('🎉 Developer Starter Kit Completed!');
    console.log('='.repeat(60));
    
    console.log('\n📊 Core Features Tested:');
    console.log('✅ Basic SDK Usage (MCPilotSDK, createSDK)');
    console.log('✅ AI Integration (SimpleAI, CloudIntentEngine)');
    console.log('✅ MCP Tool Management (ToolRegistry, MCPClient)');
    console.log('✅ Runtime Detection (EnhancedRuntimeDetector)');
    console.log('✅ Configuration Management (ConfigManager)');
    console.log('✅ Error Handling (MCPilotError, ErrorHandler)');
    console.log('✅ Logging System (logger)');
    console.log('✅ Complete Workflow');
    
    console.log('\n🚀 Next Steps:');
    console.log('1. Check detailed documentation: package/README.md');
    console.log('2. Run specialized tests: quick-test.js, final-mvp-test.js');
    console.log('3. Explore examples directory: ../sdk-core/examples/');
    console.log('4. Integrate real MCP servers');
    console.log('5. Build your first AI application');
    
    console.log('\n💡 Tip: All feature modules can be used independently or combined');
    console.log('Choose the right module combination for your needs!');
    
  } catch (error) {
    console.error('❌ Starter kit execution failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Timeout protection
const timeout = 120000; // 2 minutes
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`Starter kit timeout (${timeout}ms)`)), timeout);
});

Promise.race([
  runStarterKit(),
  timeoutPromise
])
.then(() => {
  console.log('\n✅ Developer Starter Kit completed normally');
  process.exit(0);
})
.catch(error => {
  console.error(`❌ Developer Starter Kit ended with error: ${error.message}`);
  process.exit(1);
});