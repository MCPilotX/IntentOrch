import React, { useState, useEffect } from 'react';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  Info, 
  ChevronDown, 
  ChevronRight,
  Shield,
  Zap,
  Hammer
} from 'lucide-react';
import { apiService } from '../../services/api';
import { formatRelativeTime } from '../../utils/format';
import { useLanguage } from '../../contexts/LanguageContext';

interface Span {
  trace_id: string;
  span_id: string;
  parent_span_id: string | null;
  name: string;
  start_time: number;
  end_time?: number;
  status: string;
  input?: any;
  output?: any;
  error?: string;
  metadata?: any;
}

interface TraceInspectorProps {
  traceId: string;
  onClose: () => void;
}

const TraceInspector: React.FC<TraceInspectorProps> = ({ traceId, onClose }) => {
  const { t } = useLanguage();
  const [spans, setSpans] = useState<Span[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedSpans, setExpandedSpans] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchSpans = async () => {
      setIsLoading(true);
      try {
        const response = await apiService.getSpansByTrace(traceId);
        if (response.spans) {
          // Sort spans by start time
          const sortedSpans = [...response.spans].sort((a, b) => a.start_time - b.start_time);
          setSpans(sortedSpans);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch trace spans');
      } finally {
        setIsLoading(false);
      }
    };

    fetchSpans();
  }, [traceId]);

  const toggleExpand = (spanId: string) => {
    const newExpanded = new Set(expandedSpans);
    if (newExpanded.has(spanId)) {
      newExpanded.delete(spanId);
    } else {
      newExpanded.add(spanId);
    }
    setExpandedSpans(newExpanded);
  };

  const getSpanDuration = (span: Span) => {
    if (!span.end_time) return null;
    return span.end_time - span.start_time;
  };

  const renderSpanIcon = (span: Span) => {
    if (span.status === 'error' || span.error) return <XCircle className="w-4 h-4 text-red-500" />;
    
    // Feature icons based on span name or metadata
    if (span.metadata?.recovered) return <Hammer className="w-4 h-4 text-amber-500" />;
    if (span.name.includes('sandbox')) return <Shield className="w-4 h-4 text-blue-500" />;
    if (span.name.includes('routing')) return <Zap className="w-4 h-4 text-indigo-500" />;
    
    return <CheckCircle className="w-4 h-4 text-green-500" />;
  };

  const formatDuration = (ms: number | null) => {
    if (ms === null) return '...';
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-500 mx-auto"></div>
        <p className="mt-2 text-sm text-gray-500">Loading execution trace...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-red-500">
        <XCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>Error: {error}</p>
      </div>
    );
  }

  // Group spans by hierarchy for better visualization if needed
  // For now, simple list with indentation based on depth
  const getSpanDepth = (span: Span, allSpans: Span[]): number => {
    let depth = 0;
    let current = span;
    while (current.parent_span_id) {
      const parent = allSpans.find(s => s.span_id === current.parent_span_id);
      if (!parent) break;
      depth++;
      current = parent;
    }
    return depth;
  };

  return (
    <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden flex flex-col max-h-[80vh]">
      <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-800">
        <div className="flex items-center space-x-2">
          <Clock className="w-5 h-5 text-primary-500" />
          <h3 className="font-bold text-gray-900 dark:text-white">Execution Trace Inspector</h3>
          <span className="text-xs text-gray-500 font-mono bg-gray-200 dark:bg-gray-700 px-2 py-0.5 rounded">
            {traceId}
          </span>
        </div>
        <button 
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <XCircle className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {spans.length === 0 ? (
          <div className="text-center py-8 text-gray-500">No spans found for this trace.</div>
        ) : (
          spans.map((span) => {
            const isExpanded = expandedSpans.has(span.span_id);
            const depth = getSpanDepth(span, spans);
            const duration = getSpanDuration(span);

            return (
              <div 
                key={span.span_id} 
                className="border border-gray-100 dark:border-gray-800 rounded-lg overflow-hidden"
                style={{ marginLeft: `${depth * 1.5}rem` }}
              >
                <div 
                  className={`flex items-center p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors ${isExpanded ? 'bg-gray-50 dark:bg-gray-800' : ''}`}
                  onClick={() => toggleExpand(span.span_id)}
                >
                  <div className="mr-2">
                    {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                  </div>
                  <div className="mr-3">{renderSpanIcon(span)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {span.name}
                      </span>
                      {span.metadata?.recovered && (
                        <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 rounded-full font-bold uppercase">
                          Auto-Repaired
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="text-xs text-gray-500 font-mono ml-4">
                    {formatDuration(duration)}
                  </div>
                </div>

                {isExpanded && (
                  <div className="p-4 bg-gray-50/50 dark:bg-gray-800/50 border-t border-gray-100 dark:border-gray-700 space-y-3">
                    {/* Time info */}
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="text-gray-500">Start Time:</span>
                        <p className="font-mono text-gray-700 dark:text-gray-300">
                          {new Date(span.start_time).toLocaleTimeString()}
                        </p>
                      </div>
                      <div>
                        <span className="text-gray-500">Status:</span>
                        <p className={`font-bold uppercase ${span.status === 'error' ? 'text-red-500' : 'text-green-500'}`}>
                          {span.status}
                        </p>
                      </div>
                    </div>

                    {/* Error message */}
                    {span.error && (
                      <div className="p-2 bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/40 rounded text-xs">
                        <span className="font-bold text-red-700 dark:text-red-400">Error:</span>
                        <p className="text-red-600 dark:text-red-300 mt-1">{span.error}</p>
                      </div>
                    )}

                    {/* Metadata & Special Info */}
                    {span.metadata && Object.keys(span.metadata).length > 0 && (
                      <div className="space-y-2">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Metadata</span>
                        <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
                          <pre className="text-[10px] text-gray-700 dark:text-gray-300 font-mono">
                            {JSON.stringify(span.metadata, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}

                    {/* AutoRepair details highlight */}
                    {span.metadata?.recovered && (
                      <div className="flex items-start space-x-2 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-lg">
                        <Hammer className="w-5 h-5 text-amber-600 dark:text-amber-500 shrink-0 mt-0.5" />
                        <div className="text-xs">
                          <p className="font-bold text-amber-800 dark:text-amber-400">Self-Healing Event</p>
                          <p className="text-amber-700 dark:text-amber-300 mt-1">
                            The tool call failed with <strong>"{span.metadata.repairReason}"</strong>. 
                            IntentOrch automatically triggered a repair using {span.metadata.recoveryInterceptor || 'AutoRepairInterceptor'} 
                            to fix the parameters and retry the operation.
                          </p>
                        </div>
                      </div>
                    )}

                    {/* Payload samples */}
                    {span.input && (
                      <div className="space-y-1">
                        <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">Input Arguments</span>
                        <div className="bg-white dark:bg-gray-900 p-2 rounded border border-gray-200 dark:border-gray-700 max-h-40 overflow-y-auto">
                          <pre className="text-[10px] text-gray-700 dark:text-gray-300 font-mono">
                            {JSON.stringify(span.input, null, 2)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      <div className="p-4 bg-gray-50 dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
        <p className="text-xs text-gray-500">
          Total Spans: {spans.length}
        </p>
        <div className="flex space-x-2">
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-green-500"></div>
            <span className="text-[10px] text-gray-500">Success</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-red-500"></div>
            <span className="text-[10px] text-gray-500">Error</span>
          </div>
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 rounded-full bg-amber-500"></div>
            <span className="text-[10px] text-gray-500">Repaired</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TraceInspector;
