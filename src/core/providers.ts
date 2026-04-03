import { AIProvider } from './types';

export interface ProviderInfo {
  name: string;
  description: string;
  aliases: string[];
  requiresApiKey: boolean;
  defaultModel: string;
  modelDescriptions?: Record<string, string>;
  configHint?: string;
}

export const PROVIDER_DB: Record<AIProvider, ProviderInfo> = {
  openai: {
    name: 'OpenAI',
    description: 'OpenAI GPT series models (ChatGPT, GPT-4, etc.)',
    aliases: ['gpt', 'chatgpt', 'open-ai', 'openaai', 'openni'],
    requiresApiKey: true,
    defaultModel: 'gpt-4',
    modelDescriptions: {
      'gpt-4': 'Latest GPT-4, most capable',
      'gpt-4-turbo': 'Balanced performance and cost',
      'gpt-3.5-turbo': 'Fast response, low cost',
      'gpt-4o': 'Multimodal support',
      'gpt-4-mini': 'Lightweight version of GPT-4'
    },
    configHint: 'API key format: sk-xxx...'
  },
  anthropic: {
    name: 'Anthropic',
    description: 'Anthropic Claude models',
    aliases: ['claude', 'anthropic-ai', 'claud'],
    requiresApiKey: true,
    defaultModel: 'claude-3-opus-20240229',
    modelDescriptions: {
      'claude-3-opus-20240229': 'Most capable',
      'claude-3-sonnet-20240229': 'Balanced performance',
      'claude-3-haiku-20240307': 'Fast response'
    },
    configHint: 'API key format: sk-ant-xxx...'
  },
  deepseek: {
    name: 'DeepSeek',
    description: 'DeepSeek open source models',
    aliases: ['deep', 'ds', 'deep-seek', 'deepsek', 'deepseak'],
    requiresApiKey: true,
    defaultModel: 'deepseek-chat',
    modelDescriptions: {
      'deepseek-chat': 'Conversation optimized',
      'deepseek-coder': 'Code generation optimized',
      'deepseek-v3': 'Latest version'
    },
    configHint: 'API key format: sk-xxx or obtain from platform'
  },
  cohere: {
    name: 'Cohere',
    description: 'Cohere command models',
    aliases: ['co', 'cohere-ai', 'coher'],
    requiresApiKey: true,
    defaultModel: 'command',
    modelDescriptions: {
      'command': 'General instruction model',
      'command-r': 'Reasoning optimized',
      'command-light': 'Lightweight version'
    }
  },
  ollama: {
    name: 'Ollama',
    description: 'Local Ollama services',
    aliases: ['oll', 'local-llm', 'llama', 'ollamaa', 'olama'],
    requiresApiKey: false,
    defaultModel: 'llama2',
    modelDescriptions: {
      'llama2': 'General model, balanced',
      'llama3': 'Latest Llama 3',
      'codellama': 'Code generation optimized',
      'mistral': 'Small and efficient model',
      'gemma': 'Google lightweight model',
      'phi': 'Microsoft small model'
    },
    configHint: 'Ensure Ollama services are running at http://localhost:11434'
  },
  local: {
    name: 'Local',
    description: 'Local model files',
    aliases: ['local-model', 'file', 'local-ai'],
    requiresApiKey: false,
    defaultModel: 'local-model',
    configHint: 'Need to specify local model file path'
  },
  custom: {
    name: 'Custom',
    description: 'Custom API endpoints',
    aliases: ['custom-api', 'self-hosted', 'custom-endpoint'],
    requiresApiKey: false,
    defaultModel: 'custom-model',
    configHint: 'Need to specify API endpoint URL'
  }
};

export const VALID_PROVIDERS = Object.keys(PROVIDER_DB) as AIProvider[];

// Get display names for all providers
export function getProviderDisplayName(provider: AIProvider): string {
  return PROVIDER_DB[provider]?.name || provider;
}

// Get provider information
export function getProviderInfo(provider: AIProvider): ProviderInfo | undefined {
  return PROVIDER_DB[provider];
}

// Find provider by alias
export function findProviderByAlias(alias: string): AIProvider | null {
  const normalized = alias.toLowerCase().trim();
  
  // Exact match
  if (PROVIDER_DB[normalized as AIProvider]) {
    return normalized as AIProvider;
  }
  
  // Alias match
  for (const [provider, info] of Object.entries(PROVIDER_DB)) {
    if (info.aliases.includes(normalized)) {
      return provider as AIProvider;
    }
  }
  
  return null;
}

// Calculate string similarity (Levenshtein distance)
export function levenshteinDistance(a: string, b: string): number {
  const matrix = [];
  
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // Replace
          matrix[i][j - 1] + 1,     // Insert
          matrix[i - 1][j] + 1      // Delete
        );
      }
    }
  }
  
  return matrix[b.length][a.length];
}

// Find most similar providers
export function findSimilarProviders(input: string, threshold: number = 2): Array<{
  provider: AIProvider;
  similarity: number;
  distance: number;
}> {
  const normalized = input.toLowerCase().trim();
  const results: Array<{provider: AIProvider, similarity: number, distance: number}> = [];
  
  // Check all providers
  for (const provider of VALID_PROVIDERS) {
    // Calculate distance to provider name
    const distanceToName = levenshteinDistance(normalized, provider);
    
    // Calculate distance to alias
    let minDistance = distanceToName;
    const providerInfo = PROVIDER_DB[provider];
    
    for (const alias of providerInfo.aliases) {
      const distanceToAlias = levenshteinDistance(normalized, alias);
      if (distanceToAlias < minDistance) {
        minDistance = distanceToAlias;
      }
    }
    
    // Convert to similarity percentage (distance 0 = 100%, decrease 25% for each additional distance)
    const similarity = Math.max(0, 100 - minDistance * 25);
    
    if (minDistance <= threshold) {
      results.push({
        provider,
        similarity,
        distance: minDistance
      });
    }
  }
  
  // Sort by similarity
  return results.sort((a, b) => {
    // First sort by distance (smaller distance first)
    if (a.distance !== b.distance) {
      return a.distance - b.distance;
    }
    // Then sort by similarity (higher similarity first)
    return b.similarity - a.similarity;
  });
}

// Auto-correct provider name
export function autoCorrectProvider(input: string): {
  corrected: AIProvider | null;
  original: string;
  confidence: number;
  suggestions: AIProvider[];
} {
  const normalized = input.toLowerCase().trim();
  
  // 1. Exact match
  if (PROVIDER_DB[normalized as AIProvider]) {
    return {
      corrected: normalized as AIProvider,
      original: input,
      confidence: 100,
      suggestions: []
    };
  }
  
  // 2. Alias match
  const aliasMatch = findProviderByAlias(normalized);
  if (aliasMatch) {
    return {
      corrected: aliasMatch,
      original: input,
      confidence: 90,
      suggestions: []
    };
  }
  
  // 3. Fuzzy match
  const similar = findSimilarProviders(normalized, 3);
  if (similar.length > 0) {
    const bestMatch = similar[0];
    const suggestions = similar.slice(1, 3).map(s => s.provider);
    
    return {
      corrected: bestMatch.provider,
      original: input,
      confidence: Math.max(30, bestMatch.similarity),
      suggestions
    };
  }
  
  // 4. No match
  return {
    corrected: null,
    original: input,
    confidence: 0,
    suggestions: []
  };
}

// Get default configuration for provider
export function getDefaultConfigForProvider(provider: AIProvider): any {
  const info = PROVIDER_DB[provider];
  if (!info) return null;
  
  const baseConfig = {
    provider,
    model: info.defaultModel
  };
  
  // Add specific provider default configuration
  switch (provider) {
    case 'ollama':
      return {
        ...baseConfig,
        ollamaHost: 'http://localhost:11434',
        timeout: 60000,
        maxTokens: 4096,
        temperature: 0.7
      };
    case 'local':
      return {
        ...baseConfig,
        localModelPath: '',
        timeout: 120000,
        maxTokens: 4096,
        temperature: 0.7
      };
    case 'custom':
      return {
        ...baseConfig,
        apiEndpoint: 'http://localhost:8080/v1/chat/completions',
        timeout: 30000,
        maxTokens: 2048,
        temperature: 0.7
      };
    default:
      return {
        ...baseConfig,
        timeout: 30000,
        maxTokens: 2048,
        temperature: 0.7
      };
  }
}

// Get list of all providers (for display)
export function getAllProvidersForDisplay(): Array<{
  id: AIProvider;
  name: string;
  description: string;
  requiresKey: boolean;
  defaultModel: string;
}> {
  return VALID_PROVIDERS.map(provider => ({
    id: provider,
    name: PROVIDER_DB[provider].name,
    description: PROVIDER_DB[provider].description,
    requiresKey: PROVIDER_DB[provider].requiresApiKey,
    defaultModel: PROVIDER_DB[provider].defaultModel
  }));
}