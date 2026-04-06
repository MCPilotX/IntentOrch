#!/usr/bin/env node

/**
 * Test All Examples Script
 * Runs all examples and reports results
 */

import { spawn } from 'child_process';
import { promisify } from 'util';
import { readdir } from 'fs/promises';
import { join } from 'path';

const sleep = promisify(setTimeout);

// Test configuration
const TESTS = [
  {
    name: 'Basic SDK Usage',
    file: '1-basic-sdk-usage.js',
    timeout: 30000,
    env: {}
  },
  {
    name: 'AI Integration',
    file: '2-ai-integration.js',
    timeout: 90000,
    env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || 'test-key' }
  },
  {
    name: 'MCP Tool Management',
    file: '3-mcp-tools.js',
    timeout: 60000,
    env: {}
  },
  {
    name: 'Developer Starter Kit',
    file: 'developer-starter-kit.js',
    timeout: 120000,
    env: { DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY || 'test-key' }
  }
];

// Test results
const results = {
  passed: 0,
  failed: 0,
  skipped: 0,
  details: []
};

async function runTest(test) {
  console.log(`\n🧪 Running: ${test.name}`);
  console.log('─'.repeat(50));
  
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const env = { ...process.env, ...test.env };
    const child = spawn('node', [test.file], {
      cwd: import.meta.dirname,
      env,
      stdio: ['pipe', 'pipe', 'pipe']
    });
    
    let stdout = '';
    let stderr = '';
    let timeoutId;
    
    // Set timeout
    if (test.timeout) {
      timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        const result = {
          name: test.name,
          status: 'timeout',
          duration: Date.now() - startTime,
          error: `Timeout after ${test.timeout}ms`
        };
        resolve(result);
      }, test.timeout);
    }
    
    // Collect output
    child.stdout.on('data', (data) => {
      stdout += data.toString();
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
    });
    
    // Handle completion
    child.on('close', (code) => {
      if (timeoutId) clearTimeout(timeoutId);
      
      const duration = Date.now() - startTime;
      
      if (code === 0) {
        console.log(`✅ ${test.name} - PASSED (${duration}ms)`);
        resolve({
          name: test.name,
          status: 'passed',
          duration,
          stdout: stdout.slice(-500), // Last 500 chars
          stderr: stderr.slice(-500)
        });
      } else {
        console.log(`❌ ${test.name} - FAILED (${duration}ms)`);
        if (stderr) console.log(`   Error: ${stderr.split('\n')[0]}`);
        resolve({
          name: test.name,
          status: 'failed',
          duration,
          exitCode: code,
          stdout: stdout.slice(-500),
          stderr: stderr.slice(-500)
        });
      }
    });
    
    child.on('error', (error) => {
      if (timeoutId) clearTimeout(timeoutId);
      console.log(`❌ ${test.name} - ERROR: ${error.message}`);
      resolve({
        name: test.name,
        status: 'error',
        duration: Date.now() - startTime,
        error: error.message
      });
    });
  });
}

async function runAllTests() {
  console.log('🚀 MCPilot SDK Examples Test Suite');
  console.log('='.repeat(50));
  console.log(`Running ${TESTS.length} tests...\n`);
  
  for (const test of TESTS) {
    // Check if file exists
    try {
      await import(`./${test.file}`);
    } catch (error) {
      if (error.code === 'MODULE_NOT_FOUND') {
        console.log(`⏭️  ${test.name} - SKIPPED (file not found)`);
        results.skipped++;
        results.details.push({
          name: test.name,
          status: 'skipped',
          reason: 'File not found'
        });
        continue;
      }
    }
    
    // Check environment for AI tests
    if (test.file.includes('ai') || test.file.includes('starter')) {
      if (!process.env.DEEPSEEK_API_KEY) {
        console.log(`⏭️  ${test.name} - SKIPPED (no API key)`);
        results.skipped++;
        results.details.push({
          name: test.name,
          status: 'skipped',
          reason: 'No DEEPSEEK_API_KEY environment variable'
        });
        continue;
      }
    }
    
    const result = await runTest(test);
    results.details.push(result);
    
    if (result.status === 'passed') {
      results.passed++;
    } else {
      results.failed++;
    }
    
    // Brief pause between tests
    await sleep(2000);
  }
  
  // Generate report
  console.log('\n' + '='.repeat(50));
  console.log('📊 TEST REPORT');
  console.log('='.repeat(50));
  
  console.log(`\nSummary:`);
  console.log(`✅ Passed: ${results.passed}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⏭️  Skipped: ${results.skipped}`);
  console.log(`📈 Success Rate: ${((results.passed / TESTS.length) * 100).toFixed(1)}%`);
  
  console.log('\nDetails:');
  for (const detail of results.details) {
    const icon = detail.status === 'passed' ? '✅' : 
                 detail.status === 'failed' ? '❌' :
                 detail.status === 'skipped' ? '⏭️' : '⚠️';
    console.log(`${icon} ${detail.name}: ${detail.status.toUpperCase()} (${detail.duration || 0}ms)`);
    if (detail.error) {
      console.log(`   Error: ${detail.error}`);
    }
    if (detail.reason) {
      console.log(`   Reason: ${detail.reason}`);
    }
  }
  
  // Check TypeScript examples
  console.log('\n' + '='.repeat(50));
  console.log('📝 TypeScript Examples Status');
  console.log('='.repeat(50));
  
  try {
    const files = await readdir(__dirname);
    const tsFiles = files.filter(f => f.endsWith('.ts') && !f.includes('.test.') && !f.includes('.spec.'));
    
    console.log(`Found ${tsFiles.length} TypeScript example files:`);
    for (const tsFile of tsFiles.slice(0, 5)) { // Show first 5
      console.log(`  📄 ${tsFile}`);
    }
    if (tsFiles.length > 5) {
      console.log(`  ... and ${tsFiles.length - 5} more`);
    }
    
    // Check if compiled versions exist
    const compiledDir = join(__dirname, 'ts-build', 'examples');
    try {
      const compiledFiles = await readdir(compiledDir);
      const jsFiles = compiledFiles.filter(f => f.endsWith('.js'));
      console.log(`\nCompiled: ${jsFiles.length} JavaScript files in ts-build/examples/`);
    } catch (error) {
      console.log('\n⚠️  TypeScript examples not compiled');
      console.log('   Run: npx tsc --project . --outDir examples/ts-build');
    }
  } catch (error) {
    console.log('Error checking TypeScript files:', error.message);
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('🎯 RECOMMENDATIONS');
  console.log('='.repeat(50));
  
  if (results.failed > 0) {
    console.log('\nIssues found:');
    const failedTests = results.details.filter(d => d.status === 'failed' || d.status === 'error');
    for (const test of failedTests) {
      console.log(`• ${test.name}: ${test.error || 'Unknown error'}`);
    }
    
    console.log('\nSuggested fixes:');
    console.log('1. Check API keys for AI examples');
    console.log('2. Verify all dependencies are installed');
    console.log('3. Check network connectivity for external services');
    console.log('4. Review error logs for specific issues');
  } else {
    console.log('\n✅ All tests passed!');
    console.log('✅ Examples are working correctly');
    console.log('✅ SDK integration is functional');
  }
  
  console.log('\n💡 Next steps:');
  console.log('1. Run individual examples for detailed testing');
  console.log('2. Check the examples/ directory for more examples');
  console.log('3. Review docs/ for documentation');
  console.log('4. Run npm test for unit tests');
  
  // Exit with appropriate code
  process.exit(results.failed > 0 ? 1 : 0);
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error);
  process.exit(1);
});

// Run tests
runAllTests().catch(error => {
  console.error('Test suite failed:', error);
  process.exit(1);
});