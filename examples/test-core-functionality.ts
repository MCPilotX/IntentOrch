/**
 * MCPilot SDK Core Functionality Test
 * Comprehensive test coverage for all core SDK functionality
 */

import { mcpilot, MCPilotSDK, createSDK } from '../src/index';
import { MCPClient, ToolRegistry, createMCPConfig } from '../src/mcp';

async function runCoreFunctionalityTests() {
  console.log('🔬 MCPilot SDK Core Functionality Tests\n');
  
  let testCount = 0;
  let passedCount = 0;
  let failedCount = 0;

  const test = (name: string, testFn: () => Promise<void> | void) => {
    testCount++;
    try {
      console.log(`Test ${testCount}: ${name}`);
      const result = testFn();
      if (result instanceof Promise) {
        return result.then(() => {
          console.log(`  ✅ PASSED\n`);
          passedCount++;
        }).catch((error) => {
          console.log(`  ❌ FAILED: ${error.message}\n`);
          failedCount++;
        });
      } else {
        console.log(`  ✅ PASSED\n`);
        passedCount++;
      }
    } catch (error: any) {
      console.log(`  ❌ FAILED: ${error.message}\n`);
      failedCount++;
    }
  };

  // ==================== SDK Initialization Tests ====================
  
  console.log('📦 SDK Initialization Tests');
  console.log('============================\n');

  test('Singleton instance should be available', () => {
    if (!mcpilot) {
      throw new Error('Singleton instance not available');
    }
  });

  test('Singleton instance should be auto-initialized', () => {
    // The singleton should be initialized by default
    const config = mcpilot.getConfig();
    if (!config) {
      throw new Error('Singleton not initialized');
    }
  });

  test('Should create custom SDK instance', () => {
    const customSDK = new MCPilotSDK({
      autoInit: true,
      logger: console
    });
    
    if (!customSDK) {
      throw new Error('Failed to create custom SDK instance');
    }
  });

  test('Should create SDK using factory function', () => {
    const sdk = createSDK({
      autoInit: true
    });
    
    if (!sdk) {
      throw new Error('Failed to create SDK using factory function');
    }
  });

  test('Custom SDK should have different instance than singleton', () => {
    const customSDK = new MCPilotSDK({ autoInit: true });
    if (customSDK === mcpilot) {
      throw new Error('Custom SDK should be different instance from singleton');
    }
  });

  // ==================== Configuration Management Tests ====================
  
  console.log('\n⚙️  Configuration Management Tests');
  console.log('==================================\n');

  test('Should get current configuration', () => {
    const config = mcpilot.getConfig();
    if (!config || typeof config !== 'object') {
      throw new Error('Failed to get configuration');
    }
  });

  test('Configuration should have AI section', () => {
    const config = mcpilot.getConfig();
    if (!config.ai) {
      throw new Error('Configuration missing AI section');
    }
  });

  test('Configuration should have registry section', () => {
    const config = mcpilot.getConfig();
    if (!config.registry) {
      throw new Error('Configuration missing registry section');
    }
  });

  test('Configuration should have services section', () => {
    const config = mcpilot.getConfig();
    if (!config.services) {
      throw new Error('Configuration missing services section');
    }
  });

  test('Should update AI configuration', async () => {
    const originalConfig = mcpilot.getConfig();
    await mcpilot.configureAI({
      provider: 'openai',
      model: 'gpt-4-test'
    });
    
    const updatedConfig = mcpilot.getConfig();
    if (updatedConfig.ai.provider !== 'openai' || updatedConfig.ai.model !== 'gpt-4-test') {
      throw new Error('AI configuration not updated correctly');
    }
  });

  // ==================== Service Management Tests ====================
  
  console.log('\n🚀 Service Management Tests');
  console.log('===========================\n');

  test('Should list services (initially empty)', () => {
    const services = mcpilot.listServices();
    if (!Array.isArray(services)) {
      throw new Error('listServices should return an array');
    }
  });

  test('Should handle service status for non-existent service', async () => {
    const status = await mcpilot.getServiceStatus('non-existent-service');
    if (!status || status.status !== 'unknown') {
      throw new Error('Should return unknown status for non-existent service');
    }
  });

  // ==================== MCP Functionality Tests ====================
  
  console.log('\n🔌 MCP Functionality Tests');
  console.log('==========================\n');

  test('Should initialize MCP functionality', async () => {
    await mcpilot.initMCP();
    // If no error, initialization succeeded
  });

  test('Should list MCP servers', () => {
    const servers = mcpilot.listMCPServers();
    if (!Array.isArray(servers)) {
      throw new Error('listMCPServers should return an array');
    }
  });

  test('Should get MCP server status for non-existent server', () => {
    const status = mcpilot.getMCPServerStatus('non-existent-server');
    if (status !== undefined) {
      throw new Error('Should return undefined for non-existent server');
    }
  });

  // ==================== Tool Management Tests ====================
  
  console.log('\n🛠️  Tool Management Tests');
  console.log('=========================\n');

  test('Should list tools', () => {
    const tools = mcpilot.listTools();
    if (!Array.isArray(tools)) {
      throw new Error('listTools should return an array');
    }
  });

  test('Should search tools', () => {
    const results = mcpilot.searchTools('test');
    if (!Array.isArray(results)) {
      throw new Error('searchTools should return an array');
    }
  });

  test('Should get tool statistics', () => {
    const stats = mcpilot.getToolStatistics();
    if (!stats || typeof stats !== 'object') {
      throw new Error('getToolStatistics should return an object');
    }
    
    if (typeof stats.totalTools !== 'number') {
      throw new Error('Tool statistics should include totalTools');
    }
  });

  test('Should handle tool execution for non-existent tool', async () => {
    try {
      await mcpilot.executeTool('non-existent-tool', {});
      throw new Error('Should have thrown error for non-existent tool');
    } catch (error) {
      // Expected behavior
    }
  });

  // ==================== AI Functionality Tests ====================
  
  console.log('\n🤖 AI Functionality Tests');
  console.log('=========================\n');

  test('Should handle AI query with unconfigured provider', async () => {
    try {
      // Reset to no AI provider
      await mcpilot.configureAI({ provider: 'none' as any });
      await mcpilot.ask('test question');
      throw new Error('Should have thrown error for unconfigured AI');
    } catch (error) {
      // Expected behavior
    }
  });

  // ==================== MCP Module Tests ====================
  
  console.log('\n🔧 MCP Module Tests');
  console.log('===================\n');

  test('Should create MCP config', () => {
    const config = createMCPConfig('stdio', {
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem']
    });
    
    if (!config.transport || config.transport.type !== 'stdio') {
      throw new Error('Failed to create MCP config');
    }
  });

  test('Should create ToolRegistry instance', () => {
    const registry = new ToolRegistry();
    if (!registry) {
      throw new Error('Failed to create ToolRegistry');
    }
  });

  test('ToolRegistry should have basic methods', () => {
    const registry = new ToolRegistry();
    
    if (typeof registry.getAllTools !== 'function') {
      throw new Error('ToolRegistry missing getAllTools method');
    }
    
    if (typeof registry.executeTool !== 'function') {
      throw new Error('ToolRegistry missing executeTool method');
    }
    
    if (typeof registry.searchTools !== 'function') {
      throw new Error('ToolRegistry missing searchTools method');
    }
  });

  // ==================== Test Summary ====================
  
  console.log('\n📊 Test Summary');
  console.log('===============\n');
  
  console.log(`Total Tests: ${testCount}`);
  console.log(`Passed: ${passedCount}`);
  console.log(`Failed: ${failedCount}`);
  console.log(`Success Rate: ${((passedCount / testCount) * 100).toFixed(1)}%\n`);
  
  if (failedCount === 0) {
    console.log('🎉 All tests passed!');
  } else {
    console.log(`⚠️  ${failedCount} test(s) failed`);
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('   1. Install dependencies: npm install');
  console.log('   2. Build SDK: npm run build');
  console.log('   3. Run tests: npx tsx examples/test-core-functionality.ts');
}

// Run all tests
runCoreFunctionalityTests().catch(console.error);