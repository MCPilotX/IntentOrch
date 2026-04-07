/**
 * MCPilot SDK - 修复ask方法使用示例
 * 
 * 这个示例展示了如何正确使用SDK的ask方法
 * 修复用户提供的错误代码
 */

import { MCPilotSDK } from '../src/index';

async function fixAskMethodExample() {
  console.log('🔧 MCPilot SDK - 修复ask方法使用示例\n');
  console.log('='.repeat(50));

  try {
    // 创建SDK实例
    const sdk = new MCPilotSDK({
      autoInit: true,
      logger: {
        info: (msg) => console.log(`[INFO] ${msg}`),
        error: (msg) => console.log(`[ERROR] ${msg}`),
        debug: (msg) => console.log(`[DEBUG] ${msg}`),
      }
    });

    console.log('✅ SDK实例创建成功\n');

    // ==================== 用户提供的错误代码 ====================
    console.log('❌ 用户提供的错误代码:');
    console.log('-'.repeat(40));
    console.log('const analysis = await sdk.ask(');
    console.log('  "Analyze this README file and suggest improvements",');
    console.log('  { useTools: true }');
    console.log(');');
    console.log('\n问题: useTools不是有效的AskOptions参数\n');

    // ==================== 正确的代码 ====================
    console.log('✅ 正确的代码:');
    console.log('-'.repeat(40));

    // 首先配置AI（如果需要使用AI功能）
    console.log('1. 配置AI:');
    try {
      await sdk.configureAI({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: 'sk-demo-key' // 演示用，实际需要真实密钥
      });
      console.log('   ✅ AI配置完成\n');
    } catch (error: any) {
      console.log(`   ⚠️  AI配置错误: ${error.message}`);
      console.log('   💡 提示: 使用演示密钥，实际需要真实API密钥\n');
    }

    // 正确的ask方法调用
    console.log('2. 使用正确的ask方法:');
    const analysis = await sdk.ask(
      "Analyze this README file and suggest improvements",
      {
        // 正确的AskOptions参数（可选）:
        provider: 'openai',    // 可选：指定AI提供商
        model: 'gpt-3.5-turbo', // 可选：指定模型
        temperature: 0.1,      // 可选：控制随机性（0-1）
        maxTokens: 500         // 可选：限制响应长度
      }
    );

    console.log('   ✅ 分析完成！\n');

    // 显示结果
    console.log('3. 分析结果:');
    console.log('-'.repeat(40));
    console.log(`   回答: ${analysis.answer}`);
    console.log(`   置信度: ${analysis.confidence}`);

    if (analysis.toolCalls && analysis.toolCalls.length > 0) {
      console.log(`\n   建议的工具调用 (${analysis.toolCalls.length}个):`);
      analysis.toolCalls.forEach((toolCall, index) => {
        console.log(`   ${index + 1}. ${toolCall.tool} (来自 ${toolCall.service})`);
        console.log(`      参数: ${JSON.stringify(toolCall.params)}`);
      });
    }

    // ==================== AskOptions接口定义 ====================
    console.log('\n📋 AskOptions接口定义:');
    console.log('-'.repeat(40));
    console.log('interface AskOptions {');
    console.log('  provider?: string;     // AI提供商: "openai", "anthropic", "google", "azure", "deepseek", "ollama", "none"');
    console.log('  model?: string;        // 模型名称: "gpt-4", "gpt-3.5-turbo", "claude-3-haiku", 等');
    console.log('  temperature?: number;  // 随机性: 0-1，默认0.1');
    console.log('  maxTokens?: number;    // 最大token数');
    console.log('}');
    console.log('\n注意: useTools不是有效的参数！');

    // ==================== 完整的工作示例 ====================
    console.log('\n🚀 完整的工作示例:');
    console.log('-'.repeat(40));
    console.log('import { MCPilotSDK } from \'@mcpilotx/intentorch\';');
    console.log('');
    console.log('async function analyzeReadme() {');
    console.log('  // 1. 创建SDK实例');
    console.log('  const sdk = new MCPilotSDK({ autoInit: true });');
    console.log('');
    console.log('  // 2. 配置AI（使用真实API密钥）');
    console.log('  await sdk.configureAI({');
    console.log('    provider: "openai",');
    console.log('    apiKey: "YOUR_REAL_API_KEY",');
    console.log('    model: "gpt-4"');
    console.log('  });');
    console.log('');
    console.log('  // 3. 使用ask方法分析');
    console.log('  const result = await sdk.ask(');
    console.log('    "Analyze this README file and suggest improvements",');
    console.log('    {');
    console.log('      provider: "openai",');
    console.log('      model: "gpt-4",');
    console.log('      temperature: 0.1,');
    console.log('      maxTokens: 1000');
    console.log('    }');
    console.log('  );');
    console.log('');
    console.log('  // 4. 处理结果');
    console.log('  console.log("分析结果:", result.answer);');
    console.log('  console.log("置信度:", result.confidence);');
    console.log('');
    console.log('  // 5. 如果有工具调用，可以执行它们');
    console.log('  if (result.toolCalls && result.toolCalls.length > 0) {');
    console.log('    for (const toolCall of result.toolCalls) {');
    console.log('      try {');
    console.log('        const toolResult = await sdk.executeTool(');
    console.log('          toolCall.tool,');
    console.log('          toolCall.params');
    console.log('        );');
    console.log('        console.log(`工具 ${toolCall.tool} 执行结果:`, toolResult);');
    console.log('      } catch (error) {');
    console.log('        console.error(`工具 ${toolCall.tool} 执行失败:`, error);');
    console.log('      }');
    console.log('    }');
    console.log('  }');
    console.log('}');

  } catch (error: any) {
    console.error('\n❌ 示例运行失败:');
    console.error(`   错误: ${error.message}`);
    if (error.stack) {
      console.error(`   堆栈: ${error.stack.split('\n')[0]}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 修复示例完成！');
  console.log('\n💡 关键点:');
  console.log('   1. ask方法的第二个参数是AskOptions接口');
  console.log('   2. AskOptions只包含: provider, model, temperature, maxTokens');
  console.log('   3. useTools不是有效的参数');
  console.log('   4. AI会自动决定是否需要使用工具');
  console.log('   5. 工具调用信息在result.toolCalls中');
}

// 运行示例
fixAskMethodExample().catch(error => {
  console.error('❌ 示例运行失败:', error);
  process.exit(1);
});