import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { X, Box, Info, Play, Search, Layers, Cpu } from 'lucide-react';
import { apiService } from '../../services/api';
import { formatMCPServerName } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';
import type { MCPServer } from '../../types';

interface ToolLibraryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertTool: (toolName: string) => void;
}

const ToolLibraryDrawer: React.FC<ToolLibraryDrawerProps> = ({ isOpen, onClose, onInsertTool }) => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = React.useState('');

  const { data: servers = [], isLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiService.getServers(),
  });

  if (!isOpen) return null;

  const filteredServers = servers.filter(server => 
    server.status === 'running' || server.tools?.length > 0
  );

  const searchResults = filteredServers.map(server => ({
    ...server,
    tools: server.tools?.filter(tool => 
      tool.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tool.description.toLowerCase().includes(searchTerm.toLowerCase())
    ) || []
  })).filter(server => server.tools.length > 0);

  return (
    <div className="absolute inset-y-0 right-0 w-80 bg-white dark:bg-gray-800 shadow-2xl border-l border-gray-200 dark:border-gray-700 z-40 flex flex-col animate-in slide-in-from-right duration-300">
      {/* Header */}
      <div className="p-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between bg-gray-50/50 dark:bg-gray-900/20">
        <div className="flex items-center space-x-2">
          <Layers className="h-4 w-4 text-primary-500" />
          <h3 className="font-bold text-gray-900 dark:text-white">可用工具参考库</h3>
        </div>
        <button onClick={onClose} className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors">
          <X className="h-5 w-5 text-gray-400" />
        </button>
      </div>

      {/* Search */}
      <div className="p-4">
        <div className="relative group">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 group-focus-within:text-primary-500 transition-colors" />
          <input
            type="text"
            placeholder="搜索工具或功能..."
            className="w-full pl-9 pr-4 py-2 bg-gray-100 dark:bg-gray-900 border-transparent focus:bg-white dark:focus:bg-gray-950 border-2 focus:border-primary-500 rounded-xl text-sm transition-all outline-none"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 pt-0 space-y-6">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center h-40 space-y-2 opacity-50">
            <div className="w-6 h-6 border-2 border-primary-500 border-t-transparent animate-spin rounded-full"></div>
            <p className="text-xs">加载工具中...</p>
          </div>
        ) : searchResults.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 opacity-40 text-center px-4">
            <Box className="h-8 w-8 mb-2" />
            <p className="text-xs italic">未找到匹配工具，请确保已启动相关服务</p>
          </div>
        ) : (
          searchResults.map((server) => (
            <div key={server.id} className="space-y-3">
              <div className="flex items-center space-x-2 px-1">
                <div className={`h-1.5 w-1.5 rounded-full ${server.status === 'running' ? 'bg-green-500' : 'bg-gray-300'}`}></div>
                <span className="text-[10px] font-black uppercase tracking-wider text-gray-400 truncate">
                  {formatMCPServerName(server.displayName || server.name)}
                </span>
              </div>
              <div className="grid gap-2">
                {server.tools.map((tool, idx) => (
                  <div 
                    key={idx}
                    className="group p-3 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-700 rounded-xl hover:border-primary-500 hover:shadow-sm transition-all cursor-pointer relative"
                    onClick={() => onInsertTool(tool.name)}
                  >
                    <div className="flex justify-between items-start mb-1">
                      <h4 className="text-xs font-bold text-gray-800 dark:text-gray-200 group-hover:text-primary-600 transition-colors truncate pr-4">
                        {tool.name}
                      </h4>
                      <Play className="h-3 w-3 text-gray-300 group-hover:text-primary-500 opacity-0 group-hover:opacity-100 transition-all fill-current" />
                    </div>
                    <p className="text-[10px] text-gray-500 line-clamp-2 leading-tight">
                      {tool.description}
                    </p>
                    {/* Tooltip hint on hover */}
                    <div className="absolute -left-12 top-1/2 -translate-y-1/2 bg-gray-800 text-white text-[9px] px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap shadow-xl">
                      点击插入
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Footer info */}
      <div className="p-4 bg-gray-50 dark:bg-gray-900/50 border-t border-gray-100 dark:border-gray-700">
        <div className="flex items-start space-x-2">
          <Info className="h-3.5 w-3.5 text-gray-400 mt-0.5" />
          <p className="text-[10px] text-gray-500 leading-normal">
            点击工具卡片可快速将工具名称插入对话框，帮助 AI 更精准地理解您的意图。
          </p>
        </div>
      </div>
    </div>
  );
};

export default ToolLibraryDrawer;
