# IntentOrch

<div align="right">
  <small>
    <strong>Language:</strong>
    <a href="README.md">English</a> |
    <a href="docs/README.ZH_CN.md">中文</a>
  </small>
</div>

[![npm version](https://img.shields.io/npm/v/@mcpilotx/sdk-core.svg)](https://www.npmjs.com/package/@mcpilotx/sdk-core)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)

**Build AI-powered applications with MCP (Model Context Protocol) in minutes.**

MCPilot SDK Core simplifies AI integration, MCP tool management, and intelligent runtime detection for developers of all skill levels.

## 🤖 Core Philosophy
**Tell AI what you want, let it handle the rest** - MCPilot SDK Core lets you focus on expressing your needs while we handle the complex AI orchestration, tool management, and runtime detection.

---

## 🎯 Choose Your Path

### 🟢 **Beginner** - Get Started in 5 Minutes
New to MCP or AI integration? Start here for a quick win.

### 🟡 **Intermediate** - Build Real Applications
Ready to build something useful? These examples show practical use cases.

### 🔴 **Advanced** - Scale and Optimize
Building production applications? Learn advanced configurations and optimizations.

---

## 🟢 Beginner Level - Get Started in 5 Minutes
**Tell AI what you want, let it handle the rest** - Start here to experience the simplest way to integrate AI.

### 1. Install the SDK

```bash
npm install @mcpilotx/sdk-core
```

### 2. Your First AI Interaction

```typescript
import { createSDK } from '@mcpilotx/sdk-core';

// Create SDK instance
const sdk = createSDK();

// Ask a question (No AI configured, causing an error.)
const response = await sdk.ask("What's the weather like today?");
console.log(response);
```

### 3. Configure AI with DeepSeek

```typescript
// Configure AI with DeepSeek (our primary supported provider)
// "export DEEPSEEK_API_KEY=sk-xxxx" 
await sdk.configureAI({
  provider: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: 'deepseek-chat'
});

// Now ask more complex questions
const answer = await sdk.ask("Explain quantum computing in simple terms");
console.log(answer);
```

### 4. Quick Test Script

Create a file `quick-test.js`:

```javascript
const { createSDK } = require('@mcpilotx/sdk-core');

async function quickTest() {
  const sdk = createSDK();
  
  console.log('🔑 Testing SDK initialization...');
  console.log('✅ SDK created successfully');
  
  await sdk.configureAI({
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-chat'
  });

  // Test basic AI interaction
  const response = await sdk.ask("Hello! Can you help me?");
  console.log('🤖 AI Response:', response);
  
  console.log('🎉 Quick test completed!');
}

quickTest().catch(console.error);
```

Run it:
```bash
export DEEPSEEK_API_KE=your_key_here &&  node quick-test.js
```

**🎉 Congratulations! You've successfully used MCPilot SDK Core!**

---

## 🟡 Intermediate Level - Build Real Applications

### Example 1: File Operations with MCP

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const mcpConfig = {
  servers: [
    {
      name: 'filesystem',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['@modelcontextprotocol/server-filesystem','.']
      }
    }
  ]
};

const sdk = new MCPilotSDK({
  mcp: mcpConfig
});

// Connect to the filesystem server
await sdk.connectAllFromConfig(mcpConfig);

// Read a file using AI-powered tool execution
const tools = await sdk.listTools();
console.log('Available tools:', tools);

await sdk.configureAI({
  provider: 'deepseek',
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: 'deepseek-chat'
});

// Ask AI to analyze the file
const analysis = await sdk.ask('list_allowed_directories', { useTools: true });
console.log('AI Analysis:', analysis);

try {
  console.log('AI Analysis.toolCalls:', analysis.toolCalls[0]);
  const allowedDirs = await sdk.executeTool('list_allowed_directories', analysis.toolCalls[0].params);
  console.log('Allowed directories:', allowedDirs.content);
} catch (error) {
  console.log('Error getting allowed directories:', error.message);
}

```

### Example 2: Custom Tool Integration

```typescript
import { MCPilotSDK, ToolRegistry } from '@mcpilotx/sdk-core';

// Create SDK first
const sdk = new MCPilotSDK({
  ai: {
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY
  }
});

// Register a custom calculator tool using the SDK's tool registry
sdk.toolRegistry.registerTool({
  name: 'calculate',
  description: 'Perform mathematical calculations',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string' }
    },
    required: ['expression']
  }
}, async (args: any) => {
  // In production, use a safe eval library
  const result = eval(args.expression);
  return { result };
}, 'custom-tools', 'calculator-tool');

// Let AI use the custom tool
const calculation = await sdk.ask(
  "Calculate 15 * 24 + 37 using the calculate tool",
  { useTools: true }
);

console.log('Calculation result:', calculation);
```

### Example 3: Intelligent Runtime Detection

```typescript
import { MCPilotSDK, EnhancedRuntimeDetector } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK();

// Detect the current project's runtime
const detection = await EnhancedRuntimeDetector.detect('.');

console.log('Runtime Type:', detection.runtime); // 'node', 'python', 'docker', etc.
console.log('Detection Confidence:', detection.confidence);
console.log('Detection Source:', detection.source);

// Use detection results to configure the SDK
if (detection.runtime === 'node') {
  console.log('Node.js project detected');
  // Automatically configure Node.js specific tools
}

// Ask AI for project-specific advice
const advice = await sdk.ask(
  `Based on this ${detection.runtime} project, suggest improvements`,
  { useTools: true }
);

console.log('Project Advice:', advice);
```

### Example 4: Automated Code Review

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';
import fs from 'fs/promises';

class CodeReviewer {
  private sdk: MCPilotSDK;
  
  constructor() {
    this.sdk = new MCPilotSDK({
      ai: {
        provider: 'deepseek',
        apiKey: process.env.DEEPSEEK_API_KEY
      },
      mcp: {
        servers: [
          {
            name: 'filesystem',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@modelcontextprotocol/server-filesystem']
            }
          }
        ]
      }
    });
  }
  
  async reviewFile(filePath: string): Promise<string> {
    // Read file using MCP filesystem server
    const fileContent = await this.sdk.executeTool('read_file', {
      path: filePath,
      encoding: 'utf-8'
    });
    
    // Ask AI to review the code
    const review = await this.sdk.ask(
      `Review this code for issues and suggest improvements:\n${fileContent.content}`,
      { useTools: true }
    );
    
    return review;
  }
}

// Usage
const reviewer = new CodeReviewer();
const review = await reviewer.reviewFile('src/app.ts');
console.log('Code Review:', review);
```

---

## 🔴 Advanced Level - Scale and Optimize

### Advanced Configuration 1: Custom Transport with Log Filtering

```typescript
import { TransportFactory, StdioLogFilterConfig } from '@mcpilotx/sdk-core';

// Create a transport with intelligent log filtering
const logFilter: StdioLogFilterConfig = {
  ignorePatterns: [
    '^DEBUG:.*',           // Hide debug logs
    '^\\[\\d{4}-\\d{2}-\\d{2}.*INFO.*',  // Hide timestamped INFO logs
    '.*Processing.*'       // Hide processing messages
  ],
  keepPatterns: [
    '^ERROR:.*',           // Always show errors
    '^FATAL:.*',           // Always show fatal errors
    '.*Exception.*',       // Always show exceptions
    '.*failed.*'           // Always show failure messages
  ],
  timeout: 2000,           // Buffer timeout for incomplete JSON
  bufferSize: 4096,        // Buffer size for multi-line JSON
  verbose: process.env.NODE_ENV === 'development'
};

const transport = TransportFactory.create({
  type: 'stdio',
  command: 'python',
  args: ['my_script.py'],
  logFilter
});

// Use the custom transport in SDK configuration
const sdk = new MCPilotSDK({
  mcp: {
    servers: [
      {
        name: 'custom-server',
        transport: transport
      }
    ]
  }
});
```

### Advanced Configuration 2: Performance-Optimized SDK

```typescript
import { MCPilotSDK, PerformanceMonitor } from '@mcpilotx/sdk-core';

// Create SDK with performance monitoring
const sdk = new MCPilotSDK({
  ai: {
    provider: 'deepseek',
    apiKey: process.env.DEEPSEEK_API_KEY,
    timeout: 30000,        // 30 second timeout
    maxRetries: 3,         // Retry failed requests
    cacheResponses: true   // Cache AI responses
  },
  mcp: {
    autoDiscover: true,    // Auto-discover local MCP servers
    connectionPool: {
      maxConnections: 10,  // Maximum concurrent connections
      idleTimeout: 30000   // Close idle connections after 30s
    }
  }
});

// Enable performance monitoring
const monitor = new PerformanceMonitor();

// Monitor tool execution times
monitor.on('tool_execution', (data: any) => {
  console.log(`Tool ${data.toolName} took ${data.duration}ms`);
});

// Monitor AI response times
monitor.on('ai_response', (data: any) => {
  console.log(`AI response took ${data.duration}ms, tokens: ${data.tokens}`);
});

// Get performance report
setInterval(async () => {
  const report = await monitor.getReport();
  console.log('Performance Report:', report);
}, 60000); // Every minute
```

### Advanced Configuration 3: Multi-Server Orchestration

```typescript
import { MCPilotSDK, discoverLocalMCPServers } from '@mcpilotx/sdk-core';

// Discover all local MCP servers
const localServers = await discoverLocalMCPServers();

// Load servers from environment
const envServers = [
  {
    name: 'database',
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['@modelcontextprotocol/server-postgres']
    }
  },
  {
    name: 'web-scraper',
    transport: {
      type: 'http',
      url: 'http://localhost:8080/mcp'
    }
  }
];

// Create SDK with multiple servers
const sdk = new MCPilotSDK({
  mcp: {
    servers: [...localServers, ...envServers]
  }
});

// Connect to all servers using connectAllFromConfig
const connectionResults = await sdk.connectAllFromConfig({
  servers: [...localServers, ...envServers]
});

console.log('Connection results:', connectionResults);

// Execute tools across multiple servers (sequentially since executeTools doesn't exist)
const results = [];
try {
  const fileResult = await sdk.executeTool('read_file', { path: 'data.json' });
  results.push({ tool: 'read_file', result: fileResult });
} catch (error) {
  results.push({ tool: 'read_file', error: error.message });
}

try {
  const dbResult = await sdk.executeTool('query_database', { query: 'SELECT * FROM users' });
  results.push({ tool: 'query_database', result: dbResult });
} catch (error) {
  results.push({ tool: 'query_database', error: error.message });
}

try {
  const scrapeResult = await sdk.executeTool('scrape_website', { url: 'https://example.com' });
  results.push({ tool: 'scrape_website', result: scrapeResult });
} catch (error) {
  results.push({ tool: 'scrape_website', error: error.message });
}

console.log('Multi-server results:', results);
```

### Advanced Configuration 4: Service Management with Built-in Runtimes

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK();

// Add a service with auto-detected runtime
const serviceName = await sdk.addService({
  name: 'my-service',
  path: './my-service-directory',
  // Runtime will be auto-detected if not specified
  // runtime: 'node' // Optional: explicitly specify runtime
});

console.log(`Service '${serviceName}' added successfully`);

// Start the service
await sdk.startService(serviceName);
console.log(`Service '${serviceName}' started`);

// Get service status
const status = await sdk.getServiceStatus(serviceName);
console.log('Service status:', status);

// List all services
const services = sdk.listServices();
console.log('All services:', services);

// Stop the service
await sdk.stopService(serviceName);
console.log(`Service '${serviceName}' stopped`);
```

---

## 📚 API Reference

### Core Classes

| Class | Description | When to Use |
|-------|-------------|-------------|
| `MCPilotSDK` | Main SDK class | Most common use case |
| `createSDK()` | Factory function | Quick SDK creation |
| `ToolRegistry` | Tool management | Custom tool integration |
| `TransportFactory` | Transport creation | Advanced transport configuration |

### Key Methods

| Method | Description | Example |
|--------|-------------|---------|
| `sdk.ask()` | Ask AI a question | `await sdk.ask("Hello")` |
| `sdk.executeTool()` | Execute a tool | `await sdk.executeTool('read_file', {path})` |
| `sdk.configureAI()` | Configure AI provider | `await sdk.configureAI(config)` |
| `sdk.connectMCPServer()` | Connect to MCP server | `await sdk.connectMCPServer(config)` |
| `EnhancedRuntimeDetector.detect()` | Detect project runtime | `await EnhancedRuntimeDetector.detect('.')` |

---

## 🧪 Testing Your Setup

### 1. Run the Quick Test

```bash
# Set your DeepSeek API key
export DEEPSEEK_API_KEY=your_key_here

# Run the quick test
npx @mcpilotx/sdk-core test
```

### 2. Run Examples

```bash
# Run all examples
npm run examples

# Run specific example
node examples/1-basic-sdk-usage.js
```

### 3. Build from Source

```bash
# Clone the repository
git clone https://github.com/MCPilotX/sdk-core.git
cd sdk-core

# Install dependencies
npm install

# Build the SDK
npm run build

# Run tests
npm test
```

---

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guide](docs/development.md) for details.

### Quick Contribution Steps:
1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests: `npm test`
5. Submit a pull request

---

## 📄 License

Apache 2.0 - See [LICENSE](LICENSE) for details.

---

## 🆘 Support

- **Documentation**: See [docs/](docs/) for detailed guides
- **Issues**: [GitHub Issues](https://github.com/MCPilotX/sdk-core/issues)
- **Examples**: Check [examples/](examples/) directory
- **Community**: Join our Discord/Slack (link in GitHub)

---

## 🚀 Ready to Build?

Start building AI-powered applications with MCPilot SDK Core today!

```typescript
import { createSDK } from '@mcpilotx/sdk-core';

const sdk = createSDK();
const future = await sdk.ask("What amazing things can I build with this SDK?");
console.log(future);
```

---

**Built with ❤️ by the MCPilot Team**
