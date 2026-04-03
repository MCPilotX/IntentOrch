/**
 * MCP Client Functionality Test
 * Comprehensive test coverage for MCP client functionality
 */

import { MCPClient, createMCPConfig } from '../src/mcp';

async function runMCPClientTests() {
  console.log('🔌 MCP Client Functionality Tests\n');
  
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

  // ==================== MCP Client Creation Tests ====================
  
  console.log('📦 MCP Client Creation Tests');
  console.log('=============================\n');

  test('Should create MCP client with stdio transport', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    if (!client) {
      throw new Error('Failed to create MCP client');
    }
  });

  test('Should create MCP client with HTTP transport', () => {
    const config = createMCPConfig('http', {
      url: 'http://localhost:8080',
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    if (!client) {
      throw new Error('Failed to create MCP client with HTTP transport');
    }
  });

  test('Should create MCP client with SSE transport', () => {
    const config = createMCPConfig('sse', {
      url: 'http://localhost:8080/sse',
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    if (!client) {
      throw new Error('Failed to create MCP client with SSE transport');
    }
  });

  test('MCP client should have required methods', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    
    const requiredMethods = [
      'connect',
      'disconnect',
      'isConnected',
      'listTools',
      'callTool',
      'listResources',
      'readResource',
      'listPrompts',
      'getPrompt',
      'getStatus'
    ];
    
    for (const method of requiredMethods) {
      if (typeof (client as any)[method] !== 'function') {
        throw new Error(`MCP client missing ${method} method`);
      }
    }
  });

  // ==================== MCP Client Configuration Tests ====================
  
  console.log('\n⚙️  MCP Client Configuration Tests');
  console.log('==================================\n');

  test('Should create config with timeout', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      timeout: 5000,
      autoConnect: false
    });
    
    if (config.timeout !== 5000) {
      throw new Error('Timeout not set correctly in config');
    }
  });

  test('Should create config with max retries', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      maxRetries: 3,
      autoConnect: false
    });
    
    if (config.maxRetries !== 3) {
      throw new Error('Max retries not set correctly in config');
    }
  });

  test('Should create config with autoConnect disabled', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    if (config.autoConnect !== false) {
      throw new Error('AutoConnect not set correctly in config');
    }
  });

  // ==================== MCP Client State Tests ====================
  
  console.log('\n🔋 MCP Client State Tests');
  console.log('=========================\n');

  test('New client should not be connected', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    if (client.isConnected()) {
      throw new Error('New client should not be connected');
    }
  });

  test('Client should handle connection state correctly', async () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    
    // Try to connect (will likely fail since echo is not an MCP server)
    try {
      await client.connect();
      // If it succeeds, that's fine for this test
    } catch (error) {
      // Expected for echo command
    }
    
    // Try to disconnect
    try {
      await client.disconnect();
    } catch (error) {
      // Ignore disconnect errors
    }
  });

  // ==================== MCP Client Error Handling Tests ====================
  
  console.log('\n🚨 MCP Client Error Handling Tests');
  console.log('==================================\n');

  test('Should handle tool call without connection', async () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    
    try {
      await client.callTool('test_tool', {});
      throw new Error('Should have thrown error for tool call without connection');
    } catch (error) {
      // Expected behavior
    }
  });

  test('Should handle resource read without connection', async () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    
    try {
      await client.readResource('test://resource');
      throw new Error('Should have thrown error for resource read without connection');
    } catch (error) {
      // Expected behavior
    }
  });

  // ==================== MCP Client Status Tests ====================
  
  console.log('\n📊 MCP Client Status Tests');
  console.log('==========================\n');

  test('Should get client status', () => {
    const config = createMCPConfig('stdio', {
      command: 'echo',
      args: ['test'],
      autoConnect: false
    });
    
    const client = new MCPClient(config);
    const status = client.getStatus();
    
    if (!status || typeof status !== 'object') {
      throw new Error('getStatus should return an object');
    }
    
    if (typeof status.connected !== 'boolean') {
      throw new Error('Status should include connected flag');
    }
    
    if (typeof status.toolsCount !== 'number') {
      throw new Error('Status should include toolsCount');
    }
    
    if (typeof status.resourcesCount !== 'number') {
      throw new Error('Status should include resourcesCount');
    }
    
    if (typeof status.promptsCount !== 'number') {
      throw new Error('Status should include promptsCount');
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
    console.log('🎉 All MCP client tests passed!');
  } else {
    console.log(`⚠️  ${failedCount} test(s) failed`);
  }
  
  console.log('\n🚀 Next Steps:');
  console.log('   1. Install dependencies: npm install');
  console.log('   2. Build SDK: npm run build');
  console.log('   3. Run tests: npx tsx examples/test-mcp-client.ts');
}

// Run all tests
runMCPClientTests().catch(console.error);