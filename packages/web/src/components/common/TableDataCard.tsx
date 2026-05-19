import React from 'react';

interface TableDataCardProps {
  data: any;  // 可以是数组、{headers,rows}、对象等
  title?: string;
  maxRows?: number;
}

const TableDataCard: React.FC<TableDataCardProps> = ({ data, title, maxRows }) => {
  // data can be { headers: string[], rows: string[][] } or an array of objects
  let headers: string[] = [];
  let rows: any[][] = [];

  if (Array.isArray(data)) {
    if (data.length > 0 && typeof data[0] === 'object') {
      headers = Object.keys(data[0]);
      rows = data.map(item => headers.map(h => item[h]));
    } else {
      rows = data.map(item => [item]);
      headers = ['Value'];
    }
  } else if (data && data.headers && Array.isArray(data.headers)) {
    headers = data.headers;
    rows = (data.rows || data.data || []).map((row: any) =>
      Array.isArray(row) ? row : headers.map(h => row[h])
    );
  } else if (data && typeof data === 'object') {
    headers = Object.keys(data);
    rows = [Object.values(data)];
  }

  if (headers.length === 0 && rows.length === 0) {
    return (
      <div className="my-4 p-4 bg-gray-50 dark:bg-gray-800/40 rounded-lg border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400 text-center">
        Empty table data
      </div>
    );
  }

  const displayRows = maxRows ? rows.slice(0, maxRows) : rows;

  return (
    <div className="my-4 border rounded-lg dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-2 bg-gray-50 dark:bg-gray-800/60 border-b dark:border-gray-700 flex items-center justify-between">
        <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
          {title || `📊 Table Data (${rows.length} rows${headers.length > 0 ? ` × ${headers.length} cols` : ''})`}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border-collapse">
          {headers.length > 0 && (
            <thead className="bg-gray-100 dark:bg-gray-800/80">
              <tr>
                {headers.map((header, i) => (
                  <th key={i} className="px-4 py-2.5 text-left text-xs font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wider border-b dark:border-gray-700 whitespace-nowrap">
                    {header}
                  </th>
                ))}
              </tr>
            </thead>
          )}
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {displayRows.map((row, i) => (
              <tr key={i} className={i % 2 === 0 ? 'bg-white dark:bg-gray-900' : 'bg-gray-50/50 dark:bg-gray-800/30'}>
                {row.map((cell, j) => (
                  <td key={j} className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 whitespace-normal break-words max-w-xs">
                    {cell === null || cell === undefined ? (
                      <span className="text-gray-400 dark:text-gray-600 italic">N/A</span>
                    ) : (
                      String(cell)
                    )}
                  </td>
                ))}
                {row.length < headers.length &&
                  Array.from({ length: headers.length - row.length }).map((_, k) => (
                    <td key={`pad-${k}`} className="px-4 py-2 text-sm text-gray-400 dark:text-gray-600">-</td>
                  ))
                }
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {maxRows && rows.length > maxRows && (
        <div className="px-4 py-2 text-xs text-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/30">
          ... and {rows.length - maxRows} more rows
        </div>
      )}
    </div>
  );
};

export default TableDataCard;
