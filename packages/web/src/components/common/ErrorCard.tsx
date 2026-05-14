import React, { useState } from 'react';

interface ErrorCardProps {
  data: any;  // 可以是 Error 实例、error 对象、或字符串
  title?: string;
}

const ErrorCard: React.FC<ErrorCardProps> = ({ data, title }) => {
  const [isStackExpanded, setIsStackExpanded] = useState(false);

  const errorMessage = data.message || data.error || data.details || (typeof data === 'string' ? data : 'Unknown error');
  const errorCode = data.code || data.status || '';
  const stackTrace = data.stack || '';

  return (
    <div className="my-4 p-4 bg-red-50 dark:bg-red-900/20 border-2 border-red-200 dark:border-red-800/50 rounded-xl shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex-shrink-0 mt-0.5">
          <div className="w-8 h-8 flex items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40">
            <span className="text-lg">❌</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold text-red-800 dark:text-red-300 mb-1">
            {title || (errorCode ? `${errorCode}: ` : '') + 'Error'}
          </h4>
          <p className="text-sm text-red-700 dark:text-red-400 leading-relaxed whitespace-pre-wrap">
            {typeof errorMessage === 'string' ? errorMessage : JSON.stringify(errorMessage, null, 2)}
          </p>
          {stackTrace && (
            <details className="mt-2">
              <summary className="text-xs text-red-500 dark:text-red-400 cursor-pointer hover:text-red-700 dark:hover:text-red-300">
                Stack Trace
              </summary>
              <pre className="mt-1 p-2 bg-red-100/50 dark:bg-red-950/30 rounded-lg text-xs text-red-600 dark:text-red-400 overflow-x-auto max-h-48">
                {stackTrace}
              </pre>
            </details>
          )}
        </div>
      </div>
    </div>
  );
};

export default ErrorCard;
