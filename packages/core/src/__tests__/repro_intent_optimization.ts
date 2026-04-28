import { intentorch } from '../ai/intentorch-adapter';

async function testIntentExtraction() {
  console.log('Testing intent extraction for: "query 2026-05-03 Guangzhou to Nanning high-speed train tickets"');
  
  console.log('Checking available methods on intentorch:');
  console.log('- parseAndPlanWorkflow:', typeof (intentorch as any).parseAndPlanWorkflow);
  console.log('- processQuery:', typeof (intentorch as any).processQuery);
  
  if (typeof (intentorch as any).parseAndPlanWorkflow === 'function') {
    console.log('SUCCESS: parseAndPlanWorkflow is properly exposed in IntentorchAdapter.');
  } else {
    console.error('FAILURE: parseAndPlanWorkflow is missing!');
    process.exit(1);
  }
}

testIntentExtraction().catch(console.error);
