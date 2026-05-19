import React, { useState } from 'react';
import { X, Play, Loader2, CheckCircle2, AlertCircle, Clipboard } from 'lucide-react';

interface ToolCallModalProps {
  isOpen: boolean;
  onClose: () => void;
  serverName: string;
  tool: {
    name: string;
    description: string;
    parameters?: Record<string, unknown>;
  };
  onExecute: (params: Record<string, unknown>) => Promise<unknown>;
}

const ToolCallModal: React.FC<ToolCallModalProps> = ({ isOpen, onClose, serverName, tool, onExecute }) => {
  const [params, setParams] = useState<Record<string, unknown>>({});
  const [isExecuting, setIsExecuting] = useState(false);
  const [result, setResult] = useState<unknown>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleParamChange = (name: string, value: string | boolean, type: string) => {
    let normalizedValue: string | number | boolean = value;
    if (type === 'number') normalizedValue = parseFloat(value as string);
    if (type === 'boolean') normalizedValue = value === 'true' || value === true;
    
    setParams(prev => ({
      ...prev,
      [name]: normalizedValue
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsExecuting(true);
    setResult(null);
    setError(null);

    try {
      const data = await onExecute(params);
      setResult(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Execution failed');
    } finally {
      setIsExecuting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-900/50">
          <div>
            <h3 className="text-lg font-bold text-gray-900 dark:text-white flex items-center space-x-2">
              <Play className="h-4 w-4 text-primary-500 fill-current" />
              <span>Run Tool: {tool.name}</span>
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">from {serverName}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-full transition-colors">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Tool Description */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-300">{tool.description}</p>
          </div>

          <form id="tool-call-form" onSubmit={handleSubmit} className="space-y-4">
            {tool.parameters && Object.keys(tool.parameters).length > 0 ? (
              Object.entries(tool.parameters || {}).map(([name, rawSchema]) => {
                const schema = rawSchema as Record<string, unknown>;
                const schemaType = (schema as Record<string, unknown>).type as string;
                const schemaRequired = (schema as Record<string, unknown>).required as boolean | undefined;
                const schemaDesc = (schema as Record<string, unknown>).description as string | undefined;
                return (
                <div key={name} className="space-y-1.5">
                  <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300">
                    {name}
                    {schemaRequired && <span className="text-red-500 ml-1">*</span>}
                    <span className="ml-2 text-[10px] font-normal text-gray-400 uppercase tracking-tighter">({schemaType})</span>
                  </label>
                  
                  {schemaType === 'boolean' ? (
                    <select
                      onChange={(e) => handleParamChange(name, e.target.value, 'boolean')}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                    >
                      <option value="false">False</option>
                      <option value="true">True</option>
                    </select>
                  ) : schemaType === 'number' || schemaType === 'integer' ? (
                    <input
                      type="number"
                      placeholder={schemaDesc}
                      onChange={(e) => handleParamChange(name, e.target.value, 'number')}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                      required={schemaRequired}
                    />
                  ) : (
                    <textarea
                      rows={2}
                      placeholder={schemaDesc}
                      onChange={(e) => handleParamChange(name, e.target.value, 'string')}
                      className="w-full px-3 py-2 bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded-lg text-sm focus:ring-2 focus:ring-primary-500"
                      required={schemaRequired}
                    />
                  )}
                  {schemaDesc && <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-tight">{schemaDesc}</p>}
                </div>
              );
              })
            ) : (
              <div className="text-center py-4 text-gray-500 text-sm italic">
                This tool accepts no parameters.
              </div>
            )}
          </form>

          {/* Result Area */}
          {(result || error) && (
            <div className="space-y-3 animate-in slide-in-from-bottom-2 duration-300">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-bold text-gray-900 dark:text-white flex items-center space-x-2">
                  {error ? <AlertCircle className="h-4 w-4 text-red-500" /> : <CheckCircle2 className="h-4 w-4 text-green-500" />}
                  <span>{error ? 'Execution Error' : 'Execution Result'}</span>
                </h4>
                {!error && result && (
                  <button 
                    onClick={() => copyToClipboard(JSON.stringify(result, null, 2))}
                    className="text-[10px] flex items-center space-x-1 text-primary-500 hover:text-primary-600"
                  >
                    <Clipboard className="h-3 w-3" />
                    <span>Copy JSON</span>
                  </button>
                )}
              </div>
              <div className={`p-4 rounded-xl font-mono text-xs overflow-auto max-h-60 border ${
                error 
                  ? 'bg-red-50 dark:bg-red-900/10 border-red-200 dark:border-red-800 text-red-700 dark:text-red-400' 
                  : 'bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 text-gray-800 dark:text-gray-200'
              }`}>
                {error ? error : (
                  <pre className="whitespace-pre-wrap break-all">{JSON.stringify(result, null, 2)}</pre>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700 flex justify-end space-x-3 bg-gray-50 dark:bg-gray-900/50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            form="tool-call-form"
            type="submit"
            disabled={isExecuting}
            className="flex items-center space-x-2 px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg font-bold shadow-lg shadow-primary-500/20 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isExecuting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Executing...</span>
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-current" />
                <span>Run Tool</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ToolCallModal;
