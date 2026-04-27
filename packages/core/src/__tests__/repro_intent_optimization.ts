
import { ToolRegistry } from '../mcp/tool-registry';
import { Tool } from '../mcp/types';
import { ParameterMapper } from '../mcp/parameter-mapper';

async function testIntentOptimization() {
  console.log('--- 开始测试 FlexSearch + ToolScorer 优化效果 ---');

  const registry = new ToolRegistry();
  
  // 1. 模拟注册工具 (更加真实的元数据)
  const tools: Tool[] = [
    {
      name: 'query_train_tickets',
      description: '查询 12306 火车票信息',
      inputSchema: {
        type: 'object',
        properties: {
          from: { type: 'string', description: '出发城市，例如：北京' },
          to: { type: 'string', description: '到达城市，例如：上海' },
          date: { type: 'string', description: '出发日期' }
        },
        required: ['from', 'to', 'date']
      }
    },
    {
      name: 'render_plot',
      description: '使用数据生成可视化图表',
      inputSchema: {
        type: 'object',
        properties: {
          data: { type: 'array', items: { type: 'number' }, description: '需要绘图的原始数据' },
          type: { type: 'string', enum: ['line', 'bar', 'pie'], description: '图表类型，支持柱状图、折线图等展示方式' }
        },
        required: ['data']
      },
      examples: [
        {
          description: '帮我展示一下上周销售数据的图表',
          input: { data: [100, 200], type: 'bar' }
        }
      ]
    }
  ];

  console.log('正在注册工具并建立索引 (完全基于元数据)...');
  registry.registerTool(tools[0], async () => ({ content: [] }), 'server-1', 'TrainServer');
  registry.registerTool(tools[1], async () => ({ content: [] }), 'server-2', 'PlotServer');

  // 2. 模拟用户意图 (测试查票)
  const trainIntent = {
    id: 'A2',
    type: 'query',
    description: '查询2026年5月4日广州到南宁的高铁票',
    parameters: { 
      from: '广州', 
      to: '南宁', 
      date: '2026年5月4日' 
    }
  };

  console.log(`\n用户意图: "${trainIntent.description}"`);

  // 3. FlexSearch 检索已移除 — LLM function calling 直接处理工具选择
  console.log('(FlexSearch 检索已移除，由 LLM function calling 替代)');

  // 4. 测试日期归一化逻辑
  const normalizeDate = (dateStr: string) => {
    const trimmed = dateStr.trim();
    const chineseDateMatch = trimmed.match(/(?:(\d{4})[年\/-])?(\d{1,2})[月\/-](\d{1,2})日?/);
    if (chineseDateMatch) {
      const year = chineseDateMatch[1] ? parseInt(chineseDateMatch[1]) : 2026;
      const month = parseInt(chineseDateMatch[2]);
      const day = parseInt(chineseDateMatch[3]);
      return `${year}-${month.toString().padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
    }
    return dateStr;
  };

  const normalizedDate = normalizeDate(trainIntent.parameters.date);
  console.log(`原始日期: ${trainIntent.parameters.date} -> 归一化日期: ${normalizedDate}`);

  // 5. 测试参数单复数自动对齐 (City -> Citys)
  console.log('\n[测试 3] 参数模糊对齐 (单复数):');
  const cityTool: Tool = {
    name: 'get_station_code',
    description: '获取城市车站代码',
    inputSchema: {
      type: 'object',
      properties: {
        citys: { type: 'string', description: '城市名称，多个用逗号隔开' }
      },
      required: ['citys']
    }
  };

  const intentParams = { city: '广州' };
  
  // 使用重构后的 ParameterMapper
  const mappedParams = ParameterMapper.mapParameters(cityTool.name, cityTool.inputSchema, intentParams);
  console.log(`原始参数: ${JSON.stringify(intentParams)} -> 映射后参数: ${JSON.stringify(mappedParams)}`);

  if (mappedParams.citys === '广州') {
    console.log('✅ 测试通过：参数 city 成功自动对齐到 citys！');
  } else {
    console.log('❌ 测试失败：参数名对齐不符合预期。');
  }
}

testIntentOptimization().catch(console.error);
