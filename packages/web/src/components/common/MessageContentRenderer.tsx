import React from 'react';
import JsonRenderer from './JsonRenderer';

interface MessageContentRendererProps {
  content: string;
  role: 'user' | 'assistant';
}

const MessageContentRenderer: React.FC<MessageContentRendererProps> = ({ content }) => {
  // Simple table renderer
  const renderTable = (text: string): React.ReactNode => {
    const lines = text.trim().split('\n');
    // Filter lines that contain a pipe and have at least one character on each side (or start/end with pipe)
    const tableLines = lines.filter(line => line.includes('|'));
    
    if (tableLines.length < 2) return <span>{text}</span>;

    // Extract headers
    const headerRow = tableLines[0];
    const headerCells = headerRow.split('|')
      .map(cell => cell.trim())
      .filter((cell, index, array) => {
        // Handle cases where lines start or end with |
        if ((index === 0 || index === array.length - 1) && cell === '') return false;
        return true;
      });

    // Extract body (skip header and separator row if it exists)
    let bodyStartIndex = 1;
    if (tableLines[1] && tableLines[1].includes('-') && tableLines[1].includes('|')) {
      bodyStartIndex = 2;
    }
    
    const bodyRows = tableLines.slice(bodyStartIndex);
    const bodyData = bodyRows.map(row => 
      row.split('|')
        .map(cell => cell.trim())
        .filter((cell, index, array) => {
          if ((index === 0 || index === array.length - 1) && cell === '') return false;
          return true;
        })
    );

    return (
      <div className="overflow-x-auto my-4 border rounded-lg dark:border-gray-700 shadow-sm">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-collapse">
          <thead className="bg-gray-100 dark:bg-gray-800/80">
            <tr>
              {headerCells.map((cell, i) => (
                <th key={i} className="px-4 py-3 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b dark:border-gray-700">
                  {cell}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
            {bodyData.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-normal break-words">
                    {cell}
                  </td>
                ))}
                {/* Pad row if it has fewer cells than header */}
                {row.length < headerCells.length && 
                  Array.from({ length: headerCells.length - row.length }).map((_, k) => (
                    <td key={`pad-${k}`} className="px-4 py-2.5 text-sm"></td>
                  ))
                }
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  // Simple markdown renderer for bold text, tables, etc.
  const renderMarkdown = (text: string): React.ReactNode => {
    // Check if it's a table
    if (text.includes('|') && text.split('\n').some(line => line.trim().startsWith('|'))) {
      return renderTable(text);
    }

    const lines = text.split('\n');
    return lines.map((line, lineIndex) => {
      // Handle bold text (**text**)
      const parts: React.ReactNode[] = [];
      let lastIndex = 0;
      const boldRegex = /\*\*([^*]+)\*\*/g;
      let match;

      while ((match = boldRegex.exec(line)) !== null) {
        // Add text before the bold
        if (match.index > lastIndex) {
          parts.push(line.substring(lastIndex, match.index));
        }
        
        // Add bold text
        parts.push(
          <strong key={`bold-${lineIndex}-${match.index}`} className="font-semibold">
            {match[1]}
          </strong>
        );
        
        lastIndex = match.index + match[0].length;
      }
      
      // Add remaining text
      if (lastIndex < line.length) {
        parts.push(line.substring(lastIndex));
      }
      
      // Handle emojis and other formatting
      const formattedLine = parts.map((part, partIndex) => {
        if (typeof part === 'string') {
          // Replace emoji placeholders with actual emojis
          const emojiMap: Record<string, string> = {
            '🚄': '🚄', '📊': '📊', '📝': '📝', '💡': '💡', '🔧': '🔧',
            '✅': '✅', '❌': '❌', '⚠️': '⚠️', '🎉': '🎉', '📋': '📋',
            '⏰': '⏰', '🔄': '🔄', '⏭️': '⏭️', '❓': '❓',
          };
          
          let textWithEmojis = part;
          Object.entries(emojiMap).forEach(([placeholder, emoji]) => {
            textWithEmojis = textWithEmojis.replace(new RegExp(placeholder, 'g'), emoji);
          });
          
          return <span key={`text-${lineIndex}-${partIndex}`}>{textWithEmojis}</span>;
        }
        return part;
      });
      
      return (
        <React.Fragment key={`line-${lineIndex}`}>
          {formattedLine}
          {lineIndex < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  // Parse JSON renderer markers
  const parseJsonRenderers = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    
    const regex = /<!-- JSON_RENDERER_START:([^ ]+) -->[\s\S]*?<!-- JSON_RENDERER_END -->/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderMarkdown(text.substring(lastIndex, match.index)));
      }
      
      try {
        const jsonData = JSON.parse(atob(match[1]));
        parts.push(
          <div key={`json-${match.index}`} className="my-2">
            <JsonRenderer 
              data={jsonData} 
              maxHeight="300px"
              showControls={true}
              theme="auto"
            />
          </div>
        );
      } catch (error) {
        console.error('Failed to parse JSON renderer data:', error);
        parts.push(
          <div key={`json-error-${match.index}`} className="text-red-500 text-sm">
            Failed to render JSON data
          </div>
        );
      }
      
      lastIndex = match.index + match[0].length;
    }
    
    if (lastIndex < text.length) {
      parts.push(renderMarkdown(text.substring(lastIndex)));
    }
    
    return parts;
  };

  // Check if content contains JSON renderer markers
  const hasJsonRenderers = content.includes('<!-- JSON_RENDERER_START:');
  
  if (hasJsonRenderers) {
    return <div className="whitespace-pre-wrap">{parseJsonRenderers(content)}</div>;
  }
  
  return <div className="whitespace-pre-wrap">{renderMarkdown(content)}</div>;
};

export default MessageContentRenderer;
