import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  PlayCircle, 
  StopCircle, 
  RefreshCw, 
  Search, 
  Filter,
  Activity,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  MoreVertical,
  Eye
} from 'lucide-react';
import { apiService } from '../services/api';
import { formatRelativeTime, getStatusColor, getStatusText, formatMCPServerName } from '../utils/format';
import { useLanguage } from '../contexts/LanguageContext';
import type { ProcessInfo } from '../types';

const Processes: React.FC = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedProcess, setSelectedProcess] = useState<ProcessInfo | null>(null);
  const [showLogsModal, setShowLogsModal] = useState(false);

  // Get process list
  const { data: processes = [], isLoading, refetch } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiService.getProcesses(),
    refetchInterval: 10000, // Refresh every 10 seconds
  });

  // Stop process mutation
  const stopProcessMutation = useMutation({
    mutationFn: (pid: number) => apiService.stopProcess({ pid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      queryClient.invalidateQueries({ queryKey: ['systemStats'] });
    },
  });

  // Get process logs
  const { data: processLogs, isLoading: logsLoading } = useQuery({
    queryKey: ['processLogs', selectedProcess?.pid],
    queryFn: () => selectedProcess ? apiService.getProcessLogs(selectedProcess.pid) : Promise.resolve(''),
    enabled: !!selectedProcess && showLogsModal,
  });

  // Filter processes
  const filteredProcesses = processes.filter(process => {
    // Safe handling: ensure serverName and serverId exist
    const serverName = process.serverName || '';
    const serverId = process.serverId || '';
    const searchTermLower = searchTerm.toLowerCase();
    
    const matchesSearch = serverName.toLowerCase().includes(searchTermLower) ||
                         serverId.toLowerCase().includes(searchTermLower);
    const matchesStatus = statusFilter === 'all' || process.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  // Statistics
  const stats = {
    total: processes.length,
    running: processes.filter(p => p.status === 'running').length,
    stopped: processes.filter(p => p.status === 'stopped').length,
    error: processes.filter(p => p.status === 'error').length,
  };

  // Handle stop process
  const handleStopProcess = (pid: number) => {
    if (window.confirm(t('processes.confirmStop'))) {
      stopProcessMutation.mutate(pid);
    }
  };

  // Handle view logs
  const handleViewLogs = (process: ProcessInfo) => {
    setSelectedProcess(process);
    setShowLogsModal(true);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('processes.loading')}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page title */}
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('processes.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('processes.subtitle')}
        </p>
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('processes.totalProcesses')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
            </div>
            <div className="bg-blue-500 p-3 rounded-lg">
              <Activity className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('processes.running')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.running}</p>
            </div>
            <div className="bg-green-500 p-3 rounded-lg">
              <CheckCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('processes.stopped')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.stopped}</p>
            </div>
            <div className="bg-gray-500 p-3 rounded-lg">
              <StopCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        <div className="card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{t('processes.error')}</p>
              <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{stats.error}</p>
            </div>
            <div className="bg-red-500 p-3 rounded-lg">
              <AlertCircle className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Search and filter */}
      <div className="card">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder={t('processes.searchPlaceholder')}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <Filter className="w-5 h-5 text-gray-400" />
              <select
                className="border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-800 focus:ring-2 focus:ring-primary-500 focus:border-transparent"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="all">{t('processes.filterAll')}</option>
                <option value="running">{t('processes.filterRunning')}</option>
                <option value="stopped">{t('processes.filterStopped')}</option>
                <option value="error">{t('processes.filterError')}</option>
              </select>
            </div>
            
            <button
              onClick={() => refetch()}
              className="flex items-center space-x-2 px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors"
            >
              <RefreshCw className="w-4 h-4" />
              <span>{t('processes.refresh')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Process list */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('processes.processInfo')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('processes.status')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('processes.startTime')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('processes.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {filteredProcesses.length > 0 ? (
                filteredProcesses.map((process) => (
                  <tr key={process.pid} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-4 px-4">
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{formatMCPServerName(process.serverName)}</p>
                        <div className="flex items-center space-x-2 mt-1">
                          <span className="text-sm text-gray-500">PID: {process.pid}</span>
                          <span className="text-sm text-gray-500">•</span>
                          <span className="text-sm text-gray-500">ID: {process.serverId}</span>
                        </div>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center">
                        <div className={`w-3 h-3 rounded-full mr-2 ${getStatusColor(process.status).split(' ')[0]}`}></div>
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(process.status)}`}>
                          {getStatusText(process.status)}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center text-sm text-gray-600 dark:text-gray-400">
                        <Clock className="w-4 h-4 mr-2" />
                        {formatRelativeTime(process.startedAt)}
                      </div>
                    </td>
                    <td className="py-4 px-4">
                      <div className="flex items-center space-x-2">
                        {process.status === 'running' && (
                          <button
                            onClick={() => handleStopProcess(process.pid)}
                            className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            title={t('processes.stopProcess')}
                          >
                            <StopCircle className="w-5 h-5" />
                          </button>
                        )}
                        {process.status === 'stopped' && (
                          <button
                            className="p-2 text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg transition-colors"
                            title={t('processes.startProcess')}
                          >
                            <PlayCircle className="w-5 h-5" />
                          </button>
                        )}
                        <button
                          onClick={() => handleViewLogs(process)}
                          className="p-2 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title={t('processes.viewLogs')}
                        >
                          <Eye className="w-5 h-5" />
                        </button>
                        <button
                          className="p-2 text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                          title={t('processes.moreActions')}
                        >
                          <MoreVertical className="w-5 h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-12 text-center">
                    <div className="flex flex-col items-center">
                      <Activity className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4" />
                      <p className="text-gray-500 dark:text-gray-400">{t('processes.noMatchingProcesses')}</p>
                      {searchTerm && (
                        <button
                          onClick={() => setSearchTerm('')}
                          className="mt-2 text-sm text-primary-600 hover:text-primary-700 dark:text-primary-400"
                        >
                          {t('processes.clearSearch')}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>


      {/* Logs modal */}
      {showLogsModal && selectedProcess && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <div>
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {t('processes.logsTitle', { serverName: formatMCPServerName(selectedProcess.serverName) })}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('processes.logsSubtitle', { pid: selectedProcess.pid, time: formatRelativeTime(new Date().toISOString()) })}
                </p>
              </div>
              <button
                onClick={() => setShowLogsModal(false)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg"
              >
                <XCircle className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            
            <div className="flex-1 overflow-auto p-6">
              {logsLoading ? (
                <div className="flex items-center justify-center h-32">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500"></div>
                </div>
              ) : (
                <pre className="font-mono text-sm bg-gray-50 dark:bg-gray-900 p-4 rounded-lg overflow-x-auto">
                  {processLogs || t('servers.noLogData')}
                </pre>
              )}
            </div>
            
            <div className="flex items-center justify-between p-6 border-t border-gray-200 dark:border-gray-700">
              <div className="text-sm text-gray-500">
                {t('processes.logFile')}: {selectedProcess.logPath || 'Not specified'}
              </div>
              <div className="flex space-x-3">
                <button className="px-4 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors">
                  {t('processes.refreshLogs')}
                </button>
                <button className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                  {t('processes.downloadLogs')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Processes;