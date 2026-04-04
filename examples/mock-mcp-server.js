/**
 * Mock MCP Server for Integration Testing
 * A simple MCP server that simulates tool execution for testing
 */

import { spawn } from 'child_process';
import readline from 'readline';

class MockMCPServer {
  constructor() {
    this.tools = [
      {
        name: 'mock_read_file',
        description: 'Read a mock file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to read' }
          },
          required: ['path']
        }
      },
      {
        name: 'mock_write_file',
        description: 'Write to a mock file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path to write' },
            content: { type: 'string', description: 'Content to write' }
          },
          required: ['path', 'content']
        }
      },
      {
        name: 'mock_list_files',
        description: 'List mock files in directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory path' }
          },
          required: ['directory']
        }
      },
      {
        name: 'mock_get_time',
        description: 'Get current server time',
        inputSchema: {
          type: 'object',
          properties: {}
        }
      }
    ];

    this.resources = [
      {
        uri: 'mock://server/info',
        name: 'Server Information',
        description: 'Information about the mock MCP server',
        mimeType: 'application/json'
      }
    ];

    this.prompts = [
      {
        name: 'mock_greeting',
        description: 'Get a greeting from the server',
        arguments: [
          {
            name: 'name',
            description: 'Your name',
            required: false
          }
        ]
      }
    ];
  }

  // Handle MCP initialization
  handleInitialize(params) {
    return {
      protocolVersion: '2024-11-05',
      capabilities: {
        tools: {},
        resources: {},
        prompts: {}
      },
      serverInfo: {
        name: 'Mock MCP Server',
        version: '1.0.0'
      }
    };
  }

  // Handle tool listing
  handleToolsList() {
    return {
      tools: this.tools
    };
  }

  // Handle tool calling
  handleToolsCall(calls) {
    const results = calls.map(call => {
      switch (call.name) {
        case 'mock_read_file':
          return {
            content: [{
              type: 'text',
              text: `Mock file content for: ${call.arguments.path}\nThis is simulated content.`
            }]
          };
        
        case 'mock_write_file':
          return {
            content: [{
              type: 'text',
              text: `Successfully wrote to: ${call.arguments.path}\nContent length: ${call.arguments.content.length} characters`
            }]
          };
        
        case 'mock_list_files':
          return {
            content: [{
              type: 'text',
              text: `Files in ${call.arguments.directory}:\n- file1.txt\n- file2.txt\n- directory1/\n- directory2/`
            }]
          };
        
        case 'mock_get_time':
          return {
            content: [{
              type: 'text',
              text: `Server time: ${new Date().toISOString()}`
            }]
          };
        
        default:
          return {
            content: [{
              type: 'text',
              text: `Unknown tool: ${call.name}`
            }],
            isError: true
          };
      }
    });

    return {
      results
    };
  }

  // Handle resource listing
  handleResourcesList() {
    return {
      resources: this.resources
    };
  }

  // Handle resource reading
  handleResourcesRead(uri) {
    if (uri === 'mock://server/info') {
      return {
        contents: [{
          uri: 'mock://server/info',
          mimeType: 'application/json',
          text: JSON.stringify({
            name: 'Mock MCP Server',
            version: '1.0.0',
            status: 'running',
            toolsCount: this.tools.length,
            uptime: Date.now()
          }, null, 2)
        }]
      };
    }

    return {
      contents: [{
        uri,
        mimeType: 'text/plain',
        text: `Resource not found: ${uri}`
      }]
    };
  }

  // Handle prompt listing
  handlePromptsList() {
    return {
      prompts: this.prompts
    };
  }

  // Handle prompt getting
  handlePromptsGet(name, arguments_) {
    if (name === 'mock_greeting') {
      const name = arguments_?.name || 'User';
      return {
        messages: [{
          role: 'assistant',
          content: {
            type: 'text',
            text: `Hello, ${name}! Welcome to the Mock MCP Server.`
          }
        }]
      };
    }

    return {
      messages: [{
        role: 'assistant',
        content: {
          type: 'text',
          text: `Unknown prompt: ${name}`
        }
      }]
    };
  }

  // Process incoming messages
  processMessage(message) {
    try {
      const { method, params, id } = JSON.parse(message);
      
      let result;
      switch (method) {
        case 'initialize':
          result = this.handleInitialize(params);
          break;
        
        case 'tools/list':
          result = this.handleToolsList();
          break;
        
        case 'tools/call':
          result = this.handleToolsCall(params.calls);
          break;
        
        case 'resources/list':
          result = this.handleResourcesList();
          break;
        
        case 'resources/read':
          result = this.handleResourcesRead(params.uri);
          break;
        
        case 'prompts/list':
          result = this.handlePromptsList();
          break;
        
        case 'prompts/get':
          result = this.handlePromptsGet(params.name, params.arguments);
          break;
        
        default:
          result = {
            error: {
              code: -32601,
              message: `Method not found: ${method}`
            }
          };
      }

      return JSON.stringify({
        jsonrpc: '2.0',
        id,
        result
      });
    } catch (error) {
      return JSON.stringify({
        jsonrpc: '2.0',
        id: null,
        error: {
          code: -32700,
          message: 'Parse error',
          data: error.message
        }
      });
    }
  }

  // Start the server
  start() {
    console.error('Mock MCP Server starting...');
    
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      terminal: false
    });

    rl.on('line', (line) => {
      const response = this.processMessage(line);
      console.log(response);
    });

    console.error('Mock MCP Server ready');
  }
}

// Start server if run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const server = new MockMCPServer();
  server.start();
}

export { MockMCPServer };
