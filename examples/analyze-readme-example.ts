/**
 * MCPilot SDK - 分析README文件示例
 * 
 * 这个示例展示了如何正确使用SDK的ask方法来分析README文件
 * 并获取改进建议
 */

import { mcpilot, MCPilotSDK } from '../src/index';

async function analyzeReadmeExample() {
  console.log('📖 MCPilot SDK - 分析README文件示例\n');
  console.log('='.repeat(50));

  try {
    // 方法1: 使用单例实例
    console.log('\n🔧 方法1: 使用SDK单例实例');
    console.log('-'.repeat(40));

    // 首先需要配置AI（如果需要使用真实AI功能）
    console.log('1. 配置AI（演示模式）...');
    try {
      await mcpilot.configureAI({
        provider: 'openai',
        model: 'gpt-3.5-turbo',
        apiKey: 'sk-demo-key' // 演示用密钥，实际使用时需要真实密钥
      });
      console.log('   ✅ AI配置完成（演示模式）');
    } catch (error: any) {
      console.log(`   ⚠️  AI配置错误: ${error.message}`);
      console.log('   💡 提示: 这是预期行为，演示模式下使用测试密钥');
    }

    // 使用ask方法分析README文件
    console.log('\n2. 使用ask方法分析README文件...');
    try {
      // 正确的用法：ask方法只接受查询字符串和可选的AskOptions参数
      const analysis = await mcpilot.ask(
        "Analyze this README file and suggest improvements",
        {
          provider: 'openai', // 可选：指定AI提供商
          model: 'gpt-3.5-turbo', // 可选：指定模型
          temperature: 0.1, // 可选：控制随机性
          maxTokens: 500 // 可选：限制响应长度
        }
      );

      console.log('   ✅ 分析完成！');
      console.log(`\n   📊 分析结果:`);
      console.log(`   - 回答: ${analysis.answer}`);
      console.log(`   - 置信度: ${analysis.confidence}`);

      if (analysis.toolCalls && analysis.toolCalls.length > 0) {
        console.log(`\n   🛠️  建议的工具调用:`);
        analysis.toolCalls.forEach((toolCall, index) => {
          console.log(`   ${index + 1}. 服务: ${toolCall.service}`);
          console.log(`      工具: ${toolCall.tool}`);
          console.log(`      参数: ${JSON.stringify(toolCall.params, null, 2)}`);
        });
      }
    } catch (error: any) {
      console.log(`   ❌ 分析失败: ${error.message}`);
      console.log('   💡 提示: 这可能是因为AI没有正确配置或使用了测试密钥');
    }

    // 方法2: 创建自定义SDK实例
    console.log('\n\n🔧 方法2: 创建自定义SDK实例');
    console.log('-'.repeat(40));

    try {
      const customSDK = new MCPilotSDK({
        autoInit: true,
        logger: {
          info: (msg) => console.log(`   [INFO] ${msg}`),
          error: (msg) => console.log(`   [ERROR] ${msg}`),
          debug: (msg) => console.log(`   [DEBUG] ${msg}`),
        }
      });

      console.log('1. 自定义SDK实例创建成功');

      // 使用自定义实例进行分析
      console.log('\n2. 使用自定义实例分析...');
      try {
        const customAnalysis = await customSDK.ask(
          "What are the key features of this SDK based on the README?",
          { model: 'gpt-3.5-turbo' }
        );

        console.log('   ✅ 自定义实例分析完成！');
        console.log(`   - 回答: ${customAnalysis.answer}`);
        console.log(`   - 置信度: ${customAnalysis.confidence}`);
      } catch (error: any) {
        console.log(`   ⚠️  自定义实例分析失败: ${error.message}`);
        console.log('   💡 提示: AI可能未配置，这是预期行为');
      }
    } catch (error: any) {
      console.log(`   ❌ 自定义实例创建失败: ${error.message}`);
    }

    // 实际使用建议
    console.log('\n\n💡 实际使用建议');
    console.log('-'.repeat(40));
    console.log('1. 配置真实AI提供商:');
    console.log('   - OpenAI: 获取API密钥从 https://platform.openai.com/api-keys');
    console.log('   - Ollama: 本地运行，无需API密钥');
    console.log('   - 其他: Anthropic, Google Gemini, Azure OpenAI等');
    
    console.log('\n2. 正确配置AI:');
    console.log('   await mcpilot.configureAI({');
    console.log('     provider: "openai",');
    console.log('     apiKey: "YOUR_REAL_API_KEY",');
    console.log('     model: "gpt-4"');
    console.log('   });');
    
    console.log('\n3. 使用ask方法的正确语法:');
    console.log('   const result = await sdk.ask("你的查询", {');
    console.log('     provider: "openai", // 可选');
    console.log('     model: "gpt-4", // 可选');
    console.log('     temperature: 0.1, // 可选');
    console.log('     maxTokens: 1000 // 可选');
    console.log('   });');
    
    console.log('\n4. 处理工具调用:');
    console.log('   if (result.toolCalls && result.toolCalls.length > 0) {');
    console.log('     // 执行建议的工具调用');
    console.log('     for (const toolCall of result.toolCalls) {');
    console.log('       await sdk.executeTool(toolCall.tool, toolCall.params);');
    console.log('     }');
    console.log('   }');

    // 常见错误示例
    console.log('\n\n❌ 常见错误示例');
    console.log('-'.repeat(40));
    console.log('1. 使用无效的useTools参数:');
    console.log('   // 错误: useTools不是有效的AskOptions属性');
    console.log('   await sdk.ask("query", { useTools: true });');
    
    console.log('\n2. 未配置AI直接调用:');
    console.log('   // 错误: AI未配置时会抛出AIError');
    console.log('   const sdk = new MCPilotSDK();');
    console.log('   await sdk.ask("query"); // 会失败');
    
    console.log('\n3. 忘记await:');
    console.log('   // 错误: ask是异步方法，需要await');
    console.log('   const result = sdk.ask("query"); // 返回的是Promise，不是结果');

  } catch (error: any) {
    console.error('\n❌ 示例运行失败:');
    console.error(`   错误: ${error.message}`);
    if (error.stack) {
      console.error(`   堆栈: ${error.stack.split('\n')[0]}`);
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('🎉 示例完成！');
  console.log('\n🚀 下一步:');
  console.log('   1. 配置真实AI API密钥');
  console.log('   2. 运行此示例: npx tsx examples/analyze-readme-example.ts');
  console.log('   3. 探索更多SDK功能');
}

// 运行示例
analyzeReadmeExample().catch(error => {
  console.error('❌ 示例运行失败:', error);
  process.exit(1);
});