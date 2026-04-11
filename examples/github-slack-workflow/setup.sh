#!/bin/bash

# GitHub PR to Slack Workflow Setup Script
# This script helps set up the environment for the GitHub PR to Slack workflow

set -e

echo "🚀 Setting up GitHub PR to Slack workflow..."
echo "=============================================="

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js v18 or higher."
    echo "   Download from: https://nodejs.org/"
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2)
MAJOR_VERSION=$(echo $NODE_VERSION | cut -d'.' -f1)

if [ $MAJOR_VERSION -lt 18 ]; then
    echo "⚠️  Warning: Node.js version $NODE_VERSION detected. Version 18 or higher is recommended."
    echo "   Some features may not work correctly with older versions."
fi

echo "✅ Node.js $NODE_VERSION detected"

# Check if npm is installed
if ! command -v npm &> /dev/null; then
    echo "❌ npm is not installed. Please install npm."
    exit 1
fi

echo "✅ npm detected"

# Check if the script is running in the correct directory
if [ ! -f "github-pr-slack.js" ]; then
    echo "⚠️  Warning: github-pr-slack.js not found in current directory."
    echo "   Please run this script from the github-slack-workflow directory."
    read -p "Continue anyway? (y/n): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
fi

echo ""
echo "📦 Installing dependencies..."
echo "-----------------------------"

# Install required npm packages globally for MCP servers
echo "Installing MCP servers globally..."
npm install -g @modelcontextprotocol/server-github @modelcontextprotocol/server-slack

echo ""
echo "🔧 Environment Setup"
echo "-------------------"

# Check if .env file exists
if [ -f ".env" ]; then
    echo "✅ .env file already exists"
    echo "   Current configuration:"
    echo "   ----------------------"
    grep -v "^#" .env | grep -v "^$" || echo "   (No configuration found)"
else
    echo "📝 Creating .env file from template..."
    if [ -f "env_example" ]; then
        cp env_example .env
        echo "✅ Created .env file from env_example"
        echo ""
        echo "⚠️  IMPORTANT: You need to edit the .env file with your actual credentials:"
        echo "   1. AI_API_KEY - Get from your AI provider (DeepSeek, OpenAI, etc.)"
        echo "   2. GITHUB_TOKEN - Create at https://github.com/settings/tokens"
        echo "   3. SLACK_TOKEN - Create at https://api.slack.com/apps"
        echo "   4. SLACK_TEAM_ID - Your Slack team ID"
        echo "   5. SLACK_CHANNEL - Target Slack channel name"
        echo "   6. REPO_OWNER, REPO_NAME, PR_NUMBER - GitHub repository details"
    else
        echo "❌ env_example file not found. Creating basic .env file..."
        cat > .env << EOF
# AI Configuration
AI_PROVIDER=deepseek
AI_API_KEY=your_ai_api_key_here
AI_MODEL=deepseek-chat

# GitHub Configuration
# Get Token: https://github.com/settings/tokens
GITHUB_TOKEN=your_github_token_here
REPO_OWNER=facebook
REPO_NAME=react
PR_NUMBER=1

# Slack Configuration
# Create App and get Token: https://api.slack.com/apps
SLACK_TOKEN=your_slack_token_here
SLACK_TEAM_ID=your_slack_team_id_here
SLACK_CHANNEL=general
EOF
        echo "✅ Created basic .env file"
        echo ""
        echo "⚠️  IMPORTANT: You need to edit the .env file with your actual credentials"
    fi
fi

echo ""
echo "📋 Quick Start Guide"
echo "-------------------"
echo "1. Edit the .env file with your credentials:"
echo "   nano .env  # or use your favorite editor"
echo ""
echo "2. Run the workflow:"
echo "   node github-pr-slack.js"
echo ""
echo "3. For more details, see README.md"
echo ""
echo "🔍 Testing the setup..."
echo "----------------------"

# Test if we can run node
if node -e "console.log('✅ Node.js is working correctly')"; then
    echo "✅ Node.js test passed"
else
    echo "❌ Node.js test failed"
    exit 1
fi

echo ""
echo "🎉 Setup completed successfully!"
echo "================================"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your actual credentials"
echo "2. Run: node github-pr-slack.js"
echo "3. Check README.md for detailed instructions"
echo ""
echo "Need help?"
echo "- Check the README.md file"
echo "- Review the .env.example file for configuration examples"
echo "- Make sure your tokens have the correct permissions"