import axios from 'axios';
import type { AxiosInstance } from 'axios';
import type {
  MCPServer,
  ProcessInfo,
  Config,
  Secret,
  Workflow,
  SystemStats,
  PullServerRequest,
  StartServerRequest,
  StopProcessRequest,
  UpdateConfigRequest,
  CreateSecretRequest,
  ExecuteWorkflowRequest,
  Notification,
  NotificationStats,
} from '../types';

const API_BASE_URL = 'http://localhost:9658'; // Daemon runs on port 9658

class ApiService {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_BASE_URL,
      timeout: 60000,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      async (config) => {
        // 1. Prioritize token from URL (one-time injection from CLI)
        const urlParams = new URLSearchParams(window.location.search);
        const urlToken = urlParams.get('token');
        if (urlToken) {
          localStorage.setItem('auth_token', urlToken);
          // Clean up URL to avoid leakage in history
          window.history.replaceState({}, document.title, window.location.pathname);
        }

        // 2. Add authentication token if available
        let token = localStorage.getItem('auth_token');
        
        // 3. If no token, try to get one from daemon automatically
        if (!token && config.url !== '/api/auth/token') {
          try {
            console.log('[ApiService] No auth token found, attempting to get one from daemon...');
            const tokenResponse = await axios.get(`${API_BASE_URL}/api/auth/token`, {
              timeout: 3000
            });
            
            if (tokenResponse.data && tokenResponse.data.token) {
              token = tokenResponse.data.token;
              if (token) {
                localStorage.setItem('auth_token', token);
                console.log('[ApiService] Successfully obtained and stored auth token');
              }
            }
          } catch (error) {
            console.warn('[ApiService] Failed to get auth token from daemon:', error);
            // Don't throw here, just continue without token
          }
        }

        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => {
        return Promise.reject(error);
      }
    );

    // Response interceptor - flattening the Daemon response
    this.client.interceptors.response.use(
      (response) => response.data,
      (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('auth_token');
          // Optional: redirect to login or show alert
        }
        console.error('API Error:', error.response?.data || error.message);
        return Promise.reject(error.response?.data || error.message);
      }
    );
  }

  // Server management
  async getServers(): Promise<MCPServer[]> {
    const response = await this.client.get('/api/servers') as any;
    const servers = response.servers || [];
    // Map backend server objects to MCPServer interface
    return servers.map((server: any) => {
      // Handle different backend response formats
      const serverName = server.manifest?.name || server.name || server.serverName || 'unknown';
      const version = server.manifest?.version || server.version || 'unknown';
      const description = server.manifest?.description || server.description || '';
      const runtime = server.manifest?.runtime || server.runtime || {
        type: 'unknown',
        command: '',
        args: [],
        env: []
      };
      
      return {
        id: server.pid?.toString() || server.id || '0',
        name: serverName,
        version: version,
        description: description,
        runtime: runtime,
        capabilities: server.manifest?.capabilities || server.capabilities || {},
        status: server.status || 'stopped',
        lastStartedAt: server.startTime
      };
    });
  }

  async searchServices(query: string, source?: string, limit?: number, offset?: number): Promise<{
    services: Array<{
      name: string;
      description?: string;
      version?: string;
      source: string;
      tags?: string[];
      lastUpdated?: string;
    }>;
    total: number;
    source: string;
    hasMore: boolean;
  }> {
    try {
      // First, get locally cached servers from file system
      const localServers = await this.getLocalCachedServers();
      
      // Filter local servers by query if provided
      let filteredLocalServers = localServers;
      if (query) {
        filteredLocalServers = localServers.filter(server =>
          server.name.toLowerCase().includes(query.toLowerCase()) ||
          server.description?.toLowerCase().includes(query.toLowerCase())
        );
      }
      
      // If we have local servers and no specific source is selected, return them
      if (filteredLocalServers.length > 0 && (!source || source === 'all')) {
        return this.applyPagination({
          services: filteredLocalServers,
          total: filteredLocalServers.length,
          source: 'local',
          hasMore: false
        }, limit, offset);
      }
      
      // For specific sources, search online
      if (source === 'gitee') {
        return await this.searchGiteeServices(query, limit, offset);
      }
      
      if (source === 'github') {
        return await this.searchGitHubServices(query, limit, offset);
      }
      
      // For other sources, try the backend API
      const params = new URLSearchParams();
      if (query) params.append('q', query);
      if (source) params.append('source', source);
      if (limit) params.append('limit', limit.toString());
      if (offset) params.append('offset', offset.toString());
      
      const url = `/api/servers/search${params.toString() ? `?${params.toString()}` : ''}`;
      const response = await this.client.get(url) as any;
      return response;
    } catch (error: any) {
      // If search endpoint is not available, return empty results
      console.warn('Search endpoint not available, returning empty results:', error.message);
      return {
        services: [],
        total: 0,
        source: source || 'unknown',
        hasMore: false
      };
    }
  }

  private async searchGiteeServices(query: string, limit?: number, offset?: number): Promise<{
    services: Array<{
      name: string;
      description?: string;
      version?: string;
      source: string;
      tags?: string[];
      lastUpdated?: string;
    }>;
    total: number;
    source: string;
    hasMore: boolean;
  }> {
    try {
      // Check cache first
      const cacheKey = `gitee_search_${query.toLowerCase()}`;
      const cached = this.getSearchCache(cacheKey);
      if (cached) {
        console.log('Using cached Gitee search results');
        return this.applyPagination(cached, limit, offset);
      }

      const services: Array<{
        name: string;
        description?: string;
        version?: string;
        source: string;
        tags?: string[];
        lastUpdated?: string;
      }> = [];

      // Get list of owners from Gitee hub
      const ownersResponse = await axios.get('https://gitee.com/api/v5/repos/mcpilotx/mcp-server-hub/contents/');
      const owners = ownersResponse.data.filter((item: any) => item.type === 'dir');
      
      // Search through each owner's servers (optimized: don't fetch mcp.json for speed)
      for (const owner of owners) {
        try {
          const ownerName = owner.name;
          const serversResponse = await axios.get(`https://gitee.com/api/v5/repos/mcpilotx/mcp-server-hub/contents/${ownerName}`);
          const servers = serversResponse.data.filter((item: any) => item.type === 'dir');
          
          for (const server of servers) {
            const serverName = server.name;
            const fullName = `${ownerName}/${serverName}`;
            
            // Check if server name contains the query (case-insensitive)
            if (serverName.toLowerCase().includes(query.toLowerCase()) || 
                ownerName.toLowerCase().includes(query.toLowerCase()) ||
                fullName.toLowerCase().includes(query.toLowerCase())) {
              
              // Don't fetch mcp.json for speed - just use basic info
              services.push({
                name: fullName, // Return full name: owner/server
                description: `MCP Server: ${fullName}`,
                version: 'unknown',
                source: 'gitee',
                tags: [ownerName, 'gitee', 'mcp'],
                lastUpdated: '2026-04-16' // Default date
              });
            }
          }
        } catch (ownerError: any) {
          console.warn(`Error fetching servers for owner:`, ownerError.message);
          continue;
        }
      }
      
      // Cache the results (1 hour expiry)
      this.setSearchCache(cacheKey, {
        services,
        total: services.length,
        source: 'gitee',
        hasMore: false
      }, 60 * 60 * 1000); // 1 hour
      
      return this.applyPagination({
        services,
        total: services.length,
        source: 'gitee',
        hasMore: false
      }, limit, offset);
    } catch (error: any) {
      console.error('Error searching Gitee services:', error.message);
      return {
        services: [],
        total: 0,
        source: 'gitee',
        hasMore: false
      };
    }
  }

  private async searchGitHubServices(query: string, limit?: number, offset?: number): Promise<{
    services: Array<{
      name: string;
      description?: string;
      version?: string;
      source: string;
      tags?: string[];
      lastUpdated?: string;
    }>;
    total: number;
    source: string;
    hasMore: boolean;
  }> {
    try {
      // Check cache first
      const cacheKey = `github_search_${query.toLowerCase()}`;
      const cached = this.getSearchCache(cacheKey);
      if (cached) {
        console.log('Using cached GitHub search results');
        return this.applyPagination(cached, limit, offset);
      }

      const services: Array<{
        name: string;
        description?: string;
        version?: string;
        source: string;
        tags?: string[];
        lastUpdated?: string;
      }> = [];

      // Get list of servers from GitHub hub
      // GitHub hub has a different structure: there's a "github" directory containing servers
      const githubDirResponse = await axios.get('https://api.github.com/repos/MCPilotX/mcp-server-hub/contents/github');
      const servers = githubDirResponse.data.filter((item: any) => item.type === 'dir');
      
      // Search through servers (optimized: don't fetch mcp.json for speed)
      for (const server of servers) {
        const serverName = server.name;
        const fullName = `github/${serverName}`; // Format: github/server-name
        
        // Check if server name contains the query (case-insensitive)
        if (serverName.toLowerCase().includes(query.toLowerCase()) || 
            fullName.toLowerCase().includes(query.toLowerCase())) {
          
          // Don't fetch mcp.json for speed - just use basic info
          services.push({
            name: fullName, // Return full name: github/server-name
            description: `MCP Server: ${fullName}`,
            version: 'unknown',
            source: 'github',
            tags: ['github', 'mcp'],
            lastUpdated: '2026-04-16' // Default date
          });
        }
      }
      
      // Cache the results (1 hour expiry)
      this.setSearchCache(cacheKey, {
        services,
        total: services.length,
        source: 'github',
        hasMore: false
      }, 60 * 60 * 1000); // 1 hour
      
      return this.applyPagination({
        services,
        total: services.length,
        source: 'github',
        hasMore: false
      }, limit, offset);
    } catch (error: any) {
      console.error('Error searching GitHub services:', error.message);
      return {
        services: [],
        total: 0,
        source: 'github',
        hasMore: false
      };
    }
  }

  async getServer(id: string): Promise<MCPServer> {
    const response = await this.client.get(`/api/servers/${id}`) as any;
    return response.server;
  }

  async pullServer(request: PullServerRequest): Promise<MCPServer> {
    // Backend expects serverNameOrUrl field, not serverName
    const backendRequest = { serverNameOrUrl: request.serverName };
    const response = await this.client.post('/api/servers', backendRequest) as any;
    
    // Try to get server from different possible response structures
    let server = response.server;
    
    // If server is not in response.server, check other possible locations
    if (!server) {
      // Check if the response itself is the server object
      if (response && response.name) {
        server = response;
      }
      // Check if server is in a different field
      else if (response.data && response.data.server) {
        server = response.data.server;
      }
      // Check if server is in a different field name
      else if (response.data && response.data.name) {
        server = response.data;
      }
      // Check for backend response format: response contains pid, serverName, manifest, etc.
      else if (response && response.manifest && response.serverName) {
        // Convert backend response to MCPServer format
        server = {
          id: response.pid?.toString() || '0',
          name: response.manifest.name || response.serverName,
          version: response.manifest.version || 'unknown',
          description: response.manifest.description || '',
          runtime: {
            type: 'unknown',
            command: '',
            args: [],
            env: []
          },
          capabilities: {},
          status: response.status || 'running',
          lastStartedAt: response.startTime
        };
      }
    }
    
    // Check if server is defined before accessing its properties
    if (!server) {
      console.error('Server response structure:', response);
      // Provide more helpful error message
      if (response && response.message) {
        throw new Error(`Failed to pull server: ${response.message}`);
      } else if (response && response.error) {
        throw new Error(`Failed to pull server: ${response.error}`);
      } else {
        throw new Error('Failed to pull server: Server response format is unexpected. The server may have been pulled successfully but the response format is incorrect.');
      }
    }
    
    // Add to local cache of pulled servers
    this.addToPulledServersCache(server.name, request.serverName);
    
    return server;
  }

  async startServer(request: StartServerRequest): Promise<ProcessInfo> {
    const response = await this.client.post(`/api/servers/${request.serverId}/start`) as any;
    return response.process;
  }

  async deleteServer(id: string): Promise<void> {
    await this.client.delete(`/api/servers/${id}`);
  }

  // Process management
  async getProcesses(): Promise<ProcessInfo[]> {
    const response = await this.client.get('/api/servers') as any;
    const servers = response.servers || [];
    return servers.filter((s: any) => s.status === 'running').map((server: any) => ({
      pid: server.pid || 0,
      serverId: server.pid?.toString() || '0',
      serverName: server.name,
      status: 'running',
      startedAt: server.startTime || new Date().toISOString(),
      logPath: server.logPath || ''
    }));
  }

  async stopProcess(request: StopProcessRequest): Promise<void> {
    await this.client.delete(`/api/servers/${request.pid}`);
  }

  async getProcessLogs(pid: number): Promise<string> {
    const response = await this.client.get(`/api/servers/${pid}/logs`) as any;
    return response.logs || '';
  }

  // Configuration management
  async getConfig(): Promise<Config> {
    const response = await this.client.get('/api/config') as any;
    return response.config;
  }

  async updateConfig(request: UpdateConfigRequest): Promise<Config> {
    const response = await this.client.put('/api/config', request) as any;
    return response.config;
  }

  // Secrets management
  async getSecrets(): Promise<Secret[]> {
    const response = await this.client.get('/api/secrets') as any;
    return response.secrets || [];
  }

  async createSecret(request: CreateSecretRequest): Promise<Secret> {
    const response = await this.client.post('/api/secrets', request) as any;
    return response.secret;
  }

  async deleteSecret(name: string): Promise<void> {
    await this.client.delete(`/api/secrets/${name}`);
  }

  // Workflow management
  async getWorkflows(): Promise<Workflow[]> {
    const response = await this.client.get('/api/workflows') as any;
    return response.workflows || [];
  }

  async getWorkflow(id: string): Promise<Workflow> {
    // Check if ID is a file path (contains .json extension and path separators)
    const isFilePath = id.includes('.json') && 
                      (id.includes('/') || id.includes('\\'));
    
    let encodedId;
    if (isFilePath) {
      // For file paths, encode each segment separately to preserve forward slashes
      encodedId = id.split('/').map(segment => encodeURIComponent(segment)).join('/');
      console.log(`Workflow ID is a file path, encoded as: "${encodedId}"`);
    } else {
      // For regular IDs, encode the entire ID
      encodedId = encodeURIComponent(id);
    }
    
    const response = await this.client.get(`/api/workflows/${encodedId}`) as any;
    return response.workflow;
  }

  async saveWorkflow(workflow: Workflow): Promise<Workflow> {
    console.log('Saving workflow:', workflow);
    
    // Check if this is a new workflow (empty ID) or an update
    const isNewWorkflow = !workflow.id || workflow.id.trim() === '';
    
    try {
      if (isNewWorkflow) {
        // For new workflow, use POST request
        console.log('Creating new workflow with POST request');
        const response = await this.client.post('/api/workflows', workflow) as any;
        console.log('Create workflow response:', response);
        
        // Handle different response formats
        if (response.workflow) {
          return response.workflow;
        } else if (response && response.id) {
          // If response itself is a workflow object
          return response;
        } else {
          console.error('Unexpected response format for create workflow:', response);
          throw new Error('Unexpected response format from server');
        }
      } else {
        // For existing workflow, always use POST to /api/workflows with ID in the body
        // This is because the backend may not support PUT requests
        console.log(`Updating existing workflow with ID: ${workflow.id}`);
        
        // Always use POST to /api/workflows, the backend should handle updates based on the ID in the workflow object
        console.log(`Using POST to /api/workflows for update`);
        const response = await this.client.post('/api/workflows', workflow) as any;
        console.log('Update workflow response (POST):', response);
        
        // Handle different response formats
        if (response.workflow) {
          return response.workflow;
        } else if (response && response.id) {
          // If response itself is a workflow object
          return response;
        } else {
          console.error('Unexpected response format for update workflow:', response);
          throw new Error('Unexpected response format from server');
        }
      }
    } catch (error: any) {
      console.error('Error saving workflow:', error);
      
      // Provide more user-friendly error messages
      if (error.response?.status === 401) {
        throw new Error('Authentication failed. Please check your authentication token.');
      } else if (error.response?.status === 404) {
        throw new Error(`Workflow not found. The workflow with ID "${workflow.id}" may have been deleted or does not exist.`);
      } else if (error.response?.status === 500) {
        throw new Error('Server error while saving workflow. Please check backend logs.');
      } else if (error.message?.includes('Network Error')) {
        throw new Error('Network error. Please check if the backend server is running.');
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async deleteWorkflow(id: string): Promise<void> {
    // Encode the ID to handle special characters (like Chinese filenames)
    const encodedId = encodeURIComponent(id);
    await this.client.delete(`/api/workflows/${encodedId}`);
  }

  async executeWorkflow(request: ExecuteWorkflowRequest): Promise<any> {
    console.log(`Executing workflow with request:`, request);

    // Check if workflowId is a file path (contains .json extension and path separators)
    const isFilePath = request.workflowId.includes('.json') && 
                      (request.workflowId.includes('/') || request.workflowId.includes('\\'));
    
    // Check if workflowId contains non-ASCII characters (likely a Chinese name)
    const containsNonAscii = /[^\x00-\x7F]/.test(request.workflowId);
    if (containsNonAscii) {
      console.log(`Workflow ID contains non-ASCII characters, likely a name in Chinese: "${request.workflowId}"`);
      console.log(`This is probably a workflow name, not an ID. Will search for workflow by name.`);
    }

    try {
      // First try to execute with the provided ID directly
      console.log(`Attempting to execute workflow with ID: "${request.workflowId}"`);
      
      // Special handling for file paths: don't encode the entire path, just encode special characters
      let encodedId;
      if (isFilePath) {
        // For file paths, we need to handle them differently
        // The backend likely expects the path as-is, but with special characters encoded
        // We'll encode the path but preserve forward slashes
        encodedId = request.workflowId.split('/').map(segment => encodeURIComponent(segment)).join('/');
        console.log(`Workflow ID is a file path, encoded as: "${encodedId}"`);
      } else {
        // For regular IDs, encode the entire ID
        encodedId = encodeURIComponent(request.workflowId);
      }
      
      const response = await this.client.post(`/api/workflows/${encodedId}/execute`, request.parameters || {}) as any;
      console.log(`Workflow execution successful with ID: "${request.workflowId}"`);
      return response;
    } catch (error: any) {
      console.error(`Error executing workflow with ID "${request.workflowId}":`, error);
      
      // If 404 error, or workflowId contains non-ASCII characters, try to find by name
      if (error.response?.status === 404 || containsNonAscii) {
        console.warn(`Workflow with ID "${request.workflowId}" not found or contains non-ASCII, trying to find by name...`);
        
        try {
          // Get all workflows
          console.log(`Fetching all workflows to search by name...`);
          const workflows = await this.getWorkflows();
          console.log(`Found ${workflows.length} workflows:`, workflows.map(w => ({ name: w.name, id: w.id })));
          
          if (workflows.length === 0) {
            throw new Error(`No workflows found in the system. Please create a workflow first.`);
          }
          
          // Try to find workflow by name (exact match or contains)
          let workflowByName = workflows.find(w => w.name === request.workflowId);
          
          // If no exact match, try partial match (for long Chinese names)
          if (!workflowByName && containsNonAscii) {
            console.log(`No exact name match, trying partial match for non-ASCII name...`);
            workflowByName = workflows.find(w => 
              request.workflowId.includes(w.name) || 
              w.name.includes(request.workflowId)
            );
          }
          
          // Finally try to match by ID
          if (!workflowByName) {
            workflowByName = workflows.find(w => w.id === request.workflowId);
          }
          
          if (workflowByName) {
            console.log(`Found workflow: "${workflowByName.name}" with ID: "${workflowByName.id}"`);
            // Retry execution with the correct workflow ID
            console.log(`Retrying execution with correct ID: "${workflowByName.id}"`);
            
            // Handle file path encoding for the retry as well
            let encodedCorrectId;
            const retryIsFilePath = workflowByName.id.includes('.json') && 
                                   (workflowByName.id.includes('/') || workflowByName.id.includes('\\'));
            
            if (retryIsFilePath) {
              encodedCorrectId = workflowByName.id.split('/').map(segment => encodeURIComponent(segment)).join('/');
            } else {
              encodedCorrectId = encodeURIComponent(workflowByName.id);
            }
            
            const response = await this.client.post(`/api/workflows/${encodedCorrectId}/execute`, request.parameters || {}) as any;
            console.log(`Workflow execution successful with correct ID: "${workflowByName.id}"`);
            return response.workflow;
          } else {
            // Provide more user-friendly error message
            const availableNames = workflows.slice(0, 5).map(w => `"${w.name}"`).join(', ');
            const moreText = workflows.length > 5 ? ` and ${workflows.length - 5} more` : '';
            const errorMsg = `Workflow "${request.workflowId}" not found. Available workflows: ${availableNames}${moreText}`;
            console.error(errorMsg);
            throw new Error(errorMsg);
          }
        } catch (innerError: any) {
          console.error(`Error while searching for workflow by name:`, innerError);
          
          // If getting workflow list fails, provide more specific error information
          if (innerError.response?.status === 401) {
            throw new Error(`Authentication failed. Please check your authentication token.`);
          } else if (innerError.response?.status === 404) {
            throw new Error(`Workflows API endpoint not found. The backend may not be running or the API route may not exist.`);
          } else {
            throw new Error(`Failed to search for workflow "${request.workflowId}": ${innerError.message}`);
          }
        }
      }
      
      // Handle other HTTP errors
      if (error.response?.status === 401) {
        throw new Error(`Authentication failed. Please check your authentication token.`);
      } else if (error.response?.status === 500) {
        throw new Error(`Server error while executing workflow. Please check backend logs.`);
      }
      
      // Re-throw other errors
      console.error(`Unhandled error in executeWorkflow:`, error);
      throw error;
    }
  }

  // System information
  async getSystemStats(): Promise<SystemStats> {
    const response = await this.client.get('/api/system/stats') as any;
    return response.stats;
  }

  async getSystemLogs(): Promise<string[]> {
    const response = await this.client.get('/api/system/logs') as any;
    return response.logs || [];
  }

  async healthCheck(): Promise<boolean> {
    try {
      await this.client.get('/api/status');
      return true;
    } catch {
      return false;
    }
  }

  async testAIConfig(config: { provider: string; model: string; apiKey: string }): Promise<{ success: boolean; message?: string }> {
    console.log('Starting AI config test with:', { 
      provider: config.provider, 
      model: config.model, 
      apiKey: config.apiKey ? '***' + config.apiKey.slice(-4) : 'empty',
      apiKeyLength: config.apiKey?.length || 0
    });
    
    // Check if API key looks like a masked key
    const maskedPattern = /^[•*]+$/;
    if (maskedPattern.test(config.apiKey)) {
      console.error('API key appears to be masked:', config.apiKey);
      return {
        success: false,
        message: 'API key appears to be masked/hidden. Please enter your actual API key.'
      };
    }
    
    // First, perform comprehensive validation
    const validationResult = this.performComprehensiveValidation(config);
    if (!validationResult.success) {
      return validationResult;
    }
    
    try {
      // Try backend API if available
      console.log('Trying backend API endpoint /api/ai/test');
      const response = await this.client.post('/api/ai/test', config) as any;
      console.log('Backend API response:', response);
      return { success: true, message: response.message || 'Configuration test successful' };
    } catch (error: any) {
      console.log('Backend AI test endpoint not available:', error.message);
      console.log('Error details:', error.response?.status, error.response?.data);
      
      // If backend endpoint is not available, return validation result
      // Note: We cannot perform actual API test from browser due to CORS restrictions
      // The validation has already been done above
      return {
        success: true,
        message: `Configuration validated: ${config.provider} (${config.model})`
      };
    }
  }


  private validateAPIKeyFormat(provider: string, apiKey: string): { valid: boolean; message?: string } {
    if (apiKey.length < 10) {
      return {
        valid: false,
        message: 'API key appears to be too short. Please check your API key.'
      };
    }
    
    const providerLower = provider.toLowerCase();
    
    // Check for common API key patterns
    if (providerLower === 'openai') {
      // OpenAI keys typically start with sk- and are 51 chars
      const openAIPattern = /^sk-[a-zA-Z0-9]{48}$/;
      if (!openAIPattern.test(apiKey)) {
        return {
          valid: false,
          message: 'OpenAI API keys typically start with "sk-" and are 51 characters long. Please check your API key format.'
        };
      }
    } else if (providerLower === 'anthropic') {
      // Anthropic keys typically start with sk-ant- and are 54 chars
      const anthropicPattern = /^sk-ant-[a-zA-Z0-9]{48}$/;
      if (!anthropicPattern.test(apiKey)) {
        return {
          valid: false,
          message: 'Anthropic API keys typically start with "sk-ant-" and are 54 characters long. Please check your API key format.'
        };
      }
    } else if (providerLower === 'google') {
      // Google keys typically start with AIzaSy and are 39 chars
      const googlePattern = /^AIzaSy[a-zA-Z0-9_-]{35}$/;
      if (!googlePattern.test(apiKey)) {
        return {
          valid: false,
          message: 'Google API keys typically start with "AIzaSy" and are 39 characters long. Please check your API key format.'
        };
      }
    } else if (providerLower === 'deepseek') {
      // DeepSeek API keys - they can have various formats
      // Some DeepSeek keys start with sk-, others have different formats
      // Be very lenient with DeepSeek validation
      const deepseekPattern = /^[a-zA-Z0-9._~+/-]{10,}$/;
      if (!deepseekPattern.test(apiKey)) {
        return {
          valid: false,
          message: 'DeepSeek API key format validation failed. Please ensure your API key is correctly formatted. DeepSeek API keys typically contain letters, numbers, and common symbols, and are at least 10 characters long.'
        };
      }
    } else {
      // Generic validation for other providers - be more lenient
      // Many providers have different API key formats
      const genericPattern = /^[a-zA-Z0-9._~+/-]{10,}$/;
      if (!genericPattern.test(apiKey)) {
        return {
          valid: false,
          message: `API key format validation failed for ${provider}. Please ensure your API key is correctly formatted. Most API keys contain only letters, numbers, and common symbols, and are at least 10 characters long.`
        };
      }
    }
    
    return { valid: true };
  }

  private validateModelName(provider: string, model: string): { valid: boolean; message?: string } {
    if (!model || model.trim().length === 0) {
      return {
        valid: false,
        message: 'Model name cannot be empty.'
      };
    }
    
    const providerLower = provider.toLowerCase();
    const modelLower = model.toLowerCase();
    
    // Check for common model name patterns
    if (providerLower === 'openai') {
      // OpenAI models: gpt-4, gpt-3.5-turbo, etc.
      if (!modelLower.startsWith('gpt-') && !modelLower.startsWith('text-') && !modelLower.startsWith('davinci-')) {
        return {
          valid: false,
          message: 'OpenAI model names typically start with "gpt-", "text-", or "davinci-". Please check your model name.'
        };
      }
    } else if (providerLower === 'anthropic') {
      // Anthropic models: claude-3-opus, claude-2.1, etc.
      if (!modelLower.startsWith('claude-')) {
        return {
          valid: false,
          message: 'Anthropic model names typically start with "claude-". Please check your model name.'
        };
      }
    } else if (providerLower === 'google') {
      // Google models: gemini-pro, gemini-ultra, etc.
      if (!modelLower.startsWith('gemini-') && !modelLower.startsWith('palm-')) {
        return {
          valid: false,
          message: 'Google AI model names typically start with "gemini-" or "palm-". Please check your model name.'
        };
      }
    }
    
    // Generic validation: model name should not contain special characters except hyphens
    const modelPattern = /^[a-zA-Z0-9.-]+$/;
    if (!modelPattern.test(model)) {
      return {
        valid: false,
        message: 'Model name should contain only letters, numbers, dots, and hyphens.'
      };
    }
    
    return { valid: true };
  }

  private performComprehensiveValidation(config: { provider: string; model: string; apiKey: string }): { success: boolean; message?: string } {
    const { provider, model, apiKey } = config;
    
    // 1. Basic validation
    if (!provider || !model || !apiKey) {
      return { 
        success: false, 
        message: 'Please provide provider, model, and API key' 
      };
    }
    
    // 2. Check for obviously fake API keys
    if (apiKey === 'test' || apiKey === 'demo' || apiKey === 'example' || 
        apiKey === 'sk-test' || apiKey === 'sk-demo' || apiKey.toLowerCase().includes('example')) {
      return {
        success: false,
        message: 'Please enter a real API key, not a test/demo key.'
      };
    }
    
    // 3. Check for repeated characters or simple patterns (common in fake keys)
    const repeatedPattern = /^(.)\1+$/;
    if (repeatedPattern.test(apiKey)) {
      return {
        success: false,
        message: 'API key appears to be invalid (repeated characters).'
      };
    }
    
    // 4. Check for sequential characters (e.g., abcdef, 123456)
    const sequentialPattern = /(abc|bcd|cde|def|efg|fgh|ghi|hij|ijk|jkl|klm|lmn|mno|nop|opq|pqr|qrs|rst|stu|tuv|uvw|vwx|wxy|xyz|012|123|234|345|456|567|678|789)/i;
    if (sequentialPattern.test(apiKey.toLowerCase())) {
      return {
        success: false,
        message: 'API key appears to contain sequential characters, which is unusual for real API keys.'
      };
    }
    
    // 5. Validate API key format based on provider
    const apiKeyValidation = this.validateAPIKeyFormat(provider, apiKey);
    if (!apiKeyValidation.valid) {
      return {
        success: false,
        message: apiKeyValidation.message || 'API key format validation failed.'
      };
    }
    
    // 6. Validate model name
    const modelValidation = this.validateModelName(provider, model);
    if (!modelValidation.valid) {
      return {
        success: false,
        message: modelValidation.message || 'Model name validation failed.'
      };
    }
    
    // 7. Additional provider-specific validations
    const providerLower = provider.toLowerCase();
    
    // For OpenAI: check if API key starts with sk- and has proper length
    if (providerLower === 'openai') {
      if (!apiKey.startsWith('sk-')) {
        return {
          success: false,
          message: 'OpenAI API keys must start with "sk-".'
        };
      }
      if (apiKey.length !== 51) {
        return {
          success: false,
          message: `OpenAI API keys are typically 51 characters long. Your key is ${apiKey.length} characters.`
        };
      }
    }
    
    // For Anthropic: check if API key starts with sk-ant-
    if (providerLower === 'anthropic') {
      if (!apiKey.startsWith('sk-ant-')) {
        return {
          success: false,
          message: 'Anthropic API keys must start with "sk-ant-".'
        };
      }
      if (apiKey.length < 50 || apiKey.length > 60) {
        return {
          success: false,
          message: `Anthropic API keys are typically 54 characters long. Your key is ${apiKey.length} characters.`
        };
      }
    }
    
    // For Google: check if API key starts with AIzaSy
    if (providerLower === 'google') {
      if (!apiKey.startsWith('AIzaSy')) {
        return {
          success: false,
          message: 'Google API keys must start with "AIzaSy".'
        };
      }
      if (apiKey.length !== 39) {
        return {
          success: false,
          message: `Google API keys are typically 39 characters long. Your key is ${apiKey.length} characters.`
        };
      }
    }
    
    // For DeepSeek: check minimum length and format
    if (providerLower === 'deepseek') {
      if (apiKey.length < 20) {
        return {
          success: false,
          message: 'DeepSeek API keys are typically at least 20 characters long.'
        };
      }
    }
    
    // For custom providers: require at least 20 characters
    if (providerLower === 'custom') {
      if (apiKey.length < 20) {
        return {
          success: false,
          message: 'Custom API keys should be at least 20 characters long for security.'
        };
      }
    }
    
    // All validations passed
    return { success: true };
  }


  async verifyToken(): Promise<boolean> {
    try {
      await this.client.get('/api/auth/verify');
      return true;
    } catch {
      return false;
    }
  }

  // Notification management
  async getNotifications(): Promise<Notification[]> {
    try {
      const response = await this.client.get('/api/notifications') as any;
      return response.notifications || [];
    } catch (error: any) {
      console.warn('Notifications endpoint not available, returning mock data:', error.message);
      // Return mock notifications for development
      return this.getMockNotifications();
    }
  }

  async getNotificationStats(): Promise<NotificationStats> {
    try {
      const response = await this.client.get('/api/notifications/stats') as any;
      return response.stats;
    } catch (error: any) {
      console.warn('Notification stats endpoint not available, returning mock data:', error.message);
      // Return mock stats for development
      const notifications = await this.getMockNotifications();
      const unread = notifications.filter(n => !n.read).length;
      const byType = {
        info: notifications.filter(n => n.type === 'info').length,
        success: notifications.filter(n => n.type === 'success').length,
        warning: notifications.filter(n => n.type === 'warning').length,
        error: notifications.filter(n => n.type === 'error').length,
        system: notifications.filter(n => n.type === 'system').length,
      };
      const bySource = {
        server: notifications.filter(n => n.source === 'server').length,
        process: notifications.filter(n => n.source === 'process').length,
        workflow: notifications.filter(n => n.source === 'workflow').length,
        system: notifications.filter(n => n.source === 'system').length,
      };
      
      return {
        total: notifications.length,
        unread,
        byType,
        bySource,
      };
    }
  }

  async markNotificationAsRead(notificationId: string): Promise<void> {
    try {
      await this.client.post(`/api/notifications/${notificationId}/read`);
    } catch (error: any) {
      console.warn('Mark notification as read endpoint not available:', error.message);
      // Simulate success for development
      const notifications = await this.getMockNotifications();
      const notification = notifications.find(n => n.id === notificationId);
      if (notification) {
        notification.read = true;
        localStorage.setItem('mock_notifications', JSON.stringify(notifications));
      }
    }
  }

  async markAllNotificationsAsRead(): Promise<void> {
    try {
      await this.client.post('/api/notifications/read-all');
    } catch (error: any) {
      console.warn('Mark all notifications as read endpoint not available:', error.message);
      // Simulate success for development
      const notifications = await this.getMockNotifications();
      notifications.forEach(n => n.read = true);
      localStorage.setItem('mock_notifications', JSON.stringify(notifications));
    }
  }

  async clearAllNotifications(): Promise<void> {
    try {
      await this.client.delete('/api/notifications');
    } catch (error: any) {
      console.warn('Clear notifications endpoint not available:', error.message);
      // Simulate success for development
      localStorage.removeItem('mock_notifications');
    }
  }

  private getMockNotifications(): Notification[] {
    try {
      const cached = localStorage.getItem('mock_notifications');
      if (cached) {
        return JSON.parse(cached);
      }
    } catch (error) {
      console.warn('Error reading mock notifications from cache:', error);
    }

    // Generate user-friendly mock notifications in English
    const mockNotifications: Notification[] = [
      {
        id: '1',
        type: 'success',
        title: 'GitHub Server Started Successfully',
        message: 'GitHub MCP server has been started successfully and is now running.',
        timestamp: new Date(Date.now() - 5 * 60 * 1000).toISOString(), // 5 minutes ago
        read: false,
        source: 'server',
        sourceId: 'github-mcp-server',
        actionUrl: '/servers',
      },
      {
        id: '2',
        type: 'warning',
        title: 'High CPU Usage Detected',
        message: 'GitHub server process is using 85% CPU. Consider optimization.',
        timestamp: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // 30 minutes ago
        read: true,
        source: 'process',
        sourceId: 'github-mcp-server',
        actionUrl: '/processes',
      },
      {
        id: '3',
        type: 'info',
        title: 'New Server Available',
        message: 'Weather forecast MCP server has been added to the registry.',
        timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
        read: false,
        source: 'system',
        actionUrl: '/servers',
      },
      {
        id: '4',
        type: 'error',
        title: 'Server Connection Failed',
        message: 'Failed to connect to Docker MCP server. Check network configuration.',
        timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString(), // 3 hours ago
        read: true,
        source: 'server',
        sourceId: 'docker-mcp-server',
        actionUrl: '/servers',
      },
      {
        id: '5',
        type: 'system',
        title: 'System Update Available',
        message: 'Intentorch v0.2.0 is now available with new features and bug fixes.',
        timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
        read: false,
        source: 'system',
        actionUrl: 'https://github.com/MCPilotX/Intentorch/releases',
      },
      {
        id: '6',
        type: 'success',
        title: 'Workflow Executed Successfully',
        message: 'Daily backup workflow has completed successfully.',
        timestamp: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), // 1 day ago
        read: true,
        source: 'workflow',
        sourceId: 'daily-backup',
        actionUrl: '/workflows',
      },
      {
        id: '7',
        type: 'warning',
        title: 'Low Disk Space',
        message: 'System disk is 90% full. Consider cleaning up old logs and cache files.',
        timestamp: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), // 2 days ago
        read: true,
        source: 'system',
        actionUrl: '/config',
      },
      {
        id: '8',
        type: 'info',
        title: 'System Security Scan Completed',
        message: 'System security scan completed with no threats detected.',
        timestamp: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), // 3 days ago
        read: true,
        source: 'system',
        actionUrl: '/config',
      },
      {
        id: '9',
        type: 'success',
        title: 'Docker Server Stopped',
        message: 'Docker MCP server has been safely stopped as scheduled.',
        timestamp: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days ago
        read: true,
        source: 'server',
        sourceId: 'docker-mcp-server',
        actionUrl: '/servers',
      },
      {
        id: '10',
        type: 'info',
        title: 'New Feature Available',
        message: 'Workflow orchestration feature is now available for creating automated workflows.',
        timestamp: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(), // 5 days ago
        read: true,
        source: 'system',
        actionUrl: '/workflows',
      },
    ];

    // Save to localStorage for persistence
    try {
      localStorage.setItem('mock_notifications', JSON.stringify(mockNotifications));
    } catch (error) {
      console.warn('Error saving mock notifications to cache:', error);
    }

    return mockNotifications;
  }

  // Cache management methods
  private getSearchCache(cacheKey: string): any {
    try {
      const cached = localStorage.getItem(cacheKey);
      if (!cached) return null;
      
      const { data, expiry } = JSON.parse(cached);
      if (expiry && Date.now() > expiry) {
        localStorage.removeItem(cacheKey);
        return null;
      }
      return data;
    } catch (error) {
      console.warn('Error reading cache:', error);
      return null;
    }
  }

  private setSearchCache(cacheKey: string, data: any, ttlMs: number = 60 * 60 * 1000): void {
    try {
      const cacheItem = {
        data,
        expiry: Date.now() + ttlMs
      };
      localStorage.setItem(cacheKey, JSON.stringify(cacheItem));
    } catch (error) {
      console.warn('Error setting cache:', error);
    }
  }

  private applyPagination(
    result: {
      services: Array<{
        name: string;
        description?: string;
        version?: string;
        source: string;
        tags?: string[];
        lastUpdated?: string;
      }>;
      total: number;
      source: string;
      hasMore: boolean;
    },
    limit?: number,
    offset?: number
  ): {
    services: Array<{
      name: string;
      description?: string;
      version?: string;
      source: string;
      tags?: string[];
      lastUpdated?: string;
    }>;
    total: number;
    source: string;
    hasMore: boolean;
  } {
    const startIndex = offset || 0;
    const endIndex = limit ? startIndex + limit : result.services.length;
    const paginatedServices = result.services.slice(startIndex, endIndex);
    
    return {
      services: paginatedServices,
      total: result.total,
      source: result.source,
      hasMore: endIndex < result.total
    };
  }

  private addToPulledServersCache(serverName: string, originalUrl: string): void {
    try {
      const cacheKey = 'pulled_servers';
      const cached = localStorage.getItem(cacheKey);
      let pulledServers: Array<{name: string, url: string, pulledAt: string}> = [];
      
      if (cached) {
        pulledServers = JSON.parse(cached);
      }
      
      // Add or update the server
      const existingIndex = pulledServers.findIndex(s => s.name === serverName);
      if (existingIndex >= 0) {
        pulledServers[existingIndex] = {
          name: serverName,
          url: originalUrl,
          pulledAt: new Date().toISOString()
        };
      } else {
        pulledServers.push({
          name: serverName,
          url: originalUrl,
          pulledAt: new Date().toISOString()
        });
      }
      
      // Keep only the last 50 servers
      if (pulledServers.length > 50) {
        pulledServers = pulledServers.slice(-50);
      }
      
      localStorage.setItem(cacheKey, JSON.stringify(pulledServers));
    } catch (error) {
      console.warn('Error adding to pulled servers cache:', error);
    }
  }

  private async getLocalCachedServers(): Promise<Array<{
    name: string;
    description?: string;
    version?: string;
    source: string;
    tags?: string[];
    lastUpdated?: string;
  }>> {
    try {
      // Try to get cached servers from the backend API
      const response = await this.client.get('/api/servers/cached') as any;
      if (response && response.services) {
        return response.services;
      }
      
      // Fallback to empty array if API fails or returns unexpected format
      return [];
    } catch (error) {
      console.warn('Error getting local cached servers from API:', error);
      // Return empty array as fallback
      return [];
    }
  }
}

export const apiService = new ApiService();
