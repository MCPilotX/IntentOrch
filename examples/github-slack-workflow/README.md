# GitHub PR to Slack Workflow with IntentOrch

This example demonstrates how to use IntentOrch's intent orchestration feature to create a natural language-driven workflow that fetches GitHub pull request details and sends a summary to Slack.

## Overview

The workflow automatically:
1. Connects to GitHub using MCP (Model Context Protocol) server
2. Fetches details of a specific pull request
3. Uses AI to generate a high-quality summary of the changes
4. Sends the summary to a Slack channel using MCP Slack server
5. Provides detailed execution tracking and statistics

## Prerequisites

- Node.js v18 or higher
- npm (Node Package Manager)
- GitHub Personal Access Token
- Slack Bot Token
- AI API Key (DeepSeek, OpenAI, etc.)

## Quick Start

### 1. Clone the repository (if not already done)
```bash
git clone <repository-url>
cd examples/github-slack-workflow
```

### 2. Run the setup script
```bash
./setup.sh
```

The setup script will:
- Check Node.js and npm installation
- Install required MCP servers globally
- Create or update the `.env` file
- Provide guidance for configuration

### 3. Configure your credentials
Edit the `.env` file with your actual credentials:

```bash
nano .env  # or use your preferred editor
```

You need to set the following values:

#### AI Configuration
- `AI_PROVIDER`: AI service provider (default: `deepseek`)
- `AI_API_KEY`: Your AI API key
- `AI_MODEL`: AI model name (default: `deepseek-chat`)

#### GitHub Configuration
- `GITHUB_TOKEN`: GitHub Personal Access Token
  - Create at: https://github.com/settings/tokens
  - Required scopes: `repo` (full control of private repositories)
- `REPO_OWNER`: Repository owner (default: `facebook`)
- `REPO_NAME`: Repository name (default: `react`)
- `PR_NUMBER`: Pull request number to fetch (default: `1`)

#### Slack Configuration
- `SLACK_TOKEN`: Slack Bot Token
  - Create at: https://api.slack.com/apps
  - Required scopes: `channels:read`, `chat:write`, `groups:read`, `im:read`, `mpim:read`
- `SLACK_TEAM_ID`: Your Slack team ID
- `SLACK_CHANNEL`: Target Slack channel name (without `#`)

### 4. Run the workflow
```bash
node github-pr-slack.js
```

## How It Works

### Intent Orchestration
The workflow uses IntentOrch's intent orchestration engine to:
1. **Parse natural language instructions**: The workflow is described in plain English
2. **Automatically plan execution steps**: IntentOrch determines the sequence of operations
3. **Select appropriate tools**: Based on available MCP servers and their capabilities
4. **Execute with tracking**: Each step is monitored and results are collected

### Workflow Description
The core workflow is described in natural language:

```javascript
const workflowQuery = `
   Use GitHub API to get pull request #${prNumber} from repository ${repoOwner}/${repoName}.
   Get the PR details including title, description, author, and file changes.
   Then use @intentorch to generate a high-quality summary report for these changes.
   Finally, send the summary report to Slack channel #${slackChannel}.
`;
```

### Execution Flow
1. **AI Configuration**: Sets up the AI service for intent parsing
2. **MCP Server Connection**: Connects to GitHub and Slack servers
3. **Intent Engine Initialization**: Prepares the intent orchestration engine
4. **Workflow Execution**: Parses and executes the natural language workflow
5. **Result Reporting**: Provides detailed statistics and results

## Features

### Real-time Tracking
- Step-by-step execution monitoring
- Success/failure status for each operation
- Duration tracking for performance analysis
- Detailed error reporting

### Statistics & Analytics
- Total steps executed
- Successful vs failed steps
- Total execution duration
- Average step duration
- LLM call counts

### Tool Integration
- **GitHub MCP Server**: Access to GitHub API for repository operations
- **Slack MCP Server**: Slack integration for messaging
- **IntentOrch Engine**: Natural language workflow execution

## Environment Variables Reference

### Required Variables
| Variable | Description | Example |
|----------|-------------|---------|
| `GITHUB_TOKEN` | GitHub Personal Access Token | `ghp_xxxxxxxxxxxxxxxxxxxx` |
| `SLACK_TOKEN` | Slack Bot Token | `xoxb-xxxxxxxxxxxx-xxxxxxxxxxxx` |
| `SLACK_TEAM_ID` | Slack Team ID | `T0XXXXXXXX` |
| `SLACK_CHANNEL` | Slack channel name | `general` |
| `REPO_OWNER` | GitHub repository owner | `facebook` |
| `REPO_NAME` | GitHub repository name | `react` |
| `PR_NUMBER` | Pull request number | `1` |
| `AI_API_KEY` | AI service API key | `sk-xxxxxxxxxxxxxxxxxxxxxxxx` |

### Optional Variables
| Variable | Description | Default |
|----------|-------------|---------|
| `AI_PROVIDER` | AI service provider | `deepseek` |
| `AI_MODEL` | AI model name | `deepseek-chat` |

## Troubleshooting

### Common Issues

#### 1. "Missing required environment variables"
**Solution**: Ensure all required variables are set in the `.env` file. Use `env_example` as a template.

#### 2. "No tools available, intent orchestration will not work"
**Solution**: 
- Check if MCP servers are installed: `npm list -g @modelcontextprotocol/server-*`
- Verify server connections in the code
- Ensure tokens have correct permissions

#### 3. "GitHub API rate limit exceeded"
**Solution**: 
- Wait for rate limit reset
- Use authenticated requests with higher limits
- Consider using a GitHub Enterprise account

#### 4. "Slack API authentication failed"
**Solution**:
- Verify Slack token is valid and not expired
- Check required OAuth scopes
- Ensure bot is added to the target channel

### Debug Mode
To enable more detailed logging, you can modify the logger configuration in `github-pr-slack.js`:

```javascript
const sdk = createSDK({
  logger: {
    info: (msg) => console.log(`[INFO] ${msg}`),
    error: (msg) => console.log(`[ERROR] ${msg}`),
    debug: (msg) => console.log(`[DEBUG] ${msg}`),  // Enable debug logging
  }
});
```

## Customization

### Modifying the Workflow
You can customize the natural language workflow by editing the `workflowQuery` variable in `github-pr-slack.js`:

```javascript
const workflowQuery = `
   Fetch pull request #${prNumber} from ${repoOwner}/${repoName}.
   Analyze the changes and create a technical summary.
   Post the summary to ${slackChannel} Slack channel.
`;
```

### Adding More MCP Servers
To add additional capabilities, connect more MCP servers:

```javascript
await sdk.connectMCPServer({
  name: 'jira',
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-jira'],
    env: { JIRA_API_TOKEN: process.env.JIRA_TOKEN }
  }
});
```

## Security Notes

### Token Security
- Never commit `.env` files to version control
- Use `.gitignore` to exclude sensitive files
- Rotate tokens regularly
- Use least-privilege access tokens

### Environment Variables
- Store sensitive data in `.env` files only
- Use different tokens for development and production
- Consider using secret management services for production

## Related Resources

- [IntentOrch Documentation](https://github.com/MCPilotX/IntentOrch)
- [MCP (Model Context Protocol)](https://spec.modelcontextprotocol.io/)
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [Slack MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/slack)
- [GitHub API Documentation](https://docs.github.com/en/rest)
- [Slack API Documentation](https://api.slack.com/)

## License

This example is part of the IntentOrch project. See the main repository for license information.

## Support

For issues and questions:
1. Check the troubleshooting section above
2. Review the IntentOrch documentation
3. Open an issue in the GitHub repository