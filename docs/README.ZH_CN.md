# MCPilot SDK Core

[![npm version](https://img.shields.io/npm/v/@mcpilotx/sdk-core.svg)](https://www.npmjs.com/package/@mcpilotx/sdk-core)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](https://opensource.org/licenses/Apache-2.0)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0+-3178c6.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933.svg)](https://nodejs.org/)

**构建支持MCP（模型上下文协议）的AI驱动应用程序的终极SDK。**

MCPilot SDK Core 提供了集成AI能力、MCP工具管理和智能运行时检测所需的一切 - 配置最少，灵活性最大。

## 🤖 核心理念
**告诉AI你想要什么，剩下的交给它编排** - MCPilot SDK Core让您专注于表达需求，我们处理复杂的AI编排、工具管理和运行时检测。

---

## 🚀 快速开始

### 安装

```bash
npm install @mcpilotx/sdk-core
# 或
yarn add @mcpilotx/sdk-core
# 或
pnpm add @mcpilotx/sdk-core
```

### 30秒基础使用

```typescript
import { MCPilotSDK, createSDK } from '@mcpilotx/sdk-core';

// 选项1：使用单例
import { mcpilot } from '@mcpilotx/sdk-core';

// 选项2：创建自己的实例
const sdk = new MCPilotSDK();
// 或
const sdk = createSDK();

// 立即开始使用AI
const response = await sdk.ask("今天天气怎么样？");
console.log(response); // 基于上下文的AI响应
```

## ✨ 核心功能
**告诉AI你想要什么，剩下的交给它编排** - 以下是MCPilot SDK Core为您提供的核心能力：

### 🤖 **AI集成变得简单**
```typescript
// 配置AI提供商（当前主要支持DeepSeek）
await sdk.configureAI({
  provider: 'deepseek', // 主要支持DeepSeek，实验性支持OpenAI、Ollama
  apiKey: process.env.DEEPSEEK_API_KEY,
  model: 'deepseek-chat'
});

// 自然地提问
const answer = await sdk.ask("用简单的术语解释量子计算");
```

### 🔧 **MCP工具管理**
```typescript
// 连接到MCP服务器
await sdk.connectMCPServer({
  transport: {
    type: 'stdio',
    command: 'npx',
    args: ['@modelcontextprotocol/server-filesystem']
  }
});

// 自动使用工具
const fileContent = await sdk.executeTool('read_file', { path: 'README.md' });
```

### 🧠 **智能运行时检测**
```typescript
import { EnhancedRuntimeDetector } from '@mcpilotx/sdk-core';

// 自动检测项目类型和设置
const detection = await EnhancedRuntimeDetector.detect('./path/to/project');
console.log(detection.runtime); // 'node', 'python', 'docker' 等
console.log(detection.confidence); // 检测置信度
console.log(detection.source); // 检测来源
```

### 📡 **高级传输层**
```typescript
import { TransportFactory, StdioLogFilterConfig } from '@mcpilotx/sdk-core';

// 创建具有智能日志过滤的传输
const logFilter: StdioLogFilterConfig = {
  ignorePatterns: ['^DEBUG:', '^TRACE:'], // 隐藏调试日志
  keepPatterns: ['^ERROR:', '^FATAL:'],   // 始终显示错误
  timeout: 2000                           // 缓冲区超时
};

const transport = TransportFactory.create({
  type: 'stdio',
  command: 'my-server',
  logFilter
});
```

## 📚 综合示例

### 示例1：完整的AI应用程序
```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK({
  ai: {
    provider: 'openai',
    apiKey: process.env.OPENAI_API_KEY
  },
  mcp: {
    servers: [
      {
        name: 'filesystem',
        transport: {
          type: 'stdio',
          command: 'npx',
          args: ['@modelcontextprotocol/server-filesystem']
        }
      }
    ]
  }
});

// 让AI读取并分析文件
const analysis = await sdk.ask(
  "读取package.json并建议改进",
  { useTools: true }
);
```

### 示例2：自定义工具集成
```typescript
import { MCPilotSDK, ToolRegistry } from '@mcpilotx/sdk-core';

// 注册自定义工具
const registry = new ToolRegistry();
registry.registerTool({
  name: 'calculate',
  description: '执行数学计算',
  inputSchema: {
    type: 'object',
    properties: {
      expression: { type: 'string' }
    },
    required: ['expression']
  },
  execute: async ({ expression }) => {
    return { result: eval(expression) };
  }
});

const sdk = new MCPilotSDK({ toolRegistry: registry });
```

### 示例3：服务器发现与自动连接
```typescript
import { 
  MCPilotSDK, 
  discoverLocalMCPServers,
  loadMCPServersFromEnv 
} from '@mcpilotx/sdk-core';

// 自动发现本地MCP服务器
const servers = await discoverLocalMCPServers();
// 或从环境变量加载
const envServers = loadMCPServersFromEnv();

const sdk = new MCPilotSDK({
  mcp: { servers: [...servers, ...envServers] }
});

// 自动连接到所有发现的服务器
await sdk.connectAllMCPServers();
```

## 🛠️ 高级配置

### 传输配置
```typescript
import { TransportConfig, StdioLogFilterConfig } from '@mcpilotx/sdk-core';

// 具有高级过滤功能的Stdio传输
const stdioConfig: TransportConfig = {
  type: 'stdio',
  command: 'python',
  args: ['my_script.py'],
  logFilter: {
    ignorePatterns: [
      '^DEBUG:.*',
      '^\\[\\d{4}-\\d{2}-\\d{2}.*INFO.*'
    ],
    keepPatterns: [
      '^ERROR:.*',
      '.*Exception.*',
      '.*failed.*'
    ],
    timeout: 1000,
    bufferSize: 4096,
    verbose: process.env.NODE_ENV === 'development'
  }
};

// HTTP传输
const httpConfig: TransportConfig = {
  type: 'http',
  url: 'http://localhost:8080/mcp',
  headers: {
    'Authorization': `Bearer ${process.env.MCP_TOKEN}`
  }
};

// SSE（服务器发送事件）传输
const sseConfig: TransportConfig = {
  type: 'sse',
  url: 'http://localhost:8080/events'
};
```

### AI提供商配置
```typescript
import { AIConfig } from '@mcpilotx/sdk-core';

const aiConfig: AIConfig = {
  provider: 'deepseek', // 主要支持DeepSeek，实验性支持OpenAI、Ollama
  model: 'deepseek-chat',
  apiKey: process.env.DEEPSEEK_API_KEY,
  apiEndpoint: 'https://api.deepseek.com/v1', // DeepSeek API端点
  timeout: 30000, // 请求超时时间（毫秒）
  maxTokens: 2000,
  temperature: 0.7,
  // 实验性功能（未来版本支持）
  // ollamaHost: 'http://localhost:11434', // Ollama主机地址（实验性）
  // localModelPath: './models', // 本地模型路径（计划中）
  // 嵌入模型配置（计划中）
  // embeddingProvider: 'deepseek',
  // embeddingModel: 'text-embedding'
};
```

## 🔌 MCP协议支持

### 内置MCP常量
```typescript
import { MCP_METHODS, MCP_ERROR_CODES } from '@mcpilotx/sdk-core';

console.log(MCP_METHODS.TOOLS_LIST);      // "tools/list"
console.log(MCP_METHODS.TOOLS_CALL);      // "tools/call"
console.log(MCP_ERROR_CODES.PARSE_ERROR); // -32700
```

### 工具类别和模式
```typescript
import { TOOL_CATEGORIES, TOOL_PATTERNS } from '@mcpilotx/sdk-core';

// 预定义类别
console.log(TOOL_CATEGORIES.FILESYSTEM); // "filesystem"
console.log(TOOL_CATEGORIES.AI);         // "ai"

// 预定义工具模式
console.log(TOOL_PATTERNS.READ_FILE.name);    // "read_file"
console.log(TOOL_PATTERNS.WRITE_FILE.name);   // "write_file"
```

## 🧪 测试与开发

### 运行测试
```bash
npm test
# 运行特定测试套件
npm test -- tests/transport-improvements.test.ts
```

### 从源代码构建
```bash
npm run build
```

### TypeScript支持
包含完整的TypeScript定义。在您的IDE中获得自动完成和类型检查。

## 📖 API参考

### 核心类
- **`MCPilotSDK`** - 主SDK类
- **`SimpleAI`** - AI服务包装器
- **`MCPClient`** - MCP协议客户端
- **`ToolRegistry`** - 工具管理
- **`ConfigManager`** - 配置管理

### 传输层
- **`BaseTransport`** - 基础传输类
- **`StdioTransport`** - STDIO传输
- **`HTTPTransport`** - HTTP传输  
- **`SSETransport`** - SSE传输
- **`TransportFactory`** - 传输创建

### 实用函数
- **`createSDK()`** - 快速SDK创建
- **`createMCPConfig()`** - MCP配置助手
- **`discoverLocalMCPServers()`** - 服务器发现
- **`loadMCPServersFromEnv()`** - 环境加载器

## 🎯 使用案例

### 1. **AI驱动的开发工具** 🛠️
构建VS Code扩展、CLI工具或IDE，使其能够理解代码上下文并自主执行复杂的开发任务。

### 2. **自动化工作流**
创建可以读取文件、调用API和做出决策的智能自动化。

### 3. **聊天应用程序**
构建具有访问工具和外部数据源功能的聊天机器人。

### 4. **DevOps自动化**
通过AI驱动的决策自动化基础设施管理。

### 5. **教育工具**
创建具有AI导师的交互式学习环境。

## 🔧 高级功能

### 智能日志过滤
```typescript
// 过滤噪音，保留重要内容
const transport = TransportFactory.create({
  type: 'stdio',
  command: 'noisy-server',
  logFilter: {
    // 隐藏带时间戳的INFO日志
    ignorePatterns: ['^\\[\\d{4}-\\d{2}-\\d{2}.*INFO.*'],
    // 始终显示错误和警告
    keepPatterns: ['^ERROR:', '^WARN:', '^FATAL:'],
    // 为不完整的JSON缓冲2秒
    timeout: 2000
  }
});
```

### 多行JSON支持
自动处理输出流中跨多行的JSON。

### 错误恢复
内置网络问题的重试逻辑和错误处理。

### 性能监控
跟踪响应时间并优化性能。

## 🚀 AI驱动的开发工具 - 深度探索

MCPilot SDK Core专门设计用于构建下一代AI驱动的开发工具。以下是展示如何构建智能开发助手的综合示例：

### 示例1：智能代码审查助手
```typescript
import { MCPilotSDK, ToolRegistry } from '@mcpilotx/sdk-core';

class CodeReviewAssistant {
  private sdk: MCPilotSDK;
  
  constructor() {
    const registry = new ToolRegistry();
    
    // 注册开发特定工具
    registry.registerTool({
      name: 'analyze_code',
      description: '分析代码以查找问题和改进',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          language: { type: 'string' }
        },
        required: ['code']
      },
      execute: async ({ code, language }) => {
        // 使用AI分析代码
        const analysis = await this.sdk.ask(
          `分析此${language}代码以查找问题：\n${code}`,
          { useTools: false }
        );
        return { analysis };
      }
    });
    
    registry.registerTool({
      name: 'suggest_refactoring',
      description: '建议代码重构改进',
      inputSchema: {
        type: 'object',
        properties: {
          code: { type: 'string' },
          issue: { type: 'string' }
        },
        required: ['code', 'issue']
      },
      execute: async ({ code, issue }) => {
        const suggestion = await this.sdk.ask(
          `为此代码建议重构以修复：${issue}\n代码：\n${code}`,
          { useTools: false }
        );
        return { suggestion };
      }
    });
    
    this.sdk = new MCPilotSDK({
      ai: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY,
        model: 'gpt-4'
      },
      toolRegistry: registry
    });
  }
  
  async reviewCode(filePath: string, language: string): Promise<string> {
    // 读取文件内容（使用MCP文件系统服务器）
    const fileContent = await this.sdk.executeTool('read_file', { 
      path: filePath,
      encoding: 'utf-8'
    });
    
    // 分析代码
    const analysis = await this.sdk.executeTool('analyze_code', {
      code: fileContent.content,
      language
    });
    
    // 生成审查报告
    const report = await this.sdk.ask(
      `基于此分析生成全面的代码审查报告：${analysis.analysis}`,
      { useTools: true }
    );
    
    return report;
  }
}

// 使用
const assistant = new CodeReviewAssistant();
const review = await assistant.reviewCode('src/app.ts', 'typescript');
console.log('代码审查：', review);
```

### 示例2：智能CLI开发工具
```typescript
import { MCPilotSDK, createSDK } from '@mcpilotx/sdk-core';
import { Command } from 'commander';

class DevCLI {
  private sdk: MCPilotSDK;
  private program: Command;
  
  constructor() {
    this.sdk = createSDK({
      ai: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY
      },
      mcp: {
        servers: [
          {
            name: 'filesystem',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@modelcontextprotocol/server-filesystem']
            }
          },
          {
            name: 'git',
            transport: {
              type: 'stdio',
              command: 'npx',
              args: ['@modelcontextprotocol/server-git']
            }
          }
        ]
      }
    });
    
    this.program = new Command();
    this.setupCommands();
  }
  
  private setupCommands() {
    this.program
      .command('explain <file>')
      .description('解释文件的功能')
      .action(async (file) => {
        const explanation = await this.sdk.ask(
          `解释此文件的功能：${file}`,
          { useTools: true }
        );
        console.log(explanation);
      });
    
    this.program
      .command('debug <file>')
      .description('帮助调试文件中的问题')
      .action(async (file) => {
        const debugHelp = await this.sdk.ask(
          `帮助我调试此文件中的问题：${file}`,
          { useTools: true }
        );
        console.log(debugHelp);
      });
    
    this.program
      .command('generate <component>')
      .description('为组件生成代码')
      .option('-t, --type <type>', '组件类型', 'react')
      .action(async (component, options) => {
        const code = await this.sdk.ask(
          `为${component}生成${options.type}代码`,
          { useTools: true }
        );
        console.log(code);
      });
  }
  
  async run() {
    await this.sdk.connectAllMCPServers();
    this.program.parse(process.argv);
  }
}

// 使用：node dev-cli.js explain src/components/Button.tsx
// 使用：node dev-cli.js generate user-profile --type=vue
```

### 示例3：具有AI功能的VS Code扩展
```typescript
import * as vscode from 'vscode';
import { MCPilotSDK } from '@mcpilotx/sdk-core';

export function activate(context: vscode.ExtensionContext) {
  // 初始化SDK
  const sdk = new MCPilotSDK({
    ai: {
      provider: 'openai',
      apiKey: vscode.workspace.getConfiguration().get('mcpilot.openaiKey')
    }
  });
  
  // 注册"解释代码"命令
  const explainCommand = vscode.commands.registerCommand(
    'mcpilot.explainCode',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const selection = editor.selection;
      const text = editor.document.getText(selection);
      
      vscode.window.withProgress({
        location: vscode.ProgressLocation.Notification,
        title: '正在分析代码...',
        cancellable: false
      }, async (progress) => {
        const explanation = await sdk.ask(
          `解释此代码：\n${text}`,
          { useTools: true }
        );
        
        // 在新编辑器中显示解释
        const doc = await vscode.workspace.openTextDocument({
          content: `# 代码解释\n\n${explanation}`,
          language: 'markdown'
        });
        await vscode.window.showTextDocument(doc);
      });
    }
  );
  
  // 注册"重构代码"命令
  const refactorCommand = vscode.commands.registerCommand(
    'mcpilot.refactorCode',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const document = editor.document;
      const text = document.getText();
      
      const refactoring = await sdk.ask(
        `为此代码建议重构改进：\n${text}`,
        { useTools: true }
      );
      
      // 应用重构建议
      const edit = new vscode.WorkspaceEdit();
      edit.replace(
        document.uri,
        new vscode.Range(0, 0, document.lineCount, 0),
        refactoring
      );
      await vscode.workspace.applyEdit(edit);
    }
  );
  
  // 注册"生成测试"命令
  const testCommand = vscode.commands.registerCommand(
    'mcpilot.generateTests',
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) return;
      
      const text = editor.document.getText();
      const language = editor.document.languageId;
      
      const tests = await sdk.ask(
        `为此${language}代码生成单元测试：\n${text}`,
        { useTools: true }
      );
      
      // 创建测试文件
      const testFileName = editor.document.fileName.replace(
        /\.(\w+)$/, 
        `.test.$1`
      );
      const uri = vscode.Uri.file(testFileName);
      
      const edit = new vscode.WorkspaceEdit();
      edit.createFile(uri, { overwrite: true });
      edit.insert(uri, new vscode.Position(0, 0), tests);
      
      await vscode.workspace.applyEdit(edit);
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc);
    }
  );
  
  context.subscriptions.push(explainCommand, refactorCommand, testCommand);
}

export function deactivate() {}
```

### 示例4：自动化文档生成器
```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';
import fs from 'fs/promises';
import path from 'path';

class DocumentationGenerator {
  private sdk: MCPilotSDK;
  
  constructor() {
    this.sdk = new MCPilotSDK({
      ai: {
        provider: 'openai',
        apiKey: process.env.OPENAI_API_KEY
      }
    });
  }
  
  async generateAPIDocs(sourceDir: string, outputDir: string): Promise<void> {
    const files = await this.findSourceFiles(sourceDir);
    
    for (const file of files) {
      const content = await fs.readFile(file, 'utf-8');
      const relativePath = path.relative(sourceDir, file);
      
      // 使用AI生成文档
      const docs = await this.sdk.ask(
        `为此代码生成全面的API文档：\n${content}`,
        { useTools: false }
      );
      
      // 保存文档
      const outputFile = path.join(
        outputDir, 
        relativePath.replace(/\.\w+$/, '.md')
      );
      await fs.mkdir(path.dirname(outputFile), { recursive: true });
      await fs.writeFile(outputFile, docs);
      
      console.log(`已为以下文件生成文档：${relativePath}`);
    }
  }
  
  async generateReadme(projectDir: string): Promise<void> {
    const packageJson = JSON.parse(
      await fs.readFile(path.join(projectDir, 'package.json'), 'utf-8')
    );
    
    const readmeContent = await this.sdk.ask(
      `为具有以下信息的项目生成全面的README.md：\n` +
      `名称：${packageJson.name}\n` +
      `描述：${packageJson.description || '无描述'}\n` +
      `版本：${packageJson.version}\n` +
      `包括安装、使用、API参考和示例。`,
      { useTools: true }
    );
    
    await fs.writeFile(
      path.join(projectDir, 'README.md'),
      readmeContent
    );
  }
  
  private async findSourceFiles(dir: string): Promise<string[]> {
    const files: string[] = [];
    const entries = await fs.readdir(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== '.git') {
          files.push(...await this.findSourceFiles(fullPath));
        }
      } else if (this.isSourceFile(entry.name)) {
        files.push(fullPath);
      }
    }
    
    return files;
  }
  
  private isSourceFile(filename: string): boolean {
    return /\.(ts|js|tsx|jsx|py|java|cpp|go|rs)$/.test(filename);
  }
}

// 使用
const generator = new DocumentationGenerator();
await generator.generateAPIDocs('./src', './docs/api');
await generator.generateReadme('.');
```

### 开发工具的关键优势：
1. **上下文感知的协助** - AI理解您的代码库
2. **工具集成** - 直接访问文件系统、git、API
3. **智能过滤** - 我们改进的传输层从工具输出中过滤噪音
4. **多行JSON支持** - 无缝处理复杂的工具响应
5. **错误恢复能力** - 内置重试和错误处理

## 🤝 贡献

我们欢迎贡献！请参阅 [CONTRIBUTING.md](CONTRIBUTING.md) 了解详情。

## 📄 许可证

Apache 2.0 - 查看 [LICENSE](LICENSE) 了解详情。

## 🆘 支持

- **文档**：查看 [docs/](docs/) 获取详细指南
- **问题**：[GitHub Issues](https://github.com/MCPilotX/sdk-core/issues)
- **示例**：查看 [examples/](examples/) 目录

## 🚀 准备构建？

立即开始使用MCPilot SDK Core构建智能应用程序！

```typescript
import { MCPilotSDK } from '@mcpilotx/sdk-core';

const sdk = new MCPilotSDK();
const future = await sdk.ask("我能用这个SDK构建什么令人惊叹的东西？");
console.log(future);
```

---

**由MCPilot团队用 ❤️ 构建**
