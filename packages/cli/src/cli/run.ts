/**
 * Unified Run Command
 * 
 * Uses the new UnifiedExecutionService to provide the same execution
 * capabilities for both CLI and Web.
 * 
 * This is a simplified version of the original run command that uses
 * the shared unified execution service.
 */

import { Command } from 'commander';
import { getExecuteService, getAIConfig, PROGRAM_NAME, printError } from '@intentorch/core';

/**
 * Convert MCP response format to standard format
 * MCP response: { content: [{ type: "text", text: "..." }] }
 * Standard format: { result: ... }
 */
function convertMCPResponse(response: any): any {
  if (!response) return response;
  
  // If response already has result field, return as is
  if (response.result !== undefined) {
    return response;
  }
  
  // Convert content array to result
  if (response.content && Array.isArray(response.content)) {
    // Extract text from content
    const textContent = response.content
      .filter((item: any) => item.type === 'text')
      .map((item: any) => item.text)
      .join('\n');
    
    // If there's text content, return it as result
    if (textContent) {
      return { ...response, result: textContent };
    }
    
    // If there's only one content item, return it directly
    if (response.content.length === 1) {
      return { ...response, result: response.content[0] };
    }
  }
  
  // Return original response if we can't convert it
  return response;
}

/**
 * Convert step results in execution steps
 */
function convertStepResults(executionSteps: any[]): any[] {
  if (!executionSteps || !Array.isArray(executionSteps)) {
    return executionSteps;
  }
  
  return executionSteps.map(step => {
    if (step.result) {
      return {
        ...step,
        result: convertMCPResponse(step.result)
      };
    }
    return step;
  });
}

/**
 * Display execution results in a user-friendly format
 */
function displayExecutionResults(result: any, options: any) {
  if (!options.silent) {
    console.log('\n' + '='.repeat(50));
    console.log('🎉 Workflow execution completed');
    console.log('='.repeat(50));
  }
  
  // Convert MCP response formats
  const convertedResult = {
    ...result,
    executionSteps: convertStepResults(result.executionSteps),
    result: convertMCPResponse(result.result)
  };
  
  if (convertedResult.success) {
    if (!options.silent) {
      console.log(`✅ Execution successful`);
      
      // Display execution results
      if (convertedResult.executionSteps && convertedResult.executionSteps.length > 0) {
        console.log('\n📊 Execution steps:');
        for (const step of convertedResult.executionSteps) {
          const status = step.success ? '✅' : '❌';
          const stepName = step.name || step.toolName || step.tool || 'Unknown step';
          console.log(`  ${status} ${stepName}`);
          
          if (step.result) {
            // Check if result has been converted to have result field
            const stepResult = step.result.result || step.result;
            
            if (step.toolName === 'search_tickets' && stepResult.tickets) {
              console.log(`     Found ${stepResult.tickets.length} tickets:`);
              for (const ticket of stepResult.tickets.slice(0, 3)) {
                console.log(`     - ${ticket.trainNo}: ${ticket.from} → ${ticket.to} ${ticket.departure}-${ticket.arrival} ${ticket.price}`);
              }
            } else if (step.toolName === 'get_weather' && stepResult) {
              console.log(`     ${stepResult.location}: ${stepResult.temperature} ${stepResult.condition}`);
            } else if (typeof stepResult === 'string') {
              // Display text result
              console.log(`     Result: ${stepResult.substring(0, 100)}${stepResult.length > 100 ? '...' : ''}`);
            }
          }
        }
      }
      
      // Display final output
      if (convertedResult.result) {
        console.log('\n📋 Final output:');
        const finalResult = convertedResult.result.result || convertedResult.result;
        console.log(finalResult);
      }
    } else {
      // In silent mode, just output the result
      if (convertedResult.result) {
        const finalResult = convertedResult.result.result || convertedResult.result;
        console.log(JSON.stringify(finalResult, null, 2));
      }
    }
  } else {
    console.log(`❌ Execution failed`);
    
    if (convertedResult.error) {
      console.log(`\n📋 Error message:`);
      console.log(convertedResult.error);
    }
    
    if (convertedResult.executionSteps) {
      console.log('\n📊 Failed steps:');
      for (const step of convertedResult.executionSteps) {
        if (!step.success) {
          const stepName = step.name || step.toolName || step.tool || 'Unknown step';
          console.log(`  ❌ ${stepName}`);
          if (step.error) {
            console.log(`     Error: ${step.error}`);
          }
        }
      }
    }
  }
}

export function runCommand(): Command {
  const command = new Command('run')
    .description('Execute natural language workflow, JSON workflow file, or named workflow using unified execution service')
    .argument('<input>', 'Natural language query, JSON file path, or workflow name')
    .option('--auto-start', 'Automatically pull and start required Server')
    .option('--keep-alive', 'Keep Server running after execution (only with --auto-start)')
    .option('-p, --params <json>', 'Parameters for named workflow or file (JSON format)', '{}')
    .option('--silent', 'Suppress verbose logs and initialization messages')
    .option('--simulate', 'Run in simulation mode (no real MCP Server required)')
    .action(async (input: string, options) => {
      try {
        const executionService = getExecuteService();
        let params = {};
        
        try {
          params = JSON.parse(options.params);
        } catch (e) {
          printError('Invalid JSON params');
          return;
        }

        // 1. Check if it's a JSON file
        if (input.endsWith('.json')) {
          if (!options.silent) {
            console.log(`📄 Executing workflow from file: ${input}`);
          }
          
          const result = await executionService.executeWorkflowFromFile(input, params, {
            autoStart: options.autoStart,
            keepAlive: options.keepAlive,
            silent: options.silent,
            simulate: options.simulate
          });
          
          displayExecutionResults(result, options);
          return;
        }

        // 2. Check if it's a named workflow
        const workflowManager = (await import('@intentorch/core')).getWorkflowManager();
        if (await workflowManager.exists(input)) {
          if (!options.silent) {
            console.log(`🏷️  Executing named workflow: "${input}"`);
          }
          
          const result = await executionService.executeNamedWorkflow(input, params, {
            autoStart: options.autoStart,
            keepAlive: options.keepAlive,
            silent: options.silent,
            simulate: options.simulate
          });
          
          displayExecutionResults(result, options);
          return;
        }

        // 3. Natural Language Execution
        if (!options.silent) {
          console.log('🎯 Starting natural language workflow execution');
          console.log(`📝 Query: "${input}"`);
          console.log('\n🔧 Initializing execution service...');
        }
        
        // Check AI configuration
        const aiConfig = await getAIConfig();
        
        if (!aiConfig.provider || !aiConfig.apiKey) {
          console.error('❌ AI configuration not set');
          console.log('\n💡 Please set AI configuration first:');
          console.log(`   ${PROGRAM_NAME} config set provider <openai|deepseek|...>`);
          console.log(`   ${PROGRAM_NAME} config set apiKey <your-api-key>`);
          console.log(`   ${PROGRAM_NAME} config set model <model-name> (optional)`);
          return;
        }

        if (!options.silent) {
          console.log('   Configuring AI provider:', aiConfig.provider);
          console.log('✓ Execution service initialized');
        }

        // Execute natural language query
        const result = await executionService.executeNaturalLanguage(input, {
          autoStart: options.autoStart,
          keepAlive: options.keepAlive,
          silent: options.silent,
          simulate: options.simulate,
          params
        });

        displayExecutionResults(result, options);

        // Ensure process exits
        setTimeout(() => {
          process.exit(0);
        }, 100);

      } catch (error: any) {
        console.error('❌ Workflow execution failed:', error.message);
        console.log('\n💡 Suggestions:');
        console.log('1. Make sure AI configuration is set:');
        console.log(`   ${PROGRAM_NAME} config set provider <openai|deepseek|...>`);
        console.log(`   ${PROGRAM_NAME} config set apiKey <your-api-key>`);
        console.log('2. Make sure required MCP Server is pulled and started:');
        console.log(`   ${PROGRAM_NAME} pull <server-name>`);
        console.log(`   ${PROGRAM_NAME} start <server-name>`);
        console.log('3. Or use --auto-start option');
        process.exit(1);
      }
    });

  return command;
}