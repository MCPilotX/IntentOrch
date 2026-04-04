/**
 * MCPilot SDK Zero-Config Demo
 * 
 * 零配置魔法示例 - 用户只需运行 `npx tsx examples/zero-config-demo.ts` 就能看到完整功能
 * 
 * 这个示例展示了：
 * 1. SDK基础功能 - 初始化、配置管理
 * 2. AI功能状态演示 - 明确展示当前限制
 * 3. 服务管理 - 基础框架演示
 * 4. 清晰的错误处理和用户引导
 */

import { mcpilot } from '../src/index';

async function runZeroConfigDemo() {
  console.log('🎯 MCPilot SDK 零配置魔法演示');
  console.log('='.repeat(50));
  console.log('✨ 无需安装外部依赖，无需配置API密钥');
  console.log('✨ 完整展示SDK核心功能');
  console.log('✨ 明确AI功能状态和限制\n');
  
  try {
    // 步骤1: 初始化SDK
    console.log('\n📦 步骤1: 初始化MCPilot SDK');
    console.log('-'.repeat(40));
    
    console.log('✅ SDK单例实例已就绪');
    console.log('✅ 自动初始化完成');
    
    // 步骤2: 配置管理演示
    console.log('\n⚙️  步骤2: 配置管理演示');
    console.log('-'.repeat(40));
    
    // 获取当前配置
    const config = mcpilot.getConfig();
    console.log('📋 当前配置:');
    console.log(`  - AI配置: ${config.ai ? '已配置' : '未配置'}`);
    console.log(`  - 服务数量: ${config.services ? Object.keys(config.services).length : 0}`);
    
    // 步骤3: AI功能状态演示
    console.log('\n🤖 步骤3: AI功能状态演示');
    console.log('-'.repeat(40));
    
    console.log('⚠️  AI功能状态说明:');
    console.log('  当前版本AI功能为基础框架/占位实现');
    console.log('  需要配置真实AI提供商密钥才能工作\n');
    
    // 演示AI配置
    console.log('🔧 演示AI配置:');
    try {
      await mcpilot.configureAI({
        provider: 'openai',
        model: 'gpt-4',
        apiKey: 'sk-test-demo-key' // 演示用测试密钥
      });
      console.log('  ✅ AI配置已更新（演示模式）');
    } catch (error: any) {
      console.log(`  ⚠️  配置错误: ${error.message}`);
    }
    
    // 演示AI查询（应该会失败，因为使用的是测试密钥）
    console.log('\n💬 演示AI查询:');
    try {
      const aiResult = await mcpilot.ask('Hello, can you help me list files?');
      console.log(`  🤖 AI回答: ${aiResult.answer}`);
      console.log(`  📊 置信度: ${aiResult.confidence}`);
    } catch (error: any) {
      console.log(`  ❌ 预期中的错误: ${error.message}`);
      console.log('  💡 提示: 这是预期行为，因为AI功能需要真实API密钥');
    }
    
    // 步骤4: 服务管理演示
    console.log('\n🚀 步骤4: 服务管理演示');
    console.log('-'.repeat(40));
    
    const services = mcpilot.listServices();
    console.log(`📊 当前服务数量: ${services.length}`);
    
    if (services.length > 0) {
      console.log('  服务列表:', services);
    } else {
      console.log('  💡 提示: 当前没有配置任何服务');
      console.log('  您可以使用 addService() 方法添加新服务');
    }
    
    // 步骤5: MCP功能演示
    console.log('\n🔌 步骤5: MCP功能演示');
    console.log('-'.repeat(40));
    
    console.log('🚀 注意: MCP功能需要连接真实的MCP服务器');
    console.log('💡 在实际使用中，您可以连接:');
    console.log('   - @modelcontextprotocol/server-filesystem');
    console.log('   - @modelcontextprotocol/server-weather');
    console.log('   - 或其他任何MCP兼容服务器');
    
    try {
      await mcpilot.initMCP();
      console.log('✅ MCP功能初始化完成');
      
      const servers = mcpilot.listMCPServers();
      console.log(`📊 当前MCP服务器数量: ${servers.length}`);
      
      if (servers.length === 0) {
        console.log('  💡 提示: 当前没有连接任何MCP服务器');
        console.log('  使用 connectMCPServer() 方法连接服务器');
      }
    } catch (error: any) {
      console.log(`  ⚠️  MCP初始化错误: ${error.message}`);
      console.log('  💡 提示: 这是正常现象，需要真实MCP服务器');
    }
    
    console.log('\n🎉 演示完成！');
    console.log('='.repeat(50));
    console.log('\n📋 总结:');
    console.log('  ✅ 零配置启动 - 无需外部依赖');
    console.log('  ✅ SDK初始化 - 自动完成');
    console.log('  ✅ 配置管理 - 完整支持');
    console.log('  ✅ AI功能透明 - 明确展示状态和限制');
    console.log('  ✅ 服务管理 - 基础框架就绪');
    console.log('  ✅ MCP功能 - 框架就绪，需真实服务器');
    console.log('  ✅ 错误处理 - 优雅的错误提示');
    
    console.log('\n🚀 下一步:');
    console.log('  1. 运行基础示例: npx tsx examples/basic-usage.ts');
    console.log('  2. 尝试真实MCP服务器: 安装并连接MCP服务器');
    console.log('  3. 配置真实AI: 使用OpenAI或Ollama API密钥');
    console.log('  4. 探索更多功能: 查看其他示例文件');
    
  } catch (error: any) {
    console.error('\n❌ 演示过程中出现错误:');
    console.error(`   错误信息: ${error.message}`);
    console.error(`   堆栈: ${error.stack?.split('\n')[0]}`);
    
    if (error.code) {
      console.error(`   错误代码: ${error.code}`);
    }
  }
  
  console.log('\n✨ 演示结束，感谢使用MCPilot SDK！');
}

// 运行演示
runZeroConfigDemo().catch(error => {
  console.error('❌ 演示运行失败:', error);
  process.exit(1);
});