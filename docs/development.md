# 开发指南

## 概述

本文档为 MCPilot SDK Core 的开发者提供详细的开发指南，包括环境设置、代码结构、开发流程、测试和贡献指南。

## 开发环境设置

### 系统要求

- **Node.js**: 18.x 或更高版本
- **npm**: 9.x 或更高版本（或 yarn/pnpm）
- **TypeScript**: 5.x 或更高版本
- **Git**: 版本控制系统

### 环境设置步骤

1. **克隆仓库**

```bash
git clone https://github.com/MCPilotX/mcpilot.git
cd mcpilot/packages/sdk-core
```

2. **安装依赖**

```bash
npm install
# 或使用 yarn
yarn install
# 或使用 pnpm
pnpm install
```

3. **构建项目**

```bash
npm run build
```

4. **运行测试**

```bash
npm test
```

### 开发工具推荐

- **编辑器**: VS Code 或 WebStorm
- **TypeScript 插件**: 确保 TypeScript 支持
- **ESLint**: 代码质量检查
- **Prettier**: 代码格式化
- **Jest**: 测试运行器

## 项目结构

### 目录结构

```
sdk-core/
├── src/                    # 源代码
│   ├── index.ts           # 主入口文件
│   ├── sdk.ts             # SDK 主类
│   ├── ai/                # AI 集成模块
│   │   ├── ai.ts          # AI 核心功能
│   │   ├── cloud-intent-engine.ts  # 云意图引擎
│   │   ├── command.ts     # 命令处理
│   │   ├── config.ts      # AI 配置
│   │   ├── enhanced-intent.ts  # 增强意图识别
│   │   ├── index.ts       # AI 模块导出
│   │   └── intent.ts      # 意图处理
│   ├── core/              # 核心功能模块
│   │   ├── ai-config.ts   # AI 配置管理
│   │   ├── config-manager.ts  # 配置管理器
│   │   ├── config-validator.ts  # 配置验证器
│   │   ├── constants.ts   # 常量定义
│   │   ├── error-ai.ts    # AI 错误处理
│   │   ├── error-handler.ts  # 错误处理器
│   │   ├── index.ts       # 核心模块导出
│   │   ├── logger.ts      # 日志系统
│   │   ├── performance-monitor.ts  # 性能监控
│   │   ├── providers.ts   # 服务提供商
│   │   ├── retry-manager.ts  # 重试管理器
│   │   └── types.ts       # 类型定义
│   ├── daemon/            # 守护进程功能
│   │   ├── index.ts       # 守护进程模块导出
│   │   ├── intent-engine.ts  # 意图引擎
│   │   ├── orchestrator.ts  # 编排器
│   │   ├── pm.ts          # 进程管理
│   │   ├── process.ts     # 进程处理
│   │   ├── server.ts      # 服务器
│   │   └── service.ts     # 服务管理
│   ├── mcp/               # MCP 协议模块
│   │   ├── client.ts      # MCP 客户端
│   │   ├── index.ts       # MCP 模块导出
│   │   ├── tool-registry.ts  # 工具注册表
│   │   ├── transport.ts   # 传输层
│   │   └── types.ts       # MCP 类型定义
│   └── runtime/           # 运行时适配器
│       ├── adapter-advanced.ts  # 高级适配器
│       ├── adapter.ts     # 基础适配器接口
│       ├── detector-advanced.ts  # 高级检测器
│       ├── detector.ts    # 运行时检测器
│       ├── docker-adapter.ts  # Docker 适配器
│       ├── docker.ts      # Docker 运行时
│       ├── executable-analyzer.ts  # 可执行文件分析器
│       ├── go-adapter.ts  # Go 适配器
│       ├── index.ts       # 运行时模块导出
│       ├── node-adapter.ts  # Node.js 适配器
│       ├── node.ts        # Node.js 运行时
│       ├── python-adapter.ts  # Python 适配器
│       ├── python.ts      # Python 运行时
│       ├── rust-adapter.ts  # Rust 适配器
│       └── rust.ts        # Rust 运行时
├── tests/                 # 测试文件（实际目录）
│   ├── improvements.test.ts
│   ├── logger.test.ts
│   ├── sdk-simple.test.ts
│   ├── sdk.test.ts
│   └── setup.ts
├── examples/              # 示例代码
│   ├── 1-basic-sdk-usage.js
│   ├── 2-ai-integration.js
│   ├── 3-mcp-tools.js
│   ├── analyze-readme-example.ts
│   ├── basic-usage.ts
│   ├── cloud-intent-engine-demo.ts
│   ├── developer-starter-kit.js
│   ├── end-to-end-test.ts
│   ├── enhanced-intent-tracking-demo.ts
│   ├── filesystem-server-demo.ts
│   ├── fix-ask-method-example.ts
│   ├── http-transport-demo.ts
│   ├── improved-stdio-transport.ts
│   ├── mcp-integration-test.js
│   ├── mcp-tool-discovery.md
│   ├── mock-filesystem-server.cjs
│   ├── mock-mcp-server.js
│   ├── quick-test.js
│   ├── real-world-scenarios.ts
│   ├── run-all-examples.sh
│   └── zero-config-demo.ts
├── docs/                  # 文档
│   ├── api.md
│   ├── architecture.md
│   ├── development.md
│   └── README.ZH_CN.md
├── dist/                  # 构建输出
├── package.json           # 项目配置
├── tsconfig.json          # TypeScript 配置
├── jest.config.js         # Jest 配置
└── README.md              # 项目说明
```

### 代码组织原则

1. **单一职责**: 每个文件/类只负责一个功能
2. **模块化**: 相关功能组织在同一目录
3. **依赖注入**: 通过构造函数注入依赖
4. **接口隔离**: 使用接口定义契约

## 开发流程

### 1. 功能开发

#### 创建新功能

1. **分析需求**: 明确功能目标和范围
2. **设计接口**: 设计公共 API 接口
3. **实现功能**: 编写实现代码
4. **编写测试**: 创建单元测试
5. **更新文档**: 更新 API 文档

#### 示例：添加新的运行时适配器

```typescript
// 1. 创建适配器类
import { RuntimeAdapter, ServiceConfig, ProcessInfo, ServiceStatus } from '../runtime/adapter';

export class GoRuntimeAdapter implements RuntimeAdapter {
  async start(config: ServiceConfig): Promise<ProcessInfo> {
    // 实现 Go 服务启动逻辑
    return {
      id: `go-${Date.now()}`,
      pid: 12345,
      status: 'running',
      startedAt: new Date(),
      config
    };
  }

  async stop(processId: string): Promise<void> {
    // 实现 Go 服务停止逻辑
  }

  async status(processId: string): Promise<ServiceStatus> {
    // 实现状态检查逻辑
    return {
      running: true,
      pid: 12345,
      uptime: 3600000,
      memory: 1024 * 1024 * 50, // 50MB
      cpu: 0.3
    };
  }

  supports(runtimeType: string): boolean {
    return runtimeType === 'go';
  }
}

// 2. 注册适配器
import { RuntimeAdapterRegistry } from '../runtime/adapter-advanced';

RuntimeAdapterRegistry.registerAdapter('go', GoRuntimeAdapter);
```

### 2. 代码规范

#### TypeScript 规范

- 使用严格模式 (`strict: true`)
- 明确的类型注解
- 避免使用 `any` 类型
- 使用接口定义数据结构

```typescript
// 好的示例
interface UserConfig {
  name: string;
  age: number;
  email?: string;
}

function createUser(config: UserConfig): User {
  // 实现
}

// 避免的示例
function createUser(config: any): any {
  // 实现
}
```

#### 命名规范

- **类名**: PascalCase (例如: `MCPilotSDK`)
- **方法名**: camelCase (例如: `executeTool`)
- **变量名**: camelCase (例如: `serviceConfig`)
- **常量名**: UPPER_SNAKE_CASE (例如: `MAX_RETRIES`)
- **接口名**: PascalCase，前缀 `I` 可选 (例如: `IServiceConfig` 或 `ServiceConfig`)

#### 错误处理

- 使用自定义错误类
- 提供有意义的错误信息
- 包含错误代码和重试建议

```typescript
class MCPilotError extends Error {
  constructor(
    message: string,
    public code: string,
    public shouldRetry: boolean = false
  ) {
    super(message);
    this.name = 'MCPilotError';
  }
}

// 使用示例
throw new MCPilotError('Connection failed', 'CONNECTION_ERROR', true);
```

### 3. 测试开发

#### 单元测试

使用 Jest 编写单元测试：

```typescript
import { MCPilotSDK } from '../src/sdk';
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

describe('MCPilotSDK', () => {
  let sdk: MCPilotSDK;

  beforeEach(() => {
    sdk = new MCPilotSDK({ autoInit: false });
  });

  afterEach(() => {
    // 清理资源
  });

  describe('init', () => {
    it('should initialize successfully', async () => {
      await expect(sdk.init()).resolves.not.toThrow();
    });

    it('should throw error when already initialized', async () => {
      await sdk.init();
      await expect(sdk.init()).rejects.toThrow('Already initialized');
    });
  });

  describe('executeTool', () => {
    it('should execute tool successfully', async () => {
      // 模拟工具执行
      const result = await sdk.executeTool('mock_tool', { param: 'value' });
      expect(result.isError).toBe(false);
      expect(result.content).toHaveLength(1);
    });

    it('should throw error for non-existent tool', async () => {
      await expect(
        sdk.executeTool('non_existent_tool', {})
      ).rejects.toThrow('Tool not found');
    });
  });
});
```

#### 集成测试

```typescript
import { mcpilot } from '../src';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';

describe('Integration Tests', () => {
  beforeAll(async () => {
    // 启动测试服务器
  });

  afterAll(async () => {
    // 停止测试服务器
  });

  it('should connect to MCP server and list tools', async () => {
    await mcpilot.initMCP();
    
    await mcpilot.connectMCPServer({
      transport: {
        type: 'stdio',
        command: 'node',
        args: ['examples/mock-mcp-server.js']
      }
    }, 'test-server');

    const tools = mcpilot.listTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools[0]).toHaveProperty('name');
    expect(tools[0]).toHaveProperty('description');
  });
});
```

#### 测试覆盖率

运行测试覆盖率检查：

```bash
npm test -- --coverage
```

目标覆盖率：
- 语句覆盖率: > 85%
- 分支覆盖率: > 80%
- 函数覆盖率: > 85%
- 行覆盖率: > 85%

### 4. 文档更新

#### API 文档

更新 API 文档时：
1. 添加新方法的文档
2. 更新类型定义
3. 提供使用示例
4. 说明错误情况

#### 示例代码

为每个新功能添加示例：

```typescript
// examples/new-feature-usage.ts
import { mcpilot } from '@mcpilotx/sdk-core';

async function demonstrateNewFeature() {
  // 初始化 SDK
  await mcpilot.initMCP();
  
  // 使用新功能
  const result = await mcpilot.newFeatureMethod({
    param1: 'value1',
    param2: 'value2'
  });
  
  console.log('Result:', result);
  
  // 清理
  await mcpilot.cleanup();
}

demonstrateNewFeature().catch(console.error);
```

## 构建和发布

### 开发构建

```bash
# 开发构建（带源映射）
npm run build

# 监视模式（自动重新构建）
npm run dev
```

### 生产构建

```bash
# 生产构建（优化）
npm run build:prod
```

### 发布流程

1. **版本管理**

```bash
# 更新版本号
npm version patch  # 修复版本
npm version minor  # 小版本
npm version major  # 大版本
```

2. **构建发布包**

```bash
# 运行测试
npm test

# 构建生产版本
npm run build:prod

# 准备发布
npm run prepublishOnly
```

3. **发布到 npm**

```bash
# 发布到 npm
npm publish --access public
```

### 版本策略

- **主版本 (Major)**: 不兼容的 API 变更
- **次版本 (Minor)**: 向后兼容的功能添加
- **修订版本 (Patch)**: 向后兼容的错误修复

## 调试技巧

### 1. 日志调试

启用调试日志：

```typescript
const sdk = new MCPilotSDK({
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.error(`[ERROR] ${msg}`),
    debug: (msg) => console.debug(`[DEBUG] ${msg}`),
  }
});
```

### 2. TypeScript 调试

使用 VS Code 调试配置：

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Tests",
      "program": "${workspaceFolder}/node_modules/.bin/jest",
      "args": ["--runInBand"],
      "console": "integratedTerminal",
      "internalConsoleOptions": "neverOpen",
      "disableOptimisticBPs": true
    },
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Example",
      "program": "${workspaceFolder}/examples/basic-usage.ts",
      "runtimeArgs": ["-r", "ts-node/register"],
      "console": "integratedTerminal"
    }
  ]
}
```

### 3. 网络调试

调试 MCP 通信：

```typescript
// 启用详细日志
const sdk = new MCPilotSDK({
  mcp: {
    debug: true,  // 启用调试模式
    servers: [
      {
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem'],
          env: {
            DEBUG: 'mcp:*'  // 启用服务器调试
          }
        }
      }
    ]
  }
});
```

## 性能优化

### 1. 工具缓存

实现工具缓存机制：

```typescript
class ToolRegistry {
  private toolCache = new Map<string, Tool>();
  private cacheTTL = 5 * 60 * 1000; // 5分钟

  async getTool(name: string): Promise<Tool | null> {
    const cached = this.toolCache.get(name);
    
    if (cached && Date.now() - cached.cachedAt < this.cacheTTL) {
      return cached.tool;
    }
    
    // 从服务器获取工具
    const tool = await this.fetchToolFromServer(name);
    if (tool) {
      this.toolCache.set(name, {
        tool,
        cachedAt: Date.now()
      });
    }
    
    return tool;
  }
}
```

### 2. 连接池

管理 MCP 连接：

```typescript
class ConnectionPool {
  private connections: Map<string, MCPClient[]> = new Map();
  private maxConnections = 10;

  async getConnection(serverName: string): Promise<MCPClient> {
    const pool = this.connections.get(serverName) || [];
    
    // 查找空闲连接
    const available = pool.filter(conn => !conn.isBusy);
    if (available.length > 0) {
      return available[0];
    }
    
    // 创建新连接
    if (pool.length < this.maxConnections) {
      const newConn = await this.createConnection(serverName);
      pool.push(newConn);
      this.connections.set(serverName, pool);
      return newConn;
    }
    
    // 等待连接释放
    return this.waitForConnection(serverName);
  }
}
```

### 3. 批量操作

优化批量工具执行：

```typescript
async function executeToolsInBatch(
  toolCalls: Array<{ name: string; args: any }>,
  batchSize = 5
): Promise<ToolResult[]> {
  const results: ToolResult[] = [];
  
  for (let i = 0; i < toolCalls.length; i += batchSize) {
    const batch = toolCalls.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(({ name, args }) => sdk.executeTool(name, args))
    );
    results.push(...batchResults);
  }
  
  return results;
}
```

## 错误处理和监控

### 1. 错误追踪

实现错误追踪：

```typescript
class ErrorTracker {
  private errors: Array<{
    timestamp: Date;
    error: Error;
    context: Record<string, any>;
  }> = [];

  trackError(error: Error, context: Record<string, any> = {}) {
    this.errors.push({
      timestamp: new Date(),
      error,
      context
    });
    
    // 限制错误数量
    if (this.errors.length > 1000) {
      this.errors = this.errors.slice(-1000);
    }
    
    // 发送到监控服务（可选）
    this.sendToMonitoring(error, context);
  }

  getErrorStats(): ErrorStatistics {
    const lastHour = this.errors.filter(
      e => Date.now() - e.timestamp.getTime() < 3600000
    );
    
    return {
      totalErrors: this.errors.length,
      lastHourErrors: lastHour.length,
      errorTypes: this.groupByErrorType(lastHour),
      mostCommonContext: this.findMostCommonContext(lastHour)
    };
  }
}
```

### 2. 性能监控

监控 SDK 性能：

```typescript
class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric[]> = new Map();

  startMeasurement(operation: string): () => void {
    const startTime = performance.now();
    
    return () => {
      const duration = performance.now() - startTime;
      this.recordMetric(operation, duration);
    };
  }

  private recordMetric(operation: string, duration: number) {
    const metrics = this.metrics.get(operation) || [];
    metrics.push({
      timestamp: new Date(),
      duration,
      success: true
    });
    
    this.metrics.set(operation, metrics.slice(-100)); // 保留最近100个
  }

  getPerformanceReport(): PerformanceReport {
    const report: PerformanceReport = {};
    
    for (const [operation, metrics] of this.metrics) {
      const durations = metrics.map(m => m.duration);
      report[operation] = {
        count: metrics.length,
        avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
        p95Duration: this.percentile(durations, 95),
        p99Duration: this.percentile(durations, 99),
        minDuration: Math.min(...durations),
        maxDuration: Math.max(...durations)
      };
    }
    
    return report;
  }
}
```

## 贡献指南

### 1. 贡献流程

1. **Fork 仓库**: 创建个人 fork
2. **创建分支**: 基于 main 创建功能分支
3. **开发功能**: 实现新功能或修复错误
4. **编写测试**: 添加相应的测试
5. **运行测试**: 确保所有测试通过
6. **提交更改**: 使用规范的提交信息
7. **创建 PR**: 提交 Pull Request