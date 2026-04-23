<p align="center">
  <img src="./packages/web/public/logo.jpg" width="200" alt="IntentOrch Logo" />
</p>

<h1 align="center">IntentOrch</h1>
<p align="center">
  <strong>意图驱动的 MCP 编排引擎 — 用自然语言，驱动一切</strong>
</p>

<p align="center">
  <a href="https://github.com/mcpilotx/intentorch/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/license-Apache%202.0-blue.svg" alt="License" />
  </a>
  <a href="https://nodejs.org">
    <img src="https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen" alt="Node Version" />
  </a>
  <a href="https://pnpm.io">
    <img src="https://img.shields.io/badge/package%20manager-pnpm-orange" alt="Package Manager" />
  </a>
  <a href="https://github.com/mcpilotx/intentorch/issues">
    <img src="https://img.shields.io/github/issues/mcpilotx/intentorch" alt="Issues" />
  </a>
</p>

<p align="center">
  <b>中文</b> | <a href="README.en.md">English</a>
</p>

<!-- Dashboard 全景截图 -->
<p align="center">
  <img src="./docs/screenshots/dashboard.png" width="800" alt="IntentOrch Dashboard - 系统状态总览" />
</p>

---

## 🌟 一句话介绍

**IntentOrch** 是 MCP（Model Context Protocol）生态的**意图驱动编排引擎**。你只需用自然语言描述需求，它就能自动理解意图、匹配工具、编排工作流并执行。

> 💡 **核心理念**：从"告诉计算机怎么做"到"告诉计算机你想要什么"

---

## 🎯 为什么需要 IntentOrch？

MCP 生态正在爆发，已有上千个 MCP Server 可供使用。但开发者面临三大痛点：

| 痛点 | 传统方式 | IntentOrch 的方式 |
|------|---------|-----------------|
| **发现难** | 需要手动搜索、阅读文档 | 自然语言描述需求，AI 自动匹配最佳工具 |
| **编排难** | 需要编写代码串联多个工具 | 一句话生成完整工作流，自动处理依赖 |
| **管理难** | 每个 Server 需要单独启动、监控 | 统一生命周期管理，Web 控制台可视化操作 |

**IntentOrch 让 MCP 从"开发者工具"变成"每个人的助手"。**

---

## ✨ 核心特性

### 🧠 意图驱动编排 — 核心中的核心

```
你输入： "帮我查一下明天从广州到长沙的高铁票"

IntentOrch 自动完成：
┌─────────────────────────────────────────────────────┐
│ ① 意图解析                                          │
│    └─ 识别需求：查询火车票                           │
│    └─ 提取参数：明天、广州→长沙、高铁                │
│                                                     │
│ ② 工具匹配                                          │
│    └─ 找到 12306-mcp → get-tickets 工具             │
│    └─ 参数映射：广州→GZQ, 长沙→CSQ, 高铁→G         │
│                                                     │
│ ③ 工作流编排                                        │
│    └─ 生成可执行的工作流（1个步骤）                  │
│    └─ 自动处理依赖关系                               │
│                                                     │
│ ④ 自动执行                                          │
│    └─ 启动 MCP Server → 调用工具 → 返回结果         │
└─────────────────────────────────────────────────────┘
```

**无需写代码，无需查文档，说人话就行。**

<!-- 意图编排页面截图 -->
<p align="center">
  <img src="./docs/screenshots/orchestration.png" width="800" alt="IntentOrch 意图编排界面 - 自然语言生成工作流" />
</p>

### 🐳 MCP Server 全生命周期管理

像 Docker 一样管理你的 MCP Server：

| 命令 | 说明 | 类比 Docker |
|------|------|------------|
| `intorch pull` | 从注册表拉取 MCP Server | `docker pull` |
| `intorch start` | 启动 MCP Server | `docker run` |
| `intorch stop` | 停止 MCP Server | `docker stop` |
| `intorch ps` | 查看运行中的 Server | `docker ps` |
| `intorch logs` | 查看 Server 日志 | `docker logs` |

支持 **GitHub**、**Gitee** 等多源注册表，一键拉取社区贡献的 MCP Server。

### 🖥️ 可视化 Web 管理控制台

| 页面 | 功能 |
|------|------|
| **📊 仪表板** | 系统状态总览，Server 运行状况一目了然 |
| **💬 意图编排** | AI 聊天式交互，自然语言 → 自动化工作流 |
| **📦 MCP 服务** | 拉取、启动、停止、监控 MCP Server |
| **📋 工作流** | 查看、编辑、执行已保存的工作流 |
| **🔧 进程监控** | 实时查看进程资源占用和运行状态 |
| **⚙️ 配置管理** | AI 提供商和注册表配置 |
| **🔑 密钥管理** | 安全存储 API Key 等敏感信息 |
| **📝 日志查看** | 集中查看系统、Server、工作流日志 |

<!-- 功能截图拼图 -->
<p align="center">
  <img src="./docs/screenshots/workflows.png" width="45%" alt="工作流管理" />
  <img src="./docs/screenshots/servers.png" width="45%" alt="MCP服务管理" />
</p>
<p align="center">
  <em>左：工作流管理 ｜ 右：MCP服务管理</em>
</p>

### 🔧 CLI + Daemon + Web 三端一体

```bash
# 命令行快速操作
intorch pull github:Joooook/12306-mcp
intorch start 12306-mcp
intorch ps

# 启动 Web 控制台
intorch daemon start
intorch dashboard

# 工作流管理
intorch workflow list
intorch workflow run <id>
```

---

## 🏗️ 架构设计

```
┌─────────────────────────────────────────────────────────┐
│                    用户交互层                            │
│  ┌──────────┐    ┌──────────┐    ┌──────────────────┐   │
│  │   CLI    │    │  Daemon  │    │  Web Dashboard   │   │
│  │  命令行  │    │  守护进程 │    │  可视化控制台    │   │
│  └────┬─────┘    └────┬─────┘    └────────┬─────────┘   │
└───────┼───────────────┼───────────────────┼──────────────┘
        │               │                   │
┌───────┴───────────────┴───────────────────┴──────────────┐
│                     核心引擎层                            │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │          意图驱动编排引擎 (Intent Engine)           │  │
│  │                                                    │  │
│  │  自然语言 → 意图解析 → 工具匹配 → 工作流编排 → 执行 │  │
│  └────────────────────────────────────────────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Workflow     │  │ Process      │  │ Runtime       │  │
│  │ Engine       │  │ Manager      │  │ Adapter       │  │
│  │ 工作流引擎    │  │ 进程管理      │  │ 运行时适配    │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
│                                                          │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────────┐  │
│  │ Tool         │  │ Secret       │  │ Config        │  │
│  │ Registry     │  │ Manager      │  │ Manager       │  │
│  │ 工具注册表    │  │ 密钥管理     │  │ 配置管理      │  │
│  └──────────────┘  └──────────────┘  └───────────────┘  │
└──────────────────────────────────────────────────────────┘
        │                    │
┌───────┴────────────────────┴─────────────────────────────┐
│                     MCP 生态层                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐   │
│  │ 12306    │  │ File     │  │ 1000+ MCP            │   │
│  │ MCP      │  │ System   │  │ Servers...           │   │
│  └──────────┘  └──────────┘  └──────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### 核心模块

| 模块 | 说明 |
|------|------|
| **@intentorch/core** | 核心业务逻辑：意图解析、工作流引擎、MCP 客户端、进程管理 |
| **@intentorch/cli** | 命令行工具：Server 管理、工作流管理、守护进程控制 |
| **@intentorch/web** | Web 管理控制台：React + TypeScript + Tailwind CSS |

---

## 🚦 快速开始

### 前置要求
- Node.js >= 18.0.0
- pnpm >= 8.0.0

### 安装
```bash
# 克隆仓库
git clone https://github.com/mcpilotx/intentorch.git
cd intentorch

# 安装依赖
pnpm install

# 构建所有包
pnpm build
```

### 启动
```bash
# 启动守护进程
intorch daemon start

# 启动 Web 控制台
intorch dashboard

# 打开浏览器访问 http://localhost:5173
```

### 完整使用流程
```bash
# 1. 从 GitHub 拉取 12306 查票 MCP Server
intorch pull github:Joooook/12306-mcp

# 2. 启动 Server
intorch start 12306-mcp

# 3. 查看运行状态
intorch ps

# 4. 打开 Web 控制台，用自然语言编排工作流
intorch dashboard
# → 在编排页面输入："帮我查一下明天从广州到长沙的高铁票"
# → AI 自动解析、匹配工具、生成工作流
# → 一键执行，获取结果
```

---

## 📸 场景示例

### 场景一：一句话查火车票
```
你： "帮我查一下明天从广州到长沙的高铁票"

IntentOrch：
✅ 解析意图 → 查询火车票
✅ 匹配工具 → 12306-mcp / get-tickets
✅ 参数映射 → date=明天, from=广州, to=长沙, filter=高铁
✅ 执行结果 → 返回 G 字头列车时刻表和余票信息
```

### 场景二：多步骤自动化
```
你： "每天早上8点检查服务器状态，如果 CPU 超过 80% 就发送告警"

IntentOrch：
✅ 解析为 3 个原子意图
   ├─ 步骤1: 获取服务器 CPU 使用率
   ├─ 步骤2: 判断是否超过阈值
   └─ 步骤3: 发送告警通知
✅ 自动编排依赖关系
✅ 生成可定时执行的工作流
```

### 场景三：组合多个 MCP Server
```
你： "搜索最新的 AI 新闻，总结要点，保存到本地文件"

IntentOrch：
✅ 步骤1: search-web → 搜索 AI 新闻
✅ 步骤2: ai-summarize → 总结要点
✅ 步骤3: filesystem → 保存到本地
✅ 自动处理步骤间的数据传递
```

---

## 🧩 生态兼容

IntentOrch 兼容所有遵循 [Model Context Protocol](https://modelcontextprotocol.io) 标准的 MCP Server：

- 📊 **数据库** — PostgreSQL、MySQL、SQLite 查询
- 📁 **文件系统** — 文件读写、目录操作
- 🌐 **网络服务** — HTTP 请求、API 调用
- 🚄 **交通出行** — 12306 查票、航班查询
- 📰 **信息获取** — 新闻、天气、百科
- 🛠️ **开发工具** — Git 操作、代码分析
- ... 以及 **1000+** 社区贡献的 MCP Server

---

## 🤝 贡献指南

我们欢迎所有形式的贡献！请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

### 开发
```bash
# 启动开发模式
pnpm dev

# 运行测试
pnpm test

# 代码检查
pnpm lint
```

---

## 📄 许可证

本项目基于 [Apache 2.0](LICENSE) 许可证开源。

---

<p align="center">
  <b>IntentOrch</b> — 从"告诉计算机怎么做"到"告诉计算机你想要什么"
</p>
<p align="center">
  <a href="https://github.com/mcpilotx/intentorch">GitHub</a> •
  <a href="https://gitee.com/mcpilotx/intentorch">Gitee</a> •
  <a href="https://github.com/mcpilotx/intentorch/issues">Issues</a>
</p>
