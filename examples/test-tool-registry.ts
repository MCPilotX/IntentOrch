/**
 * Tool Registry Functionality Test
 * Comprehensive test coverage for Tool Registry functionality
 */

import { ToolRegistry } from '../src/mcp';

async function runToolRegistryTests() {
  console.log('🛠️  Tool Registry Functionality Tests\n');
  
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

  // ==================== Tool Registry Creation Tests ====================
  
  console.log('📦 Tool Registry Creation Tests');
  console.log('===============================\n');

  test('Should create ToolRegistry instance', () => {
    const registry = new ToolRegistry();
    if (!registry) {
      throw new Error('Failed to create ToolRegistry');
    }
  });

  test('ToolRegistry should have required methods', () => {
    const registry = new ToolRegistry();
    
    const requiredMethods = [
      'registerMCPTool',
      'registerMCPTools',
      'getAllTools',
      'getToolsByServer',
      'searchTools',
      'executeTool',
      'unregisterServerTools',
      'getToolStatistics'
    ];
    
    for (const method of requiredMethods) {
      if (typeof (registry as any)[method] !== 'function') {
        throw new Error(`ToolRegistry missing ${method} method`);
      }
    }
  });

  // ==================== Tool Registration Tests ====================
  
  console.log('\n📝 Tool Registration Tests');
  console.log('==========================\n');

  test('Should register MCP tool', () => {
    const registry = new ToolRegistry();
    
    const tool = {
      name: 'test_tool',
      description: 'A test tool',
      inputSchema: {
        type: 'object',
        properties: {
          param1: { type: 'string' }
        }
      }
    };
    
    const executor = async (args: any) => ({
      content: [{ type: 'text', text: 'Test result' }],
      isError: false
    });
    
    registry.registerMCPTool(tool, executor, 'test-server', 'server-1');
    
    const tools = registry.getAllTools();
    if (tools.length !== 1) {
      throw new Error('Tool not registered correctly');
    }
    
    if (tools[0].tool.name !== 'test_tool') {
      throw new Error('Registered tool has wrong name');
    }
  });

  test('Should register multiple MCP tools', () => {
    const registry = new ToolRegistry();
    
    const tools = [
      {
        name: 'tool1',
        description: 'First tool',
        inputSchema: { type: 'object', properties: {} }
      },
      {
        name: 'tool2',
        description: 'Second tool',
        inputSchema: { type: 'object', properties: {} }
      }
    ];
    
    const executor = async (args: any) => ({
      content: [{ type: 'text', text: 'Test result' }],
      isError: false
    });
    
    registry.registerMCPTools(tools, executor, 'test-server', 'server-1');
    
    const registeredTools = registry.getAllTools();
    if (registeredTools.length !== 2) {
      throw new Error('Not all tools registered');
    }
  });

  test('Should get tools by server', () => {
    const registry = new ToolRegistry();
    
    // Register tools for server 1
    registry.registerMCPTool(
      { name: 'server1_tool', description: 'Tool from server 1', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-1',
      'server-1'
    );
    
    // Register tools for server 2
    registry.registerMCPTool(
      { name: 'server2_tool', description: 'Tool from server 2', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-2',
      'server-2'
    );
    
    const server1Tools = registry.getToolsByServer('server-1');
    if (server1Tools.length !== 1) {
      throw new Error('Wrong number of tools for server 1');
    }
    
    if (server1Tools[0].tool.name !== 'server1_tool') {
      throw new Error('Wrong tool for server 1');
    }
    
    const server2Tools = registry.getToolsByServer('server-2');
    if (server2Tools.length !== 1) {
      throw new Error('Wrong number of tools for server 2');
    }
  });

  // ==================== Tool Search Tests ====================
  
  console.log('\n🔍 Tool Search Tests');
  console.log('====================\n');

  test('Should search tools by name', () => {
    const registry = new ToolRegistry();
    
    registry.registerMCPTool(
      { name: 'read_file', description: 'Read a file', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'filesystem',
      'filesystem'
    );
    
    registry.registerMCPTool(
      { name: 'write_file', description: 'Write to a file', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'filesystem',
      'filesystem'
    );
    
    registry.registerMCPTool(
      { name: 'list_directory', description: 'List directory contents', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'filesystem',
      'filesystem'
    );
    
    const fileTools = registry.searchTools('file');
    if (fileTools.length !== 2) {
      throw new Error(`Expected 2 file tools, got ${fileTools.length}`);
    }
    
    const readTools = registry.searchTools('read');
    if (readTools.length !== 1) {
      throw new Error(`Expected 1 read tool, got ${readTools.length}`);
    }
    
    if (readTools[0].tool.name !== 'read_file') {
      throw new Error('Wrong tool found for search');
    }
  });

  test('Should search tools by description', () => {
    const registry = new ToolRegistry();
    
    registry.registerMCPTool(
      { name: 'tool1', description: 'Read files from disk', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'test',
      'test'
    );
    
    registry.registerMCPTool(
      { name: 'tool2', description: 'Write data to files', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'test',
      'test'
    );
    
    const diskTools = registry.searchTools('disk');
    if (diskTools.length !== 1) {
      throw new Error(`Expected 1 disk tool, got ${diskTools.length}`);
    }
    
    const fileTools = registry.searchTools('file');
    if (fileTools.length !== 2) {
      throw new Error(`Expected 2 file tools, got ${fileTools.length}`);
    }
  });

  // ==================== Tool Execution Tests ====================
  
  console.log('\n⚡ Tool Execution Tests');
  console.log('=======================\n');

  test('Should execute registered tool', async () => {
    const registry = new ToolRegistry();
    
    const testTool = {
      name: 'echo',
      description: 'Echo input',
      inputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string' }
        },
        required: ['message']
      }
    };
    
    const executor = async (args: any) => ({
      content: [{ type: 'text', text: `Echo: ${args.message}` }],
      isError: false
    });
    
    registry.registerMCPTool(testTool, executor, 'test', 'test');
    
    const result = await registry.executeTool({
      name: 'echo',
      arguments: { message: 'Hello World' }
    });
    
    if (!result || result.isError) {
      throw new Error('Tool execution failed');
    }
    
    if (result.content[0].text !== 'Echo: Hello World') {
      throw new Error('Wrong execution result');
    }
  });

  test('Should handle tool execution error', async () => {
    const registry = new ToolRegistry();
    
    const errorTool = {
      name: 'error_tool',
      description: 'Tool that always errors',
      inputSchema: { type: 'object', properties: {} }
    };
    
    const executor = async (args: any) => ({
      content: [{ type: 'text', text: 'Error occurred' }],
      isError: true
    });
    
    registry.registerMCPTool(errorTool, executor, 'test', 'test');
    
    const result = await registry.executeTool({
      name: 'error_tool',
      arguments: {}
    });
    
    if (!result.isError) {
      throw new Error('Tool should have returned error');
    }
  });

  test('Should handle non-existent tool execution', async () => {
    const registry = new ToolRegistry();
    
    try {
      await registry.executeTool({
        name: 'non_existent',
        arguments: {}
      });
      throw new Error('Should have thrown error for non-existent tool');
    } catch (error) {
      // Expected behavior
    }
  });

  // ==================== Tool Management Tests ====================
  
  console.log('\n🗂️  Tool Management Tests');
  console.log('========================\n');

  test('Should unregister server tools', () => {
    const registry = new ToolRegistry();
    
    // Register tools for two servers
    registry.registerMCPTool(
      { name: 'server1_tool', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-1',
      'server-1'
    );
    
    registry.registerMCPTool(
      { name: 'server2_tool', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-2',
      'server-2'
    );
    
    // Unregister server 1 tools
    registry.unregisterServerTools('server-1');
    
    const allTools = registry.getAllTools();
    if (allTools.length !== 1) {
      throw new Error(`Expected 1 tool after unregister, got ${allTools.length}`);
    }
    
    if (allTools[0].tool.name !== 'server2_tool') {
      throw new Error('Wrong tool remaining after unregister');
    }
    
    const server1Tools = registry.getToolsByServer('server-1');
    if (server1Tools.length !== 0) {
      throw new Error('Server 1 tools should be empty');
    }
  });

  // ==================== Tool Statistics Tests ====================
  
  console.log('\n📊 Tool Statistics Tests');
  console.log('========================\n');

  test('Should get tool statistics', () => {
    const registry = new ToolRegistry();
    
    // Register tools from multiple servers
    registry.registerMCPTool(
      { name: 'tool1', description: 'Tool 1', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-a',
      'server-a'
    );
    
    registry.registerMCPTool(
      { name: 'tool2', description: 'Tool 2', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-a',
      'server-a'
    );
    
    registry.registerMCPTool(
      { name: 'tool3', description: 'Tool 3', inputSchema: { type: 'object', properties: {} } },
      async () => ({ content: [{ type: 'text', text: 'Result' }], isError: false }),
      'server-b',
      'server-b'
    );
    
    const stats = registry.getToolStatistics();
    
    if (stats.totalTools !== 3) {
      throw new Error(`Wrong total tools: ${stats.totalTools}`);
    }
    
    if (!stats.byServer || typeof stats.byServer !== 'object') {
      throw new Error('Missing byServer statistics');
    }
    
    if (stats.byServer['server-a'] !== 2) {
      throw new Error(`Wrong tool count for server-a: ${stats.byServer['server-a']}`);
    }
    
    if (stats.byServer['server-b'] !== 1) {
      throw new Error(`Wrong tool count for server-b: ${stats.byServer['server-b']}`);
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
    console.log('🎉 All tool registry tests passed!');
  } else {
    console.log(`⚠️  ${failedCount} test(s) failed`);
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('   1. Install dependencies: npm install');
  console.log('   2. Build SDK: npm run build');
  console.log('   3. Run tests: npx tsx examples/test-tool-registry.ts');
}

// Run all tests
runToolRegistryTests().catch(console.error);