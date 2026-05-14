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
    const tableLines = lines.filter(line => line.includes('|'));

    if (tableLines.length < 2) return <span>{text}</span>;

    const headerRow = tableLines[0];
    const headerCells = headerRow.split('|')
      .map(cell => cell.trim())
      .filter((cell, index, array) => {
        if ((index === 0 || index === array.length - 1) && cell === '') return false;
        return true;
      });

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
      <div className="overflow-x-auto my-4 border rounded-lg dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900">
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
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {bodyData.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30 hover:bg-primary-50/30 dark:hover:bg-primary-900/10 transition-colors'}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 whitespace-normal break-words">
                    {cell}
                  </td>
                ))}
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

  // Improved markdown renderer
  const renderMarkdown = (text: string): React.ReactNode => {
    // Check if it's a table
    if (text.includes('|') && text.split('\n').some(line => line.trim().startsWith('|'))) {
      return renderTable(text);
    }

    const lines = text.split('\n');
    const result: React.ReactNode[] = [];

    let inList = false;
    let listType: 'ul' | 'ol' = 'ul';
    let listItems: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeBlockContent: string[] = [];
    let codeLanguage = '';

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmedLine = line.trim();

      // Code blocks
      if (trimmedLine.startsWith('```')) {
        if (inCodeBlock) {
          result.push(
            <pre key={`code-${i}`} className="my-4 p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs font-mono border border-gray-700">
              {codeLanguage && <div className="text-[10px] text-gray-500 mb-2 uppercase font-bold">{codeLanguage}</div>}
              {codeBlockContent.join('\n')}
            </pre>
          );
          inCodeBlock = false;
          codeBlockContent = [];
          codeLanguage = '';
        } else {
          inCodeBlock = true;
          codeLanguage = trimmedLine.substring(3).trim();
        }
        continue;
      }

      if (inCodeBlock) {
        codeBlockContent.push(line);
        continue;
      }

      // Headers
      const headerMatch = trimmedLine.match(/^(#{1,6})\s+(.+)$/);
      if (headerMatch) {
        if (inList) {
          const ListTag = listType;
          result.push(<ListTag key={`list-${i}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 mb-4 space-y-1`}>{listItems}</ListTag>);
          inList = false;
          listItems = [];
        }
        const level = headerMatch[1].length;
        const headerText = headerMatch[2];
        const HeaderTag = `h${level}` as keyof JSX.IntrinsicElements;
        const classes = {
          h1: 'text-2xl font-bold mt-6 mb-4 text-gray-900 dark:text-white',
          h2: 'text-xl font-bold mt-5 mb-3 text-gray-900 dark:text-white border-b pb-1 dark:border-gray-700',
          h3: 'text-lg font-bold mt-4 mb-2 text-gray-900 dark:text-white',
          h4: 'text-base font-bold mt-3 mb-2 text-gray-900 dark:text-white',
          h5: 'text-sm font-bold mt-2 mb-1 text-gray-900 dark:text-white',
          h6: 'text-xs font-bold mt-2 mb-1 text-gray-900 dark:text-white',
        }[HeaderTag] || 'font-bold';

        result.push(<HeaderTag key={`header-${i}`} className={classes}>{renderInlineStyles(headerText)}</HeaderTag>);
        continue;
      }

      // List items
      const ulMatch = trimmedLine.match(/^([*•-])\s+(.+)$/);
      const olMatch = trimmedLine.match(/^(\d+\.)\s+(.+)$/);

      if (ulMatch || olMatch) {
        const currentType = ulMatch ? 'ul' : 'ol';
        const content = ulMatch ? ulMatch[2] : olMatch![2];

        if (inList && listType !== currentType) {
          const ListTag = listType;
          result.push(<ListTag key={`list-${i}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 mb-4 space-y-1`}>{listItems}</ListTag>);
          listItems = [];
        }

        inList = true;
        listType = currentType;
        listItems.push(<li key={`li-${i}`} className="text-sm text-gray-700 dark:text-gray-300">{renderInlineStyles(content)}</li>);
        continue;
      } else if (inList && trimmedLine !== '') {
        if (line.startsWith('  ')) {
          listItems.push(<div key={`li-cont-${i}`} className="pl-4 text-sm text-gray-600 dark:text-gray-400">{renderInlineStyles(trimmedLine)}</div>);
          continue;
        }
      }

      if (inList) {
        const ListTag = listType;
        result.push(<ListTag key={`list-${i}`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 mb-4 space-y-1`}>{listItems}</ListTag>);
        inList = false;
        listItems = [];
      }

      // Empty lines
      if (trimmedLine === '') {
        result.push(<div key={`br-${i}`} className="h-2" />);
        continue;
      }

      // Paragraph
      result.push(<p key={`p-${i}`} className="mb-3 text-sm leading-relaxed text-gray-700 dark:text-gray-300">{renderInlineStyles(line)}</p>);
    }

    if (inList) {
      const ListTag = listType;
      result.push(<ListTag key={`list-end`} className={`${listType === 'ul' ? 'list-disc' : 'list-decimal'} pl-5 mb-4 space-y-1`}>{listItems}</ListTag>);
    }

    if (inCodeBlock) {
      result.push(
        <pre key={`code-end`} className="my-4 p-3 bg-gray-900 text-gray-100 rounded-lg overflow-x-auto text-xs font-mono border border-gray-700">
          {codeBlockContent.join('\n')}
        </pre>
      );
    }

    return result;
  };

  // Helper for bold, italic, and other inline styles
  const renderInlineStyles = (text: string): React.ReactNode => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Bold: **text** or __text__
    const boldRegex = /(\*\*|__)(.*?)\1/g;
    let match;

    while ((match = boldRegex.exec(text)) !== null) {
      if (match.index > lastIndex) {
        parts.push(renderEmojis(text.substring(lastIndex, match.index)));
      }

      parts.push(
        <strong key={`bold-${match.index}`} className="font-bold text-gray-900 dark:text-white">
          {match[2]}
        </strong>
      );

      lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
      parts.push(renderEmojis(text.substring(lastIndex)));
    }

    return parts;
  };

  const renderEmojis = (text: string): string => {
    const emojiMap: Record<string, string> = {
      '🚄': '🚄', '📊': '📊', '📝': '📝', '💡': '💡', '🔧': '🔧',
      '✅': '✅', '❌': '❌', '⚠️': '⚠️', '🎉': '🎉', '📋': '📋',
      '⏰': '⏰', '🔄': '🔄', '⏭️': '⏭️', '❓': '❓', '🎫': '🎫',
      '📅': '📅', '🕒': '🕒', '💰': '💰', '📍': '📍', '🚀': '🚀',
    };

    let result = text;
    Object.entries(emojiMap).forEach(([placeholder, emoji]) => {
      result = result.replace(new RegExp(placeholder, 'g'), emoji);
    });

    return result;
  };

  // Parse JSON_RENDERER markers
  const parseJsonRenderers = (text: string): React.ReactNode[] => {
    const parts: React.ReactNode[] = [];
    let lastIndex = 0;

    // Regex for JSON_RENDERER markers only
    const regex = /<!-- JSON_RENDERER_START:([^ ]+) -->[\s\S]*?<!-- JSON_RENDERER_END -->/g;
    let match;

    while ((match = regex.exec(text)) !== null) {
      const base64Data = match[1];

      if (match.index > lastIndex) {
        parts.push(renderMarkdown(text.substring(lastIndex, match.index)));
      }

      try {
        const decodedData = JSON.parse(atob(base64Data));

        parts.push(
          <div key={`formatted-${match.index}`} className="my-4">
            <JsonRenderer
              data={decodedData}
              maxHeight="400px"
              showControls={true}
              theme="auto"
            />
          </div>
        );
      } catch (error) {
        console.error('Failed to parse JSON_RENDERER data:', error);
        parts.push(
          <div key={`formatted-error-${match.index}`} className="text-red-500 text-sm p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-100 dark:border-red-900/50 my-2">
            Failed to render formatted data
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

  // Render content as markdown with JSON_RENDERER marker parsing
  const hasJsonRenderers = content.includes('<!-- JSON_RENDERER_START:');

  return (
    <div className="message-content-wrapper">
      {hasJsonRenderers ? parseJsonRenderers(content) : renderMarkdown(content)}
    </div>
  );
};

export default MessageContentRenderer;
