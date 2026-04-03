import * as os from 'os';
import * as path from 'path';

export const MCPILOT_HOME = path.join(os.homedir(), '.mcpilot');
export const MCPILOT_DIR = MCPILOT_HOME; // Alias for backward compatibility
export const SOCKET_PATH = path.join(MCPILOT_HOME, 'run', 'mcp.sock');
export const LOGS_DIR = path.join(MCPILOT_HOME, 'logs');
export const SERVERS_DIR = path.join(MCPILOT_HOME, 'servers');
export const VENVS_DIR = path.join(MCPILOT_HOME, 'venvs');
export const CONFIG_PATH = path.join(MCPILOT_HOME, 'config.json');

export const DEFAULT_CONFIG = {
  ai: {
    enabled: true, // Whether to enable AI functionality
    provider: 'deepseek',
    model: 'deepseek-v3',
    apiKey: '',
    timeout: 30000, // 30 second timeout
    maxTokens: 2048,
    temperature: 0.7,
    // Embedding-specific configuration
    embeddingProvider: '',
    embeddingApiKey: '',
    embeddingModel: '',
    embeddingEndpoint: '',
    useLocalEmbeddings: false, // Whether to use local transformers for text embedding
    useVectorSearch: true, // Whether to use vector search
    transformersTimeout: 5000, // Transformers loading timeout (milliseconds)
    fallbackMode: 'lightweight' // Fallback mode: 'lightweight' | 'simple' | 'disabled'
  },
  registry: {
    preferred: 'gitee-mcp',
  },
  services: {
    autoStart: ['filesystem'],
    defaultTimeout: 60000, // 60 second default timeout
  }
};
