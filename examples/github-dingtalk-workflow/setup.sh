#!/bin/bash

echo "🔧 设置 GitHub PR 分析 + 钉钉通知工作流"
echo "=========================================="

# 检查 Node.js 版本
echo "1. 检查 Node.js 版本..."
node_version=$(node --version)
echo "   Node.js 版本: $node_version"

# 检查 npm 版本
echo "2. 检查 npm 版本..."
npm_version=$(npm --version)
echo "   npm 版本: $npm_version"

# 安装 IntentOrch
echo "3. 安装 IntentOrch..."
npm install @mcpilotx/intentorch

# 配置.env
echo "4. 配置.env"
mv env_example .env
echo "	.env初始化完成，请编辑.env文件补充必要的环境变量"

# 显示使用说明
echo ""
echo "🎯 使用说明:"
echo "==========="
echo ""
echo "1. 编辑 .env 文件，填写以下信息:"
echo "   - GITHUB_TOKEN: GitHub 个人访问令牌"
echo "   - DINGTALK_APP_KEY: 钉钉应用 AppKey"
echo "   - DINGTALK_APP_SECRET: 钉钉应用 AppSecret"
echo "   - DINGTALK_ROBOT_CODE: 钉钉机器人 Code"
echo "   - DINGTALK_CHAT_ID: 钉钉群聊 ID"
echo "   - AI_API_KEY: AI 服务 API 密钥"
echo ""
echo "2. 安装必要的 MCP 服务器:"
echo "   npm install -g @modelcontextprotocol/server-github dingtalk-mcp"
echo ""
echo "3. 构建项目:"
echo "   npm run build"
echo ""
echo "4. 运行工作流:"
echo "   node github-pr-dingtalk.js"
echo ""
echo ""
echo "📚 详细文档请查看 README.md"
echo ""
echo "✅ 设置完成!"
