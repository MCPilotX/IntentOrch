# 架构指南

## 概述

MCPilot SDK Core 是一个为开发者设计的 MCP（Model Context Protocol）服务编排 SDK。本文档详细介绍了 SDK 的架构设计、核心组件和设计原则。

## 架构概览

### 整体架构

```
MCPilot SDK Core
├── 核心层 (Core Layer)
│   ├── SDK 主类 (MCPilotSDK)
│   ├── 配置管理器 (ConfigManager)
│   ├── 日志系统 (Logger)
│   └── 错误处理 (ErrorHandler)
│
├── MCP 模块 (MCP Module)
│   ├── MCP 客户端 (MCPClient)
│   ├── 工具注册表 (ToolRegistry)
│   ├── 传输层 (Transport)
│   └── 类型定义 (Types)
│
├── 运行时适配器 (Runtime Adapters)
│   ├── Node.js 适配器
│   ├── Python 适配器
│   ├── Docker 适配器
│   ├── Go 适配器
│   └── Rust 适配器
│
├── 服务管理器 (Service Manager)
│   ├── 服务生命周期管理
│   ├── 健康监控
│   └── 进程管理
│
├── AI 集成层 (AI Integration)
│   ├── 自然语言处理
│   ├── 工具执行编排
│   └── 意图识别
│
└── 守护进程层 (Daemon Layer)
    ├── 意图引擎 (Intent Engine)
    ├── 编排器 (Orchestrator)
    └── 进程管理器 (Process Manager)
```

## 核心组件

### 1. SDK 主类 (MCPilotSDK)

**职责：**
- 提供统一的 API 接口
- 管理 SDK 生命周期
- 协调各个组件之间的交互

**设计特点：**
- 单例模式和实例模式都支持
- 懒加载和按需初始化
- 线程安全的组件管理

```typescript
class MCPilotSDK {
  // 核心组件
  private configManager: ConfigManager;
  private toolRegistry: ToolRegistry;
  private mcpClients: Map<string, MCPClient>;
  
  // 运行时适配器注册表
  private runtimeAdapters: RuntimeAdapterRegistry;
  
  // 服务管理器
  private serviceManager: ServiceManager;
}
```

### 2. 配置管理器 (ConfigManager)

**职责：**
- 管理全局和本地配置
- 配置持久化
- 配置验证和默认值设置

**设计特点：**
- 基于文件的配置存储
- 支持环境变量覆盖
- 配置变更监听

```typescript
class ConfigManager {
  // 配置存储
  private config: Config;
  
  // 配置文件路径
  private configPath: string;
  
  // 配置验证器
  private validator: ConfigValidator;
}
```

### 3. MCP 客户端 (MCPClient)

**职责：**
- 实现 MCP 协议
- 管理 MCP 服务器连接
- 处理工具调用和结果

**支持的传输类型：**
- **stdio**: 标准输入输出传输
- **http**: HTTP 传输
- **sse**: 服务器发送事件传输

```typescript
class MCPClient {
  // 传输层
  private transport: Transport;
  
  // 协议处理器
  private protocolHandler: ProtocolHandler;
  
  // 连接状态
  private connectionState: ConnectionState;
}
```

### 4. 工具注册表 (ToolRegistry)

**职责：**
- 统一管理所有工具
- 工具发现和搜索
- 工具执行和结果处理

**设计特点：**
- 支持多服务器工具聚合
- 工具缓存和性能优化
- 工具执行统计

```typescript
class ToolRegistry {
  // 工具存储
  private tools: Map<string, RegisteredTool>;
  
  // 工具执行器
  private executors: Map<string, ToolExecutor>;
  
  // 统计信息
  private statistics: ToolStatistics;
}
```

### 5. 运行时适配器 (Runtime Adapters)

**职责：**
- 抽象不同运行时的差异
- 提供统一的运行时接口
- 管理服务生命周期

**支持的运行时：**
- **Node.js**: JavaScript/TypeScript 服务
- **Python**: Python 服务
- **Docker**: 容器化服务
- **Go**: Go 语言服务
- **Rust**: Rust 语言服务

```typescript
interface RuntimeAdapter {
  // 启动服务
  start(config: ServiceConfig): Promise<ProcessInfo>;
  
  // 停止服务
  stop(processId: string): Promise<void>;
  
  // 获取服务状态
  status(processId: string): Promise<ServiceStatus>;
  
  // 检查运行时支持
  supports(runtimeType: string): boolean;
}
```

### 6. 服务管理器 (ServiceManager)

**职责：**
- 管理服务生命周期
- 监控服务健康状态
- 处理服务依赖关系

**设计特点：**
- 服务状态持久化
- 自动重启和恢复
- 资源限制和隔离

```typescript
class ServiceManager {
  // 服务存储
  private services: Map<string, ManagedService>;
  
  // 进程管理器
  private processManager: ProcessManager;
  
  // 健康检查器
  private healthChecker: HealthChecker;
}
```

## 设计原则

### 1. 简洁性 (Simplicity)

**目标：** 提供干净、最小的 API 表面

**实现方式：**
- 每个类有单一职责
- 最小化的公共 API
- 直观的命名约定

**示例：**
```typescript
// 简洁的 API 设计
const sdk = new MCPilotSDK();
await sdk.initMCP();
const tools = sdk.listTools();
const result = await sdk.executeTool('read_file', { path: '/tmp/file.txt' });
```

### 2. 模块化 (Modularity)

**目标：** 清晰的关注点分离

**实现方式：**
- 独立的组件模块
- 明确的接口边界
- 松耦合的组件设计

**模块结构：**
```
src/
├── core/          # 核心功能
├── mcp/           # MCP 协议实现
├── runtime/       # 运行时适配器
├── daemon/        # 守护进程功能
└── ai/            # AI 集成
```

### 3. 可扩展性 (Extensibility)

**目标：** 易于添加新功能和适配器

**实现方式：**
- 插件式架构
- 工厂模式创建适配器
- 配置驱动的扩展

**扩展示例：**
```typescript
// 添加自定义运行时适配器
class CustomRuntimeAdapter implements RuntimeAdapter {
  // 实现接口方法
}

// 注册适配器
RuntimeAdapterRegistry.registerAdapter('custom', CustomRuntimeAdapter);
```

### 4. 可靠性 (Reliability)

**目标：** 健壮的错误处理和恢复

**实现方式：**
- 全面的错误类型
- 自动重试机制
- 优雅的降级处理

**错误处理：**
```typescript
try {
  await sdk.executeTool('some_tool', params);
} catch (error) {
  if (error instanceof MCPilotError && error.shouldRetry) {
    // 自动重试逻辑
  }
  // 优雅降级
}
```

### 5. 性能 (Performance)

**目标：** 高效的工具发现和执行

**实现方式：**
- 工具缓存
- 并行执行支持
- 资源优化

**性能优化：**
```typescript
// 并行工具执行
const results = await Promise.all([
  sdk.executeTool('tool1', params1),
  sdk.executeTool('tool2', params2),
  sdk.executeTool('tool3', params3)
]);
```

## 数据流

### 1. 工具执行流程

```
用户请求
    ↓
SDK.executeTool()
    ↓
ToolRegistry.findTool()
    ↓
MCPClient.callTool()
    ↓
Transport.sendRequest()
    ↓
MCP 服务器处理
    ↓
Transport.receiveResponse()
    ↓
ToolRegistry.processResult()
    ↓
返回结果给用户
```

### 2. 服务启动流程

```
用户调用 sdk.startService()
    ↓
ServiceManager.validateConfig()
    ↓
RuntimeAdapterRegistry.createAdapter()
    ↓
RuntimeAdapter.start()
    ↓
ProcessManager.createProcess()
    ↓
监控进程状态
    ↓
返回服务状态
```

### 3. 配置管理流程

```
配置读取请求
    ↓
ConfigManager.loadConfig()
    ↓
ConfigValidator.validate()
    ↓
应用默认值
    ↓
返回配置对象
    ↓
配置变更监听
    ↓
自动保存到文件
```

## 组件交互

### MCP 模块内部交互

```
MCPClient ────────┐
    │              │
    ▼              ▼
Transport ──── ToolRegistry
    │              │
    ▼              ▼
Protocol ────── ToolExecutor
```

### 运行时适配器交互

```
ServiceManager ───┐
    │              │
    ▼              ▼
RuntimeAdapterRegistry
    │
    ▼
[NodeAdapter, PythonAdapter, DockerAdapter, ...]
```

### AI 集成交互

```
AI Module ────────┐
    │              │
    ▼              ▼
IntentEngine ── ToolRegistry
    │              │
    ▼              ▼
Orchestrator ── MCPClient
```

## 配置架构

### 配置文件结构

```json
{
  "global": {
    "logLevel": "info",
    "maxRetries": 3,
    "timeout": 30000
  },
  "ai": {
    "provider": "openai",
    "apiKey": "sk-...",
    "model": "gpt-4",
    "temperature": 0.7
  },
  "mcp": {
    "autoDiscover": true,
    "defaultTransport": "stdio",
    "servers": [
      {
        "name": "filesystem",
        "transport": {
          "type": "stdio",
          "command": "npx",
          "args": ["@modelcontextprotocol/server-filesystem"]
        }
      }
    ]
  },
  "services": {
    "my-service": {
      "name": "my-service",
      "path": "./service",
      "runtime": "node",
      "env": {
        "NODE_ENV": "production"
      }
    }
  }
}
```

### 配置优先级

1. **命令行参数**: 最高优先级
2. **环境变量**: 次高优先级
3. **配置文件**: 默认配置
4. **代码默认值**: 最低优先级

## 错误处理架构

### 错误层次结构

```
Error (基础错误类)
├── MCPilotError (SDK 基础错误)
│   ├── ServiceNotFoundError (服务未找到)
│   ├── ToolNotFoundError (工具未找到)
│   ├── MCPConnectionError (MCP 连接错误)
│   └── ConfigValidationError (配置验证错误)
└── ExternalError (外部错误)
```

### 错误恢复策略

1. **重试策略**: 对于网络错误和临时故障
2. **降级策略**: 当主要功能不可用时
3. **回滚策略**: 对于配置变更失败
4. **通知策略**: 向用户报告错误

```typescript
// 错误恢复示例
async function executeWithRecovery(toolName: string, args: any) {
  try {
    return await sdk.executeTool(toolName, args);
  } catch (error) {
    if (error instanceof MCPConnectionError && error.shouldRetry) {
      // 重试逻辑
      return await retryExecution(toolName, args);
    } else if (error instanceof ToolNotFoundError) {
      // 降级逻辑
      return await fallbackExecution(toolName, args);
    } else {
      // 报告错误
      throw error;
    }
  }
}
```

## 性能考虑

### 1. 工具缓存

- **内存缓存**: 最近使用的工具
- **磁盘缓存**: 工具元数据
- **缓存失效**: 基于时间或事件

### 2. 连接池

- **MCP 连接复用**: 减少连接建立开销
- **连接健康检查**: 自动检测和恢复
- **连接限制**: 防止资源耗尽

### 3. 并行处理

- **工具并行执行**: 支持并发工具调用
- **异步操作**: 非阻塞 I/O
- **批量处理**: 优化多个操作

### 4. 资源管理

- **内存限制**: 防止内存泄漏
- **进程隔离**: 服务间资源隔离
- **垃圾回收**: 及时释放资源

## 安全考虑

### 1. 认证和授权

- **API 密钥管理**: 安全的密钥存储
- **传输加密**: TLS/SSL 支持
- **访问控制**: 基于角色的权限

### 2. 输入验证

- **参数验证**: 严格的类型检查
- **边界检查**: 防止缓冲区溢出
- **注入防护**: SQL/命令注入防护

### 3. 安全配置

- **默认安全**: 安全默认配置
- **配置加密**: 敏感配置加密
- **审计日志**: 安全事件记录

## 部署架构

### 1. 单机部署

```
应用程序
    ↓
MCPilot SDK
    ↓
[本地 MCP 服务器]
    ↓
[本地服务]
```

### 2. 分布式部署

```
应用程序 ───┐
    │       │
    ▼       ▼
MCPilot SDK ─── MCPilot SDK
    │               │
    ▼               ▼
[远程 MCP 服务器] [本地服务]
```

### 3. 容器化部署

```
Docker 容器
    ├── 应用程序
    ├── MCPilot SDK
    └── MCP 服务器
```

## 监控和可观测性

### 1. 指标收集

- **工具执行指标**: 成功率、延迟、吞吐量
- **服务健康指标**: 运行时间、资源使用
- **系统资源指标**: CPU、内存、磁盘

### 2. 日志记录

- **结构化日志**: JSON 格式日志
- **日志级别**: 可配置的日志级别
- **日志聚合**: 集中式日志管理

### 3. 跟踪和追踪

- **请求跟踪**: 端到端请求跟踪
- **性能剖析**: 性能瓶颈分析
- **依赖映射**: 组件依赖关系

## 扩展点

### 1. 自定义运行时适配器

```typescript
// 实现 RuntimeAdapter 接口
class CustomRuntimeAdapter implements RuntimeAdapter {
  async start(config: ServiceConfig): Promise<ProcessInfo> {
    // 自定义启动逻辑
  }
  
  async stop(processId: string): Promise<void> {
    // 自定义停止逻辑
  }
  
  supports(runtimeType: string): boolean {
    return runtimeType === 'custom';
  }
}

// 注册适配器
RuntimeAdapterRegistry.registerAdapter('custom', CustomRuntimeAdapter);
```

### 2. 自定义传输层

```typescript
// 实现 Transport 接口
class CustomTransport implements Transport {
  async connect(config: TransportConfig): Promise<void> {
    // 自定义连接逻辑
  }
  
  async send(request: any): Promise<any> {
    // 自定义发送逻辑
  }
  
  async disconnect(): Promise<void> {
    // 自定义断开逻辑
  }
}
```

### 3. 自定义工具执行器

```typescript
// 实现 ToolExecutor 接口
class CustomToolExecutor implements ToolExecutor {
  async execute(tool: Tool, args: any): Promise<ToolResult> {
    // 自定义执行逻辑
  }
  
  supports(toolName: string): boolean {
    return toolName.startsWith('custom_');
  }
}
```

## 最佳实践

### 1. 配置管理

- 使用环境变量管理敏感配置
- 为不同环境维护不同的配置文件
- 定期备份和验证配置

### 2. 错误处理

- 为所有 SDK 调用添加错误处理
- 实现适当的重试逻辑
- 记录详细的错误信息

### 3. 性能优化

- 缓存频繁使用的工具
- 使用连接池管理 MCP 连接
- 监控和优化资源使用

### 4. 安全实践

- 定期更新依赖项
- 使用最小权限原则
- 实施输入验证和清理

## 未来架构演进

### 1. 插件系统

- **动态插件加载**: 运行时插件加载
- **插件市场**: 社区插件共享
- **插件版本管理**: 兼容性管理

### 2. 分布式架构

- **集群支持**: 多节点部署
- **负载均衡**: 请求分发
- **故障转移**: 高可用性

### 3. 高级 AI 集成

- **多模型支持**: 多个 AI 提供商
- **上下文管理**: 长期对话上下文
- **学习能力**: 自适应行为

### 4. 监控和运维

- **仪表板**: 可视化监控
- **自动化运维**: 自愈系统
- **预测分析**: 性能预测

## 总结

MCPilot SDK Core 采用模块化、可扩展的架构设计，专注于为开发者提供简洁、可靠的 MCP 服务编排能力。通过清晰的组件边界、全面的错误处理和性能优化，SDK 能够满足从简单工具调用到复杂服务编排的各种需求。

架构的核心优势包括：
- **简洁的 API 设计**: 降低学习曲线
- **模块化组件**: 易于维护和扩展
- **全面的错误处理**: 提高系统可靠性
- **性能优化**: 确保高效执行
- **安全考虑**: 保护系统和数据安全

随着项目的发展，架构将继续演进，添加更多高级功能和优化，同时保持对现有用户的向后兼容性。