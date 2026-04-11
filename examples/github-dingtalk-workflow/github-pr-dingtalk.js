/**
 * github-pr-dingtalk.js - 使用 IntentOrch 构建自动分析 GitHub PR 并发送钉钉通知的 AI 工作流
 * 
 * 这个工作流展示了如何使用 IntentOrch 的意图编排功能来自动分析 GitHub PR 并发送钉钉通知。
 * 
 * 使用方法：
 * 1. 设置环境变量（参考 .env.example）
 * 2. 运行: node github-pr-dingtalk.js
 */

import { createSDK } from '@mcpilotx/intentorch';
import dotenv from 'dotenv';

dotenv.config();

/**
 * 主函数 - 运行完整的意图编排工作流
 */
async function runIntentOrchestratedWorkflow() {
  console.log('🚀 启动 IntentOrch 意图编排工作流 - GitHub PR 分析 + 钉钉通知\n');

  const sdk = createSDK({
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      error: (msg) => console.log(`[ERROR] ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
    }
  });

  try {
    // 1. 配置 AI
    console.log('🧠 配置 AI 服务...');
    await sdk.configureAI({
      provider: process.env.AI_PROVIDER || 'deepseek',
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'deepseek-chat'
    });

    // 2. 连接 MCP 服务器
    console.log('🔗 连接 MCP 服务器...');
    
    // 连接 GitHub 服务器
    console.log('   📦 连接 GitHub 服务器...');
    await sdk.connectMCPServer({
      name: 'github',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN }
      }
    });

    // 连接钉钉服务器
    console.log('   📦 连接钉钉服务器...');
    await sdk.connectMCPServer({
      name: 'dingtalk',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', 'dingtalk-mcp'],
        env: { 
          DINGTALK_Client_ID: process.env.DINGTALK_APP_KEY,
          DINGTALK_Client_Secret: process.env.DINGTALK_APP_SECRET,
          ROBOT_CODE: process.env.DINGTALK_ROBOT_CODE
        }
      }
    });

    console.log('✅ 服务器连接成功\n');
    
    // 3. 初始化 Cloud Intent Engine
    console.log('⚙️  初始化 Cloud Intent Engine...');
    await sdk.initCloudIntentEngine();
    
    // 4. 验证工具同步
    console.log('🔍 验证工具同步...');
    const tools = sdk.listTools();
    console.log(`   可用工具数量: ${tools.length}`);
    
    if (tools.length === 0) {
      console.log('⚠️  警告: 没有可用的工具，意图编排将无法工作');
      console.log('   请检查 MCP 服务器连接是否成功');
    } else {
      console.log('   工具列表预览:');
      tools.slice(0, 5).forEach((tool, index) => {
        console.log(`     ${index + 1}. ${tool.name} - ${tool.description}`);
      });
      if (tools.length > 5) {
        console.log(`     ... 还有 ${tools.length - 5} 个工具`);
      }
    }
    console.log('');

    // 5. 定义工作流参数
    const repoOwner = process.env.REPO_OWNER || 'MCPilotX';
    const repoName = process.env.REPO_NAME || 'IntentOrch';
    const prNumber = parseInt(process.env.PR_NUMBER || '1');
    const dingtalkChatId = process.env.DINGTALK_CHAT_ID;

    // 6. 使用自然语言描述工作流
    const workflowQuery = `
      分析 GitHub 仓库 ${repoOwner}/${repoName} 的 PR #${prNumber}，
      获取 PR 详情和文件变更，
      @intentorch为这些变更生成高质量的总结报告，
      包括以下内容：
      1. PR 标题和描述
      2. 主要变更的文件
      3. 代码变更的类型（新增、修改、删除）
      4. 潜在的风险和影响
      5. 评审建议
      然后将报告发送到钉钉群聊 ${dingtalkChatId}。
    `;

    console.log('🤖 工作流描述:');
    console.log(`   "${workflowQuery}"\n`);

    // 7. 执行意图编排工作流（带跟踪）
    console.log('🔄 执行意图编排工作流...\n');

    const result = await sdk.executeWorkflowWithTracking(
      workflowQuery,
      {
        onStepStarted: (step) => {
          console.log(`   ▶️  开始步骤: ${step.intentDescription}`);
          console.log(`       工具: ${step.toolName}`);
        },
        onStepCompleted: (step) => {
          console.log(`   ✅ 步骤完成: ${step.intentDescription}`);
          console.log(`       状态: ${step.success ? '成功' : '失败'}`);
          if (step.duration) {
            console.log(`       耗时: ${step.duration}ms`);
          }
          console.log('');
        },
        onStepFailed: (step) => {
          console.log(`   ❌ 步骤失败: ${step.intentDescription}`);
          console.log(`       错误: ${step.error}`);
          console.log('');
        }
      }
    );

    // 8. 输出结果
    console.log('\n📊 工作流执行结果:');
    console.log('='.repeat(50));

    if (result.success) {
      console.log('🎉 工作流执行成功!');
      
      if (result.statistics) {
        console.log('\n📈 执行统计:');
        console.log(`   总步骤数: ${result.statistics.totalSteps}`);
        console.log(`   成功步骤: ${result.statistics.successfulSteps}`);
        console.log(`   失败步骤: ${result.statistics.failedSteps}`);
        console.log(`   总耗时: ${result.statistics.totalDuration}ms`);
        console.log(`   平均步骤耗时: ${result.statistics.averageStepDuration}ms`);
        console.log(`   LLM 调用次数: ${result.statistics.llmCalls}`);
      }

      console.log('\n🔍 工作流解析详情:');
      if (result.parsedIntents && result.parsedIntents.length > 0) {
        console.log(`   解析出的意图数量: ${result.parsedIntents.length}`);
        result.parsedIntents.forEach((intent, index) => {
          console.log(`   ${index + 1}. ${intent.description} (${intent.type})`);
        });
      }

      console.log('\n🛠️  工具选择详情:');
      if (result.toolSelections && result.toolSelections.length > 0) {
        result.toolSelections.forEach((selection, index) => {
          console.log(`   ${index + 1}. ${selection.toolName} (置信度: ${selection.confidence})`);
          console.log(`      对应意图: ${selection.intentId}`);
        });
      }

      console.log('\n📋 最终结果:');
      console.log(result.result || '无结果输出');
      
      // 显示钉钉通知发送状态
      console.log('\n📨 钉钉通知状态:');
      console.log('   通知已发送到钉钉群聊');
      console.log(`   群聊ID: ${dingtalkChatId}`);
    } else {
      console.log('❌ 工作流执行失败!');
      console.log(`   错误: ${result.error}`);
    }

  } catch (error) {
    console.error('\n💥 工作流执行异常:', error);
  } finally {
    // 清理资源
    console.log('\n🧹 清理资源...');
    await sdk.disconnectAll();
    console.log('✅ 资源清理完成');
  }
}


/**
 * 主函数 - 运行工作流
 */
async function main() {
  console.log('='.repeat(60));
  console.log('🔧 GitHub PR 分析 + 钉钉通知 - IntentOrch 意图编排工作流');
  console.log('='.repeat(60));
  console.log('\n这个工作流会自动分析 GitHub PR 并发送钉钉通知:\n');
  console.log('1. 获取 GitHub PR 详情和文件变更');
  console.log('2. 使用 AI 分析 PR 内容');
  console.log('3. 生成详细的评审报告');
  console.log('4. 发送报告到钉钉群聊\n');

  // 检查必要的环境变量
  const requiredEnvVars = [
    'GITHUB_TOKEN',
    'DINGTALK_APP_KEY',
    'DINGTALK_APP_SECRET',
    'DINGTALK_ROBOT_CODE',
    'DINGTALK_CHAT_ID',
    'AI_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('⚠️  缺少必要的环境变量:');
    missingVars.forEach(varName => {
      console.log(`   - ${varName}`);
    });
    console.log('\n💡 请创建 .env 文件并设置这些变量。');
    console.log('   参考下面的环境变量说明:\n');
    console.log('   GITHUB_TOKEN=你的GitHub个人访问令牌');
    console.log('   DINGTALK_APP_KEY=钉钉应用AppKey');
    console.log('   DINGTALK_APP_SECRET=钉钉应用AppSecret');
    console.log('   DINGTALK_ROBOT_CODE=钉钉机器人Code');
    console.log('   DINGTALK_CHAT_ID=钉钉群聊ID');
    console.log('   AI_API_KEY=AI服务API密钥（DeepSeek/OpenAI等）');
    console.log('\n   可选环境变量:');
    console.log('   REPO_OWNER=仓库所有者（默认: MCPilotX）');
    console.log('   REPO_NAME=仓库名称（默认: IntentOrch）');
    console.log('   PR_NUMBER=PR编号（默认: 1）');
    console.log('   AI_PROVIDER=AI服务提供商（默认: deepseek）');
    console.log('   AI_MODEL=AI模型（默认: deepseek-chat）\n');
    return;
  }

  console.log('✅ 环境变量检查通过\n');

  // 运行工作流
  try {
    // 模式1: 完整的意图编排工作流
    await runIntentOrchestratedWorkflow();
    
  } catch (error) {
    console.error('💥 主函数执行异常:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 GitHub PR 分析 + 钉钉通知工作流执行完成!');
  console.log('='.repeat(60));
}

// 运行主函数
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ 程序执行失败:', error);
    process.exit(1);
  });
}

// 导出函数供其他模块使用
export {
  runIntentOrchestratedWorkflow,
  main
};
