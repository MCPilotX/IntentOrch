import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { formatMCPServerName } from '../utils/format';
import type { MCPServer } from '../types';
import toast from 'react-hot-toast';
import { 
  Search, Layers, Activity, FileJson, Globe, Terminal, 
  Box, ChevronDown, ChevronUp, Cpu, Info, Play, Loader2, 
  Plus, DownloadCloud, Trash2
} from 'lucide-react';
import ToolCallModal from '../components/servers/ToolCallModal';

// Registry sources available (official removed)
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

// Default Claude Desktop config template
const DEFAULT_CLAUDE_CONFIG = `{
  "mcpServers": {
    "mysql-mcp": {
      "url": "http://localhost:8082/sse"
    },
    "filesystem": {
      "command": "node",
      "args": ["/path/to/index.js"]
    }
  }
}`;

// Tab definitions
const TABS = [
  { id: 'mcp-standard', labelKey: 'servers.tabMCPStandard', icon: Layers },
  { id: 'explore', labelKey: '探索与市场', icon: Globe },
] as const;

type TabId = typeof TABS[number]['id'];

export default function Servers() {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<TabId>('mcp-standard');
  const [pullUrl, setPullUrl] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
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
  const [expandedTools, setExpandedTools] = useState<Set<string>>(new Set());
  const [callingTool, setCallingTool] = useState<{ server: MCPServer; tool: any } | null>(null);

  const toggleTools = (serverId: string) => {
    setExpandedTools(prev => {
      const next = new Set(prev);
      if (next.has(serverId)) next.delete(serverId);
      else next.add(serverId);
      return next;
    });
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearchLoading(true);
    setSearchError(null);
    setShowSearchResults(true);
    
    try {
      const sources = selectedSource === 'all' ? ['github', 'gitee', 'smithery'] : [selectedSource];
      const allResults = await Promise.all(
        sources.map(src => apiService.searchServices(searchQuery, src, 15, 0))
      );
      
      const combined = allResults.flatMap(res => res.services);
      setSearchResults(combined.sort((a, b) => a.name.localeCompare(b.name)));
    } catch (error: any) {
      setSearchError(error.message);
    } finally {
      setSearchLoading(false);
    }
  };

  const handleExecuteTool = async (params: Record<string, any>) => {
    if (!callingTool) return;

    try {
      const result = await apiService.executeSteps({
        steps: [{
          id: `manual_${Date.now()}`,
          type: 'tool',
          serverName: callingTool.server.name,
          toolName: callingTool.tool.name,
          parameters: params
        }]
      });

      if (!result.success) {
        throw new Error(result.error || 'Execution failed');
      }

      return result.executionSteps?.[0]?.result || result.result;
    } catch (error: any) {
      console.error('Tool execution failed:', error);
      throw error;
    }
  };
  
  const [importConfigText, setImportConfigText] = useState(DEFAULT_CLAUDE_CONFIG);
  const [importResult, setImportResult] = useState<{ success: boolean; message: string; imported: any[]; total: number } | null>(null);

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

  const importConfigMutation = useMutation({
    mutationFn: (config: string) => apiService.importConfig(config),
    onSuccess: (data) => {
      setImportResult(data);
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      toast.success(data.message || `Successfully imported ${data.total} MCP server(s)`);
    },
    onError: (error: any) => {
      setImportResult({ success: false, message: error.message, imported: [], total: 0 });
      toast.error(error.message || 'Failed to import config');
    }
  });

  const startServerMutation = useMutation({
    mutationFn: (serverId: string) => apiService.startServer({ serverId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('servers.startSuccess') || 'Server started successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || t('servers.error.startFailed'));
    }
  });

  const stopProcessMutation = useMutation({
    mutationFn: (pid: number) => apiService.stopProcess({ pid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] });
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      toast.success(t('servers.stopSuccess') || 'Server stopped successfully');
    },
    onError: (error: any) => {
      toast.error(error.message || t('servers.error.stopFailed'));
    }
  });

  const handleStartServer = (serverId: string) => {
    setStartingServers(prev => new Set(prev).add(serverId));
    startServerMutation.mutate(serverId, {
      onSettled: () => {
        setStartingServers(prev => {
          const next = new Set(prev);
          next.delete(serverId);
          return next;
        });
      }
    });
  };

  const handleStopServer = (id: string) => {
    const pid = parseInt(id);
    if (!isNaN(pid)) {
      stopProcessMutation.mutate(pid);
    }
  };

  const handleImportConfig = () => {
    if (!importConfigText.trim()) return;
    importConfigMutation.mutate(importConfigText);
  };

  if (isLoading && servers.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-primary-500 mx-auto" />
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

      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 overflow-hidden">
        {/* Tab Header */}
        <div className="border-b border-gray-100 dark:border-gray-700 bg-gray-50/50 dark:bg-gray-900/20 px-2">
          <nav className="flex space-x-1" aria-label="Tabs">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => {
                    setActiveTab(tab.id);
                    setImportResult(null);
                  }}
                  className={`flex items-center space-x-2 px-6 py-4 text-sm font-bold transition-all relative ${
                    activeTab === tab.id
                      ? 'text-primary-600 dark:text-primary-400'
                      : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t(tab.labelKey) || tab.labelKey}</span>
                  {activeTab === tab.id && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-primary-500 rounded-t-full"></div>
                  )}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Tab Content */}
        <div className="divide-y divide-gray-100 dark:divide-gray-700">
          {/* Main Management Tab */}
          {activeTab === 'mcp-standard' && (
            <div className="flex flex-col lg:flex-row divide-y lg:divide-y-0 lg:divide-x divide-gray-100 dark:divide-gray-700 min-h-[600px]">
              {/* Left: Server List */}
              <div className="flex-[7] bg-white dark:bg-gray-800">
                <div className="px-6 py-4 bg-gray-50/30 dark:bg-gray-900/10 border-b border-gray-100 dark:border-gray-700 flex justify-between items-center">
                   <h3 className="font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                      <Layers className="h-4 w-4 text-primary-500" />
                      <span>已安装服务 ({servers.length})</span>
                   </h3>
                   <button 
                     onClick={() => setActiveTab('explore')}
                     className="text-xs font-bold text-primary-500 hover:underline flex items-center space-x-1"
                   >
                     <Plus className="h-3 w-3" />
                     <span>添加服务</span>
                   </button>
                </div>
                {servers.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-96 text-center p-8">
                    <div className="p-4 bg-gray-50 dark:bg-gray-900 rounded-full mb-4">
                      <Box className="h-12 w-12 text-gray-300" />
                    </div>
                    <p className="text-gray-500 max-w-xs">{t('servers.noServers')}</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700">
                    {servers.map((server) => (
                      <li key={server.id} className="flex flex-col hover:bg-gray-50/80 dark:hover:bg-gray-900/30 transition-colors">
                        <div className="px-6 py-5 flex items-center justify-between">
                          <div className="flex items-center space-x-4">
                            <div className={`h-3 w-3 rounded-full shadow-sm ${server.status === 'running' ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`}></div>
                      <div className="flex items-center space-x-2">
                        <p className="text-sm font-bold text-gray-900 dark:text-white">
                          {formatMCPServerName(server.displayName || server.name)}
                        </p>
                        <span className={`px-1.5 py-0.5 text-[9px] font-bold rounded uppercase tracking-wider ${
                          server.runtime.type === 'remote' ? 'bg-purple-100 text-purple-600' : 'bg-blue-100 text-blue-600'
                        }`}>
                          {server.runtime.type}
                        </span>
                      </div>
                      <p className="text-[11px] text-gray-500 mt-0.5">
                        {server.name !== server.displayName ? `${server.name} • ` : ''}
                        v{server.version} • {server.status}
                      </p>
                          </div>
                          
                          <div className="flex items-center space-x-3">
                            <button 
                              onClick={() => toggleTools(server.id)}
                              className="flex items-center space-x-1.5 px-3 py-1 bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400 rounded-full hover:bg-primary-100 transition-all border border-primary-100 dark:border-primary-800/50"
                            >
                              <Box className="h-3.5 w-3.5" />
                              <span className="text-xs font-bold">{server.tools?.length || 0}</span>
                              {expandedTools.has(server.id) ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                            </button>

                            <div className="flex space-x-1">
                              {server.status === 'running' ? (
                                <button onClick={() => handleStopServer(server.id)} className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors" title="Stop">
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              ) : (
                                <button 
                                  onClick={() => handleStartServer(server.name)} 
                                  disabled={startingServers.has(server.name)}
                                  className="p-2 text-green-500 hover:bg-green-50 rounded-lg transition-colors disabled:opacity-50" 
                                  title="Start"
                                >
                                  {startingServers.has(server.name) ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4 fill-current" />}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Tools Sub-view */}
                        {expandedTools.has(server.id) && (
                          <div className="px-6 pb-6 pt-2 bg-gray-50/30 dark:bg-black/10 animate-in fade-in slide-in-from-top-1 duration-200">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {server.tools?.map((tool, idx) => (
                                <div key={idx} className="group p-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl shadow-sm hover:border-primary-400 transition-all">
                                  <div className="flex justify-between items-start mb-1">
                                    <h4 className="text-xs font-bold text-gray-900 dark:text-white truncate pr-2">{tool.name}</h4>
                                    <button
                                      onClick={() => setCallingTool({ server, tool })}
                                      className="p-1 bg-primary-100 text-primary-600 rounded-md hover:bg-primary-600 hover:text-white transition-all shadow-sm"
                                    >
                                      <Play className="h-3 w-3 fill-current" />
                                    </button>
                                  </div>
                                  <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">{tool.description}</p>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Right: Quick Import SidePanel */}
              <div className="flex-[3] p-6 bg-gray-50/20 dark:bg-gray-900/10 space-y-6">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center">
                    <DownloadCloud className="h-4 w-4 mr-2 text-primary-500" />
                    快速导入配置
                  </h4>
                  <p className="text-xs text-gray-500">粘贴并导入您的 Claude Desktop 配置文件</p>
                </div>

                <div className="relative group">
                  <textarea
                    value={importConfigText}
                    onChange={(e) => setImportConfigText(e.target.value)}
                    className="w-full h-80 px-4 py-3 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-2xl font-mono text-[11px] leading-relaxed focus:ring-4 focus:ring-primary-500/10 focus:border-primary-500 transition-all shadow-inner"
                    placeholder="Paste JSON here..."
                  />
                </div>

                {importResult && (
                  <div className={`p-4 rounded-xl text-xs ${importResult.success ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                    {importResult.message}
                  </div>
                )}

                <button
                  onClick={handleImportConfig}
                  disabled={importConfigMutation.isPending || !importConfigText.trim()}
                  className="w-full py-3 bg-gray-900 dark:bg-white text-white dark:text-gray-900 rounded-2xl font-bold text-sm shadow-xl hover:opacity-90 active:scale-95 transition-all flex items-center justify-center space-x-2"
                >
                  {importConfigMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Terminal className="h-4 w-4" />}
                  <span>立即导入</span>
                </button>
              </div>
            </div>
          )}

          {/* Explore Marketplace Tab */}
          {activeTab === 'explore' && (
            <div className="p-8 space-y-8 animate-in fade-in slide-in-from-bottom-2 duration-300">
              <div className="max-w-3xl mx-auto text-center space-y-2">
                <h2 className="text-2xl font-black text-gray-900 dark:text-white tracking-tight">发现 MCP 宇宙</h2>
                <p className="text-gray-500 text-sm">跨平台搜索全球开源 MCP 工具</p>
              </div>

              <div className="max-w-4xl mx-auto">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="relative flex-1 group">
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
                    <input
                      type="text"
                      placeholder="输入关键词，如 'mysql', 'weather'..."
                      className="w-full pl-12 pr-4 py-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl focus:border-primary-500 transition-all shadow-sm"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    />
                  </div>
                  <select
                    value={selectedSource}
                    onChange={(e) => setSelectedSource(e.target.value)}
                    className="px-4 py-4 bg-white dark:bg-gray-800 border-2 border-gray-100 dark:border-gray-700 rounded-2xl font-bold text-sm"
                  >
                    <option value="all">所有平台</option>
                    <option value="smithery">Smithery.ai</option>
                    <option value="github">GitHub</option>
                    <option value="gitee">Gitee</option>
                  </select>
                  <button
                    onClick={handleSearch}
                    disabled={searchLoading}
                    className="px-10 py-4 bg-primary-600 hover:bg-primary-700 text-white rounded-2xl font-black shadow-lg shadow-primary-500/30 transition-all flex items-center justify-center space-x-2"
                  >
                    {searchLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : <Search className="h-5 w-5" />}
                    <span>探索</span>
                  </button>
                </div>

                <div className="mt-8 flex flex-col items-center">
                  <div className="flex items-center space-x-4 w-full opacity-40">
                    <div className="h-px flex-1 bg-gray-300"></div>
                    <span className="text-[10px] font-black uppercase tracking-[0.2em]">直连模式</span>
                    <div className="h-px flex-1 bg-gray-300"></div>
                  </div>
                  <div className="mt-4 flex w-full max-w-xl space-x-2">
                     <input
                      type="text"
                      placeholder="粘贴 URL (SSE/Git) 或本地路径..."
                      className="flex-1 px-4 py-2 text-xs bg-gray-100/50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-xl"
                      value={pullUrl}
                      onChange={(e) => setPullUrl(e.target.value)}
                    />
                    <button
                      onClick={() => pullServerMutation.mutate(pullUrl)}
                      disabled={pullServerMutation.isPending || !pullUrl.trim()}
                      className="px-6 py-2 text-[10px] font-black bg-gray-800 dark:bg-white text-white dark:text-gray-900 rounded-xl uppercase tracking-tighter"
                    >
                      拉取
                    </button>
                  </div>
                </div>
              </div>

              {showSearchResults && (
                <div className="max-w-6xl mx-auto space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {searchResults.map((result) => (
                      <div key={result.name} className="group p-6 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-3xl shadow-sm hover:shadow-2xl hover:-translate-y-1 transition-all border-b-4 hover:border-b-primary-500">
                        <div className="flex justify-between items-start mb-4">
                          <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-widest ${
                            result.source === 'github' ? 'bg-black text-white' : 
                            result.source === 'smithery' ? 'bg-orange-500 text-white' :
                            'bg-red-500 text-white'
                          }`}>
                            {result.source}
                          </span>
                          <button
                            onClick={() => pullServerMutation.mutate(result.source === 'smithery' ? `smithery:${result.name}` : result.name)}
                            disabled={pullServerMutation.isPending}
                            className="p-2 bg-gray-50 hover:bg-primary-500 hover:text-white text-gray-400 rounded-xl transition-all"
                          >
                            <DownloadCloud className="h-5 w-5" />
                          </button>
                        </div>
                        <h4 className="text-lg font-black text-gray-900 dark:text-white mb-2 leading-tight">{result.name}</h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400 line-clamp-3 leading-relaxed">
                          {result.description || '发现无限可能的 MCP 服务能力...'}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Interactive Tool Laboratory */}
      {callingTool && (
        <ToolCallModal
          isOpen={!!callingTool}
          onClose={() => setCallingTool(null)}
          serverName={callingTool.server.name}
          tool={callingTool.tool}
          onExecute={handleExecuteTool}
        />
      )}
    </div>
  );
}
