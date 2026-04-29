# IntentOrch CLI

CLI tool for IntentOrch - MCP Ecosystem Orchestration Platform

## 安装

```bash
npm install -g @intentorch/cli
```

## 快速开始

```bash
# 查看帮助
intorch --help

# 启动守护进程
intorch start

# 查看服务器列表
intorch list

# 运行编排
intorch run "your query"
```

## 命令

- `intorch start` - 启动 IntentOrch 守护进程
- `intorch stop` - 停止 IntentOrch 守护进程
- `intorch list` - 列出所有 MCP 服务器
- `intorch run <query>` - 运行智能编排
- `intorch ps` - 查看运行中的进程
- `intorch logs` - 查看日志
- `intorch config` - 管理配置
- `intorch secret` - 管理密钥
- `intorch pull <server>` - 拉取 MCP 服务器
- `intorch workflow` - 管理工作流
- `intorch dashboard` - 启动 Web 控制台
- `intorch daemon` - 守护进程管理

## 许可证

Apache-2.0
