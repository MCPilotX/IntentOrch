import React, { useState, useRef, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { 
  Home, 
  Server, 
  PlayCircle, 
  Settings, 
  Key, 
  Workflow,
  FileText,
  Menu,
  X,
  ChevronRight,
  Search,
  User,
  LogOut,
  Activity,
  Clock,
  Sparkles,
  ChevronRight as ChevronRightIcon,
  Mail,
  QrCode,
  MessageSquare
} from 'lucide-react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiService } from '../../services/api';
import { useAuth } from '../../contexts/AuthContext';
import { useLanguage } from '../../contexts/LanguageContext';
import LanguageSwitcher from '../common/LanguageSwitcher';
import { formatRelativeTime, formatMCPServerName } from '../../utils/format';

const Layout: React.FC = () => {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const { logout } = useAuth();
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const searchRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Get system statistics
  const { data: stats } = useQuery({
    queryKey: ['systemStats'],
    queryFn: () => apiService.getSystemStats(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Global search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<{
    servers: any[];
    processes: any[];
    logs: any[];
  }>({ servers: [], processes: [], logs: [] });
  const [showSearchResults, setShowSearchResults] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  // Handle global search
  const handleGlobalSearch = async (query: string) => {
    if (!query.trim()) {
      setSearchResults({ servers: [], processes: [], logs: [] });
      setShowSearchResults(false);
      return;
    }

    setSearchLoading(true);
    try {
      // Search servers
      const serverResults = await apiService.searchServices(query, 'all');
      
      // Search processes (client-side filtering for now)
      const processes = await queryClient.fetchQuery({
        queryKey: ['processes'],
        queryFn: () => apiService.getProcesses(),
      });
      const filteredProcesses = (processes as any[]).filter((process: any) =>
        process.serverName.toLowerCase().includes(query.toLowerCase()) ||
        process.serverId.toLowerCase().includes(query.toLowerCase())
      );

      // Search logs (client-side filtering for now)
      const systemLogs = await queryClient.fetchQuery({
        queryKey: ['systemLogs'],
        queryFn: () => apiService.getSystemLogs(),
      });
      const filteredLogs = (systemLogs as string[]).filter((log: string) =>
        log.toLowerCase().includes(query.toLowerCase())
      ).slice(0, 10); // Limit to 10 log entries

      setSearchResults({
        servers: serverResults.services,
        processes: filteredProcesses,
        logs: filteredLogs.map((log: string, index: number) => ({
          id: `log-${index}`,
          message: log,
          timestamp: new Date().toISOString(),
        }))
      });
      setShowSearchResults(true);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults({ servers: [], processes: [], logs: [] });
    } finally {
      setSearchLoading(false);
    }
  };

  // Handle search input change with debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    
    // Simple debounce
    const timeoutId = setTimeout(() => {
      handleGlobalSearch(value);
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  // Handle search key press
  const handleSearchKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleGlobalSearch(searchQuery);
    } else if (e.key === 'Escape') {
      setShowSearchResults(false);
    }
  };

  // Handle click outside to close search results
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setShowSearchResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Handle search result click
  const handleSearchResultClick = (type: 'server' | 'process' | 'log') => {
    setShowSearchResults(false);
    setSearchQuery('');
    
    switch (type) {
      case 'server':
        navigate('/servers');
        break;
      case 'process':
        navigate('/processes');
        break;
      case 'log':
        navigate('/logs');
        break;
    }
  };

  // Calculate total results
  const totalResults = searchResults.servers.length + searchResults.processes.length + searchResults.logs.length;

  const navigation = [
    { name: t('layout.dashboard'), href: '/', icon: Home },
    { name: t('layout.serverManagement'), href: '/servers', icon: Server },
    { name: t('layout.processMonitoring'), href: '/processes', icon: PlayCircle },
    { name: t('orchestration.title'), href: '/orchestration', icon: Sparkles },
    { name: t('layout.workflowOrchestration'), href: '/workflows', icon: Workflow },
    { name: t('layout.configurationManagement'), href: '/config', icon: Settings },
    { name: t('layout.secretsManagement'), href: '/secrets', icon: Key },
    { name: t('layout.logViewer'), href: '/logs', icon: FileText },
  ];

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="p-2 rounded-md bg-white dark:bg-gray-800 shadow-md"
        >
          {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar - Desktop */}
      <div className={`hidden lg:flex flex-col fixed inset-y-0 z-40 ${sidebarOpen ? 'w-64' : 'w-20'} transition-all duration-300`}>
        <div className="flex flex-col flex-1 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700">
          {/* Logo area */}
          <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
                <img 
                  src="/logo.jpg" 
                  alt="Intentorch Logo" 
                  className="w-full h-full object-cover"
                />
              </div>
              {sidebarOpen && (
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Intentorch</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">You say it, MCP does it</p>
                </div>
              )}
            </div>
            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="ml-auto p-1 rounded-md hover:bg-gray-100 dark:hover:bg-gray-700"
            >
              <ChevronRight className={`w-5 h-5 transition-transform ${sidebarOpen ? 'rotate-180' : ''}`} />
            </button>
          </div>

          {/* Navigation menu */}
          <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.name}
                  to={item.href}
                  end={item.href === '/'}
                  className={({ isActive }: { isActive: boolean }) =>
                    `flex items-center px-3 py-2 rounded-lg transition-colors ${
                      isActive
                        ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                        : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                    } ${!sidebarOpen ? 'justify-center' : ''}`
                  }
                >
                  <Icon className="w-5 h-5" />
                  {sidebarOpen && <span className="ml-3">{item.name}</span>}
                </NavLink>
              );
            })}
          </nav>

          {/* System status */}
          {sidebarOpen && stats && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">{t('layout.systemStatus')}</div>
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500 dark:text-gray-400">{t('layout.running')}</span>
                  <span className="font-medium text-green-600 dark:text-green-400">
                    {stats.totalServers > 0 ? `${stats.runningServers}/${stats.totalServers}` : t('dashboard.noRunningServers')}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Mobile sidebar */}
      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <div className="fixed inset-0 bg-black bg-opacity-50" onClick={() => setMobileMenuOpen(false)} />
          <div className="fixed inset-y-0 left-0 w-64 bg-white dark:bg-gray-800 shadow-lg">
            <div className="flex items-center h-16 px-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center space-x-3">
                <div className="w-8 h-8 rounded-lg overflow-hidden flex items-center justify-center">
                  <img 
                    src="/logo.jpg" 
                    alt="Intentorch Logo" 
                    className="w-full h-full object-cover"
                  />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 dark:text-white">Intentorch</h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">You say it, MCP does it</p>
                </div>
              </div>
            </div>
            <nav className="px-4 py-6 space-y-1">
              {navigation.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.name}
                    to={item.href}
                    end={item.href === '/'}
                    className={({ isActive }: { isActive: boolean }) =>
                      `flex items-center px-3 py-2 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-primary-50 dark:bg-primary-900/20 text-primary-600 dark:text-primary-400'
                          : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700'
                      }`
                    }
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Icon className="w-5 h-5" />
                    <span className="ml-3">{item.name}</span>
                  </NavLink>
                );
              })}
            </nav>
          </div>
        </div>
      )}

      {/* Main content area */}
      <div className={`flex-1 ${sidebarOpen ? 'lg:ml-64' : 'lg:ml-20'} transition-all duration-300`}>
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center justify-between h-16 px-4 lg:px-6">
            <div className="flex-1 max-w-2xl" ref={searchRef}>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="search"
                  placeholder={t('common.search.placeholder')}
                  className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={searchQuery}
                  onChange={handleSearchChange}
                  onKeyDown={handleSearchKeyPress}
                  onFocus={() => {
                    if (searchQuery.trim() && totalResults > 0) {
                      setShowSearchResults(true);
                    }
                  }}
                />
                
                {/* Search loading indicator */}
                {searchLoading && (
                  <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-primary-500"></div>
                  </div>
                )}
                
                {/* Search results dropdown */}
                {showSearchResults && searchQuery.trim() && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg z-50 max-h-96 overflow-y-auto">
                    <div className="p-3 border-b border-gray-200 dark:border-gray-700">
                      <div className="flex justify-between items-center">
                        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('common.search.results')} ({totalResults})
                        </span>
                        <button
                          onClick={() => setShowSearchResults(false)}
                          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                        >
                          {t('common.close')}
                        </button>
                      </div>
                    </div>
                    
                    {totalResults === 0 ? (
                      <div className="p-4 text-center text-gray-500 dark:text-gray-400">
                        <p>{t('common.search.noResults')}</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-gray-100 dark:divide-gray-700">
                        {/* Servers section */}
                        {searchResults.servers.length > 0 && (
                          <div>
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                              <div className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                <Server className="w-4 h-4 mr-2" />
                                {t('common.search.servers')} ({searchResults.servers.length})
                              </div>
                            </div>
                            {searchResults.servers.slice(0, 5).map((server, index) => (
                              <div
                                key={`server-${index}`}
                                className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => handleSearchResultClick('server')}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-white">{formatMCPServerName(server.name)}</div>
                                    {server.description && (
                                      <div className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-md">
                                        {server.description}
                                      </div>
                                    )}
                                    {server.tags && server.tags.length > 0 && (
                                      <div className="flex flex-wrap gap-1 mt-1">
                                        {server.tags.slice(0, 3).map((tag: string, tagIndex: number) => (
                                          <span
                                            key={tagIndex}
                                            className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300"
                                          >
                                            {tag}
                                          </span>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Processes section */}
                        {searchResults.processes.length > 0 && (
                          <div>
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                              <div className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                <Activity className="w-4 h-4 mr-2" />
                                {t('common.search.processes')} ({searchResults.processes.length})
                              </div>
                            </div>
                            {searchResults.processes.slice(0, 5).map((process, index) => (
                              <div
                                key={`process-${index}`}
                                className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => handleSearchResultClick('process')}
                              >
                                <div className="flex items-center justify-between">
                                  <div>
                                    <div className="font-medium text-gray-900 dark:text-white">{formatMCPServerName(process.serverName)}</div>
                                    <div className="text-sm text-gray-600 dark:text-gray-400">
                                      PID: {process.pid} • {process.status}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      <Clock className="w-3 h-3 inline mr-1" />
                                      Started {formatRelativeTime(process.startedAt)}
                                    </div>
                                  </div>
                                  <ChevronRightIcon className="w-4 h-4 text-gray-400" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* Logs section */}
                        {searchResults.logs.length > 0 && (
                          <div>
                            <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900">
                              <div className="flex items-center text-sm font-medium text-gray-700 dark:text-gray-300">
                                <FileText className="w-4 h-4 mr-2" />
                                {t('common.search.logs')} ({searchResults.logs.length})
                              </div>
                            </div>
                            {searchResults.logs.slice(0, 5).map((log, index) => (
                              <div
                                key={`log-${index}`}
                                className="px-3 py-2 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer"
                                onClick={() => handleSearchResultClick('log')}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1 min-w-0">
                                    <div className="text-sm text-gray-900 dark:text-white truncate">
                                      {log.message}
                                    </div>
                                    <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                                      <Clock className="w-3 h-3 inline mr-1" />
                                      {formatRelativeTime(log.timestamp)}
                                    </div>
                                  </div>
                                  <ChevronRightIcon className="w-4 h-4 text-gray-400 ml-2 flex-shrink-0" />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        
                        {/* View all results link */}
                        {totalResults > 0 && (
                          <div className="px-3 py-2 bg-gray-50 dark:bg-gray-900 border-t border-gray-200 dark:border-gray-700">
                            <button
                              onClick={() => {
                                setShowSearchResults(false);
                                navigate('/search?q=' + encodeURIComponent(searchQuery));
                              }}
                              className="w-full text-center text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
                            >
                              {t('common.search.viewAllResults')}
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <LanguageSwitcher />
              
              <div className="flex items-center space-x-3 group relative">
                <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                  <User className="w-5 h-5 text-primary-600 dark:text-primary-400" />
                </div>
                <div className="hidden md:block">
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Administrator</div>
                  <div className="text-xs text-gray-500 dark:text-gray-400">Authenticated</div>
                </div>
                
                {/* Logout dropdown menu */}
                <div className="absolute top-full right-0 mt-2 w-48 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                  <div className="py-1">
                    <button
                      onClick={logout}
                      className="w-full flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    >
                      <LogOut className="w-4 h-4 mr-3" />
                      {t('layout.logout')}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6">
          <Outlet />
        </main>

        {/* Footer */}
        <footer className="border-t border-gray-200 dark:border-gray-700 px-4 lg:px-6 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center text-sm text-gray-500 dark:text-gray-400">
            <div className="flex flex-col md:flex-row items-center space-y-1 md:space-y-0 md:space-x-4 mb-2 md:mb-0">
              <div>
                {t('layout.footer.copyright', { year: new Date().getFullYear() })}
              </div>
              <div className="hidden md:block">•</div>
              <div>
                <span>{t('layout.footer.version')}: v0.8.0</span>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              {/* Email contact */}
              <a 
                href="mailto:applesline@163.com" 
                className="flex items-center hover:text-primary-500 transition-colors"
                title={t('layout.footer.emailTitle')}
              >
                <Mail className="w-4 h-4 mr-1" />
                <span className="hidden sm:inline">applesline@163.com</span>
              </a>
              
              {/* WeChat QR Code with popup */}
              <div className="relative group">
                <button className="flex items-center hover:text-primary-500 transition-colors" title={t('layout.footer.wechatTitle')}>
                  <QrCode className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{t('layout.footer.wechat')}</span>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 min-w-64">
                  <div className="text-center">
                    <img 
                      src="/wechat-qrcode.jpg" 
                      alt={t('layout.footer.wechatTitle')} 
                      className="w-48 h-48 object-contain rounded bg-white p-2"
                    />
                    <p className="text-sm mt-3 text-gray-600 dark:text-gray-400">{t('layout.footer.wechatScan')}</p>
                  </div>
                </div>
              </div>
              
              {/* QQ Group with popup */}
              <div className="relative group">
                <button className="flex items-center hover:text-primary-500 transition-colors" title={t('layout.footer.qqGroupTitle')}>
                  <MessageSquare className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">{t('layout.footer.qqGroup')}</span>
                </button>
                <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 hidden group-hover:block bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 min-w-64">
                  <div className="text-center">
                    <img 
                      src="/qq-qrcode.jpg" 
                      alt={t('layout.footer.qqGroupTitle')} 
                      className="w-48 h-48 object-contain rounded bg-white p-2"
                    />
                    <p className="text-sm mt-3 text-gray-600 dark:text-gray-400">{t('layout.footer.qqGroupScan')}</p>
                  </div>
                </div>
              </div>
              
              {/* GitHub link */}
              <a 
                href="https://github.com/MCPilotX/IntentOrch" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center hover:text-primary-500 transition-colors"
                title={t('layout.footer.githubTitle')}
              >
                <span className="text-sm font-medium">{t('layout.footer.github')}</span>
              </a>
              
              {/* Gitee link */}
              <a 
                href="https://gitee.com/MCPilotX/IntentOrch" 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center hover:text-primary-500 transition-colors"
                title={t('layout.footer.giteeTitle')}
              >
                <span className="text-sm font-medium">{t('layout.footer.gitee')}</span>
              </a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Layout;