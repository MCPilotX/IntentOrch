/**
 * MCP Tool Management Examples
 * Demonstrates ToolRegistry, MCPClient, and transport usage
 */

import { 
  ToolRegistry, 
  MCPClient,
  TransportFactory,
  TOOL_CATEGORIES,
  TOOL_PATTERNS,
  discoverLocalMCPServers
} from './package/dist/index.js';

console.log('🔧 MCP Tool Management Examples');
console.log('='.repeat(50));

async function runMCPExamples() {
  try {
    // ==================== Tool Registry Examples ====================
    console.log('\n🔹 Tool Registry - Custom Tool Management');
    console.log('-'.repeat(40));
    
    // Example 1: Basic tool registry
    console.log('\nExample 1: Basic Tool Registry');
    const toolRegistry = new ToolRegistry();
    
    // Register a simple tool
    toolRegistry.registerTool({
      name: 'greet',
      description: 'Greet a person by name',
      inputSchema: {
        type: 'object',
        properties: {
          name: { 
            type: 'string', 
            description: 'Name of the person to greet' 
          },
          language: {
            type: 'string',
            description: 'Greeting language',
            enum: ['en', 'es', 'fr'],
            default: 'en'
          }
        },
        required: ['name']
      },
      execute: async ({ name, language = 'en' }) => {
        const greetings = {
          en: `Hello, ${name}!`,
          es: `¡Hola, ${name}!`,
          fr: `Bonjour, ${name}!`
        };
        return { 
          success: true, 
          greeting: greetings[language] || greetings.en 
        };
      }
    });
    
    console.log('✅ Tool registry created');
    console.log('Registered tools:', toolRegistry.getAllTools().map(t => t.tool.name));
    
    // Example 2: Execute a tool
    console.log('\nExample 2: Execute Tool');
    try {
      const result = await toolRegistry.executeTool('greet', {
        name: 'Developer',
        language: 'en'
      });
      console.log('✅ Tool execution result:', result.greeting);
    } catch (error) {
      console.log('⚠ Tool execution test skipped:', error.message);
    }
    
    // Example 3: Register multiple tools
    console.log('\nExample 3: Register Multiple Tools');
    
    // Math tool
    toolRegistry.registerTool({
      name: 'calculate',
      description: 'Perform mathematical operations',
      inputSchema: {
        type: 'object',
        properties: {
          operation: {
            type: 'string',
            description: 'Mathematical operation',
            enum: ['add', 'subtract', 'multiply', 'divide']
          },
          a: { type: 'number', description: 'First number' },
          b: { type: 'number', description: 'Second number' }
        },
        required: ['operation', 'a', 'b']
      },
      execute: async ({ operation, a, b }) => {
        let result;
        switch (operation) {
          case 'add': result = a + b; break;
          case 'subtract': result = a - b; break;
          case 'multiply': result = a * b; break;
          case 'divide': result = b !== 0 ? a / b : 'Error: Division by zero'; break;
          default: result = 'Error: Unknown operation';
        }
        return { success: true, result };
      }
    });
    
    // File info tool (mock)
    toolRegistry.registerTool({
      name: 'file_info',
      description: 'Get information about a file',
      inputSchema: {
        type: 'object',
        properties: {
          filename: { type: 'string', description: 'File name' }
        },
        required: ['filename']
      },
      execute: async ({ filename }) => {
        return { 
          success: true, 
          info: {
            name: filename,
            size: Math.floor(Math.random() * 10000),
            type: filename.split('.').pop() || 'unknown',
            created: new Date().toISOString()
          }
        };
      }
    });
    
    console.log('✅ Multiple tools registered');
    console.log('All tools:', toolRegistry.getAllTools().map(t => t.tool.name));
    
    // ==================== Predefined Categories & Patterns ====================
    console.log('\n🔹 Predefined Tool Categories & Patterns');
    console.log('-'.repeat(40));
    
    console.log('\nExample 4: Tool Categories');
    console.log('Available categories:', Object.keys(TOOL_CATEGORIES));
    console.log('Filesystem category:', TOOL_CATEGORIES.FILESYSTEM);
    console.log('AI category:', TOOL_CATEGORIES.AI);
    
    console.log('\nExample 5: Tool Patterns');
    console.log('Read file pattern:', {
      name: TOOL_PATTERNS.READ_FILE.name,
      description: TOOL_PATTERNS.READ_FILE.description
    });
    
    console.log('Write file pattern:', {
      name: TOOL_PATTERNS.WRITE_FILE.name,
      description: TOOL_PATTERNS.WRITE_FILE.description
    });
    
    // ==================== MCP Client Examples ====================
    console.log('\n🔹 MCP Client - Protocol Communication');
    console.log('-'.repeat(40));
    
    // Example 6: Basic MCP client
    console.log('\nExample 6: MCP Client Setup');
    const mcpClient = new MCPClient({
      transport: {
        type: 'stdio',
        command: 'echo',
        args: ['Hello from MCP server']
      }
    });
    console.log('✅ MCP client created');
    console.log('Client methods:', Object.keys(mcpClient).filter(k => typeof mcpClient[k] === 'function').slice(0, 5));
    
    // ==================== Transport Examples ====================
    console.log('\n🔹 Transport Layer - Communication Protocols');
    console.log('-'.repeat(40));
    
    // Example 7: Transport factory patterns
    console.log('\nExample 7: Transport Factory Patterns');
    
    // Stdio transport configuration (for local MCP servers)
    const stdioConfig = {
      type: 'stdio',
      command: 'echo',
      args: ['Hello from MCP server'],
      logFilter: {
        ignorePatterns: ['^DEBUG:'],
        keepPatterns: ['^ERROR:', '^WARN:']
      }
    };
    
    console.log('Stdio transport config:', {
      type: stdioConfig.type,
      command: stdioConfig.command
    });
    
    // HTTP transport configuration (for remote MCP servers)
    const httpConfig = {
      type: 'http',
      url: 'http://localhost:8080/mcp',
      headers: {
        'Authorization': 'Bearer token123'
      }
    };
    
    console.log('HTTP transport config:', {
      type: httpConfig.type,
      url: httpConfig.url
    });
    
    // ==================== Server Discovery ====================
    console.log('\n🔹 Server Discovery');
    console.log('-'.repeat(40));
    
    // Example 8: Discover local MCP servers
    console.log('\nExample 8: Local Server Discovery');
    try {
      const servers = await discoverLocalMCPServers();
      console.log('✅ Server discovery completed');
      console.log('Found servers:', servers.length);
      
      if (servers.length > 0) {
        servers.slice(0, 2).forEach((server, i) => {
          console.log(`  Server ${i + 1}:`, server.name || 'Unnamed');
        });
      }
    } catch (error) {
      console.log('⚠ Server discovery test skipped:', error.message);
    }
    
    // ==================== Complete Tool Workflow ====================
    console.log('\n🔹 Complete Tool Workflow');
    console.log('-'.repeat(40));
    
    console.log('\nExample 9: End-to-End Tool Workflow');
    
    // Create a specialized tool registry
    const workflowRegistry = new ToolRegistry();
    
    // Register workflow tools
    workflowRegistry.registerTool({
      name: 'validate_input',
      description: 'Validate user input',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string' },
          minLength: { type: 'number', default: 1 }
        },
        required: ['input']
      },
      execute: async ({ input, minLength = 1 }) => {
        const isValid = input.length >= minLength;
        return { 
          success: true, 
          valid: isValid,
          message: isValid ? 'Input is valid' : `Input must be at least ${minLength} characters`
        };
      }
    });
    
    workflowRegistry.registerTool({
      name: 'process_data',
      description: 'Process validated data',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'string' }
        },
        required: ['data']
      },
      execute: async ({ data }) => {
        return { 
          success: true, 
          processed: data.toUpperCase(),
          length: data.length
        };
      }
    });
    
    // Execute workflow
    try {
      console.log('Step 1: Validate input');
      const validation = await workflowRegistry.executeTool('validate_input', {
        input: 'Hello World',
        minLength: 5
      });
      
      console.log('Validation result:', validation);
      
      if (validation.valid) {
        console.log('\nStep 2: Process data');
        const processing = await workflowRegistry.executeTool('process_data', {
          data: 'Hello World'
        });
        
        console.log('Processing result:', processing);
      }
      
      console.log('✅ Workflow completed successfully');
    } catch (error) {
      console.log('⚠ Workflow test skipped:', error.message);
    }
    
    // ==================== Summary ====================
    console.log('\n' + '='.repeat(50));
    console.log('🎯 MCP Tool Management Summary');
    console.log('='.repeat(50));
    
    console.log('\nTool Registry Features:');
    console.log('✅ Custom tool registration');
    console.log('✅ Input schema validation');
    console.log('✅ Tool execution management');
    console.log('✅ Multiple tool support');
    
    console.log('\nMCP Client Features:');
    console.log('✅ MCP protocol communication');
    console.log('✅ Server connection management');
    console.log('✅ Tool discovery and listing');
    
    console.log('\nTransport Layer Features:');
    console.log('✅ Multiple transport types (stdio, HTTP, SSE)');
    console.log('✅ Log filtering and management');
    console.log('✅ Connection configuration');
    
    console.log('\nUse Cases:');
    console.log('• Custom tool development');
    console.log('• MCP server integration');
    console.log('• Workflow automation');
    console.log('• Protocol communication');
    
    console.log('\nNext Steps:');
    console.log('• Run: node 4-runtime-detection.js for runtime examples');
    console.log('• Run: node developer-starter-kit.js for complete overview');
    console.log('• Integrate with real MCP servers');
    
  } catch (error) {
    console.error('❌ MCP examples failed:', error.message);
    console.error(error.stack);
  }
}

// Run examples
runMCPExamples().catch(console.error);