# MCPilot SDK Core

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18+-green.svg)](https://nodejs.org/)
[![npm version](https://img.shields.io/npm/v/@mcpilotx/sdk-core.svg)](https://www.npmjs.com/package/@mcpilotx/sdk-core)
[![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)]()
[![Test Coverage](https://img.shields.io/badge/coverage-85%25-green.svg)]()

**MCPilot SDK Core** 是一个专注于开发者的SDK，用于MCP（Model Context Protocol）服务编排。它提供了简单、优雅的API，通过简洁、极简的设计来管理MCP服务器、工具和服务。

## 目录

- [功能特性](#-功能特性)
- [安装](#-安装)
- [快速开始](#-快速开始)
- [示例](#-示例)
- [API参考](#-api参考)
- [测试](#-测试)
- [架构](#-架构)
- [MCP服务器集成](#-mcp服务器集成)
- [文档](#-文档)
- [贡献指南](#-贡献指南)
- [许可证](#-许可证)
- [致谢](#-致谢)
- [支持](#-支持)
- [路线图](#-路线图)

## ✨ 功能特性

- **🔌 MCP协议支持**: 完整支持Model Context Protocol，包括stdio、HTTP和SSE传输方式
- **🛠️ 工具管理**: 统一的工具注册表，用于发现、搜索和执行来自多个MCP服务器的工具
- **🚀 服务编排**: 跨不同运行时（Node.js、Python、Docker等）管理和编排服务
- **⚙️ 配置管理**: 具有持久化功能的集中式配置系统
- **🤖 AI集成**: 可选的AI功能，用于自然语言工具执行
- **📊 监控**: 实时服务状态和工具使用统计
- **🔧 可扩展架构**: 清晰的关注点分离，支持可插拔适配器

## 📦 安装

```bash
npm install @mcpilotx/sdk-core
```

或使用yarn：

```bash
yarn add @mcpilotx/sdk-core
```

或使用pnpm：

```bash
pnpm add @mcpilotx/sdk-core
```

## 🚀 快速开始

### 基本使用

```typescript
import { mcpilot } from '@mcpilotx/sdk-core';

// 初始化MCP功能
await mcpilot.initMCP();

// 连接到MCP服务器
const client = await mcpilot.connectMCPServer({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
}, 'filesystem');

// 列出可用工具
const tools = mcpilot.listTools();
console.log('可用工具:', tools);

// 执行工具
const result = await mcpilot.executeTool('read_file', {
  path: '/tmp/example.txt'
});
console.log('执行结果:', result);

// 完成后断开连接
await mcpilot.disconnectMCPServer('filesystem');
```

### 创建自定义SDK实例

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK({
  autoInit: true,
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`),
  }
});

// 使用自定义实例
await sdk.initMCP();
const tools = sdk.listTools();
console.log('工具数量:', tools.length);
```

## 📚 示例

### 场景1：基本MCP集成

```typescript
import { mcpilot } from '@mcpilotx/sdk-core';

async function basicIntegration() {
  // 初始化MCP功能
  await mcpilot.initMCP();
  
  // 连接到文件系统MCP服务器
  await mcpilot.connectMCPServer({
    transport: {
      type: 'stdio',
      command: 'npx',
      args: ['@modelcontextprotocol/server-filesystem']
    }
  }, 'filesystem');
  
  // 搜索文件相关工具
  const fileTools = mcpilot.searchTools('file');
  console.log(`找到 ${fileTools.length} 个文件相关工具`);
  
  // 列出所有工具
  const allTools = mcpilot.listTools();
  console.log(`总工具数: ${allTools.length}`);
}
```

### 场景2：服务管理

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

async function serviceManagement() {
  const sdk = new MCPilotSDK();
  
  // 添加Node.js服务
  await sdk.addService({
    name: 'my-node-service',
    path: '/path/to/service',
    runtime: 'node',
    config: {
      entry: 'index.js',
      env: { NODE_ENV: 'development' }
    }
  });
  
  // 启动服务
  await sdk.startService('my-node-service');
  
  // 检查服务状态
  const status = await sdk.getServiceStatus('my-node-service');
  console.log('服务状态:', status);
  
  // 列出所有服务
  const services = sdk.listServices();
  console.log('可用服务:', services);
}
```

### 场景3：错误处理和回退机制

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

async function errorHandling() {
  const sdk = new MCPilotSDK();
  
  // 使用虚拟API密钥配置AI（模拟有限的AI访问）
  await sdk.configureAI({ 
    provider: "openai", 
    apiKey: "dummy-key" // 实际使用时，请使用真实的API密钥
  });

  try {
    // AI将返回占位符响应，因为完整的AI功能尚未实现
    const result = await sdk.ask("列出当前目录中的文件");
    console.log("AI响应:", result.answer);
    
    // 注意：当前实现返回占位符消息
    // 未来版本将集成实际的AI服务
  } catch (error) {
    // AI查询失败时的优雅错误处理
    console.log("AI查询失败，手动搜索工具...");
    
    // 手动工具发现作为回退
    const fileTools = sdk.searchTools("file");
    console.log(`找到 ${fileTools.length} 个文件相关工具`);
    
    // 您还可以检查AI是否正确配置
    const config = sdk.getConfig();
    if (!config.ai || (config.ai as any).provider === "none") {
      console.log("AI未配置。请先配置AI提供商。");
    }
  }
}
```

## 🔧 API参考

### 核心SDK类

#### `MCPilotSDK`
主SDK类，提供所有核心功能。

**构造函数**
```typescript
new MCPilotSDK(options?: SDKOptions)
```

**方法**
- `initMCP(): Promise<void>` - 初始化MCP功能
- `connectMCPServer(config: MCPClientConfig, name?: string): Promise<MCPClient>` - 连接到MCP服务器
- `disconnectMCPServer(name: string): Promise<void>` - 断开MCP服务器连接
- `listTools(): Tool[]` - 列出所有可用工具
- `searchTools(query: string): Tool[]` - 搜索工具
- `executeTool(name: string, args: any): Promise<ToolResult>` - 执行工具
- `addService(config: ServiceConfig): Promise<void>` - 添加服务
- `startService(name: string): Promise<void>` - 启动服务
- `stopService(name: string): Promise<void>` - 停止服务
- `getServiceStatus(name: string): Promise<ServiceStatus>` - 获取服务状态
- `listServices(): ServiceConfig[]` - 列出所有服务
- `configureAI(config: Partial<AIConfig>): Promise<void>` - 配置AI
- `ask(query: string, options?: AskOptions): Promise<AskResult>` - 向AI提问
- `getConfig(): Config` - 获取当前配置

#### 单例实例
```typescript
import { mcpilot } from '@mcpilotx/sdk-core';
// mcpilot是自动初始化的MCPilotSDK单例实例
```

## 🧪 测试

运行测试套件：

```bash
npm test
```

运行特定测试：

```bash
npm test -- __tests__/sdk.test.ts
```

生成覆盖率报告：

```bash
npm test -- --coverage
```

## 🏗️ 架构

MCPilot SDK Core采用模块化架构，具有清晰的关注点分离：

### 核心组件

1. **SDK核心** (`src/sdk.ts`)
   - 主SDK类和公共API
   - 单例实例管理
   - 服务生命周期管理

2. **运行时适配器** (`src/runtime/`)
   - Node.js适配器
   - Python适配器
   - Docker适配器
   - Go适配器
   - Rust适配器

3. **MCP集成** (`src/mcp/`)
   - MCP客户端实现
   - 工具注册表
   - 传输层（stdio、HTTP、SSE）

4. **配置管理** (`src/core/`)
   - 配置管理器
   - 配置验证器
   - 持久化存储

5. **AI模块** (`src/ai/`) - 可选
   - AI提供商集成
   - 自然语言处理
   - 向量数据库支持

### 数据流

```
应用程序 → MCPilotSDK → 运行时适配器 → 服务进程
                    ↓
                MCP客户端 → MCP服务器 → 工具执行
```

## 🔌 MCP服务器集成

### 支持的MCP服务器

MCPilot SDK Core可以与任何符合MCP标准的服务器集成：

1. **文件系统服务器** (`@modelcontextprotocol/server-filesystem`)
2. **Git服务器** (`@modelcontextprotocol/server-git`)
3. **网络搜索服务器** (`@modelcontextprotocol/server-websearch`)
4. **自定义MCP服务器**

### 连接配置

```typescript
// stdio传输
{
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
}

// HTTP传输
{
  transport: {
    type: 'http',
    url: 'http://localhost:3000'
  }
}

// SSE传输
{
  transport: {
    type: 'sse',
    url: 'http://localhost:3000/sse'
  }
}
```

## 📖 文档

### 完整文档
- [API参考](./docs/api.md) - 完整的API文档
- [架构指南](./docs/architecture.md) - 架构详细说明
- [开发指南](./docs/development.md) - 开发指南

### 示例代码
查看 [`examples/`](./examples/) 目录获取更多示例：
- `basic-usage.ts` - 基本使用示例
- `test-core-functionality.ts` - 核心功能测试
- `test-mcp-client.ts` - MCP客户端测试
- `test-tool-registry.ts` - 工具注册表测试

## 🤝 贡献指南

我们欢迎贡献！请参阅我们的贡献指南：

1. **报告问题**
   - 使用GitHub Issues报告bug或请求功能
   - 提供详细的复现步骤

2. **提交代码**
   - Fork仓库并创建功能分支
   - 确保代码通过所有测试
   - 添加适当的测试用例
   - 提交清晰的提交信息

3. **代码规范**
   - 遵循TypeScript最佳实践
   - 使用有意义的变量名
   - 添加适当的注释
   - 保持代码简洁

### 开发设置

```bash
# 克隆仓库
git clone https://github.com/MCPilotX/sdk-core.git

# 安装依赖
cd sdk-core
npm install

# 运行开发服务器
npm run dev

# 运行测试
npm test
```

## 📄 许可证

本项目基于Apache 2.0许可证 - 查看 [LICENSE](./LICENSE) 文件了解详情。

## 🙏 致谢

感谢所有为这个项目做出贡献的人：

- **MCP协议团队** - 创建了Model Context Protocol标准
- **TypeScript社区** - 提供了优秀的类型系统
- **开源贡献者** - 他们的工作使这个项目成为可能

## 🆘 支持

如果您需要帮助：

1. **查看文档** - 首先查看完整文档
2. **检查示例** - 查看示例代码了解用法
3. **搜索问题** - 在GitHub Issues中搜索类似问题
4. **创建新问题** - 如果找不到解决方案，创建新问题

### 社区支持
- **GitHub Discussions** - 提问和讨论
- **Discord频道** - 实时聊天和支持(待定)
- **Stack Overflow** - 使用`mcpilot`标签

## 🗺️ 路线图

### 即将推出的功能

1. **增强的AI集成**
   - 更多AI提供商支持
   - 本地AI模型集成
   - 高级提示工程

2. **扩展的运行时支持**
   - Java运行时适配器
   - 自定义运行时插件系统

3. **企业功能**
   - 高级监控和告警
   - 多租户支持
   - 审计日志

4. **开发者工具**
   - CLI工具
   - VS Code扩展
   - 调试工具

### 当前版本：v0.3.0

**主要功能**
- ✅ 完整的MCP协议支持
- ✅ 多运行时服务编排
- ✅ 配置管理系统
- ✅ 基本AI集成
- ✅ 全面的测试套件

**下一步计划**
- 提高测试覆盖率至85%+
- 添加更多示例和教程
- 性能优化和基准测试

---

**MCPilot SDK Core** - 让AI服务编排变得简单而强大
