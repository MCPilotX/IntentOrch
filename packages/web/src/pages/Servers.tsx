import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { formatMCPServerName } from '../utils/format';
import type { MCPServer } from '../types';
import toast from 'react-hot-toast';
import { X, Search, Download, Layers, Activity, PlayCircle, StopCircle, Plus } from 'lucide-react';

// Registry sources available
const REGISTRY_SOURCES = [
  { 
    id: 'github', 
    name: 'GitHub Hub', 
    description: 'Search services from MCPilotX GitHub hub',
    downloadUrl: 'https://raw.githubusercontent.com/MCPilotX/mcp-server-hub/refs/heads/main/github/{server}/mcp.json'
  },
  { 
    id: 'gitee', 
    name: 'Gitee Hub', 
    description: 'Search services from MCPilotX Gitee hub',
    downloadUrl: 'https://gitee.com/mcpilotx/mcp-server-hub/raw/master/{owner}/{server}/mcp.json'
  },
  { 
    id: 'direct', 
    name: 'Direct URL', 
    description: 'Direct URL or local file',
    downloadUrl: 'Direct URL or local file path'
  },
];

// Example inputs for each registry source
const REGISTRY_EXAMPLES: Record<string, string[]> = {
  github: ['github/github-mcp-server', 'owner/repo', 'owner/repo@main', 'owner/repo:dist/mcp.json'],
  gitee: ['Joooook/12306-mcp', 'owner/server-name'],
  direct: ['https://example.com/mcp.json', 'file:///path/to/mcp.json', '/local/path/mcp.json'],
};

export default function Servers() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [pullUrl, setPullUrl] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('github');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Array<{
    name: string;
    description?: string;
    version?: string;
    source: string;
    tags?: string[];
    lastUpdated?: string;
  }>>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [startingServers, setStartingServers] = useState<Set<string>>(new Set());
  const [searchError, setSearchError] = useState<string | null>(null);

  // Use React Query for servers list
  const { data: servers = [], isLoading, error: queryError } = useQuery({
    queryKey: ['servers'],
    queryFn: async () => {
      const data = await apiService.getServers();
      const serverMap = new Map<string, MCPServer>();
      data.forEach(server => {
        const existing = serverMap.get(server.name);
        if (!existing || 
            (server.status === 'running' && existing.status !== 'running') ||
            (server.lastStartedAt && existing.lastStartedAt && 
             server.lastStartedAt > existing.lastStartedAt)) {
          serverMap.set(server.name, server);
        }
      });
      return Array.from(serverMap.values()).sort((a, b) => a.name.localeCompare(b.name));
    },
    refetchInterval: 10000,
  });

  // Pull server mutation
  const pullServerMutation = useMutation({
    mutationFn: (serverName: string) => apiService.pullServer({ serverName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      setPullUrl('');
      toast.success(t('servers.pullSuccess') || 'Server pulled successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || t('servers.error.pullFailed'));
    }
  });

  // Start server mutation
  const startServerMutation = useMutation({
    mutationFn: (serverId: string) => apiService.startServer({ serverId }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      setStartingServers(prev => {
        const next = new Set(prev);
        next.delete(variables);
        return next;
      });
      toast.success(t('servers.startSuccess') || 'Server started successfully');
    },
    onError: (error: any, variables) => {
      setStartingServers(prev => {
        const next = new Set(prev);
        next.delete(variables);
        return next;
      });
      toast.error(error.message || t('servers.error.startFailed'));
    }
  });

  // Stop/Delete server mutation
  const stopServerMutation = useMutation({
    mutationFn: (id: string) => apiService.deleteServer(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('servers.stopSuccess') || 'Server stopped successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || t('servers.error.stopFailed'));
    }
  });

  const handlePullServer = async () => {
    if (!pullUrl.trim()) {
      toast.error(t('servers.error.urlRequired'));
      return;
    }

    let serverName = pullUrl;
    if (selectedSource === 'gitee' && serverName.includes('/') && !serverName.startsWith('http')) {
      serverName = `https://gitee.com/mcpilotx/mcp-server-hub/raw/master/${serverName}/mcp.json`;
    } else if (selectedSource === 'github') {
      if (serverName.startsWith('github/') && !serverName.startsWith('http')) {
        const serverPath = serverName.replace('github/', '');
        serverName = `https://raw.githubusercontent.com/MCPilotX/mcp-server-hub/refs/heads/main/github/${serverPath}/mcp.json`;
      } else if (!serverName.includes(':') && !serverName.startsWith('http')) {
        serverName = `github:${serverName}`;
      }
    }

    pullServerMutation.mutate(serverName);
  };

  const handleStopServer = (id: string) => {
    if (confirm(t('servers.confirmStop'))) {
      stopServerMutation.mutate(id);
    }
  };

  const handleStartServer = (id: string) => {
    setStartingServers(prev => new Set(prev).add(id));
    startServerMutation.mutate(id);
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      setShowSearchResults(false);
      return;
    }

    try {
      setSearchLoading(true);
      const result = await apiService.searchServices(searchQuery, selectedSource);
      setSearchResults(result.services);
      setShowSearchResults(true);
      setSearchError(null);
      
      // Show message if no results found
      if (result.services.length === 0) {
        setSearchError(t('servers.noSearchResults'));
      }
    } catch (err: any) {
      // Show error message if search fails
      setSearchError(err.message || t('servers.error.searchFailed'));
      setSearchResults([]);
      setShowSearchResults(false);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleSelectSearchResult = (serviceName: string, serviceSource?: string) => {
    setPullUrl(serviceName);
    if (serviceSource) {
      if (serviceSource.includes('github')) {
        setSelectedSource('github');
      } else if (serviceSource.includes('gitee')) {
        setSelectedSource('gitee');
      } else if (serviceSource.includes('direct') || serviceSource.includes('url')) {
        setSelectedSource('direct');
      }
    }
    setShowSearchResults(false);
  };

  const getActualDownloadUrl = (): string => {
    const source = REGISTRY_SOURCES.find(s => s.id === selectedSource);
    if (!source) return '';
    if (selectedSource === 'direct') return source.downloadUrl;
    if (!pullUrl.trim()) return source.downloadUrl;
    
    if (selectedSource === 'gitee') {
      if (pullUrl.includes('/') && !pullUrl.startsWith('http')) {
        return `https://gitee.com/mcpilotx/mcp-server-hub/raw/master/${pullUrl}/mcp.json`;
      }
    } else if (selectedSource === 'github') {
      if (pullUrl.startsWith('github/') && !pullUrl.startsWith('http')) {
        const serverPath = pullUrl.replace('github/', '');
        return `https://raw.githubusercontent.com/MCPilotX/mcp-server-hub/refs/heads/main/github/${serverPath}/mcp.json`;
      } else if (pullUrl.includes('/') && !pullUrl.includes(':')) {
        return `github:${pullUrl}`;
      }
    }
    return source.downloadUrl;
  };

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('servers.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('servers.title')}</h1>
        <p className="text-gray-600 dark:text-gray-400 mt-2">{t('servers.subtitle')}</p>
      </div>

      {queryError && (
        <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-700 dark:text-red-400">{(queryError as Error).message}</p>
        </div>
      )}

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">{t('servers.pullNewServer')}</h2>
        
        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {t('servers.registrySource')}
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {REGISTRY_SOURCES.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setSelectedSource(source.id)}
                className={`px-3 py-2 text-sm rounded-lg border text-left transition-colors ${
                  selectedSource === source.id
                    ? 'bg-primary-50 border-primary-500 text-primary-700 dark:bg-primary-900/20 dark:text-primary-400'
                    : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50 dark:bg-gray-800 dark:border-gray-600 dark:text-gray-300'
                }`}
              >
                <div className="font-medium">{source.name}</div>
                <div className="text-xs opacity-70 truncate">{source.description}</div>
              </button>
            ))}
          </div>
          
          <div className="mt-3 p-3 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg">
            <div className="flex items-start">
              <Activity className="h-5 w-5 text-gray-400 mt-0.5" />
              <div className="ml-3">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {t('servers.downloadUrlInfo')}: {REGISTRY_SOURCES.find(s => s.id === selectedSource)?.name}
                </p>
                <div className="mt-1 p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded text-xs font-mono text-gray-800 dark:text-gray-200 break-all">
                  {getActualDownloadUrl()}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('servers.searchServers')}
            </label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  placeholder={t('servers.searchPlaceholder', { source: REGISTRY_SOURCES.find(s => s.id === selectedSource)?.name })}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                />
              </div>
              <button
                onClick={handleSearch}
                disabled={searchLoading}
                className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {searchLoading ? 'Searching...' : t('common.search')}
              </button>
            </div>
            
            {showSearchResults && (
              <div className="mt-3 border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden bg-gray-50 dark:bg-gray-900/30">
                <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-sm font-medium">Search Results ({searchResults.length})</span>
                  <button onClick={() => setShowSearchResults(false)} className="text-xs text-primary-500">Close</button>
                </div>
                <div className="max-h-60 overflow-auto divide-y divide-gray-200 dark:divide-gray-700">
                  {searchResults.map((service, index) => (
                    <div
                      key={index}
                      className="px-4 py-3 hover:bg-white dark:hover:bg-gray-800 cursor-pointer"
                      onClick={() => handleSelectSearchResult(service.name, service.source)}
                    >
                      <div className="font-medium text-gray-900 dark:text-white">{service.name}</div>
                      {service.description && <div className="text-sm text-gray-500 truncate">{service.description}</div>}
                    </div>
                  ))}
                  {searchResults.length === 0 && !searchLoading && <div className="p-4 text-center text-gray-500">No results found</div>}
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('servers.pullDescription')}
            </label>
            <div className="flex space-x-2">
              <input
                type="text"
                value={pullUrl}
                onChange={(e) => setPullUrl(e.target.value)}
                placeholder={t('servers.pullPlaceholder')}
                className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                onKeyDown={(e) => e.key === 'Enter' && handlePullServer()}
              />
              <button
                onClick={handlePullServer}
                disabled={pullServerMutation.isPending || !pullUrl.trim()}
                className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 disabled:opacity-50"
              >
                {pullServerMutation.isPending ? 'Pulling...' : t('servers.pullButton')}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">{t('servers.pulledServers')}</h2>
        </div>
        
        {servers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Layers className="mx-auto h-12 w-12 opacity-20 mb-4" />
            <p>{t('servers.noServers')}</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {servers.map((server) => (
              <li key={server.id} className="px-6 py-4 hover:bg-gray-50 dark:hover:bg-gray-900/50">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <div className={`h-2.5 w-2.5 rounded-full ${server.status === 'running' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                    <div>
                      <p className="text-sm font-medium text-gray-900 dark:text-white">{formatMCPServerName(server.name)}</p>
                      <p className="text-xs text-gray-500">v{server.version} • {server.status}</p>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    {server.status === 'running' ? (
                      <button
                        onClick={() => handleStopServer(server.id)}
                        className="px-3 py-1.5 text-xs bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 rounded-md hover:bg-red-200 transition-colors"
                      >
                        {t('servers.stop')}
                      </button>
                    ) : (
                      <button
                        onClick={() => handleStartServer(server.id)}
                        disabled={startingServers.has(server.id)}
                        className="px-3 py-1.5 text-xs bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 rounded-md hover:bg-green-200 transition-colors disabled:opacity-50"
                      >
                        {startingServers.has(server.id) ? 'Starting...' : t('servers.start')}
                      </button>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
