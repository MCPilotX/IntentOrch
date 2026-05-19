# IntentOrch Web Dashboard

基于React + TypeScript + Tailwind CSS的IntentOrch Web管理控制台，提供完整的MCP Server管理和智能编排功能。

## 功能特性

- 📊 **仪表板**：系统概览、统计信息、最近活动
- 🖥️ **Server管理**：MCP Server的拉取、启动、停止、删除
- 🔄 **进程监控**：实时监控运行中的进程状态
- ⚙️ **配置管理**：AI配置、Registry配置、系统配置
- 🔑 **密钥管理**：安全的密钥存储和管理
- 🤖 **智能编排**：AI驱动的意图解析和工作流生成
- 🔄 **工作流管理**：可视化工作流编辑和执行
- 📝 **日志查看**：实时日志查看和历史日志搜索

## 技术栈

- **前端框架**: React 19 + TypeScript
- **样式框架**: Tailwind CSS
- **路由管理**: React Router DOM
- **状态管理**: TanStack Query (React Query)
- **HTTP客户端**: Axios
- **图标库**: Lucide React
- **UI组件**: Headless UI, Heroicons
- **图表库**: Recharts
- **工作流可视化**: React Flow
- **构建工具**: Vite
- **代码质量**: ESLint, TypeScript


## 快速开始

### 方式一：全局安装（推荐）

```bash
# 1. 全局安装
npm install -g @intentorch/web

# 2. 确保 daemon 已启动（需要先安装 @intentorch/cli）
npm install -g @intentorch/cli
intorch daemon start

# 3. 启动 Web 面板
intorch-web
```

执行 `intorch-web` 后，会自动：
- 检测 daemon 是否运行
- 获取认证 Token
- 启动内置 HTTP 静态文件服务器
- 打开浏览器访问 Web 面板

> **提示**：默认端口为 5173，可通过环境变量修改：
> ```bash
> INTORCH_WEB_PORT=8080 intentorch-web
> ```

### 方式二：本地开发

#### 1. 安装依赖

```bash
npm install
```

#### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

#### 3. 构建生产版本

```bash
npm run build
```

#### 4. 预览生产版本

```bash
npm run preview
```

## API集成

Web控制台需要与IntentOrch Daemon后端API集成。默认API地址为 `http://localhost:9658`。

### 主要API端点

- `GET /api/servers` - 获取Server列表
- `POST /api/servers/pull` - 拉取Server
- `POST /api/servers/:id/start` - 启动Server
- `POST /api/servers/:id/stop` - 停止Server
- `GET /api/processes` - 获取进程列表
- `GET /api/config` - 获取配置
- `PUT /api/config` - 更新配置
- `GET /api/secrets` - 获取密钥列表
- `POST /api/secrets` - 添加密钥
- `GET /api/workflows` - 获取工作流列表
- `GET /api/system/stats` - 获取系统统计

### 构建静态文件
```bash
npm run build
```

## 许可证

Apache-2.0

## 贡献

欢迎提交Issue和Pull Request！

## 联系与社区

Intentorch是一个社区驱动的智能编排系统，我们欢迎所有开发者和用户的参与！

### 联系方式
- **邮箱**: applesline@163.com
- **GitHub**: [MCPilotX/IntentOrch](https://github.com/MCPilotX/IntentOrch)
- **Gitee**: [MCPilotX/IntentOrch](https://gitee.com/MCPilotX/IntentOrch) (国内镜像)
- **微信公众号**: 扫码关注Intentorch获取最新动态

### 社区参与
我们鼓励社区成员通过以下方式参与项目：
1. **提交Issue**: 报告Bug、提出功能建议
2. **提交PR**: 贡献代码、改进文档
3. **分享用例**: 分享你的使用场景和最佳实践
4. **参与讨论**: 在GitHub Discussions中参与技术讨论

