// Manifest structure (mcp.json)
export interface Manifest {
  name: string;
  version: string;
  description?: string; // Service description
  runtime: {
    type: string; // Runtime type (nodejs, python, docker, etc.)
    command: string;
    args?: string[]; // Make args optional
    env?: string[]; // Required environment variable names (fetched from secret)
    cwd?: string; // Working directory
  };
  transport?: {
    type: "stdio" | "http" | "sse" | "websocket" | "tcp"; // Communication transport type
    port?: number; // Port for HTTP transport
    url?: string; // URL for HTTP/SSE transport
    headers?: Record<string, string>; // Optional headers for HTTP/SSE transport
  };
  capabilities?: {
    tools?: any[]; // Tools array (can be ToolMetadata or string[])
  };
  tools?: any[]; // Direct tools array (alternative to capabilities.tools)
  metadata?: {
    description?: string;
    author?: string;
    repository?: string;
    license?: string;
  };
  compatibility?: {
    supportsDynamicDiscovery?: boolean;
    minMCPVersion?: string;
  };
}

export interface ServiceInfo {
  name: string;
  description?: string;
  version?: string;
  source: string;
  tags?: string[];
  lastUpdated?: string;
}

export interface SearchOptions {
  query?: string;
  source?: string;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  services: ServiceInfo[];
  total: number;
  source: string;
  hasMore: boolean;
}

export interface RegistrySource {
  name: string;
  fetchManifest: (serverName: string) => Promise<Manifest>;
  searchServices?: (options: SearchOptions) => Promise<SearchResult>;
  listAvailableServices?: () => Promise<ServiceInfo[]>;
}
