import chalk from 'chalk';
import { AIProvider } from './types';
import {
  PROVIDER_DB,
  autoCorrectProvider,
  findSimilarProviders,
  getDefaultConfigForProvider,
  getProviderDisplayName,
} from './providers';
import { AIErrorHandler } from './error-ai';
import { ConfigValidator } from './config-validator';
import { CONFIG_PATH } from './constants';
import * as fs from 'fs';
import * as readline from 'readline';

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

export interface AIConfig {
  provider: AIProvider;
  apiKey?: string;
  model?: string;
  options?: {
    apiEndpoint?: string;
    ollamaHost?: string;
    localModelPath?: string;
    timeout?: number;
    maxTokens?: number;
    temperature?: number;
  };
}

export class AIConfigParser {
  // Parse simple command: mcp ai use openai sk-xxx [model]
  static parse(args: string[]): AIConfig | null {
    if (args.length === 0) {
      return null;
    }

    const inputProvider = args[0];
    let apiKey: string | undefined;
    let model: string | undefined;

    // Try to correct provider name
    const correction = autoCorrectProvider(inputProvider);

    if (!correction.corrected) {
      // Provider name error, show error message
      const similar = findSimilarProviders(inputProvider, 3);
      AIErrorHandler.handleProviderError(inputProvider, similar);
      return null;
    }

    const provider = correction.corrected;

    // If corrected, ask user for confirmation
    if (correction.confidence < 100 && correction.confidence >= 30) {
      console.log(chalk.yellow(`🤖 Detected possible spelling error: '${inputProvider}'`));
      console.log(chalk.cyan(`🔍 Did you mean to enter: '${provider}'?`));

      // In actual implementation, we should ask user for confirmation
      // For simplicity, we assume user accepts the correction
      console.log(chalk.green(`✅ Auto-corrected to: ${provider}`));
    }

    // Parse API key and model
    if (args.length >= 2) {
      // Second argument could be API key or model
      const secondArg = args[1];
      const providerInfo = PROVIDER_DB[provider];

      // Check if second argument is a known model for this provider
      const isKnownModel = providerInfo.modelDescriptions &&
                          secondArg in providerInfo.modelDescriptions;

      // Check if it's an API key
      const looksLikeKey = this.looksLikeApiKey(secondArg);

      if (providerInfo.requiresApiKey) {
        if (looksLikeKey && !isKnownModel) {
          // Looks like an API key and not a known model
          apiKey = secondArg;

          // Third argument could be model
          if (args.length >= 3) {
            model = args[2];
          }
        } else {
          // Either doesn't look like API key or is a known model name
          model = secondArg;

          // If provider requires API key but we're treating second arg as model,
          // check if it might be intended as an API key
          if (!isKnownModel && secondArg.length < 10 && !secondArg.startsWith('sk-')) {
            console.log(chalk.yellow(`⚠️  Note: '${secondArg}' is being treated as a model name.`));
            console.log(chalk.yellow('   If it\'s an API key, make sure it\'s at least 10 characters long'));
            console.log(chalk.yellow('   or starts with \'sk-\' (like \'sk-xxx...\').'));
          }
        }
      } else {
        // Provider doesn't require API key, so second argument must be model
        model = secondArg;
      }
    }

    // Use default model if not specified
    if (!model) {
      model = PROVIDER_DB[provider].defaultModel;
    }

    return {
      provider,
      apiKey,
      model,
      options: {},
    };
  }

  // Check if string looks like an API key
  private static looksLikeApiKey(str: string): boolean {
    // OpenAI: sk-xxx
    if (str.startsWith('sk-')) {return true;}

    // Anthropic: sk-ant-xxx
    if (str.startsWith('sk-ant-')) {return true;}

    // Cohere and other providers: various formats
    // Generic: contains at least 10 characters, may contain alphanumeric and hyphens
    if (str.length >= 10 && /^[a-zA-Z0-9_-]+$/.test(str)) {return true;}

    return false;
  }

  // Apply configuration to system
  static async applyConfig(config: AIConfig, confirm: boolean = true): Promise<boolean> {
    try {
      // Read current configuration
      let currentConfig;
      if (fs.existsSync(CONFIG_PATH)) {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
        currentConfig = JSON.parse(configData);
      } else {
        currentConfig = ConfigValidator.getDefaultConfig();
      }

      // Get default configuration for provider
      const defaultProviderConfig = getDefaultConfigForProvider(config.provider);

      // Build new AI configuration
      const newAIConfig = {
        ...defaultProviderConfig,
        ...(config.apiKey && { apiKey: config.apiKey }),
        ...(config.model && { model: config.model }),
        ...config.options,
      };

      // Verify configuration
      const validatedAIConfig = ConfigValidator.validateAIConfig(newAIConfig);

      // Update complete configuration
      currentConfig.ai = validatedAIConfig;

      // If confirmation needed, show configuration summary
      if (confirm) {
        console.log(chalk.blue('\n📋 Configuration summary:'));
        console.log(chalk.gray('='.repeat(40)));
        console.log(`Provider: ${chalk.cyan(getProviderDisplayName(config.provider))}`);
        console.log(`Model: ${chalk.cyan(validatedAIConfig.model)}`);

        if (validatedAIConfig.apiKey) {
          const maskedKey = '***' + validatedAIConfig.apiKey.slice(-4);
          console.log(`API key: ${chalk.green(maskedKey)}`);
        }

        if (validatedAIConfig.apiEndpoint) {
          console.log(`API endpoint: ${chalk.cyan(validatedAIConfig.apiEndpoint)}`);
        }

        if (validatedAIConfig.ollamaHost) {
          console.log(`Ollama host: ${chalk.cyan(validatedAIConfig.ollamaHost)}`);
        }

        if (validatedAIConfig.localModelPath) {
          console.log(`Local model path: ${chalk.cyan(validatedAIConfig.localModelPath)}`);
        }

        console.log(chalk.gray('='.repeat(40)));

        const answer = await question('\nConfirm applying this configuration? (y/N): ');
        if (answer.toLowerCase() !== 'y') {
          console.log(chalk.yellow('Configuration cancelled'));
          return false;
        }
      }

      // Save configuration
      const validatedConfig = ConfigValidator.validate(currentConfig);
      fs.writeFileSync(CONFIG_PATH, JSON.stringify(validatedConfig, null, 2));

      console.log(chalk.green('\n✅ AI configuration updated!'));

      // Show configuration details
      this.showConfigSummary(validatedConfig.ai, config.provider);

      return true;

    } catch (error: any) {
      AIErrorHandler.handleError({
        type: 'config',
        message: `Configuration failed: ${error.message}`,
        provider: config.provider,
        details: error,
      });
      return false;
    }
  }

  // Show configuration summary
  private static showConfigSummary(aiConfig: any, provider: AIProvider): void {
    const providerInfo = PROVIDER_DB[provider];

    console.log(chalk.blue('\n🎯 Configuration details:'));
    console.log(chalk.gray('='.repeat(40)));

    console.log(`🤖 ${providerInfo.name}`);
    console.log(`  Model: ${chalk.cyan(aiConfig.model)}`);

    if (aiConfig.apiKey) {
      console.log(`  API key: ${chalk.green('Configured')}`);
    }

    if (aiConfig.timeout) {
      console.log(`  Timeout: ${chalk.cyan(aiConfig.timeout + 'ms')}`);
    }

    if (aiConfig.maxTokens) {
      console.log(`  Max tokens: ${chalk.cyan(aiConfig.maxTokens)}`);
    }

    if (aiConfig.temperature !== undefined) {
      console.log(`  Temperature: ${chalk.cyan(aiConfig.temperature)}`);
    }

    console.log(chalk.gray('='.repeat(40)));

    console.log(chalk.green('\n💡 Next steps:'));
    console.log(`  • Test connection: ${chalk.cyan('mcp ai test')}`);
    console.log(`  • Use AI: ${chalk.cyan('mcp ai "your question"')}`);
    console.log(`  • View configuration: ${chalk.cyan('mcp ai config')}`);
  }

  // Show current AI status
  static showAIStatus(): void {
    try {
      let config;
      if (fs.existsSync(CONFIG_PATH)) {
        const configData = fs.readFileSync(CONFIG_PATH, 'utf-8');
        config = JSON.parse(configData);
        config = ConfigValidator.validate(config);
      } else {
        config = ConfigValidator.getDefaultConfig();
      }

      const aiConfig = config.ai;
      const provider = aiConfig.provider as AIProvider;
      const providerInfo = PROVIDER_DB[provider];

      console.log(chalk.blue('\n🤖 AI configuration status'));
      console.log(chalk.gray('='.repeat(50)));

      if (providerInfo) {
        console.log(`Provider: ${chalk.cyan(providerInfo.name)}`);
        console.log(`Status: ${chalk.green('Configured')}`);
        console.log(`Model: ${chalk.cyan(aiConfig.model)}`);

        if (aiConfig.apiKey) {
          console.log(`API key: ${chalk.green('Set')}`);
        } else if (providerInfo.requiresApiKey) {
          console.log(`API key: ${chalk.yellow('Not set')}`);
        }

        // Show specific configuration
        if (aiConfig.apiEndpoint) {
          console.log(`API endpoint: ${chalk.cyan(aiConfig.apiEndpoint)}`);
        }

        if (aiConfig.ollamaHost) {
          console.log(`Ollama host: ${chalk.cyan(aiConfig.ollamaHost)}`);
        }

        if (aiConfig.localModelPath) {
          console.log(`Local model: ${chalk.cyan(aiConfig.localModelPath)}`);
        }
      } else {
        console.log(`Provider: ${chalk.yellow(provider)}`);
        console.log(`Status: ${chalk.yellow('Unknown provider')}`);
      }

      console.log(chalk.gray('='.repeat(50)));

      console.log(chalk.green('\n💡 Available commands:'));
      console.log(`  • Configure AI: ${chalk.cyan('mcp ai use <provider> [api-key] [model]')}`);
      console.log(`  • Test connection: ${chalk.cyan('mcp ai test')}`);
      console.log(`  • View providers: ${chalk.cyan('mcp ai providers')}`);
      console.log(`  • Use AI: ${chalk.cyan('mcp ai "your question"')}`);

    } catch (error: any) {
      console.log(chalk.red(`❌ Unable to read configuration: ${error.message}`));
      console.log(chalk.yellow('\n💡 Try reconfiguring:'));
      console.log('  mcp ai use openai <your-api-key>');
    }
  }

  // List all providers
  static listProviders(): void {
    console.log(chalk.blue('\n📋 Supported AI providers'));
    console.log(chalk.gray('='.repeat(60)));

    Object.entries(PROVIDER_DB).forEach(([id, info], index) => {
      console.log(chalk.yellow(`\n${index + 1}. ${info.name} (${chalk.cyan(id)})`));
      console.log(`   ${info.description}`);

      if (info.requiresApiKey) {
        console.log(`   🔑 Requires API key: ${chalk.yellow('Yes')}`);
      } else {
        console.log(`   🔑 Requires API key: ${chalk.green('No')}`);
      }

      console.log(`   🤖 Default model: ${chalk.cyan(info.defaultModel)}`);

      if (info.aliases.length > 0) {
        console.log(`   🔤 Aliases: ${chalk.gray(info.aliases.join(', '))}`);
      }

      if (info.configHint) {
        console.log(`   💡 ${info.configHint}`);
      }
    });

    console.log(chalk.gray('='.repeat(60)));

    console.log(chalk.green('\n💡 Usage examples:'));
    console.log(`  • Configure OpenAI: ${chalk.cyan('mcp ai use openai sk-xxx')}`);
    console.log(`  • Configure Ollama: ${chalk.cyan('mcp ai use ollama')}`);
    console.log(`  • Specify model: ${chalk.cyan('mcp ai use openai sk-xxx gpt-3.5-turbo')}`);
  }

  // List provider's models
  static listModels(providerInput?: string): void {
    if (!providerInput) {
      console.log(chalk.yellow('Please specify provider, for example:'));
      console.log(`  ${chalk.cyan('mcp ai models openai')}`);
      console.log(`  ${chalk.cyan('mcp ai models ollama')}`);
      console.log(chalk.green('\nAvailable providers:'));
      console.log(`  ${Object.keys(PROVIDER_DB).join(', ')}`);
      return;
    }

    // Try to correct provider name
    const correction = autoCorrectProvider(providerInput);

    if (!correction.corrected) {
      const similar = findSimilarProviders(providerInput, 3);
      AIErrorHandler.handleProviderError(providerInput, similar);
      return;
    }

    const provider = correction.corrected;
    const providerInfo = PROVIDER_DB[provider];

    console.log(chalk.blue(`\n📋 ${providerInfo.name} available models`));
    console.log(chalk.gray('='.repeat(50)));

    if (providerInfo.modelDescriptions) {
      Object.entries(providerInfo.modelDescriptions).forEach(([model, description]) => {
        const isDefault = model === providerInfo.defaultModel;
        console.log(`  • ${chalk.cyan(model)} ${isDefault ? chalk.green('(default)') : ''}`);
        console.log(`    ${description}`);
      });
    } else {
      console.log(`  ${chalk.yellow('This provider has no predefined model list')}`);
      console.log(`  ${chalk.gray('Please check provider documentation for available models')}`);
    }

    console.log(chalk.gray('='.repeat(50)));

    console.log(chalk.green('\n💡 Configuration examples:'));
    console.log(`  • Use default model: ${chalk.cyan(`mcp ai use ${provider}`)}`);
    console.log(`  • Specify model: ${chalk.cyan(`mcp ai use ${provider} [api-key] <model-name>`)}`);
  }

  // Close readline interface
  static close(): void {
    rl.close();
  }
}
