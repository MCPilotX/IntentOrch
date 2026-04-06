/**
 * AI Integration Examples
 * Demonstrates SimpleAI and CloudIntentEngine usage
 */

import { SimpleAI, CloudIntentEngine } from './package/dist/index.js';

// Environment check
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_TOKEN;
if (!DEEPSEEK_API_KEY) {
  console.error('❌ Error: DeepSeek API key not found');
  console.error('Please set environment variable:');
  console.error('  export DEEPSEEK_API_KEY=your_api_key_here');
  process.exit(1);
}

console.log('🤖 AI Integration Examples');
console.log('='.repeat(50));

async function runAIExamples() {
  try {
    // ==================== SimpleAI Examples ====================
    console.log('\n🔹 SimpleAI - Basic AI Functionality');
    console.log('-'.repeat(40));
    
    // Example 1: Basic chat
    console.log('\nExample 1: Basic Chat');
    const simpleAI = new SimpleAI();
    
    try {
      // SimpleAI needs to be configured first
      await simpleAI.configure({
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1
      });
      
      // SimpleAI has ask() method, not chat()
      const response = await simpleAI.ask('Hello! Introduce yourself briefly.');
      console.log('✅ AI Response:', response.message?.substring(0, 150) || 'No response');
    } catch (error) {
      console.log('⚠ Chat test skipped:', error.message);
    }
    
    // Example 2: System prompt
    console.log('\nExample 2: With System Prompt');
    const aiWithSystem = new SimpleAI();
    
    try {
      // Configure AI first
      await aiWithSystem.configure({
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat'
      });
      
      const codingResponse = await aiWithSystem.ask('Explain JavaScript closures in one sentence.');
      console.log('✅ Coding Response:', codingResponse.message || 'No response');
    } catch (error) {
      console.log('⚠ System prompt test skipped:', error.message);
    }
    
    // Example 3: Streaming response (simulated)
    console.log('\nExample 3: Streaming Response Pattern');
    console.log('(Simulated - actual streaming depends on provider support)');
    
    // ==================== CloudIntentEngine Examples ====================
    console.log('\n🔹 CloudIntentEngine - Advanced Intent Processing');
    console.log('-'.repeat(40));
    
    // Example 4: Basic intent engine setup
    console.log('\nExample 4: Intent Engine Setup');
    const intentEngine = new CloudIntentEngine({
      llm: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1,
        maxTokens: 1024
      },
      execution: {
        maxConcurrentTools: 3
      },
      fallback: {
        enableKeywordMatching: true
      }
    });
    
    console.log('✅ Intent engine created successfully');
    
    // Example 5: Tool configuration
    console.log('\nExample 5: Tool Configuration');
    const mockTools = [
      {
        name: 'read_file',
        description: 'Read content from a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' }
          },
          required: ['path']
        }
      },
      {
        name: 'search_files',
        description: 'Search for files matching pattern',
        inputSchema: {
          type: 'object',
          properties: {
            pattern: { type: 'string', description: 'Search pattern' },
            directory: { type: 'string', description: 'Directory to search' }
          },
          required: ['pattern']
        }
      },
      {
        name: 'execute_command',
        description: 'Execute shell command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Command to execute' }
          },
          required: ['command']
        }
      }
    ];
    
    intentEngine.setAvailableTools(mockTools);
    console.log('✅ Tools configured:', mockTools.map(t => t.name));
    
    // Example 6: Intent parsing
    console.log('\nExample 6: Intent Parsing');
    try {
      const intentResult = await intentEngine.parseIntent("Read the config.json file and search for JavaScript files");
      console.log('✅ Intent parsing successful');
      console.log('Number of intents:', intentResult.intents.length);
      
      if (intentResult.intents.length > 0) {
        console.log('First intent:', {
          type: intentResult.intents[0].type,
          description: intentResult.intents[0].description
        });
      }
      
      if (intentResult.edges.length > 0) {
        console.log('Dependencies:', intentResult.edges.map(e => `${e.from} → ${e.to}`));
      }
    } catch (error) {
      console.log('⚠ Intent parsing test skipped:', error.message);
    }
    
    // Example 7: Tool selection
    console.log('\nExample 7: Tool Selection');
    try {
      const mockIntents = [
        {
          id: 'I1',
          type: 'read_file',
          description: 'Read configuration file',
          parameters: { path: 'config.json' }
        }
      ];
      
      const toolSelections = await intentEngine.selectTools(mockIntents);
      console.log('✅ Tool selection successful');
      console.log('Selected tools:', toolSelections.map(t => t.toolName));
    } catch (error) {
      console.log('⚠ Tool selection test skipped');
    }
    
    // Example 8: Complete workflow
    console.log('\nExample 8: Complete Workflow Pattern');
    
    // Mock tool executor
    const mockToolExecutor = async (toolName, params) => {
      console.log(`  [Mock Execution] ${toolName}:`, params);
      return { success: true, result: `Executed ${toolName}` };
    };
    
    const workflowIntents = [
      {
        id: 'W1',
        type: 'search_files',
        description: 'Search for configuration files',
        parameters: { pattern: '*.json', directory: '.' }
      }
    ];
    
    const workflowSelections = [
      {
        intentId: 'W1',
        toolName: 'search_files',
        toolDescription: 'Search for files matching pattern',
        mappedParameters: { pattern: '*.json', directory: '.' },
        confidence: 0.9
      }
    ];
    
    try {
      const executionResult = await intentEngine.executeWorkflow(
        workflowIntents,
        workflowSelections,
        [], // No dependencies
        mockToolExecutor
      );
      
      console.log('✅ Workflow execution:', executionResult.success ? 'Success' : 'Failed');
    } catch (error) {
      console.log('⚠ Workflow test skipped');
    }
    
    // ==================== Summary ====================
    console.log('\n' + '='.repeat(50));
    console.log('🎯 AI Integration Summary');
    console.log('='.repeat(50));
    
    console.log('\nSimpleAI Features:');
    console.log('✅ Basic chat functionality');
    console.log('✅ System prompts for context');
    console.log('✅ Configurable AI providers');
    
    console.log('\nCloudIntentEngine Features:');
    console.log('✅ Natural language intent parsing');
    console.log('✅ Tool matching and selection');
    console.log('✅ Workflow execution');
    console.log('✅ Dependency management');
    
    console.log('\nUse Cases:');
    console.log('• Chat interfaces with AI');
    console.log('• Natural language to tool commands');
    console.log('• Automated workflow execution');
    console.log('• Intelligent task automation');
    
    console.log('\nNext Steps:');
    console.log('• Run: node 3-mcp-tools.js for tool management examples');
    console.log('• Run: node developer-starter-kit.js for complete overview');
    console.log('• Explore: ../sdk-core/examples/ for more AI examples');
    
  } catch (error) {
    console.error('❌ AI examples failed:', error.message);
    console.error(error.stack);
  }
}

// Run with timeout protection
const timeout = 90000; // 90 seconds
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`AI examples timeout (${timeout}ms)`)), timeout);
});

Promise.race([
  runAIExamples(),
  timeoutPromise
])
.then(() => {
  console.log('\n✅ AI Integration examples completed');
  process.exit(0);
})
.catch(error => {
  console.error(`❌ AI Integration examples failed: ${error.message}`);
  process.exit(1);
});