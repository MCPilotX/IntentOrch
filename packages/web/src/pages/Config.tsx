import { useState, useEffect } from 'react';
import { apiService } from '../services/api';
import { useLanguage } from '../contexts/LanguageContext';
import { Toast } from '../components/ui';
import type { Config, UpdateConfigRequest } from '../types';

// AI Providers and their models
const AI_PROVIDERS = [
  { id: 'openai', name: 'OpenAI', models: ['gpt-4', 'gpt-4-turbo', 'gpt-3.5-turbo', 'gpt-3.5-turbo-instruct'] },
  { id: 'anthropic', name: 'Anthropic', models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku', 'claude-2.1'] },
  { id: 'google', name: 'Google', models: ['gemini-pro', 'gemini-ultra', 'palm-2'] },
  { id: 'azure', name: 'Azure OpenAI', models: ['gpt-4', 'gpt-35-turbo', 'davinci'] },
  { id: 'cohere', name: 'Cohere', models: ['command', 'command-light', 'command-r', 'command-r-plus'] },
  { id: 'huggingface', name: 'Hugging Face', models: ['llama-2-70b', 'mistral-7b', 'zephyr-7b'] },
  { id: 'deepseek', name: 'DeepSeek', models: ['deepseek-chat', 'deepseek-coder'] },
  { id: 'none', name: 'None', models: ['none'] },
  { id: 'custom', name: 'Custom', models: [] },
];

interface ToastState {
  show: boolean;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
}

export default function ConfigPage() {
  const { t } = useLanguage();
  const [config, setConfig] = useState<Config | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState<UpdateConfigRequest>({
    config: {
      ai: { provider: 'none', apiKey: '', model: 'none' },
      registry: { preferred: 'gitee' }
    }
  });
  const [toast, setToast] = useState<ToastState>({
    show: false,
    message: '',
    type: 'success'
  });
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message?: string } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' | 'warning' = 'success') => {
    setToast({ show: true, message, type });
  };

  const closeToast = () => {
    setToast(prev => ({ ...prev, show: false }));
  };

  const loadConfig = async () => {
    try {
      setLoading(true);
      const data = await apiService.getConfig();
      setConfig(data);
      
      setFormData({
        config: {
          ai: { 
            provider: data.ai?.provider || 'none',
            model: data.ai?.model || 'none',
            apiKey: data.ai?.apiKey || ''
          },
          registry: { 
            preferred: data.registry?.preferred || 'gitee'
          }
        }
      });
      setError(null);
    } catch (err: any) {
      setError(err.message || t('config.error.loadFailed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      const updatedConfig = await apiService.updateConfig(formData);
      setConfig(updatedConfig);
      setError(null);
      showToast(t('config.saveConfiguration') + ' ' + t('common.save') + '!', 'success');
    } catch (err: any) {
      setError(err.message || t('config.error.saveFailed'));
      showToast(err.message || t('config.error.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleTestAI = async () => {
    try {
      setTesting(true);
      setTestResult(null);
      const result = await apiService.testAIConfig(formData.config.ai as any);
      setTestResult(result);
    } catch (err: any) {
      setTestResult({ success: false, message: err.message });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('config.title')}</h1>
        <p className="mt-2 text-gray-600 dark:text-gray-400">
          {t('config.subtitle')}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* AI Configuration */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">{t('config.aiConfig')}</h3>
            <p className="card-description">{t('config.aiConfigDescription')}</p>
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  AI Provider
                </label>
                <select
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  value={formData.config.ai?.provider || 'none'}
                  onChange={(e) => setFormData({
                    ...formData,
                    config: {
                      ...formData.config,
                      ai: {
                        ...formData.config.ai,
                        provider: e.target.value as any,
                        // Reset model when provider changes
                        model: AI_PROVIDERS.find(p => p.id === e.target.value)?.models[0] || ''
                      }
                    }
                  })}
                >
                  {AI_PROVIDERS.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Model
                </label>
                <input
                  type="text"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                  value={formData.config.ai?.model || ''}
                  onChange={(e) => setFormData({
                    ...formData,
                    config: {
                      ...formData.config,
                      ai: {
                        ...formData.config.ai,
                        model: e.target.value
                      }
                    }
                  })}
                  list="model-suggestions"
                />
                <datalist id="model-suggestions">
                  {AI_PROVIDERS.find(p => p.id === formData.config.ai?.provider)?.models.map(m => (
                    <option key={m} value={m} />
                  ))}
                </datalist>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                API Key
              </label>
              <input
                type="password"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 font-mono"
                placeholder="sk-..."
                value={formData.config.ai?.apiKey || ''}
                onChange={(e) => setFormData({
                  ...formData,
                  config: {
                    ...formData.config,
                    ai: {
                      ...formData.config.ai,
                      apiKey: e.target.value
                    }
                  }
                })}
              />
            </div>
            <div className="flex items-center space-x-4">
              <button
                type="button"
                onClick={handleTestAI}
                disabled={testing || !formData.config.ai?.apiKey}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
              >
                {testing ? 'Testing...' : 'Test Connection'}
              </button>
              {testResult && (
                <span className={`text-sm ${testResult.success ? 'text-green-600' : 'text-red-600'}`}>
                  {testResult.message}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Registry Configuration */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title">Registry Settings</h3>
            <p className="card-description">Preferred source for pulling MCP servers</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Preferred Source
              </label>
              <select
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800"
                value={formData.config.registry?.preferred || 'gitee'}
                onChange={(e) => setFormData({
                  ...formData,
                  config: {
                    ...formData.config,
                    registry: {
                      ...formData.config.registry,
                      preferred: e.target.value
                    }
                  }
                })}
              >
                <option value="gitee">Gitee</option>
                <option value="github">GitHub</option>
                <option value="official">Official</option>
              </select>
            </div>
          </div>
        </div>

        <div className="flex justify-end">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-primary-500 text-white rounded-lg hover:bg-primary-600 transition-colors shadow-lg disabled:opacity-50"
          >
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </form>

      {toast.show && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={closeToast}
        />
      )}
    </div>
  );
}
