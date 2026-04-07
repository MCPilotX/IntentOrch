# API Reference

## Overview

MCPilot SDK Core provides a concise and elegant API for MCP (Model Context Protocol) service orchestration. This document details all public APIs of the SDK.

## Core Classes

### `MCPilotSDK`

The main SDK class that provides all functionality.

```typescript
import { MCPilotSDK } from '@mcpilotx/intentorch';

const sdk = new MCPilotSDK(options);
```

#### Constructor Options

```typescript
interface SDKOptions {
  // Configuration file path, defaults to ~/.mcpilot/config.json
  configPath?: string;
  
  // Whether to auto-initialize the SDK, defaults to true
  autoInit?: boolean;
  
  // Custom logger
  logger?: {
    info: (message: string) => void;
    error: (message: string) => void;
    debug: (message: string) => void;
  };
  
  // MCP related configuration
  mcp?: {
    // Whether to auto-discover local MCP servers, defaults to false
    autoDiscover?: boolean;
    
    // Array of MCP server configurations
    servers?: MCPClientConfig[];
  };
}
```

#### Singleton Instance

The SDK also provides a pre-initialized singleton instance:

```typescript
import { mcpilot } from '@mcpilotx/intentorch';

// 直接使用，无需初始化
await mcpilot.initMCP();
```

## MCP 功能

### `initMCP()`

初始化 MCP 功能。

```typescript
async initMCP(): Promise<void>
```

**示例：**
```typescript
await sdk.initMCP();
```

### `connectMCPServer()`

连接到 MCP 服务器。

```typescript
async connectMCPServer(
  config: MCPClientConfig, 
  name?: string
): Promise<MCPClient>
```

**参数：**
- `config`: MCP 客户端配置
- `name`: 可选的服务器名称标识符

**MCPClientConfig 类型：**
```typescript
interface MCPClientConfig {
  // 传输配置
  transport: {
    type: 'stdio' | 'http' | 'sse';
    
    // stdio 传输的命令和参数
    command?: string;
    args?: string[];
    
    // HTTP/SSE 传输的 URL
    url?: string;
    
    // HTTP/SSE 传输的请求头
    headers?: Record<string, string>;
    
    // stdio 传输的日志过滤配置
    logFilter?: {
      ignorePatterns?: string[];
      keepPatterns?: string[];
      verbose?: boolean;
      bufferSize?: number;
      timeout?: number;
    };
  };
  
  // 是否自动连接（默认：false）
  autoConnect?: boolean;
  
  // 请求超时时间（毫秒，默认：30000）
  timeout?: number;
  
  // 最大重试次数（默认：3）
  maxRetries?: number;
}
```

**示例：**
```typescript
// 连接到 stdio 传输的 MCP 服务器
await sdk.connectMCPServer({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
}, 'filesystem');

// 连接到 HTTP 传输的 MCP 服务器
await sdk.connectMCPServer({
  transport: {
    type: 'http',
    url: 'http://localhost:8080'
  }
}, 'http-server');
```

### `disconnectMCPServer()`

断开与 MCP 服务器的连接。

```typescript
async disconnectMCPServer(name: string): Promise<void>
```

**参数：**
- `name`: 服务器名称标识符

**示例：**
```typescript
await sdk.disconnectMCPServer('filesystem');
```

### `listMCPServers()`

列出所有已连接的 MCP 服务器。

```typescript
listMCPServers(): Array<{
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  client: MCPClient;
}>
```

**示例：**
```typescript
const servers = sdk.listMCPServers();
console.log('Connected servers:', servers);
```

### `getMCPServerStatus()`

获取特定 MCP 服务器的状态。

```typescript
getMCPServerStatus(name: string): {
  name: string;
  status: 'connected' | 'disconnected' | 'error';
  connectedAt?: Date;
  lastError?: string;
}
```

**示例：**
```typescript
const status = sdk.getMCPServerStatus('filesystem');
console.log('Server status:', status);
```

## 工具管理

### `listTools()`

列出所有可用工具（来自所有服务器）。

```typescript
listTools(): Array<{
  name: string;
  description: string;
  serverName?: string;
  inputSchema?: Record<string, any>;
}>
```

**示例：**
```typescript
const tools = sdk.listTools();
console.log('Available tools:', tools);
```

### `searchTools()`

按名称或描述搜索工具。

```typescript
searchTools(query: string): Array<{
  name: string;
  description: string;
  serverName?: string;
  matchScore: number;
}>
```

**参数：**
- `query`: 搜索查询字符串

**示例：**
```typescript
const fileTools = sdk.searchTools('file');
console.log('File-related tools:', fileTools);
```

### `executeTool()`

执行工具。

```typescript
async executeTool(
  toolName: string, 
  args: Record<string, any>
): Promise<ToolResult>
```

**参数：**
- `toolName`: 工具名称
- `args`: 工具参数

**ToolResult 类型：**
```typescript
interface ToolResult {
  // 工具执行结果内容
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: any;
  }>;
  
  // 是否成功（可选）
  isError?: boolean;
}
```

**示例：**
```typescript
const result = await sdk.executeTool('read_file', {
  path: '/tmp/example.txt'
});
console.log('Execution result:', result.content[0].text);
```

### `getToolStatistics()`

获取已注册工具的统计信息。

```typescript
getToolStatistics(): {
  totalTools: number;
  toolsByServer: Record<string, number>;
  executionCount: number;
  averageExecutionTime: number;
  lastExecutedAt?: Date;
}
```

**示例：**
```typescript
const stats = sdk.getToolStatistics();
console.log('Tool statistics:', stats);
```

## 服务管理

### `addService()`

添加新服务。

```typescript
async addService(config: ServiceConfig): Promise<void>
```

**ServiceConfig 类型：**
```typescript
interface ServiceConfig {
  // 服务名称（必需）
  name: string;
  
  // 服务路径（必需）
  path: string;
  
  // 运行时类型：node、python、docker、go、rust
  runtime?: RuntimeType;
  
  // 自动检测运行时（如果未指定 runtime）
  autoDetectRuntime?: boolean;
  
  // 启动命令（可选，覆盖默认值）
  command?: string;
  
  // 启动参数
  args?: string[];
  
  // 环境变量
  env?: Record<string, string>;
  
  // 工作目录
  cwd?: string;
  
  // 端口映射（Docker 服务）
  ports?: Array<{
    host: number;
    container: number;
  }>;
  
  // 其他配置
  [key: string]: any;
}
```

**示例：**
```typescript
// 添加 Node.js 服务
await sdk.addService({
  name: 'my-node-app',
  path: './my-app',
  runtime: 'node'
});

// 添加 Python 服务（自动检测运行时）
await sdk.addService({
  name: 'my-python-app',
  path: './my-app',
  autoDetectRuntime: true
});
```

### `startService()`

启动服务。

```typescript
async startService(name: string): Promise<void>
```

**参数：**
- `name`: 服务名称

**示例：**
```typescript
await sdk.startService('my-node-app');
```

### `stopService()`

停止服务。

```typescript
async stopService(name: string): Promise<void>
```

**参数：**
- `name`: 服务名称

**示例：**
```typescript
await sdk.stopService('my-node-app');
```

### `listServices()`

列出所有服务。

```typescript
listServices(): Array<{
  name: string;
  config: ServiceConfig;
  status: 'running' | 'stopped' | 'error' | 'unknown';
}>
```

**示例：**
```typescript
const services = sdk.listServices();
console.log('Services:', services);
```

### `getServiceStatus()`

获取服务状态。

```typescript
async getServiceStatus(name: string): Promise<ServiceStatus>
```

**ServiceStatus 类型：**
```typescript
interface ServiceStatus {
  name: string;
  status: 'running' | 'stopped' | 'error' | 'unknown';
  pid?: number;
  uptime?: number;
  memory?: number;
  cpu?: number;
}
```

**示例：**
```typescript
const status = await sdk.getServiceStatus('my-node-app');
console.log('Service status:', status);
```

## 配置管理

### `getConfig()`

获取当前配置。

```typescript
getConfig(): Config
```

**Config 类型：**
```typescript
interface Config {
  // 全局配置
  global?: {
    logLevel?: 'info' | 'error' | 'debug' | 'warn';
    maxRetries?: number;
    timeout?: number;
  };
  
  // AI 配置
  ai?: {
    provider?: 'openai' | 'anthropic' | 'local' | 'none';
    apiKey?: string;
    model?: string;
    temperature?: number;
  };
  
  // MCP 配置
  mcp?: {
    autoDiscover?: boolean;
    defaultTransport?: 'stdio' | 'http' | 'sse';
  };
  
  // 服务配置
  services?: Record<string, ServiceConfig>;
}
```

**示例：**
```typescript
const config = sdk.getConfig();
console.log('Current configuration:', config);
```

### `updateConfig()`

更新配置。

```typescript
async updateConfig(updates: Partial<Config>): Promise<void>
```

**参数：**
- `updates`: 要更新的配置部分

**示例：**
```typescript
await sdk.updateConfig({
  global: {
    logLevel: 'debug',
    maxRetries: 3
  }
});
```

## AI 功能

### `ask()`

使用 AI 提问。

```typescript
async ask(query: string, options?: AskOptions): Promise<AskResult>
```

**AskOptions 类型：**
```typescript
interface AskOptions {
  provider?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
}
```

**AskResult 类型：**
```typescript
interface AskResult {
  answer: string;
  toolCalls?: Array<{
    service: string;
    tool: string;
    params: Record<string, any>;
  }>;
  confidence: number;
}
```

**示例：**
```typescript
const result = await sdk.ask('What files are in the current directory?');
console.log('AI response:', result.answer);

if (result.toolCalls && result.toolCalls.length > 0) {
  for (const toolCall of result.toolCalls) {
    const toolResult = await sdk.executeTool(toolCall.tool, toolCall.params);
    console.log(`Tool ${toolCall.tool} result:`, toolResult);
  }
}
```

### `configureAI()`

配置 AI 设置。

```typescript
async configureAI(config: Partial<Config['ai']>): Promise<void>
```

**参数：**
- `config`: AI 配置

**示例：**
```typescript
await sdk.configureAI({
  provider: 'openai',
  apiKey: 'your-api-key-here',
  model: 'gpt-4'
});
```

## 错误处理

### 错误类型

SDK 定义了以下错误类型：

```typescript
class MCPilotError extends Error {
  code: string;
  shouldRetry: boolean;
  
  constructor(message: string, code: string, shouldRetry: boolean = false) {
    super(message);
    this.code = code;
    this.shouldRetry = shouldRetry;
  }
}

// 特定错误类型
class ServiceNotFoundError extends MCPilotError {
  constructor(serviceName: string) {
    super(`Service '${serviceName}' not found`, 'SERVICE_NOT_FOUND');
  }
}

class ToolNotFoundError extends MCPilotError {
  constructor(toolName: string) {
    super(`Tool '${toolName}' not found`, 'TOOL_NOT_FOUND');
  }
}

class MCPConnectionError extends MCPilotError {
  constructor(serverName: string, message: string) {
    super(`Failed to connect to MCP server '${serverName}': ${message}`, 'MCP_CONNECTION_ERROR', true);
  }
}
```

### 错误处理示例

```typescript
try {
  await sdk.executeTool('read_file', { path: '/nonexistent.txt' });
} catch (error) {
  if (error instanceof MCPilotError) {
    console.error(`MCPilot error: ${error.code} - ${error.message}`);
    if (error.shouldRetry) {
      // 实现重试逻辑
      console.log('Retrying...');
    }
  } else {
    console.error('Unexpected error:', error);
  }
}
```

## 日志记录

### 自定义日志记录器

```typescript
const sdk = new MCPilotSDK({
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
  }
});
```

### 日志级别

支持以下日志级别：
- `info`: 一般信息性消息
- `error`: 错误消息
- `debug`: 调试消息（仅在调试时启用）

## 类型导出

SDK 导出以下 TypeScript 类型：

```typescript
import {
  // 核心类
  MCPilotSDK,
  mcpilot,
  
  // 类型
  type SDKOptions,
  type ServiceConfig,
  type ServiceStatus,
  type Config,
  type AskOptions,
  type AskResult,
  
  // MCP 相关
  type MCPClientConfig,
  type Tool,
  type ToolResult,
  type ToolCall,
  
  // 错误类
  MCPilotError,
  ServiceNotFoundError,
  ToolNotFoundError,
  MCPConnectionError
} from '@mcpilotx/intentorch';
```

## 实用函数

### `createSDK()`

创建 SDK 实例的快捷函数。

```typescript
import { createSDK } from '@mcpilotx/intentorch';

const sdk = createSDK(options);
```

### `discoverLocalMCPServers()`

发现本地 MCP 服务器。

```typescript
import { discoverLocalMCPServers } from '@mcpilotx/intentorch';

const servers = await discoverLocalMCPServers();
console.log('Discovered servers:', servers);
```

## 版本信息

### 获取 SDK 版本

```typescript
import { version } from '@mcpilotx/intentorch';

console.log(`MCPilot SDK version: ${version}`);
```

## 最佳实践

### 1. 错误处理

始终使用 try-catch 块包装 SDK 调用：

```typescript
try {
  await sdk.initMCP();
  await sdk.connectMCPServer(config, 'my-server');
  const result = await sdk.executeTool('some_tool', { param: 'value' });
} catch (error) {
  console.error('Operation failed:', error);
  // 适当的错误恢复逻辑
}
```

### 2. 资源清理

使用后清理资源：

```typescript
// 使用完成后断开连接
try {
  await sdk.disconnectMCPServer('my-server');
  await sdk.stopService('my-service');
} catch (error) {
  console.error('Cleanup failed:', error);
}
```

### 3. 配置管理

将配置存储在适当的位置：

```typescript
// 从环境变量加载配置
const sdk = new MCPilotSDK({
  configPath: process.env.MCPILOT_CONFIG_PATH || '~/.mcpilot/config.json',
  mcp: {
    autoDiscover: process.env.MCP_AUTO_DISCOVER === 'true',
    servers: JSON.parse(process.env.MCP_SERVERS || '[]')
  }
});
```

### 4. 性能监控

监控工具执行性能：

```typescript
const startTime = Date.now();
const result = await sdk.executeTool('expensive_tool', { /* params */ });
const executionTime = Date.now() - startTime;

console.log(`Tool executed in ${executionTime}ms`);

// 获取统计信息
const stats = sdk.getToolStatistics();
console.log('Average execution time:', stats.averageExecutionTime);
```

## 常见问题

### Q: 如何连接到多个 MCP 服务器？

A: 在初始化时配置多个服务器，或使用多个 `connectMCPServer` 调用：

```typescript
// 方法1：初始化时配置
const sdk = new MCPilotSDK({
  mcp: {
    servers: [
      {
        transport: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-filesystem'] }
      },
      {
        transport: { type: 'stdio', command: 'npx', args: ['@modelcontextprotocol/server-weather'] }
      }
    ]
  }
});

// 方法2：动态连接
await sdk.connectMCPServer(filesystemConfig, 'filesystem');
await sdk.connectMCPServer(weatherConfig, 'weather');
```

### Q: 如何处理工具执行失败？

A: 使用错误处理和重试机制：

```typescript
async function executeWithRetry(toolName: string, args: Record<string, any>, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt