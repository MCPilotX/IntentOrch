/**
 * Basic SDK Usage Examples
 * Demonstrates different ways to create and use MCPilotSDK
 */

import { MCPilotSDK, createSDK } from './package/dist/index.js';

console.log('🚀 Basic SDK Usage Examples');
console.log('='.repeat(50));

async function runBasicExamples() {
  try {
    // Example 1: Quick start with singleton
    console.log('\n📦 Example 1: Quick Start with Singleton');
    console.log('-'.repeat(30));
    
    const sdk1 = createSDK();
    console.log('✅ SDK singleton created');
    console.log('Type:', typeof sdk1);
    console.log('Methods available:', Object.keys(sdk1).filter(k => typeof sdk1[k] === 'function').slice(0, 5));
    
    // Example 2: Custom configuration (simplified)
    console.log('\n📦 Example 2: Custom Configuration');
    console.log('-'.repeat(30));
    
    const sdk2 = new MCPilotSDK({
      // AI configuration
      ai: {
        provider: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY || 'your-api-key',
        model: 'deepseek-chat',
        temperature: 0.1
      },
      
      // MCP configuration
      mcp: {
        autoDiscover: true,
        servers: []
      }
      // Note: Using SDK's default logger to avoid configuration errors
    });
    
    console.log('✅ Custom SDK configured');
    console.log('SDK instance created successfully');
    
    // Example 3: Minimal configuration
    console.log('\n📦 Example 3: Minimal Configuration');
    console.log('-'.repeat(30));
    
    const sdk3 = new MCPilotSDK({
      ai: {
        provider: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY || 'your-api-key'
      }
    });
    
    console.log('✅ Minimal SDK configured');
    console.log('Configuration keys:', Object.keys(sdk3.config || {}));
    
    // Example 4: SDK methods overview
    console.log('\n📦 Example 4: SDK Methods Overview');
    console.log('-'.repeat(30));
    
    console.log('Common SDK methods:');
    console.log('• ask(query) - Ask AI a question');
    console.log('• configureAI(config) - Configure AI settings');
    console.log('• connectMCPServer(server) - Connect to MCP server');
    console.log('• useTool(toolName, params) - Use a tool');
    console.log('• detectRuntime() - Detect project runtime');
    
    // Example 5: Error handling patterns
    console.log('\n📦 Example 5: Error Handling Patterns');
    console.log('-'.repeat(30));
    
    try {
      // This will fail because we don't have a valid API key in this example
      const sdk4 = new MCPilotSDK({
        ai: {
          provider: 'deepseek',
          apiKey: 'invalid-key'
        }
      });
      
      // Try to initialize (will fail gracefully)
      await sdk4.init?.();
    } catch (error) {
      console.log('✅ Error handled gracefully:', error.message);
    }
    
    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('🎯 Basic SDK Usage Summary');
    console.log('='.repeat(50));
    
    console.log('\nKey Takeaways:');
    console.log('1. Use createSDK() for quick singleton access');
    console.log('2. Use new MCPilotSDK(config) for custom configuration');
    console.log('3. Configure AI provider (DeepSeek, OpenAI, etc.)');
    console.log('4. Set up MCP servers for tool access');
    console.log('5. Handle errors gracefully with try-catch');
    
    console.log('\nNext Steps:');
    console.log('• Run: node 2-ai-integration.js for AI examples');
    console.log('• Run: node 3-mcp-tools.js for tool management');
    console.log('• Check: package/README.md for full documentation');
    
  } catch (error) {
    console.error('❌ Basic examples failed:', error.message);
  }
}

// Run examples
runBasicExamples().catch(console.error);