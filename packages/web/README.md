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

## 项目结构

```
@intentorch/web/
├── public/                 # 静态资源
├── src/
│   ├── components/         # React组件
│   │   ├── auth/          # 认证组件
│   │   ├── common/        # 通用组件
│   │   ├── layout/        # 布局组件
│   │   ├── orchestration/ # 编排组件
│   │   └── ui/            # UI基础组件
│   ├── contexts/          # React Contexts
│   ├── daemon/            # 守护进程服务端
│   ├── hooks/             # 自定义Hooks
│   ├── pages/             # 页面组件
│   ├── services/          # API服务
│   ├── test/              # 测试配置
│   ├── types/             # TypeScript类型定义
│   ├── utils/             # 工具函数
│   ├── __tests__/         # 测试文件
│   ├── App.tsx            # 主应用组件
│   ├── App.css            # 应用样式
│   ├── main.tsx           # 入口文件
│   └── index.css          # 全局样式
├── docs/                  # 文档
├── tailwind.config.js     # Tailwind配置
├── postcss.config.js      # PostCSS配置
├── tsconfig.json          # TypeScript配置
├── tsconfig.app.json      # 应用TypeScript配置
├── tsconfig.node.json     # Node TypeScript配置
├── vite.config.ts         # Vite配置
├── vitest.config.ts       # 测试配置
├── eslint.config.js       # ESLint配置
├── package.json           # 依赖管理
└── README.md              # 项目说明
```

## 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

访问 http://localhost:5173

### 3. 构建生产版本

```bash
npm run build
```

### 4. 预览生产版本

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

## 设计特点

### 响应式设计
- 支持桌面、平板、手机等多种设备
- 自适应布局，提供最佳用户体验

### 暗黑模式
- 支持系统主题跟随
- 手动切换亮色/暗色主题

### 实时更新
- 进程状态实时刷新
- 系统统计定时更新
- WebSocket支持实时日志

### 用户体验
- 直观的导航和操作流程
- 丰富的视觉反馈
- 错误处理和加载状态
- 快捷键支持

## 开发指南

### 添加新页面
1. 在 `src/pages/` 目录下创建页面组件
2. 在 `src/App.tsx` 中添加路由配置
3. 在 `src/components/layout/Layout.tsx` 中添加导航菜单项

### 添加新组件
1. 在 `src/components/` 相应目录下创建组件
2. 使用TypeScript定义Props类型
3. 使用Tailwind CSS进行样式设计

### API集成
1. 在 `src/services/api.ts` 中添加API方法
2. 在 `src/types/index.ts` 中添加类型定义
3. 使用 `useQuery` 或 `useMutation` 进行数据获取

## 部署

### 构建静态文件
```bash
npm run build
```

构建结果位于 `dist/` 目录，可以部署到任何静态文件服务器。

### Docker部署
```dockerfile
FROM node:18-alpine as builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

## 许可证

MIT License

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

### 推广与运营功能建议
作为一个社区驱动的系统，我们建议添加以下功能来促进推广和运营：

#### 1. 用户反馈系统
- 内置反馈表单，方便用户提交建议和Bug报告
- 用户投票系统，让社区决定新功能优先级
- 使用案例分享墙，展示用户成功案例

#### 2. 社区贡献激励
- 贡献者排行榜，展示活跃贡献者
- 贡献者徽章系统，激励社区参与
- 月度最佳贡献者评选

#### 3. 内容营销
- 博客系统，分享技术文章和最佳实践
- 教程和文档中心，降低学习门槛
- 视频教程和直播分享

#### 4. 用户增长功能
- 邀请系统，鼓励用户邀请他人使用
- 社交媒体分享功能
- 用户推荐奖励机制

#### 5. 数据分析与洞察
- 用户行为分析，了解功能使用情况
- 系统使用统计，为优化提供数据支持
- 社区活跃度监控

### 加入我们
如果你对MCP、智能编排、AI Agent等领域感兴趣，欢迎加入我们的社区！
1. 关注微信公众号获取最新动态
2. 在GitHub上Star项目支持我们
3. 参与社区讨论和贡献

让我们一起打造更好的智能编排系统！
