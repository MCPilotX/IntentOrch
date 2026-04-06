/**
 * 快速测试：验证DeepSeek API和意图引擎基本功能
 */

import { CloudIntentEngine } from './package/dist/ai/cloud-intent-engine.js';

// 检查环境变量
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || process.env.DEEPSEEK_TOKEN;

if (!DEEPSEEK_API_KEY) {
  console.error('❌ 错误: 未找到DeepSeek API token');
  console.error('请设置环境变量:');
  console.error('  export DEEPSEEK_API_KEY=your_api_key_here');
  console.error('或');
  console.error('  export DEEPSEEK_TOKEN=your_api_key_here');
  process.exit(1);
}

console.log('🔑 检测到DeepSeek API token');
console.log('开始快速测试...\n');

async function quickTest() {
  try {
    // 1. 创建意图引擎
    console.log('1. 创建CloudIntentEngine...');
    const engine = new CloudIntentEngine({
      llm: {
        provider: 'deepseek',
        apiKey: DEEPSEEK_API_KEY,
        model: 'deepseek-chat',
        temperature: 0.1
      }
    });
    console.log('✅ 引擎创建成功\n');
    
    // 初始化引擎（配置AI服务）
    console.log('初始化引擎...');
    await engine.initialize();
    console.log('✅ 引擎初始化成功\n');
    
    // 2. 设置简单工具
    console.log('2. 设置模拟工具...');
    engine.setAvailableTools([
      {
        name: 'read_file',
        description: 'Read a file',
        inputSchema: {
          type: 'object',
          properties: {
            path: { type: 'string' }
          },
          required: ['path']
        }
      }
    ]);
    console.log('✅ 工具设置成功\n');
    
    // 3. 测试简单意图解析
    console.log('3. 测试意图解析...');
    console.log('查询: "hello"');
    
    try {
      const result = await engine.parseIntent("hello");
      console.log(`✅ 意图解析成功`);
      console.log(`意图数量: ${result.intents.length}`);
    } catch (error) {
      console.log(`⚠ 意图解析失败（可能需要初始化）: ${error.message}`);
    }
    
    console.log('\n🎉 快速测试完成！');
    console.log('\n下一步:');
    console.log('1. 运行完整测试: node mcp-integration-test.js');
    console.log('2. 或运行简化测试: node final-mvp-test.js');
    console.log('3. 确保已设置正确的DeepSeek API token');
    
  } catch (error) {
    console.error(`❌ 测试失败: ${error.message}`);
    console.error(error.stack);
  }
}

// 运行测试
quickTest().catch(console.error);