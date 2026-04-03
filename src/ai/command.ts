/**
 * Simplified AI Command Handler
 * Minimal command interface for AI features
 */

import chalk from 'chalk';
import { SimpleAI, AIError, AskResult } from './ai';
import { SimpleAIConfigManager } from './config';

/**
 * Simplified AI command handler
 */
export class SimpleAICommand {
  private ai: SimpleAI;
  private configManager: SimpleAIConfigManager;
  
  constructor() {
    this.ai = new SimpleAI();
    this.configManager = new SimpleAIConfigManager();
    
    // Load configuration
    this.loadConfiguration();
  }
  
  /**
   * Load configuration from manager
   */
  private async loadConfiguration(): Promise<void> {
    try {
      const config = this.configManager.getConfig();
      if (config.provider !== 'none') {
        await this.ai.configure(config);
      }
    } catch (error: any) {
      console.warn(`Failed to load AI configuration: ${error.message}`);
    }
  }
  
  /**
   * Handle AI command
   */
  async handleCommand(action?: string, ...args: string[]): Promise<void> {
    if (!action) {
      // Show status when no action provided
      await this.showStatus();
      return;
    }
    
    switch (action.toLowerCase()) {
      case 'configure':
        await this.handleConfigure(args);
        break;
        
      case 'test':
        await this.handleTest();
        break;
        
      case 'ask':
        await this.handleAsk(args.join(' '));
        break;
        
      case 'status':
        await this.showStatus();
        break;
        
      case 'reset':
        await this.handleReset();
        break;
        
      case 'help':
        this.showHelp();
        break;
        
      default:
        console.log(chalk.red(`Unknown action: ${action}`));
        this.showHelp();
    }
  }
  
  /**
   * Handle configure command
   */
  private async handleConfigure(args: string[]): Promise<void> {
    try {
      // Parse configuration from arguments
      const config = this.configManager.parseFromArgs(args);
      
      // Update configuration
      await this.configManager.updateConfig(config);
      
      // Configure AI service
      if (config.provider !== 'none') {
        await this.ai.configure(config);
        console.log(chalk.green(`✅ AI configured with provider: ${config.provider}`));
        
        if (config.provider === 'ollama') {
          console.log(chalk.blue('💡 Make sure Ollama service is running: ollama serve'));
        }
      } else {
        this.ai.reset();
        console.log(chalk.yellow('⚠️ AI configuration reset'));
      }
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Configuration failed: ${error.message}`));
      
      if (error.message.includes('OpenAI requires API key')) {
        console.log(chalk.yellow('\n🔧 How to get OpenAI API key:'));
        console.log('  1. Visit: https://platform.openai.com/api-keys');
        console.log('  2. Create new API key');
        console.log('  3. Run: mcp ai configure openai YOUR_API_KEY');
      }
    }
  }
  
  /**
   * Handle test command
   */
  private async handleTest(): Promise<void> {
    const status = this.ai.getStatus();
    
    if (!status.configured) {
      console.log(chalk.yellow('⚠️ AI not configured'));
      console.log('Run: mcp ai configure openai YOUR_API_KEY');
      console.log('Or: mcp ai configure ollama');
      return;
    }
    
    console.log(chalk.blue('🔌 Testing AI connection...'));
    
    try {
      const result = await this.ai.testConnection();
      
      if (result.success) {
        console.log(chalk.green(`✅ ${result.message}`));
      } else {
        console.log(chalk.red(`❌ ${result.message}`));
        
        // Provide suggestions based on provider
        const config = this.configManager.getConfig();
        if (config.provider === 'openai') {
          console.log(chalk.yellow('\n🔧 OpenAI troubleshooting:'));
          console.log('  1. Check internet connection');
          console.log('  2. Verify API key is valid');
          console.log('  3. Check OpenAI service status: https://status.openai.com');
        } else if (config.provider === 'ollama') {
          console.log(chalk.yellow('\n🔧 Ollama troubleshooting:'));
          console.log('  1. Ensure Ollama is installed: https://ollama.com');
          console.log('  2. Start Ollama service: ollama serve');
          console.log('  3. Check if endpoint is correct: http://localhost:11434');
        }
      }
      
    } catch (error: any) {
      console.log(chalk.red(`❌ Test failed: ${error.message}`));
    }
  }
  
  /**
   * Handle ask command
   */
  private async handleAsk(query: string): Promise<void> {
    if (!query) {
      console.log(chalk.yellow('⚠️ Please provide a query'));
      console.log('Example: mcp ai ask "list files in current directory"');
      return;
    }
    
    console.log(chalk.blue(`🤖 Query: "${query}"`));
    
    try {
      const result = await this.ai.ask(query);
      await this.handleAskResult(result);
      
    } catch (error: any) {
      if (error instanceof AIError) {
        console.log(SimpleAI.getFriendlyError(error));
      } else {
        console.log(chalk.red(`❌ Error: ${error.message}`));
      }
    }
  }
  
  /**
   * Handle ask result
   */
  private async handleAskResult(result: AskResult): Promise<void> {
    switch (result.type) {
      case 'tool_call':
        console.log(chalk.green(`✅ Intent recognized (confidence: ${(result.confidence || 0) * 100}%)`));
        console.log(chalk.blue(`🔧 Tool call: ${result.tool?.service}.${result.tool?.tool}`));
        console.log(chalk.gray(`   Parameters: ${JSON.stringify(result.tool?.params)}`));
        
        // In actual implementation, this would execute the tool call
        console.log(chalk.yellow('\n💡 Note: Tool execution would happen here'));
        console.log('   In production, this would call the actual MCP service');
        break;
        
      case 'suggestions':
        console.log(chalk.yellow(`⚠️ ${result.message}`));
        if (result.help) {
          console.log(chalk.blue(result.help));
        }
        
        if (result.suggestions && result.suggestions.length > 0) {
          console.log(chalk.green('\n🔧 Suggested commands:'));
          result.suggestions.forEach((suggestion, i) => {
            console.log(`  ${i + 1}. ${suggestion}`);
          });
        }
        break;
        
      case 'error':
        console.log(chalk.red(`❌ ${result.message}`));
        break;
    }
  }
  
  /**
   * Handle reset command
   */
  private async handleReset(): Promise<void> {
    this.configManager.resetConfig();
    this.ai.reset();
    console.log(chalk.green('✅ AI configuration reset to defaults'));
  }
  
  /**
   * Show AI status
   */
  private async showStatus(): Promise<void> {
    const aiStatus = this.ai.getStatus();
    const configStatus = this.configManager.getStatus();
    
    console.log(chalk.blue('🤖 AI Status:'));
    console.log(`  Enabled: ${aiStatus.enabled ? chalk.green('Yes') : chalk.red('No')}`);
    console.log(`  Provider: ${chalk.cyan(aiStatus.provider)}`);
    console.log(`  Configured: ${configStatus.configured ? chalk.green('Yes') : chalk.yellow('No')}`);
    
    if (configStatus.configured) {
      const config = this.configManager.getConfig();
      console.log(`  Config file: ${chalk.gray(configStatus.configFile)}`);
      
      if (config.provider !== 'none') {
        console.log(chalk.blue('\n🔧 Current configuration:'));
        console.log(this.configManager.formatConfig());
      }
    } else {
      console.log(chalk.yellow('\n💡 AI is not configured'));
      console.log('   To configure: mcp ai configure openai YOUR_API_KEY');
      console.log('   Or use Ollama: mcp ai configure ollama');
    }
    
    // Show test result if configured
    if (aiStatus.configured) {
      console.log(chalk.blue('\n🔌 Connection test:'));
      try {
        const testResult = await this.ai.testConnection();
        console.log(`  Status: ${testResult.success ? chalk.green('OK') : chalk.red('Failed')}`);
        console.log(`  Message: ${testResult.message}`);
      } catch (error: any) {
        console.log(`  Status: ${chalk.red('Error')}`);
        console.log(`  Message: ${error.message}`);
      }
    }
  }
  
  /**
   * Show help
   */
  private showHelp(): void {
    console.log(chalk.blue('🤖 AI Commands:'));
    console.log('');
    console.log(chalk.green('  mcp ai'));
    console.log('    Show AI status');
    console.log('');
    console.log(chalk.green('  mcp ai configure <provider> [options]'));
    console.log('    Configure AI provider');
    console.log('    Providers: openai, ollama, none');
    console.log('    Options:');
    console.log('      --api-key=<key>    API key (for OpenAI)');
    console.log('      --endpoint=<url>   Custom endpoint');
    console.log('      --model=<name>     Model name');
    console.log('');
    console.log(chalk.green('  mcp ai test'));
    console.log('    Test AI connection');
    console.log('');
    console.log(chalk.green('  mcp ai ask "<query>"'));
    console.log('    Ask AI a question');
    console.log('    Example: mcp ai ask "list files in current directory"');
    console.log('');
    console.log(chalk.green('  mcp ai reset'));
    console.log('    Reset AI configuration to defaults');
    console.log('');
    console.log(chalk.green('  mcp ai help'));
    console.log('    Show this help message');
    console.log('');
    console.log(chalk.yellow('💡 Examples:'));
    console.log('  Configure OpenAI: mcp ai configure openai sk-xxx');
    console.log('  Configure Ollama: mcp ai configure ollama');
    console.log('  Ask question:    mcp ai ask "start http service"');
    console.log('  Test connection: mcp ai test');
  }
  
  /**
   * Get AI instance (for integration with other modules)
   */
  getAIInstance(): SimpleAI {
    return this.ai;
  }
  
  /**
   * Get config manager instance
   */
  getConfigManager(): SimpleAIConfigManager {
    return this.configManager;
  }
}