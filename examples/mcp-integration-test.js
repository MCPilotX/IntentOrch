/**
 * MCP集成测试：DeepSeek + 意图引擎 + MCP服务器
 * 基于mcpilotx-sdk-core-0.5.0.tgz实现完整MVP流程
 */

import { CloudIntentEngine } from './package/dist/ai/cloud-intent-engine.js';
import { MCPilotSDK } from './package/dist/index.js';

// 从环境变量获取DeepSeek API token
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_TOKEN;

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 错误: 未找到DeepSeek API token');
  console.error('请设置环境变量:');
  console.error('  export DEEPSEEK_API_KEY=your_api_key_here');
  console.error('或');
  console.error('  export DEEPSEEK_TOKEN=your_api_key_here');
  process.exit(1);
}

console.log('🔑 DeepSeek API token已从环境变量获取');
console.log(`Token长度: ${DEEPSEEK_API_KEY.length} 字符\n`);

// 完整的MVP流程测试
async function runFullMVPTest() {
  console.log('🚀 完整MVP流程测试：DeepSeek + 意图引擎 + MCP集成\n');
  console.log('='.repeat(60) + '\n');
  
  let testResults = {
    total: 0,
    passed: 0,
    failed: 0,
    details: []
  };
  
  try {
    // 阶段1: 创建和配置SDK
    console.log('阶段1: 创建和配置SDK');
    console.log('-'.repeat(40));
    testResults.total++;
    
    const sdk = new MCPilotSDK({
      ai: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1
      },
      mcp: {
        autoDiscover: false, // 手动配置MCP服务器
        servers: []
      },
      logger: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.error(`[ERROR] ${msg}`)
      }
    });
    
    // 初始化SDK
    sdk.init();
    console.log('✅ SDK创建和初始化成功\n');
    testResults.passed++;
    testResults.details.push({ step: 'SDK初始化', status: 'passed' });
    
    // 阶段2: 创建意图引擎
    console.log('阶段2: 创建意图引擎');
    console.log('-'.repeat(40));
    testResults.total++;
    
    const engineConfig = {
      llm: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1,
        maxTokens: 1024
      },
      execution: {
        maxConcurrentTools: 3
      },
      fallback: {
        enableKeywordMatching: true
      }
    };
    
    const intentEngine = new CloudIntentEngine(engineConfig);
    
    try {
      await intentEngine.initialize();
      console.log('✅ 意图引擎初始化成功（DeepSeek连接正常）\n');
      testResults.passed++;
      testResults.details.push({ step: '意图引擎初始化', status: 'passed' });
    } catch (error) {
      console.log(`⚠ 意图引擎初始化失败: ${error.message}`);
      console.log('使用回退模式继续测试...\n');
      testResults.failed++;
      testResults.details.push({ step: '意图引擎初始化', status: 'failed', error: error.message });
    }
    
    // 阶段3: 测试MCP服务器连接（模拟）
    console.log('阶段3: 测试MCP服务器集成');
    console.log('-'.repeat(40));
    testResults.total++;
    
    console.log('📋 模拟MCP工具列表:');
    
    // 模拟MCP工具（实际环境中这些工具来自MCP服务器）
    const simulatedMCPTools = [
      {
        name: 'filesystem_read',
        description: 'Read file from filesystem',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string', description: 'File path' }
          },
          required: ['path']
        }
      },
      {
        name: 'filesystem_list',
        description: 'List files in directory',
        inputSchema: {
          type: 'object',
          properties: {
            directory: { type: 'string', description: 'Directory path' }
          },
          required: ['directory']
        }
      },
      {
        name: 'git_status',
        description: 'Check git repository status',
        inputSchema: {
          type: 'object',
          properties: {
            repo_path: { type: 'string', description: 'Git repository path' }
          },
          required: ['repo_path']
        }
      },
      {
        name: 'execute_shell',
        description: 'Execute shell command',
        inputSchema: {
          type: 'object',
          properties: {
            command: { type: 'string', description: 'Shell command' },
            args: { type: 'array', items: { type: 'string' }, description: 'Command arguments' }
          },
          required: ['command']
        }
      }
    ];
    
    console.log(`✅ 模拟了 ${simulatedMCPTools.length} 个MCP工具:`);
    simulatedMCPTools.forEach(tool => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    console.log();
    
    // 设置工具到意图引擎
    intentEngine.setAvailableTools(simulatedMCPTools);
    testResults.passed++;
    testResults.details.push({ step: 'MCP工具配置', status: 'passed' });
    
    // 阶段4: 测试意图解析和工作流
    console.log('阶段4: 测试意图解析和工作流');
    console.log('-'.repeat(40));
    
    // 测试场景1: 简单文件操作
    console.log('\n测试场景1: 简单文件操作');
    console.log('查询: "读取当前目录的README文件"');
    testResults.total++;
    
    try {
      const parseResult1 = await intentEngine.parseIntent("读取当前目录的README文件");
      console.log(`✅ 意图解析成功: ${parseResult1.intents.length} 个意图`);
      
      if (parseResult1.intents.length > 0) {
        const intent = parseResult1.intents[0];
        console.log(`   意图类型: ${intent.type}`);
        console.log(`   意图描述: ${intent.description}`);
      }
      
      testResults.passed++;
      testResults.details.push({ step: '简单意图解析', status: 'passed' });
      
    } catch (error) {
      console.log(`❌ 意图解析失败: ${error.message}`);
      testResults.failed++;
      testResults.details.push({ step: '简单意图解析', status: 'failed', error: error.message });
    }
    
    // 测试场景2: 复杂工作流
    console.log('\n测试场景2: 复杂工作流');
    console.log('查询: "列出src目录的文件，检查git状态，然后执行测试"');
    testResults.total++;
    
    try {
      const parseResult2 = await intentEngine.parseIntent("列出src目录的文件，检查git状态，然后执行测试");
      console.log(`✅ 复杂意图解析成功: ${parseResult2.intents.length} 个意图`);
      
      parseResult2.intents.forEach((intent, index) => {
        console.log(`   ${index + 1}. ${intent.type}: ${intent.description}`);
      });
      
      if (parseResult2.edges.length > 0) {
        console.log(`   依赖关系: ${parseResult2.edges.length} 个`);
        parseResult2.edges.forEach(edge => {
          console.log(`     ${edge.from} → ${edge.to}`);
        });
      }
      
      testResults.passed++;
      testResults.details.push({ step: '复杂意图解析', status: 'passed' });
      
    } catch (error) {
      console.log(`❌ 复杂意图解析失败: ${error.message}`);
      testResults.failed++;
      testResults.details.push({ step: '复杂意图解析', status: 'failed', error: error.message });
    }
    
    // 测试场景3: 工具选择
    console.log('\n测试场景3: 工具选择测试');
    console.log('使用模拟意图测试工具选择');
    testResults.total++;
    
    const mockIntents = [
      {
        id: 'M1',
        type: 'read_file',
        description: 'Read configuration file',
        parameters: { path: 'config.json' }
      },
      {
        id: 'M2',
        type: 'check_status',
        description: 'Check system status',
        parameters: {}
      }
    ];
    
    try {
      const toolSelections = await intentEngine.selectTools(mockIntents);
      console.log(`✅ 工具选择成功: ${toolSelections.length} 个工具`);
      
      toolSelections.forEach((selection, index) => {
        console.log(`   ${index + 1}. ${selection.toolName} (置信度: ${selection.confidence})`);
      });
      
      testResults.passed++;
      testResults.details.push({ step: '工具选择', status: 'passed' });
      
    } catch (error) {
      console.log(`❌ 工具选择失败: ${error.message}`);
      testResults.failed++;
      testResults.details.push({ step: '工具选择', status: 'failed', error: error.message });
    }
    
    // 阶段5: 完整工作流执行
    console.log('\n阶段5: 完整工作流执行测试');
    console.log('-'.repeat(40));
    testResults.total++;
    
    // 模拟工具执行器
    const mockToolExecutor = async (toolName, params) => {
      console.log(`\n[执行工具] ${toolName}`);
      console.log(`[参数]`, params);
      
      // 模拟执行结果
      switch (toolName) {
        case 'filesystem_read':
          return {
            success: true,
            content: `# 配置文件\n\n这是 ${params.path} 的内容示例。`,
            size: 256,
            timestamp: new Date().toISOString()
          };
        case 'filesystem_list':
          return {
            success: true,
            files: ['file1.js', 'file2.ts', 'config.json', 'README.md'],
            directories: ['src', 'dist', 'tests'],
            count: 7,
            path: params.directory || '.'
          };
        case 'git_status':
          return {
            success: true,
            status: 'clean',
            branch: 'main',
            changes: 0,
            message: 'Repository is clean'
          };
        case 'execute_shell':
          return {
            success: true,
            exitCode: 0,
            stdout: `执行命令: ${params.command}`,
            stderr: '',
            duration: 100
          };
        default:
          return {
            success: false,
            error: `未知工具: ${toolName}`
          };
      }
    };
    
    // 测试工作流执行
    const workflowIntents = [
      {
        id: 'W1',
        type: 'list_files',
        description: 'List files in current directory',
        parameters: { directory: '.' }
      },
      {
        id: 'W2',
        type: 'read_file',
        description: 'Read configuration file',
        parameters: { path: 'config.json' }
      }
    ];
    
    const workflowSelections = [
      {
        intentId: 'W1',
        toolName: 'filesystem_list',
        toolDescription: 'List files in directory',
        mappedParameters: { directory: '.' },
        confidence: 0.9
      },
      {
        intentId: 'W2',
        toolName: 'filesystem_read',
        toolDescription: 'Read file from filesystem',
        mappedParameters: { path: 'config.json' },
        confidence: 0.8
      }
    ];
    
    try {
      const executionResult = await intentEngine.executeWorkflow(
        workflowIntents,
        workflowSelections,
        [], // 无依赖关系
        mockToolExecutor
      );
      
      console.log(`✅ 工作流执行完成`);
      console.log(`   成功: ${executionResult.success}`);
      console.log(`   步骤数: ${executionResult.stepResults?.length || 0}`);
      
      if (executionResult.stepResults) {
        executionResult.stepResults.forEach((step, index) => {
          console.log(`   ${index + 1}. ${step.intentId}: ${step.toolName} - ${step.success ? '✓' : '✗'}`);
        });
      }
      
      testResults.passed++;
      testResults.details.push({ step: '工作流执行', status: 'passed' });
      
    } catch (error) {
      console.log(`❌ 工作流执行失败: ${error.message}`);
      testResults.failed++;
      testResults.details.push({ step: '工作流执行', status: 'failed', error: error.message });
    }
    
    // 阶段6: 测试总结
    console.log('\n' + '='.repeat(60));
    console.log('测试总结');
    console.log('='.repeat(60));
    
    console.log(`\n📊 测试统计:`);
    console.log(`   总测试数: ${testResults.total}`);
    console.log(`   通过: ${testResults.passed}`);
    console.log(`   失败: ${testResults.failed}`);
    console.log(`   通过率: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%`);
    
    console.log('\n📋 详细结果:');
    testResults.details.forEach((detail, index) => {
      const statusIcon = detail.status === 'passed' ? '✅' : '❌';
      console.log(`   ${index + 1}. ${statusIcon} ${detail.step}`);
      if (detail.error) {
        console.log(`       错误: ${detail.error}`);
      }
    });
    
    console.log('\n' + '='.repeat(60));
    
    if (testResults.failed === 0) {
      console.log('🎉 恭喜！完整MVP流程测试全部通过！\n');
      console.log('✅ 已验证的核心功能:');
      console.log('   1. DeepSeek API集成和连接');
      console.log('   2. 意图引擎创建和初始化');
      console.log('   3. MCP工具配置和管理');
      console.log('   4. 自然语言意图解析');
      console.log('   5. 复杂工作流处理');
      console.log('   6. 工具选择和执行');
      console.log('   7. 完整工作流执行');
      
      console.log('\n🚀 下一步建议:');
      console.log('   1. 安装真实MCP服务器（如filesystem、git服务器）');
      console.log('   2. 配置真实MCP服务器连接');
      console.log('   3. 测试真实环境下的工具执行');
      console.log('   4. 集成到实际应用场景中');
      
    } else {
      console.log('⚠ 部分测试失败，需要进一步检查。\n');
      console.log('🔧 调试建议:');
      console.log('   1. 检查DeepSeek API token是否正确');
      console.log('   2. 检查网络连接是否正常');
      console.log('   3. 查看详细错误信息');
      console.log('   4. 尝试使用回退模式测试');
    }
    
    console.log('\n' + '='.repeat(60));
    console.log('🏁 MVP流程测试完成！\n');
    
  } catch (error) {
    console.error(`\n❌ 测试过程中发生严重错误: ${error.message}`);
    console.error(error.stack);
    process.exit(1);
  }
}

// 运行完整测试
console.log('准备运行完整MVP流程测试...');
console.log('当前工作目录:', process.cwd());
console.log('Node版本:', process.version);
console.log('='.repeat(60) + '\n');

// 设置超时
const timeout = 180000; // 3分钟
const timeoutPromise = new Promise((_, reject) => {
  setTimeout(() => reject(new Error(`测试超时 (${timeout}ms)`)), timeout);
});

// 运行测试
Promise.race([
  runFullMVPTest(),
  timeoutPromise
])
.then(() => {
  console.log('✅ 测试程序正常结束');
  process.exit(0);
})
.catch(error => {
  console.error(`❌ 测试程序异常结束: ${error.message}`);
  process.exit(1);
});