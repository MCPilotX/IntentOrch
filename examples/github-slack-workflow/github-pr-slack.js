/**
 * 
 * This version demonstrates how to use IntentOrch's intent orchestration feature to refactor hard-coded workflows.
 * The original workflow is converted into a natural language-driven intent orchestration workflow.
 * 
 * Usage:
 * 1. Set environment variables (refer to .env)
 * 2. Run: node github-pr-slack-en.js
 */

import { createSDK } from '@mcpilotx/intentorch';
import dotenv from 'dotenv';

dotenv.config();

/**
 * Method 1: Using executeWorkflowWithTracking - Complete intent orchestration workflow
 * Describing the entire workflow in natural language, IntentOrch automatically parses, plans, and executes
 */
async function runIntentOrchestratedWorkflow() {
  console.log('🚀 Starting IntentOrch intent orchestration workflow...\n');

  const sdk = createSDK({
    logger: {
      info: (msg) => console.log(`[INFO] ${msg}`),
      error: (msg) => console.log(`[ERROR] ${msg}`),
      debug: (msg) => console.log(`[DEBUG] ${msg}`),
    }
  });

  try {
    // 1. Configure AI
    console.log('🧠 Configuring AI service...');
    await sdk.configureAI({
      provider: process.env.AI_PROVIDER || 'deepseek',
      apiKey: process.env.AI_API_KEY,
      model: process.env.AI_MODEL || 'deepseek-chat'
    });

    // 2. Connect MCP servers (connect servers first, then initialize engine)
    console.log('🔗 Connecting MCP servers...');
    
    // Connect GitHub server
    console.log('   📦 Connecting GitHub server...');
    await sdk.connectMCPServer({
      name: 'github',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-github'],
        env: { GITHUB_PERSONAL_ACCESS_TOKEN: process.env.GITHUB_TOKEN }
      }
    });

    // Connect Slack server
    console.log('   📦 Connecting Slack server...');
    await sdk.connectMCPServer({
      name: 'slack',
      transport: {
        type: 'stdio',
        command: 'npx',
        args: ['-y', '@modelcontextprotocol/server-slack'],
        env: { 
          SLACK_BOT_TOKEN: process.env.SLACK_TOKEN,
          SLACK_TEAM_ID: process.env.SLACK_TEAM_ID
        }
      }
    });

    console.log('✅ Servers connected successfully\n');
    
    // 3. Initialize Cloud Intent Engine (after connecting servers)
    console.log('⚙️  Initializing Cloud Intent Engine...');
    await sdk.initCloudIntentEngine();
    
    // 4. Verify tool synchronization
    console.log('🔍 Verifying tool synchronization...');
    const tools = sdk.listTools();
    console.log(`   Available tools: ${tools.length}`);
    
    if (tools.length === 0) {
      console.log('⚠️  Warning: No tools available, intent orchestration will not work');
      console.log('   Please check if MCP server connections were successful');
    } else {
      console.log('   Tool list preview:');
      tools.slice(0, 5).forEach((tool, index) => {
        console.log(`     ${index + 1}. ${tool.name} - ${tool.description}`);
      });
      if (tools.length > 5) {
        console.log(`     ... and ${tools.length - 5} more tools`);
      }
    }
    console.log('');

    // 4. Define workflow parameters
    const slackChannel = process.env.SLACK_CHANNEL;
    const repoOwner = process.env.REPO_OWNER || 'facebook';
    const repoName = process.env.REPO_NAME || 'react';
    const prNumber = parseInt(process.env.PR_NUMBER || '1');

    // 5. Describe workflow in natural language (including @intentorch directive)
    // 使用更明确的描述，确保引擎能正确提取参数
    const workflowQuery = `
       Use GitHub API to get pull request #${prNumber} from repository ${repoOwner}/${repoName}.
       Get the PR details including title, description, author, and file changes.
       Then use @intentorch to generate a high-quality summary report for these changes.
       Finally, send the summary report to Slack channel #${slackChannel}.
    `;

    console.log('🤖 Workflow description:');
    console.log(`   "${workflowQuery}"\n`);

    // 6. Execute intent orchestration workflow (with tracking)
    console.log('🔄 Executing intent orchestration workflow...\n');

    const result = await sdk.executeWorkflowWithTracking(
      workflowQuery,
      {
        onStepStarted: (step) => {
          console.log(`   ▶️  Starting step: ${step.intentDescription}`);
          console.log(`       Tool: ${step.toolName}`);
        },
        onStepCompleted: (step) => {
          console.log(`   ✅ Step completed: ${step.intentDescription}`);
          console.log(`       Status: ${step.success ? 'Success' : 'Failed'}`);
          if (step.duration) {
            console.log(`       Duration: ${step.duration}ms`);
          }
          console.log('');
        },
        onStepFailed: (step) => {
          console.log(`   ❌ Step failed: ${step.intentDescription}`);
          console.log(`       Error: ${step.error}`);
          console.log('');
        }
      }
    );

    // 7. Output results
    console.log('\n📊 Workflow execution results:');
    console.log('='.repeat(50));

    if (result.success) {
      console.log('🎉 Workflow executed successfully!');
      
      if (result.statistics) {
        console.log('\n📈 Execution statistics:');
        console.log(`   Total steps: ${result.statistics.totalSteps}`);
        console.log(`   Successful steps: ${result.statistics.successfulSteps}`);
        console.log(`   Failed steps: ${result.statistics.failedSteps}`);
        console.log(`   Total duration: ${result.statistics.totalDuration}ms`);
        console.log(`   Average step duration: ${result.statistics.averageStepDuration}ms`);
        console.log(`   LLM calls: ${result.statistics.llmCalls}`);
      }

      console.log('\n🔍 Workflow parsing details:');
      if (result.parsedIntents && result.parsedIntents.length > 0) {
        console.log(`   Parsed intents: ${result.parsedIntents.length}`);
        result.parsedIntents.forEach((intent, index) => {
          console.log(`   ${index + 1}. ${intent.description} (${intent.type})`);
        });
      }

      console.log('\n🛠️  Tool selection details:');
      if (result.toolSelections && result.toolSelections.length > 0) {
        result.toolSelections.forEach((selection, index) => {
          console.log(`   ${index + 1}. ${selection.toolName} (confidence: ${selection.confidence})`);
          console.log(`       Corresponding intent: ${selection.intentId}`);
        });
      }

      console.log('\n📋 Final result:');
      console.log(result.result || 'No output result');
    } else {
      console.log('❌ Workflow execution failed!');
      console.log(`   Error: ${result.error}`);
    }

  } catch (error) {
    console.error('\n💥 Workflow execution exception:', error);
  } finally {
    // Clean up resources
    console.log('\n🧹 Cleaning up resources...');
    await sdk.disconnectAll();
    console.log('✅ Resource cleanup completed');
  }
}


/**
 * Main function - Run all three modes
 */
async function main() {
  console.log('='.repeat(60));
  console.log('1. executeWorkflowWithTracking - Complete natural language workflow');

  // Check required environment variables
  const requiredEnvVars = [
    'GITHUB_TOKEN',
    'SLACK_TOKEN',
    'SLACK_TEAM_ID',
    'SLACK_CHANNEL',
    'REPO_OWNER',
    'REPO_NAME',
    'PR_NUMBER',
    'AI_API_KEY'
  ];

  const missingVars = requiredEnvVars.filter(varName => !process.env[varName]);
  
  if (missingVars.length > 0) {
    console.log('⚠️  Missing required environment variables:');
    missingVars.forEach(varName => {
      console.log(`   - ${varName}`);
    });
    console.log('\n💡 Please create a .env file and set these variables.');
    console.log('   Refer to .env.example file for example configuration.\n');
    return;
  }

  console.log('✅ Environment variables check passed\n');

  try {
    // Complete intent orchestration workflow
    await runIntentOrchestratedWorkflow();
  } catch (error) {
    console.error('💥 Main function execution exception:', error);
  }

  console.log('\n' + '='.repeat(60));
  console.log('🎉 IntentOrch intent orchestration example execution completed!');
  console.log('='.repeat(60));
}

// Run main function
if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error('❌ Program execution failed:', error);
    process.exit(1);
  });
}

// Export functions for other modules
export {
  runIntentOrchestratedWorkflow,
  main
};
