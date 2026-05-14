import React from 'react';

interface TicketDataCardProps {
  data: any;  // 可以是 tickets 数组、{tickets:[]}、{data:[]} 等
  title?: string;
  maxTickets?: number;
}

const TicketDataCard: React.FC<TicketDataCardProps> = ({ data, title, maxTickets = 20 }) => {
  const tickets = Array.isArray(data) ? data : (data.tickets || data.data || (data ? [data] : []));

  if (!tickets || tickets.length === 0) {
    return (
      <div className="my-4 p-4 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-800/30 text-sm text-amber-700 dark:text-amber-400">
        🎫 No tickets found
      </div>
    );
  }

  return (
    <div className="my-4 border rounded-lg dark:border-gray-700 shadow-sm bg-white dark:bg-gray-900 overflow-hidden">
      <div className="px-4 py-3 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/30 dark:to-indigo-950/30 border-b dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎫</span>
          <span className="text-sm font-bold text-gray-800 dark:text-gray-200">
            {title || 'Ticket Search Results'}
          </span>
          <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
            {tickets.length} train{tickets.length !== 1 ? 's' : ''} found
          </span>
        </div>
      </div>
      <div className="divide-y divide-gray-100 dark:divide-gray-800">
        {tickets.slice(0, maxTickets).map((ticket: any, idx: number) => {
          const trainNo = ticket.trainNo || ticket.trainNumber || ticket.train_code || 'N/A';
          const from = ticket.from || ticket.departure_station || 'N/A';
          const to = ticket.to || ticket.arrival_station || 'N/A';
          const departure = ticket.departureTime || ticket.start_time || '';
          const arrival = ticket.arrivalTime || ticket.end_time || '';
          const duration = ticket.duration || ticket.run_time || '';
          const price = ticket.price || '';
          const seats = ticket.seats || ticket.seat_info || {};

          return (
            <div key={idx} className="px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/40 transition-colors">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-primary-700 dark:text-primary-400">
                    {trainNo}
                  </span>
                  <span className="text-xs text-gray-400">|</span>
                  <div className="flex items-center gap-1 text-sm text-gray-600 dark:text-gray-300">
                    <span>{from}</span>
                    <span className="text-gray-400 mx-1">→</span>
                    <span>{to}</span>
                  </div>
                </div>
                {price && (
                  <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
                    {typeof price === 'number' ? `¥${price.toFixed(2)}` : price}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                {departure && (
                  <span className="flex items-center gap-1">
                    <span>🕐</span>
                    <span>{departure} - {arrival}</span>
                  </span>
                )}
                {duration && (
                  <span className="flex items-center gap-1">
                    <span>⏱</span>
                    <span>{duration}</span>
                  </span>
                )}
                {Object.keys(seats).length > 0 && (
                  <span className="flex items-center gap-1 ml-auto">
                    <span>💺</span>
                    <span>{Object.entries(seats).slice(0, 2).map(([type, info]) => `${type}: ${info}`).join(', ')}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
        {tickets.length > maxTickets && (
          <div className="px-4 py-2 text-xs text-center text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800/30">
            ... and {tickets.length - maxTickets} more trains
          </div>
        )}
      </div>
    </div>
  );
};

export default TicketDataCard;
