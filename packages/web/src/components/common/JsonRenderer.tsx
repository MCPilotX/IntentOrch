import React, { useRef, useEffect } from 'react';
import JsonBeautifulRender from 'json-beautiful-render';

interface JsonRendererProps {
  data: any;
  title?: string;
  maxHeight?: string;
  showControls?: boolean;
  theme?: 'light' | 'dark' | 'auto';
}

const JsonRenderer: React.FC<JsonRendererProps> = ({
  data,
  title,
  maxHeight = '400px',
  showControls = true,
  theme = 'auto'
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Determine theme based on current mode
  const getTheme = () => {
    if (theme === 'auto') {
      // Check if dark mode is active
      const isDark = document.documentElement.classList.contains('dark');
      return isDark ? 'dark' : 'light';
    }
    return theme;
  };

  // Format the data for rendering
  const formatData = () => {
    if (typeof data === 'string') {
      try {
        return JSON.parse(data);
      } catch {
        return { _raw: data };
      }
    }
    return data;
  };

  const formattedData = formatData();
  const currentTheme = getTheme();

  useEffect(() => {
    if (containerRef.current && formattedData) {
      // Clear previous content
      containerRef.current.innerHTML = '';
      
      // Render JSON using json-beautiful-render
      JsonBeautifulRender(
        containerRef.current,
        formattedData
      );
    }
  }, [formattedData, currentTheme, showControls]);

  return (
    <div className="json-renderer-container">
      {title && (
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-medium text-gray-900 dark:text-white">{title}</h3>
          {showControls && (
            <div className="flex items-center space-x-2 text-xs">
              <span className="text-gray-500 dark:text-gray-400">
                {typeof formattedData === 'object' && formattedData !== null
                  ? Array.isArray(formattedData)
                    ? `Array (${formattedData.length} items)`
                    : `Object (${Object.keys(formattedData).length} keys)`
                  : typeof formattedData}
              </span>
            </div>
          )}
        </div>
      )}
      
      <div 
        ref={containerRef}
        className="json-renderer-content rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 break-all"
        style={{ maxHeight }}
      />

      {/* Stats footer */}
      {showControls && (
        <div className="mt-2 flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center space-x-3">
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-blue-500 mr-1"></div>
              Key
            </span>
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-green-500 mr-1"></div>
              String
            </span>
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-yellow-500 mr-1"></div>
              Number
            </span>
            <span className="flex items-center">
              <div className="w-2 h-2 rounded-full bg-pink-500 mr-1"></div>
              Boolean
            </span>
          </div>
          <div className="text-xs">
            {JSON.stringify(formattedData).length} characters
          </div>
        </div>
      )}
    </div>
  );
};

export default JsonRenderer;
