import React from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Server, 
  PlayCircle, 
  StopCircle,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  Users
} from 'lucide-react';
import { apiService } from '../services/api';
import { formatRelativeTime, getStatusColor, getStatusText, formatMCPServerName } from '../utils/format';
import { useLanguage } from '../contexts/LanguageContext';

const Dashboard: React.FC = () => {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  
  // Health check
  const { data: isAlive } = useQuery({
    queryKey: ['healthCheck'],
    queryFn: () => apiService.healthCheck(),
    refetchInterval: 10000,
  });

  // Fetch data
  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['systemStats'],
    queryFn: () => apiService.getSystemStats(),
    refetchInterval: 5000, // Every5seconds refresh once，for real-time updates
  });

  const { data: servers, isLoading: serversLoading } = useQuery({
    queryKey: ['servers'],
    queryFn: () => apiService.getServers(),
    refetchInterval: 5000, // Every5seconds refresh once，for real-time updates
  });

  const { data: processes, isLoading: processesLoading } = useQuery({
    queryKey: ['processes'],
    queryFn: () => apiService.getProcesses(),
    refetchInterval: 5000, // Every5seconds refresh once，for real-time updates
  });

  const { data: systemLogs = [] } = useQuery({
    queryKey: ['systemLogs'],
    queryFn: () => apiService.getSystemLogs(),
    refetchInterval: 10000, // Every10seconds refresh once
  });

  // Stop processmutation
  const stopProcessMutation = useMutation({
    mutationFn: (pid: number) => apiService.stopProcess({ pid }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processes'] });
      queryClient.invalidateQueries({ queryKey: ['systemStats'] });
      queryClient.invalidateQueries({ queryKey: ['servers'] });
    },
  });

  // Handle stop process
  const handleStopProcess = (pid: number) => {
    if (window.confirm(t('processes.confirmStop'))) {
      stopProcessMutation.mutate(pid);
    }
  };

  // Convert system logs to recent activity format
  const recentActivities = React.useMemo(() => {
    // If no system logs，return empty array
    if (!systemLogs || systemLogs.length === 0) {
      return [];
    }

    // Check if system logs contain real data（not defaultMocklog）
    // Iflogare all defaultMockmessages，alsoreturn empty array
    const logs = Array.isArray(systemLogs) ? systemLogs : [];
    const hasRealLogs = logs.some(log => {
      // Check if it is defaultMocklogmessages
      const isDefaultLog = log.includes('System is running normally') || 
                          log.includes('Daemon started successfully') ||
                          log.includes('System running normally') ||
                          log.includes('Daemon started successfully');
      return !isDefaultLog;
    });

    if (!hasRealLogs) {
      return [];
    }

    // parseSystemlogto activity records
    const activities = logs.slice(-6).reverse().map((log, index) => {
      // Improvedlogparselogic
      let action = 'System Operation';
      let target = '';
      let user = 'system';
      let type: 'success' | 'info' | 'warning' | 'error' = 'info';
      
      // More preciselogparse
      const logLower = log.toLowerCase();
      
      if (logLower.includes('start') || logLower.includes('Start')) {
        action = 'Server Started';
        const match = log.match(/server[:\s]+([^\s,]+)/i) || log.match(/Start[:\s]+([^\s,]+)/i);
        target = match ? match[1] : 'Unknown Server';
        type = 'success';
      } else if (logLower.includes('stop') || logLower.includes('Stop')) {
        action = 'Process Stopped';
        const match = log.match(/pid[:\s]+(\d+)/i) || log.match(/process[:\s]+(\d+)/i);
        target = match ? `PID: ${match[1]}` : 'Unknown Process';
        type = 'warning';
      } else if (logLower.includes('pull') || logLower.includes('Pull')) {
        action = 'Server Pulled';
        const match = log.match(/server[:\s]+([^\s,]+)/i) || log.match(/Pull[:\s]+([^\s,]+)/i);
        target = match ? match[1] : 'Unknown Server';
        type = 'info';
      } else if (logLower.includes('config') || logLower.includes('Config')) {
        action = 'Configuration Updated';
        target = 'System Configuration';
        type = 'info';
      } else if (logLower.includes('secret') || logLower.includes('Secret')) {
        action = 'Secret Added';
        const match = log.match(/key[:\s]+([^\s,]+)/i) || log.match(/Secret[:\s]+([^\s,]+)/i);
        target = match ? match[1] : 'Unknown Secret';
        type = 'success';
      } else if (logLower.includes('error') || logLower.includes('Error') || logLower.includes('failed') || logLower.includes('Failure')) {
        action = 'System Error';
        target = log.length > 50 ? log.substring(0, 50) + '...' : log;
        type = 'error';
      } else if (logLower.includes('success') || logLower.includes('Success')) {
        action = 'Operation Successful';
        target = 'System Operation';
        type = 'success';
      }

      // Attempt to extract timestamp from log
      const timeMatch = log.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || 
                       log.match(/\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}:\d{2}/);
      const time = timeMatch ? new Date(timeMatch[0]).toISOString() : 
                  new Date(Date.now() - (index + 1) * 30 * 60 * 1000).toISOString();

      // Attempt to extract user info from log
      const userMatch = log.match(/user[:\s]+([^\s,]+)/i) || log.match(/User[:\s]+([^\s,]+)/i);
      if (userMatch) {
        user = userMatch[1];
      }

      return {
        id: index + 1,
        action,
        target,
        time,
        user,
        type
      };
    });

    return activities;
  }, [systemLogs]);

  if (statsLoading || serversLoading || processesLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">{t('common.loading')}</p>
        </div>
      </div>
    );
  }

  const statCards = [
    {
      title: t('dashboard.totalServers'),
      value: stats?.totalServers || 0,
      icon: Server,
      color: 'bg-blue-500',
      change: '+2',
      trend: 'up' as const,
    },
    {
      title: t('dashboard.runningServers'),
      value: stats?.runningServers || 0,
      icon: PlayCircle,
      color: 'bg-green-500',
      change: '+1',
      trend: 'up' as const,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Welcome title */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('dashboard.title')}</h1>
          <p className="mt-2 text-gray-600 dark:text-gray-400">
            {t('dashboard.welcome')}
          </p>
        </div>
        
        <div className={`flex items-center space-x-2 px-3 py-1.5 rounded-full border ${isAlive ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          <div className={`w-2.5 h-2.5 rounded-full ${isAlive ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
          <span className="text-sm font-medium">{isAlive ? 'Daemon Online' : 'Daemon Offline'}</span>
        </div>
      </div>

      {/* Statistics cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div key={card.title} className="card">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600 dark:text-gray-400">{card.title}</p>
                  <p className="mt-2 text-3xl font-bold text-gray-900 dark:text-white">{card.value}</p>
                  <div className="mt-2 flex items-center">
                    {card.trend === 'up' ? (
                      <ArrowUpRight className="w-4 h-4 text-green-500" />
                    ) : (
                      <ArrowDownRight className="w-4 h-4 text-red-500" />
                    )}
                    <span className={`ml-1 text-sm ${card.trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                      {card.change}
                    </span>
                    <span className="ml-2 text-sm text-gray-500">{t('dashboard.comparedToYesterday')}</span>
                  </div>
                </div>
                <div className={`${card.color} p-3 rounded-lg`}>
                  <Icon className="w-6 h-6 text-white" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Running Servers */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.runningServersTitle')}</h3>
            <p className="card-description">{t('dashboard.runningServersDescription')}</p>
          </div>
          <div className="space-y-4">
            {processes && processes.length > 0 ? (
              processes.map((process) => (
                <div key={process.pid} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-center space-x-3">
                    <div className={`w-3 h-3 rounded-full ${getStatusColor(process.status).split(' ')[0]}`}></div>
                    <div>
                      <p className="font-medium text-gray-900 dark:text-white">{formatMCPServerName(process.serverName)}</p>
                      <p className="text-sm text-gray-500">PID: {process.pid}</p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-4">
                    <div className="text-right">
                      <p className="text-sm font-medium">{getStatusText(process.status)}</p>
                      <p className="text-xs text-gray-500">{t('dashboard.startedAt')} {formatRelativeTime(process.startedAt)}</p>
                    </div>
                    {process.status === 'running' && (
                      <button
                        onClick={() => handleStopProcess(process.pid)}
                        className="p-2 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                        title="Stop Process"
                      >
                        <StopCircle className="w-5 h-5" />
                      </button>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <PlayCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('dashboard.noRunningServers')}</p>
              </div>
            )}
          </div>
        </div>

        {/* Recent activity */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('dashboard.recentActivitiesTitle')}</h3>
            <p className="card-description">{t('dashboard.recentActivitiesDescription')}</p>
          </div>
          <div className="space-y-4">
            {recentActivities.length > 0 ? (
              recentActivities.map((activity) => (
                <div key={activity.id} className="flex items-start space-x-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800 rounded-lg transition-colors">
                  <div className="mt-1">
                    <div className="w-8 h-8 rounded-full bg-primary-100 dark:bg-primary-900 flex items-center justify-center">
                      <Activity className="w-4 h-4 text-primary-600 dark:text-primary-400" />
                    </div>
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-gray-900 dark:text-white">{activity.action}</p>
                      <span className="text-xs text-gray-500">{formatRelativeTime(activity.time)}</span>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{activity.target}</p>
                    <div className="flex items-center mt-2">
                      <Users className="w-3 h-3 text-gray-400 mr-1" />
                      <span className="text-xs text-gray-500">{activity.user}</span>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <Activity className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p>{t('dashboard.noActivities')}</p>
              </div>
            )}
          </div>
        </div>
      </div>


      {/* ServerStatus overview */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title">{t('dashboard.serverOverviewTitle')}</h3>
          <p className="card-description">{t('dashboard.serverOverviewDescription')}</p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200 dark:border-gray-700">
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.serverName')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.version')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('common.status')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.lastOperation')}</th>
                <th className="py-3 px-4 text-left text-sm font-medium text-gray-700 dark:text-gray-300">{t('dashboard.actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
              {servers && servers.length > 0 ? (
                servers.slice(0, 5).map((server) => (
                  <tr key={server.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                    <td className="py-3 px-4">
                      <div className="flex items-center">
                        <Server className="w-5 h-5 text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium text-gray-900 dark:text-white">{formatMCPServerName(server.name)}</p>
                          <p className="text-sm text-gray-500">{server.description || t('dashboard.noDescription')}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                        v{server.version}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(server.status)}`}>
                        {getStatusText(server.status)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-sm text-gray-500">
                      {server.lastStartedAt ? formatRelativeTime(server.lastStartedAt) : t('dashboard.neverStarted')}
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex space-x-2">
                        {server.status === 'not_pulled' && (
                          <button className="text-sm text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300">
                            {t('dashboard.pull')}
                          </button>
                        )}
                        {server.status === 'pulled' && (
                          <button className="text-sm text-green-600 hover:text-green-800 dark:text-green-400 dark:hover:text-green-300">
                            {t('dashboard.start')}
                          </button>
                        )}
                        {server.status === 'running' && (
                          <button
                            onClick={() => {
                              const pid = parseInt(server.id);
                              if (!isNaN(pid)) {
                                handleStopProcess(pid);
                              }
                            }}
                            className="text-sm text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300"
                          >
                            {t('dashboard.stop')}
                          </button>
                        )}
                        <button className="text-sm text-gray-600 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-300">
                          {t('dashboard.details')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-gray-500 dark:text-gray-400">
                    <Server className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>{t('dashboard.noServerData')}</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;