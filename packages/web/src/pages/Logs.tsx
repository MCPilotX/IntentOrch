import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { 
  Search, 
  RefreshCw,
  Download,
  Trash2,
  Clock,
  AlertCircle,
  Info,
  XCircle,
  ChevronDown,
  ChevronUp,
  Copy,
  ExternalLink,
  Calendar,
  FileText,
  Server,
  Hash
} from 'lucide-react';
import { apiService } from '../services/api';
import { formatRelativeTime, exportLogsAsCSV, exportLogsAsJSON, formatMCPServerName } from '../utils/format';
import { useLanguage } from '../contexts/LanguageContext';

type LogLevel = 'info' | 'warning' | 'error' | 'debug' | 'all';
type LogSource = 'system' | 'server' | 'workflow' | 'all';

interface LogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  source: LogSource;
  sourceId?: string;
  sourceName?: string;
  message: string;
  details?: string;
}

const Logs: React.FC = () => {
  const { t } = useLanguage();
  const [searchTerm, setSearchTerm] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [sourceFilter, setSourceFilter] = useState<LogSource>('all');
  const [dateRange, setDateRange] = useState<string>('today');
  const [expandedLogs, setExpandedLogs] = useState<Set<string>>(new Set());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const exportMenuRef = useRef<HTMLDivElement>(null);

  // Get system logs
  const { data: systemLogs = [], isLoading, refetch } = useQuery({
    queryKey: ['systemLogs'],
    queryFn: () => apiService.getSystemLogs(),
    refetchInterval: autoRefresh ? 10000 : false, // 10 seconds auto refresh
  });

  // Get process list (for showing server log sources)
  const { data: processes = [] } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiService.getProcesses(),
    refetchInterval: 30000,
  });

  // Mock log data (in real projects should come from API)
  const mockLogs: LogEntry[] = [
    ...(Array.isArray(systemLogs) ? systemLogs : []).map((log, index) => ({
      id: `system-${index}`,
      timestamp: new Date(Date.now() - index * 60000).toISOString(),
      level: (['info', 'warning', 'error', 'debug'] as LogLevel[])[index % 4],
      source: 'system' as LogSource,
      sourceName: 'System Daemon',
      message: log,
    })),
    ...processes.slice(0, 3).flatMap((process, processIndex) => [
      {
        id: `server-${process.pid}-1`,
        timestamp: new Date(Date.now() - processIndex * 120000).toISOString(),
        level: 'info' as LogLevel,
        source: 'server' as LogSource,
        sourceId: process.serverId,
        sourceName: formatMCPServerName(process.serverName),
        message: `Server ${formatMCPServerName(process.serverName)} started successfully`,
        details: `PID: ${process.pid}, Started: ${formatRelativeTime(process.startedAt)}`,
      },
      {
        id: `server-${process.pid}-2`,
        timestamp: new Date(Date.now() - processIndex * 180000).toISOString(),
        level: process.status === 'error' ? 'error' : ('info' as LogLevel),
        source: 'server' as LogSource,
        sourceId: process.serverId,
        sourceName: formatMCPServerName(process.serverName),
        message: `Server ${formatMCPServerName(process.serverName)} status: ${process.status}`,
        details: `Server ${formatMCPServerName(process.serverName)} is running`,
      },
    ]),
  ];

  // Filter logs
  const filteredLogs = mockLogs.filter(log => {
    const matchesSearch = log.message.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         log.sourceName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         false;
    const matchesLevel = levelFilter === 'all' || log.level === levelFilter;
    const matchesSource = sourceFilter === 'all' || log.source === sourceFilter;
    
    // Date filtering (simplified implementation)
    const logDate = new Date(log.timestamp);
    const now = new Date();
    const isToday = logDate.toDateString() === now.toDateString();
    const matchesDate = dateRange === 'all' || 
                       (dateRange === 'today' && isToday) ||
                       (dateRange === 'yesterday' && 
                        logDate.toDateString() === new Date(now.getTime() - 86400000).toDateString());

    return matchesSearch && matchesLevel && matchesSource && matchesDate;
  });

  // Scroll to bottom
  useEffect(() => {
    if (autoRefresh && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [filteredLogs.length, autoRefresh]);

  // Toggle log expansion
  const toggleLogExpansion = (id: string) => {
    const newExpanded = new Set(expandedLogs);
    if (newExpanded.has(id)) {
      newExpanded.delete(id);
    } else {
      newExpanded.add(id);
    }
    setExpandedLogs(newExpanded);
  };

  // Copy log content - only copy useful information
  const copyLogToClipboard = (log: LogEntry) => {
    // Only copy message and necessary details, remove redundant information
    let text = log.message;
    
    // Add details only if they exist and are not duplicate information
    if (log.details && !log.message.includes(log.details)) {
      text += `\n${log.details}`;
    }
    
    navigator.clipboard.writeText(text);
    alert(t('logs.logCopied'));
  };

  // Get log level color
  const getLevelColor = (level: LogLevel) => {
    switch (level) {
      case 'error': return 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300';
      case 'warning': return 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300';
      case 'info': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
      case 'debug': return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
      default: return 'bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300';
    }
  };

  // Get log level icon
  const getLevelIcon = (level: LogLevel) => {
    switch (level) {
      case 'error': return <XCircle className="w-4 h-4" />;
      case 'warning': return <AlertCircle className="w-4 h-4" />;
      case 'info': return <Info className="w-4 h-4" />;
      case 'debug': return <Hash className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  // Get source icon
  const getSourceIcon = (source: LogSource) => {
    switch (source) {
      case 'system': return <Server className="w-4 h-4" />;
      case 'server': return <Server className="w-4 h-4" />;
      case 'workflow': return <FileText className="w-4 h-4" />;
      default: return <Info className="w-4 h-4" />;
    }
  };

  // Export logs function
  const handleExportLogs = (format: 'csv' | 'json') => {
    if (filteredLogs.length === 0) {
      alert(t('logs.noLogsToExport'));
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    
    if (format === 'csv') {
      exportLogsAsCSV(filteredLogs, `logs-${timestamp}.csv`);
    } else {
      exportLogsAsJSON(filteredLogs, `logs-${timestamp}.json`);
    }
    
    setShowExportMenu(false);
  };

  // Clear logs function
  const handleClearLogs = () => {
    // Note: This only clears the logs displayed in the frontend
    // In a real project, you should call an API to delete logs from the backend
    // Since there's no delete logs API currently, we just show a notification
    if (window.confirm(t('logs.confirmClearLogs'))) {
      alert(t('logs.logsCleared'));
      // In a real project, you would call an API here:
      // await apiService.clearLogs();
    }
  };

  // Click outside to close export menu
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) {
        setShowExportMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Statistics
  const stats = {
    total: filteredLogs.length,
    errors: filteredLogs.filter(log => log.level === 'error').length,
    warnings: filteredLogs.filter(log => log.level === 'warning').length,
    today: filteredLogs.filter(log => 
      new Date(log.timestamp).toDateString() === new Date().toDateString()
    ).length,
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
          </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('logs.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('logs.subtitle')}
        </p>
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('logs.totalLogs')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-lg">
              <FileText className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('logs.errorLogs')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.errors}</p>
            </div>
            <div className="bg-red-500 p-3 rounded-lg">
              <XCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('logs.warningLogs')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.warnings}</p>
            </div>
            <div className="bg-yellow-500 p-3 rounded-lg">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('logs.todayLogs')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.today}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg">
              <Calendar className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and filter panel */}
      <div className="card">
        <div className="space-y-4">
          {/* Search bar */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder={t('logs.searchPlaceholder')}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
            </div>
            
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <RefreshCw className={`w-5 h-5 ${autoRefresh ? 'text-primary-500' : 'text-gray-400'}`} />
                <label className="flex items-center cursor-pointer">
                  <div className="relative">
                    <input
                      type="checkbox"
                      className="sr-only"
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.target.checked)}
                    />
                    <div className={`block w-10 h-6 rounded-full ${autoRefresh ? 'bg-primary-500' : 'bg-gray-300 dark:bg-gray-600'}`}></div>
                    <div className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform ${autoRefresh ? 'transform translate-x-4' : ''}`}></div>
                  </div>
                  <span className="ml-2 text-sm text-gray-700 dark:text-gray-300">{t('logs.autoRefresh')}</span>
                </label>
              </div>
              
              <button
                onClick={() => refetch()}
                className="flex items-center space-x-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                <span>{t('logs.refresh')}</span>
              </button>
            </div>
          </div>

          {/* Filter options */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('logs.logLevel')}
              </label>
              <select
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as LogLevel)}
              >
                <option value="all">{t('logs.allLevels')}</option>
                <option value="error">{t('logs.error')}</option>
                <option value="warning">{t('logs.warning')}</option>
                <option value="info">{t('logs.info')}</option>
                <option value="debug">{t('logs.debug')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('logs.logSource')}
              </label>
              <select
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value as LogSource)}
              >
                <option value="all">{t('logs.allSources')}</option>
                <option value="system">{t('logs.systemLogs')}</option>
                <option value="server">{t('logs.serverLogs')}</option>
                <option value="workflow">{t('logs.workflowLogs')}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                {t('logs.timeRange')}
              </label>
              <select
                className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={dateRange}
                onChange={(e) => setDateRange(e.target.value)}
              >
                <option value="today">{t('logs.today')}</option>
                <option value="yesterday">{t('logs.yesterday')}</option>
                <option value="week">{t('logs.last7Days')}</option>
                <option value="month">{t('logs.last30Days')}</option>
                <option value="all">{t('logs.allTime')}</option>
              </select>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500">
              {t('logs.showingLogs', { count: filteredLogs.length })}
            </div>
            <div className="flex space-x-3 relative">
              <div className="relative" ref={exportMenuRef}>
                <button 
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  className="flex items-center space-x-2 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  <span>{t('logs.exportLogs')}</span>
                </button>
                
                {showExportMenu && (
                  <div className="absolute right-0 mt-2 w-48 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-lg z-10">
                    <div className="py-1">
                      <button
                        onClick={() => handleExportLogs('csv')}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Export as CSV
                      </button>
                      <button
                        onClick={() => handleExportLogs('json')}
                        className="flex items-center w-full px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                      >
                        <FileText className="w-4 h-4 mr-2" />
                        Export as JSON
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              <button 
                onClick={handleClearLogs}
                className="flex items-center space-x-2 px-4 py-2 border border-red-300 dark:border-red-600 text-red-600 dark:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                <span>{t('logs.clearLogs')}</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Log list */}
      <div className="card">
        <div className="overflow-hidden rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="max-h-[600px] overflow-y-auto">
            {filteredLogs.length > 0 ? (
              <div className="divide-y divide-gray-200 dark:divide-gray-700">
                {filteredLogs.map((log) => (
                  <div
                    key={log.id}
                    className={`p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${
                      expandedLogs.has(log.id) ? 'bg-gray-50 dark:bg-gray-800' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3 mb-2">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelColor(log.level)}`}>
                            <span className="flex items-center">
                              {getLevelIcon(log.level)}
                              <span className="ml-1">{log.level.toUpperCase()}</span>
                            </span>
                          </span>
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                            <span className="flex items-center">
                              {getSourceIcon(log.source)}
                              <span className="ml-1">{log.sourceName}</span>
                            </span>
                          </span>
                          <span className="text-sm text-gray-500">
                            <Clock className="w-3 h-3 inline mr-1" />
                            {formatRelativeTime(log.timestamp)}
                          </span>
                        </div>
                        
                        <p className="text-gray-900 dark:text-white font-medium mb-2">
                          {log.message}
                        </p>
                        
                        {log.details && expandedLogs.has(log.id) && (
                          <div className="mt-3 p-3 bg-gray-100 dark:bg-gray-900 rounded-lg">
                            <p className="text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap">
                              {log.details}
                            </p>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex items-center space-x-2 ml-4">
                        <button
                          onClick={() => toggleLogExpansion(log.id)}
                          className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                          title={expandedLogs.has(log.id) ? t('logs.collapseDetails') : t('logs.expandDetails')}
                        >
                          {expandedLogs.has(log.id) ? (
                            <ChevronUp className="w-4 h-4" />
                          ) : (
                            <ChevronDown className="w-4 h-4" />
                          )}
                        </button>
                        <button
                          onClick={() => copyLogToClipboard(log)}
                          className="p-1.5 text-gray-500 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg"
                          title={t('logs.copyLog')}
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                        {log.sourceId && (
                          <button
                            className="p-1.5 text-blue-500 hover:bg-blue-100 dark:hover:bg-blue-900/20 rounded-lg"
                            title={t('logs.viewSourceDetails')}
                          >
                            <ExternalLink className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
                <div ref={logsEndRef} />
              </div>
            ) : (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">{t('logs.noLogs')}</h3>
                <p className="text-gray-600 dark:text-gray-400">
                  {searchTerm ? t('logs.noMatchingLogs') : t('logs.noLogsDescription')}
                </p>
                {searchTerm && (
                  <button
                    onClick={() => {
                      setSearchTerm('');
                      setLevelFilter('all');
                      setSourceFilter('all');
                      setDateRange('today');
                    }}
                    className="mt-4 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                  >
                    {t('logs.clearAllFilters')}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Log analysis panel */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Log level distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('logs.levelDistribution')}</h3>
            <p className="card-description">{t('logs.levelDistributionDesc')}</p>
          </div>
          <div className="space-y-4">
            {['error', 'warning', 'info', 'debug'].map((level) => {
              const count = filteredLogs.filter(log => log.level === level).length;
              const percentage = filteredLogs.length > 0 ? (count / filteredLogs.length) * 100 : 0;
              
              return (
                <div key={level} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getLevelColor(level as LogLevel)}`}>
                        {level.toUpperCase()}
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{count} logs</span>
                    </div>
                    <span className="text-sm font-medium">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        level === 'error' ? 'bg-red-500' :
                        level === 'warning' ? 'bg-yellow-500' :
                        level === 'info' ? 'bg-blue-500' : 'bg-gray-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Log source distribution */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('logs.sourceDistribution')}</h3>
            <p className="card-description">{t('logs.sourceDistributionDesc')}</p>
          </div>
          <div className="space-y-4">
            {['system', 'server', 'workflow'].map((source) => {
              const count = filteredLogs.filter(log => log.source === source).length;
              const percentage = filteredLogs.length > 0 ? (count / filteredLogs.length) * 100 : 0;
              
              return (
                <div key={source} className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        {getSourceIcon(source as LogSource)}
                        <span className="ml-1">
                          {source === 'system' ? t('logs.system') : source === 'server' ? t('logs.server') : t('logs.workflow')}
                        </span>
                      </span>
                      <span className="text-sm text-gray-600 dark:text-gray-400">{count} logs</span>
                    </div>
                    <span className="text-sm font-medium">{percentage.toFixed(1)}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div
                      className={`h-2 rounded-full ${
                        source === 'system' ? 'bg-blue-500' :
                        source === 'server' ? 'bg-green-500' : 'bg-purple-500'
                      }`}
                      style={{ width: `${percentage}%` }}
                    ></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

    </div>
  );
};

export default Logs;
