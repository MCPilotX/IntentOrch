import chalk from 'chalk';
import { PROVIDER_DB, getProviderDisplayName } from './providers';
export class AIErrorHandler {
    static handleError(error) {
        console.log(chalk.red(`❌ ${error.message}`));
        // Provide different repair suggestions based on error type
        const suggestions = this.getSuggestions(error);
        if (suggestions.length > 0) {
            console.log(chalk.yellow('\n🔧 Repair suggestions:'));
            suggestions.forEach((suggestion, index) => {
                console.log(`  ${index + 1}. ${suggestion}`);
            });
        }
        // Provide next steps
        console.log(chalk.blue('\n📝 Next steps:'));
        this.printNextSteps(error);
    }
    static getSuggestions(error) {
        const suggestions = [];
        switch (error.type) {
            case 'config':
                suggestions.push('Check configuration file format is correct');
                suggestions.push('Ensure all required fields are filled');
                if (error.provider) {
                    const providerInfo = PROVIDER_DB[error.provider];
                    if (providerInfo?.configHint) {
                        suggestions.push(providerInfo.configHint);
                    }
                }
                break;
            case 'connection':
                suggestions.push('Check network connection is normal');
                suggestions.push('Confirm API endpoint is accessible');
                if (error.provider === 'ollama') {
                    suggestions.push('Ensure Ollama service is running: ollama serve');
                    suggestions.push('Check Ollama host address: http://localhost:11434');
                }
                break;
            case 'authentication':
                suggestions.push('Check API key is correct');
                suggestions.push('Confirm API key has sufficient permissions');
                suggestions.push('Try generating a new API key');
                if (error.provider) {
                    suggestions.push(`Visit ${this.getProviderWebsite(error.provider)} to manage API keys`);
                }
                break;
            case 'validation':
                suggestions.push('Check input parameters meet requirements');
                suggestions.push('Confirm model name is correct');
                suggestions.push('View provider documentation to understand parameter limits');
                break;
            case 'unknown':
                suggestions.push('View detailed error logs: mcp logs');
                suggestions.push('Try restarting MCPilot services');
                suggestions.push('Check system resources are sufficient');
                break;
        }
        // Add general suggestions
        if (error.provider) {
            suggestions.push(`View ${getProviderDisplayName(error.provider)} configuration help: mcp ai help ${error.provider}`);
        }
        return suggestions;
    }
    static printNextSteps(error) {
        console.log(`  • Reconfigure: ${chalk.cyan('mcp ai use <provider>')}`);
        if (error.provider) {
            console.log(`  • Test connection: ${chalk.cyan('mcp ai test')}`);
            console.log(`  • View configuration: ${chalk.cyan('mcp ai config')}`);
        }
        console.log(`  • View help: ${chalk.cyan('mcp ai --help')}`);
        if (error.type === 'config' || error.type === 'validation') {
            console.log(`  • View providers: ${chalk.cyan('mcp ai providers')}`);
        }
        if (error.details) {
            console.log(chalk.gray(`\n💡 Detailed error information: ${JSON.stringify(error.details, null, 2)}`));
        }
    }
    static getProviderWebsite(provider) {
        const websites = {
            openai: 'https://platform.openai.com/api-keys',
            anthropic: 'https://console.anthropic.com/keys',
            google: 'https://makersuite.google.com/app/apikey',
            azure: 'https://portal.azure.com/#create/Microsoft.CognitiveServicesOpenAI',
            deepseek: 'https://platform.deepseek.com/api-keys',
            cohere: 'https://dashboard.cohere.com/api-keys',
            ollama: 'https://ollama.com',
            local: '',
            custom: '',
            none: '',
        };
        return websites[provider] || '';
    }
    // Handle provider name errors
    static handleProviderError(input, similarProviders) {
        console.log(chalk.red(`❌ Unknown AI provider: '${input}'`));
        if (similarProviders && similarProviders.length > 0) {
            console.log(chalk.yellow('\n🔍 Similar providers:'));
            similarProviders.forEach((similar, index) => {
                const providerInfo = PROVIDER_DB[similar.provider];
                const displayName = providerInfo?.name || similar.provider;
                console.log(`  • ${chalk.cyan(displayName)} (similarity ${similar.similarity}%)`);
            });
        }
        console.log(chalk.blue('\n📋 Supported providers:'));
        const providerList = Object.entries(PROVIDER_DB)
            .map(([id, info]) => `${chalk.cyan(id)} - ${info.description}`)
            .join('\n  ');
        console.log(`  ${providerList}`);
        console.log(chalk.green('\n💡 Use the following commands:'));
        console.log(`  • View all providers: ${chalk.cyan('mcp ai providers')}`);
        console.log(`  • Configure provider: ${chalk.cyan('mcp ai use <provider>')}`);
    }
    // Handle model name errors
    static handleModelError(provider, model, availableModels) {
        const providerInfo = PROVIDER_DB[provider];
        const displayName = providerInfo?.name || provider;
        console.log(chalk.red(`❌ ${displayName} does not support model: '${model}'`));
        if (availableModels && availableModels.length > 0) {
            console.log(chalk.yellow('\n📋 Available models:'));
            availableModels.forEach(availableModel => {
                const description = providerInfo?.modelDescriptions?.[availableModel] || '';
                console.log(`  • ${chalk.cyan(availableModel)} ${description ? `- ${description}` : ''}`);
            });
        }
        else if (providerInfo?.modelDescriptions) {
            console.log(chalk.yellow('\n📋 Common models:'));
            Object.entries(providerInfo.modelDescriptions).forEach(([modelName, description]) => {
                console.log(`  • ${chalk.cyan(modelName)} - ${description}`);
            });
        }
        console.log(chalk.green('\n💡 Use the following commands:'));
        console.log(`  • View all models: ${chalk.cyan(`mcp ai models ${provider}`)}`);
        console.log(`  • Use default model: ${chalk.cyan(`mcp ai use ${provider}`)}`);
    }
    // Handle API key errors
    static handleApiKeyError(provider) {
        const providerInfo = PROVIDER_DB[provider];
        const displayName = providerInfo?.name || provider;
        console.log(chalk.red(`❌ ${displayName} requires API key`));
        console.log(chalk.yellow('\n🔑 How to get API key:'));
        switch (provider) {
            case 'openai':
                console.log('  1. Visit https://platform.openai.com/api-keys');
                console.log('  2. Login or register OpenAI account');
                console.log('  3. Create new API key');
                console.log('  4. Key format: sk-xxx...');
                break;
            case 'deepseek':
                console.log('  1. Visit https://platform.deepseek.com/api-keys');
                console.log('  2. Login or register DeepSeek account');
                console.log('  3. Create new API key');
                console.log('  4. Key format: sk-xxx or obtain from platform');
                break;
            case 'anthropic':
                console.log('  1. Visit https://console.anthropic.com/keys');
                console.log('  2. Login or register Anthropic account');
                console.log('  3. Create new API key');
                console.log('  4. Key format: sk-ant-xxx...');
                break;
            case 'cohere':
                console.log('  1. Visit https://dashboard.cohere.com/api-keys');
                console.log('  2. Login or register Cohere account');
                console.log('  3. Create new API key');
                break;
            default:
                console.log(`  Please visit ${displayName} official website to get API key`);
        }
        console.log(chalk.green('\n💡 Configuration method:'));
        console.log(`  • Direct configuration: ${chalk.cyan(`mcp ai use ${provider} <your-api-key>`)}`);
        console.log(`  • Environment variable: ${chalk.cyan(`export ${this.getEnvVarName(provider)}=<your-api-key>`)}`);
    }
    static getEnvVarName(provider) {
        const envVars = {
            openai: 'OPENAI_API_KEY',
            anthropic: 'ANTHROPIC_API_KEY',
            google: 'GOOGLE_API_KEY',
            azure: 'AZURE_OPENAI_API_KEY',
            deepseek: 'DEEPSEEK_API_KEY',
            cohere: 'COHERE_API_KEY',
            ollama: '',
            local: '',
            custom: '',
            none: '',
        };
        return envVars[provider] || `${provider.toUpperCase()}_API_KEY`;
    }
    // Handle connection test results
    static handleTestResult(success, provider, details) {
        if (success) {
            if (provider) {
                const providerInfo = PROVIDER_DB[provider];
                const displayName = providerInfo?.name || provider;
                console.log(chalk.green(`✅ ${displayName} connection test successful!`));
            }
            else {
                console.log(chalk.green('✅ AI connection test successful!'));
            }
            if (details) {
                console.log(chalk.gray('\n📊 Test details:'));
                console.log(JSON.stringify(details, null, 2));
            }
        }
        else {
            console.log(chalk.red('❌ AI connection test failed'));
            if (details?.error) {
                const error = {
                    type: 'connection',
                    message: details.error.message || 'Connection failed',
                    provider,
                    details: details.error,
                };
                this.handleError(error);
            }
        }
    }
}
//# sourceMappingURL=error-ai.js.map