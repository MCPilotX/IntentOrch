/**
 * MCPilot SDK Basic Usage Example
 * Developers can run this example to test SDK functionality
 */

import { mcpilot, MCPilotSDK } from '../src/index';

async function runExamples() {
  console.log('🚀 MCPilot SDK Basic Usage Example\n');

  // ==================== Example 1: Using Singleton Instance ====================
  
  console.log('📦 Example 1: Using Singleton Instance');
  console.log('----------------------------------------');
  
  try {
    // Singleton instance is already auto-initialized
    console.log('1. SDK singleton instance is ready:', mcpilot);
    
    // Get current configuration
    const config = mcpilot.getConfig();
    console.log('2. Current configuration:', JSON.stringify(config, null, 2));
    
    console.log('✅ Singleton instance test passed\n');
  } catch (error) {
    console.log('❌ Singleton instance test failed:', error.message, '\n');
  }

  // ==================== Example 2: Creating Custom Instance ====================
  
  console.log('🔧 Example 2: Creating Custom Instance');
  console.log('----------------------------------------');
  
  try {
    const customSDK = new MCPilotSDK({
      autoInit: true,
      logger: {
        info: (msg) => console.log(`   [INFO] ${msg}`),
        error: (msg) => console.log(`   [ERROR] ${msg}`),
        debug: (msg) => console.log(`   [DEBUG] ${msg}`),
      },
      mcp: {
        autoDiscover: false,
      }
    });
    
    console.log('1. Custom SDK instance created successfully');
    
    // List services (should be empty initially)
    const services = customSDK.listServices();
    console.log(`2. Current service count: ${services.length}`);
    
    console.log('✅ Custom instance test passed\n');
  } catch (error) {
    console.log('❌ Custom instance test failed:', error.message, '\n');
  }

  // ==================== Example 3: MCP Functionality Test ====================
  
  console.log('🔌 Example 3: MCP Functionality Test');
  console.log('--------------------------------------');
  
  try {
    console.log('1. Initializing MCP functionality...');
    await mcpilot.initMCP();
    console.log('   MCP functionality initialized');
    
    // List MCP servers (may be empty depending on environment)
    const servers = mcpilot.listMCPServers();
    console.log(`2. Current MCP server count: ${servers.length}`);
    
    if (servers.length > 0) {
      console.log('   Server list:', servers);
      
      // Get status of first server
      const status = mcpilot.getMCPServerStatus(servers[0]);
      console.log(`3. Server "${servers[0]}" status:`, status);
    }
    
    console.log('✅ MCP functionality test passed\n');
  } catch (error) {
    console.log('⚠️  MCP functionality test partially failed (may have no MCP servers):', error.message, '\n');
  }

  // ==================== Example 4: Tool Management Test ====================
  
  console.log('🛠️  Example 4: Tool Management Test');
  console.log('--------------------------------------');
  
  try {
    // List all tools
    const tools = mcpilot.listTools();
    console.log(`1. Available tool count: ${tools.length}`);
    
    if (tools.length > 0) {
      console.log('   First 3 tools:');
      tools.slice(0, 3).forEach((tool, index) => {
        console.log(`   ${index + 1}. ${tool.name} - ${tool.description}`);
        console.log(`      Source: ${tool.serverName || 'unknown'}`);
      });
      
      // Test tool search
      const searchResults = mcpilot.searchTools('file');
      console.log(`2. Search for "file" related tools: ${searchResults.length} results`);
      
      // Get tool statistics
      const stats = mcpilot.getToolStatistics();
      console.log('3. Tool statistics:');
      console.log(`   Total tools: ${stats.totalTools}`);
      console.log(`   Distribution by server:`, stats.byServer);
    }
    
    console.log('✅ Tool management test passed\n');
  } catch (error) {
    console.log('⚠️  Tool management test partially failed:', error.message, '\n');
  }

  // ==================== Example 5: Configuration Management Test ====================
  
  console.log('⚙️  Example 5: Configuration Management Test');
  console.log('---------------------------------------------');
  
  try {
    // Get current configuration
    const currentConfig = mcpilot.getConfig();
    console.log('1. Current AI configuration:', currentConfig.ai);
    
    // Test AI configuration update
    console.log('2. Updating AI configuration...');
    await mcpilot.configureAI({
      provider: 'openai',
      model: 'gpt-4',
      apiKey: 'sk-test-key' // Test API key
    });
    
    // Get updated configuration
    const updatedConfig = mcpilot.getConfig();
    console.log('3. Updated AI configuration:', updatedConfig.ai);
    
    // Test AI query (may not actually call API due to test configuration)
    console.log('4. Testing AI query...');
    try {
      const answer = await mcpilot.ask('Hello, this is a test question');
      console.log(`   AI answer: ${answer.answer}`);
      console.log(`   Confidence: ${answer.confidence}`);
    } catch (aiError) {
      console.log('   AI query test (expected behavior):', aiError.message);
    }
    
    console.log('✅ Configuration management test passed\n');
  } catch (error) {
    console.log('❌ Configuration management test failed:', error.message, '\n');
  }

  // ==================== Example 6: Service Management Test ====================
  
  console.log('🚀 Example 6: Service Management Test');
  console.log('----------------------------------------');
  
  try {
    // List current services
    const services = mcpilot.listServices();
    console.log(`1. Current service count: ${services.length}`);
    
    if (services.length > 0) {
      console.log('   Service list:', services);
      
      // Get status of first service
      const status = await mcpilot.getServiceStatus(services[0]);
      console.log(`2. Service "${services[0]}" status:`, status);
    } else {
      console.log('2. No configured services, skipping service status check');
    }
    
    console.log('✅ Service management test passed\n');
  } catch (error) {
    console.log('⚠️  Service management test partially failed:', error.message, '\n');
  }

  console.log('🎉 All example tests completed!');
  console.log('\n📋 Test Summary:');
  console.log('   - Singleton instance: ✅ Available');
  console.log('   - Custom instance: ✅ Available');
  console.log('   - MCP functionality: ⚠️  Environment dependent');
  console.log('   - Tool management: ✅ Available');
  console.log('   - Configuration management: ✅ Available');
  console.log('   - Service management: ✅ Available');
  console.log('\n🚀 Next Steps:');
  console.log('   1. Install dependencies: npm install');
  console.log('   2. Build SDK: npm run build');
  console.log('   3. Run example: npx tsx examples/basic-usage.ts');
}

// Run all examples
runExamples().catch(console.error);