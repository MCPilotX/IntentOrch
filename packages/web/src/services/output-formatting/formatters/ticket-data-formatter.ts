/**
 * Ticket Data Formatter
 * 
 * Formats train ticket data in a user-friendly way
 */

import { BaseFormatter } from './base-formatter';
import type { FormatContext } from '../types';

export class TicketDataFormatter extends BaseFormatter {
  id = 'ticket-data-formatter';
  name = 'Ticket Data Formatter';
  description = 'Formats train ticket data with train numbers, schedules, and seat availability';
  priority = 10; // High priority for ticket data
  
  supportedTypes = ['application/json'];
  supportedTools = [
    /get-tickets/i,
    /ticket/i,
    /train/i,
    /12306/i
  ];

  canFormat(data: any, context?: FormatContext): boolean {
    // Check if data matches ticket data pattern
    if (!data) {
      return false;
    }

    // Pattern 1: Has tickets array (structured JSON)
    if (typeof data === 'object') {
      if (Array.isArray(data.tickets) && data.tickets.length > 0) {
        const firstTicket = data.tickets[0];
        return this.isTicketObject(firstTicket);
      }

      // Pattern 2: Has data array with ticket-like objects
      if (Array.isArray(data.data) && data.data.length > 0) {
        const firstItem = data.data[0];
        return this.isTicketObject(firstItem);
      }

      // Pattern 3: Direct ticket object
      if (this.isTicketObject(data)) {
        return true;
      }
    }

    // Pattern 4: Text table format (for get-tickets output)
    if (typeof data === 'string') {
      const isTable = this.isTextTable(data);
      const hasTicketKeywords = this.containsTicketKeywords(data);
      if (isTable && hasTicketKeywords) {
        return true;
      }
    }

    // Pattern 5: Check by tool name
    const toolName = this.getToolName(context);
    if (toolName && this.matchesToolPattern(toolName)) {
      return true;
    }

    return false;
  }

  getConfidence(data: any, context?: FormatContext): number {
    let confidence = 0.5;
    
    // Boost confidence if data has clear ticket structure
    if (Array.isArray(data.tickets) && data.tickets.length > 0) {
      confidence += 0.3;
    }
    
    if (Array.isArray(data.data) && data.data.length > 0) {
      confidence += 0.2;
    }
    
    // Boost confidence if tool name matches
    const toolName = this.getToolName(context);
    if (toolName && this.matchesToolPattern(toolName)) {
      confidence += 0.2;
    }
    
    // Check if user query is about tickets
    const userQuery = this.getUserQuery(context);
    if (userQuery && this.isTicketRelatedQuery(userQuery)) {
      confidence += 0.1;
    }
    
    return Math.min(confidence, 1.0);
  }

  format(data: any, context?: FormatContext): string {
    this.logActivity('Formatting ticket data', { dataType: typeof data });
    
    // Extract tickets array
    const tickets = this.extractTickets(data);
    
    if (tickets.length === 0) {
      return this.formatNoTicketsFound(data, context);
    }
    
    return this.formatTicketsTable(tickets, context);
  }

  /**
   * Check if object is a ticket object
   */
  private isTicketObject(obj: any): boolean {
    if (!obj || typeof obj !== 'object') {
      return false;
    }

    // Check for common ticket fields
    const hasTrainInfo = !!(obj.trainNo || obj.trainNumber || obj.train_code);
    const hasRouteInfo = !!(obj.from || obj.to || obj.departure_station || obj.arrival_station);
    const hasTimeInfo = !!(obj.departureTime || obj.arrivalTime || obj.start_time || obj.end_time);
    
    return hasTrainInfo || hasRouteInfo || hasTimeInfo;
  }

  /**
   * Check if user query is ticket-related
   */
  private isTicketRelatedQuery(query: string): boolean {
    const ticketKeywords = [
      'ticket', 'train', 'rail', 'schedule', 'departure', 'arrival',
      'station', 'journey', 'travel', 'book', 'reservation',
      'seat', 'coach', 'compartment', 'fare', 'price',
      'ticket', 'train', 'high-speed', 'bullet', 'schedule', 'departure', 'arrival',
      'station', 'journey', 'booking', 'seat', 'fare', 'available'
    ];
    
    const lowerQuery = query.toLowerCase();
    return ticketKeywords.some(keyword => lowerQuery.includes(keyword));
  }

  /**
   * Check if text is a table format (contains pipe separators and multiple lines)
   */
  private isTextTable(text: string): boolean {
    if (typeof text !== 'string') {
      return false;
    }
    
    const lines = text.trim().split('\n');
    if (lines.length < 2) {
      return false; // Need at least header and one data row
    }
    
    // Check if first line contains pipe separators (header row)
    const firstLine = lines[0].trim();
    if (!firstLine.includes('|')) {
      return false;
    }
    
    // For get-tickets format, only the header has pipes, data rows don't
    // But we should still accept it as a table if it has ticket keywords
    const hasTicketKeywords = this.containsTicketKeywords(text);
    const hasMultipleLines = lines.length >= 3;
    
    return hasTicketKeywords && hasMultipleLines;
  }

  /**
   * Check if text contains ticket-related keywords
   */
  private containsTicketKeywords(text: string): boolean {
    if (typeof text !== 'string') {
      return false;
    }
    
    const ticketKeywords = [
      'train', 'ticket', 'station', 'departure', 'arrival', 'duration',
      'seat', 'price', 'yuan', '¥', '￥', 'G', 'D', 'Z', 'T', 'K', // Train types
      'business', 'first', 'second', 'hard', 'soft', 'sleeper', // Seat types
      'Train', 'departure', 'arrival', 'Duration', 'available', 'Business Class', 'First Class', 'Second Class', 'HardSeat', 'SoftSeat', 'HardSleeper', 'SoftSleeper'
    ];
    
    const lowerText = text.toLowerCase();
    return ticketKeywords.some(keyword => lowerText.includes(keyword.toLowerCase()));
  }

  /**
   * Extract tickets from data
   */
  private extractTickets(data: any): any[] {
    // Pattern 1: Structured JSON with tickets array
    if (Array.isArray(data.tickets)) {
      return data.tickets;
    }
    
    // Pattern 2: Structured JSON with data array
    if (Array.isArray(data.data)) {
      return data.data;
    }
    
    // Pattern 3: Direct array
    if (Array.isArray(data)) {
      return data;
    }
    
    // Pattern 4: Single ticket object
    if (this.isTicketObject(data)) {
      return [data];
    }
    
    // Pattern 5: Text table format (for get-tickets output)
    if (typeof data === 'string' && this.isTextTable(data)) {
      return this.parseTextTable(data);
    }
    
    return [];
  }

  /**
   * Parse text table format into structured ticket objects
   */
  private parseTextTable(text: string): any[] {
    const tickets: any[] = [];
    const lines = text.trim().split('\n');
    
    if (lines.length < 2) {
      return tickets;
    }
    
    // For get-tickets format, we need to parse the special format
    // Format: "Train|departureStation -> arrivalStation|departureTime -> arrivalTime|Duration"
    // Then data lines like: "G9610 Guangzhou(telecode:GZQ) -> ChangshaSouth(telecode:CWQ) 00:10 -> 02:31 Duration：02:21"
    
    // Parse header to understand column structure
    const headerLine = lines[0].trim();
    if (!headerLine.includes('|')) {
      return tickets;
    }
    
    const headerColumns = headerLine.split('|').map(col => col.trim());
    
    // Parse data rows (skip header)
    let currentTicket: any = null;
    
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        continue;
      }
      
      // Check if this is a new train line (starts with train number like G9610, K6516, etc.)
      const trainMatch = line.match(/^([GDZKT]\d+|\d+[GDZKT]?)\s+/);
      if (trainMatch) {
        // If we have a current ticket, save it
        if (currentTicket) {
          tickets.push(currentTicket);
        }
        
        // Start new ticket
        currentTicket = {};
        
        // Parse train info from line
        // Format: "G9610 Guangzhou(telecode:GZQ) -> ChangshaSouth(telecode:CWQ) 00:10 -> 02:31 Duration：02:21"
        const trainParts = line.split(/\s+/);
        if (trainParts.length >= 1) {
          currentTicket.trainNo = trainParts[0];
        }
        
        // Try to extract from/to stations
        // Format: "G9610 Guangzhou(telecode:GZQ) -> ChangshaSouth(telecode:CWQ) 00:10 -> 02:31"
        // We need to skip the train number at the beginning
        const stationMatch = line.match(/^[A-Z0-9]+\s+(.+?)\s*->\s*(.+?)\s+(\d{2}:\d{2})\s*->\s*(\d{2}:\d{2})/);
        if (stationMatch) {
          currentTicket.from = stationMatch[1].trim();
          currentTicket.to = stationMatch[2].trim();
          currentTicket.departureTime = stationMatch[3];
          currentTicket.arrivalTime = stationMatch[4];
        } else {
          // Fallback: try to extract stations without train number
          const fallbackMatch = line.match(/(.+?)\s*->\s*(.+?)\s+(\d{2}:\d{2})\s*->\s*(\d{2}:\d{2})/);
          if (fallbackMatch) {
            currentTicket.from = fallbackMatch[1].trim();
            currentTicket.to = fallbackMatch[2].trim();
            currentTicket.departureTime = fallbackMatch[3];
            currentTicket.arrivalTime = fallbackMatch[4];
          }
        }
        
        // Try to extract duration
        const durationMatch = line.match(/duration[：:]\s*(\d{2}:\d{2})/i);
        if (durationMatch) {
          currentTicket.duration = durationMatch[1];
        }
        
        // Also try Chinese duration pattern (for compatibility)
        const chineseDurationMatch = line.match(/Duration[：:]\s*(\d{2}:\d{2})/);
        if (chineseDurationMatch && !currentTicket.duration) {
          currentTicket.duration = chineseDurationMatch[1];
        }
        
        // Initialize seats object
        currentTicket.seats = {};
      } 
      // Check if this is a seat line (starts with dash)
      else if (line.startsWith('-') && currentTicket) {
        // Format: "- Business Class: Remaining14tickets 1083CNY"
        const seatMatch = line.match(/-\s*([^:]+):\s*(.+)/);
        if (seatMatch) {
          const seatType = seatMatch[1].trim();
          const seatInfo = seatMatch[2].trim();
          currentTicket.seats[seatType] = seatInfo;
          
          // Try to extract price from seat info
          const priceMatch = seatInfo.match(/(\d+(?:\.\d{2})?)CNY/);
          if (priceMatch && !currentTicket.price) {
            currentTicket.price = priceMatch[1];
          }
        }
      }
    }
    
    // Don't forget the last ticket
    if (currentTicket) {
      tickets.push(currentTicket);
    }
    
    return tickets;
  }

  /**
   * Format when no tickets found
   */
  private formatNoTicketsFound(data: any, context?: FormatContext): string {
    const userQuery = this.getUserQuery(context);
    
    let message = '## 🎫 Ticket Search Results\n\n';
    message += 'No tickets found matching your criteria.\n\n';
    
    if (userQuery) {
      message += `**Search:** ${userQuery}\n\n`;
    }
    
    message += '**Suggestions:**\n';
    message += '• Try different dates or times\n';
    message += '• Check alternative routes\n';
    message += '• Verify station names are correct\n';
    message += '• Consider different seat classes\n';
    
    return message;
  }

  /**
   * Format tickets as a table
   */
  private formatTicketsTable(tickets: any[], context?: FormatContext): string {
    const userQuery = this.getUserQuery(context);
    
    let message = '## 🎫 Ticket Search Results\n\n';
    
    if (userQuery) {
      message += `**Search:** ${userQuery}\n\n`;
    }
    
    message += `Found **${tickets.length}** train${tickets.length > 1 ? 's' : ''}\n\n`;
    
    // Group tickets by date if available
    const ticketsByDate = this.groupTicketsByDate(tickets);
    const dateKeys = Object.keys(ticketsByDate).sort();
    
    for (const date of dateKeys) {
      const dateTickets = ticketsByDate[date];
      
      message += `### 📅 ${date}\n\n`;
      
      // Create table for this date's tickets
      message += this.createTicketTable(dateTickets);
      message += '\n';
    }
    
    // Add summary
    message += this.createTicketSummary(tickets);
    
    return message;
  }

  /**
   * Group tickets by date
   */
  private groupTicketsByDate(tickets: any[]): Record<string, any[]> {
    const groups: Record<string, any[]> = {};
    
    for (const ticket of tickets) {
      const date = this.extractDate(ticket);
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(ticket);
    }
    
    return groups;
  }

/**
 * Extract date from ticket
 */
private extractDate(ticket: any): string {
  // Try various date fields
  const dateSources = [
    ticket.departureDate,
    ticket.date,
    ticket.travelDate,
    ticket.departureTime,
    ticket.start_time
  ];

  for (const source of dateSources) {
    if (source) {
      try {
        const date = new Date(source);
        if (!isNaN(date.getTime())) {
          return date.toISOString().split('T')[0];
        }
      } catch {
        // Continue to next source
      }
    }
  }

  return 'Unknown Date';
}

/**
 * Create ticket table
...
   */
  private createTicketTable(tickets: any[], isChinese: boolean = false): string {
    if (tickets.length === 0) {
      return isChinese ? 'This dateNoneticket。\n' : 'No tickets for this date.\n';
    }
    
    // Limit for readability, but more than 10 if there are many
    const displayTickets = tickets.slice(0, 50);
    
    let table = isChinese 
      ? '| Train | departure → arrival | departureTime | arrivalTime | Duration | available | fare |\n'
      : '| Train | From → To | Departure | Arrival | Duration | Seats | Price |\n';
    
    table += '|-------|-----------|-----------|---------|----------|-------|-------|\n';
    
    for (const ticket of displayTickets) {
      const trainNo = ticket.trainNo || ticket.trainNumber || ticket.train_code || 'N/A';
      const from = ticket.from || ticket.departure_station || 'N/A';
      const to = ticket.to || ticket.arrival_station || 'N/A';
      const departure = this.formatTime(ticket.departureTime || ticket.start_time);
      const arrival = this.formatTime(ticket.arrivalTime || ticket.end_time);
      const duration = this.formatDurationText(ticket.duration || ticket.run_time);
      const seats = this.formatSeatAvailability(ticket.seats || ticket.seat_info || {}, isChinese);
      const price = this.formatPrice(ticket.price);
      
      table += `| ${trainNo} | ${from} → ${to} | ${departure} | ${arrival} | ${duration} | ${seats} | ${price} |\n`;
    }
    
    if (tickets.length > 50) {
      table += isChinese 
        ? `| ... | ... There are ${tickets.length - 50} Train | ... | ... | ... | ... | ... |\n`
        : `| ... | ... and ${tickets.length - 50} more tickets | ... | ... | ... | ... | ... |\n`;
    }
    
    return table;
  }

  /**
   * Format time
   */
  private formatTime(time: any): string {
    if (!time) {
      return 'N/A';
    }
    
    try {
      const date = new Date(time);
      return date.toLocaleTimeString('en-US', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: false 
      });
    } catch {
      return String(time).substring(0, 8);
    }
  }

  /**
   * Format duration text
   */
  private formatDurationText(duration: any): string {
    if (!duration) {
      return 'N/A';
    }
    
    if (typeof duration === 'string') {
      return duration;
    }
    
    if (typeof duration === 'number') {
      // Assume minutes
      const hours = Math.floor(duration / 60);
      const minutes = duration % 60;
      
      if (hours > 0) {
        return `${hours}h ${minutes}m`;
      }
      return `${minutes}m`;
    }
    
    return String(duration);
  }

  /**
   * Format seat availability
   */
  private formatSeatAvailability(seats: Record<string, any>, isChinese: boolean = false): string {
    if (!seats || Object.keys(seats).length === 0) {
      return isChinese ? 'No information' : 'N/A';
    }
    
    const availableSeats: string[] = [];
    
    for (const [seatType, availability] of Object.entries(seats)) {
      if (availability && availability !== 'no' && availability !== '0' && availability !== 'N/A' && 
          availability !== 'None' && availability !== 'NoneTicket' &&
          !availability.toLowerCase().includes('sold out') && !availability.toLowerCase().includes('unavailable')) {
        availableSeats.push(`${seatType}: ${availability}`);
      }
    }
    
    if (availableSeats.length === 0) {
      return isChinese ? '❌ NoneTicket' : '❌ Sold out';
    }
    
    return availableSeats.slice(0, 2).join(', ');
  }

  /**
   * Format price
   */
  private formatPrice(price: any): string {
    if (!price) {
      return 'N/A';
    }
    
    if (typeof price === 'number') {
      return `¥${price.toFixed(2)}`;
    }
    
    if (typeof price === 'string') {
      if (price.includes('¥') || price.includes('￥') || price.includes('$')) {
        return price;
      }
      return `¥${price}`;
    }
    
    return String(price);
  }

  /**
   * Create ticket summary
   */
  private createTicketSummary(tickets: any[], isChinese: boolean = false): string {
    let summary = isChinese ? '### 📊 Summary\n\n' : '### 📊 Summary\n\n';
    
    // Count by train type
    const trainTypes: Record<string, number> = {};
    let totalPrice = 0;
    let priceCount = 0;
    let availableCount = 0;
    
    for (const ticket of tickets) {
      const trainNo = ticket.trainNo || ticket.trainNumber || ticket.train_code || 'Unknown';
      const trainType = this.guessTrainType(trainNo);
      
      trainTypes[trainType] = (trainTypes[trainType] || 0) + 1;
      
      // Check if any seat is available
      const seats = ticket.seats || ticket.seat_info || {};
      const hasSeats = Object.values(seats).some(a => 
        a && a !== 'None' && a !== 'NoneTicket' && a !== '0' && a !== 'no' && 
        !String(a).toLowerCase().includes('sold out')
      );
      if (hasSeats) availableCount++;

      if (ticket.price) {
        const priceValue = typeof ticket.price === 'number' 
          ? ticket.price 
          : parseFloat(String(ticket.price).replace(/[^0-9.]/g, ''));
        
        if (!isNaN(priceValue)) {
          totalPrice += priceValue;
          priceCount++;
        }
      }
    }
    
    // Train type breakdown
    summary += isChinese ? '**Train Type Statistics:**\n' : '**Train Types:**\n';
    for (const [type, count] of Object.entries(trainTypes)) {
      const localizedType = isChinese ? type.replace('High-speed', 'high-speed').replace('Bullet', 'bullet').replace('Direct Express', 'DirectExpress').replace('Express', 'Express').replace('Fast', 'Fast').replace('Regular', 'Regular') : type;
      summary += `• ${localizedType}: ${count} ${isChinese ? 'trains' : 'train'}${!isChinese && count > 1 ? 's' : ''}\n`;
    }
    
    summary += isChinese ? `\n**Availability:** AvailableTicketTrain ${availableCount} / TotalTrain ${tickets.length}\n` : `\n**Availability:** ${availableCount} / ${tickets.length} trains have seats\n`;

    // Price summary
    if (priceCount > 0) {
      const avgPrice = totalPrice / priceCount;
      summary += isChinese ? `\n**Averagefare:** ¥${avgPrice.toFixed(2)}\n` : `\n**Average Price:** ¥${avgPrice.toFixed(2)}\n`;
      summary += isChinese ? `**Price Range:** ${this.getPriceRange(tickets)}\n` : `**Price Range:** ${this.getPriceRange(tickets)}\n`;
    }
    
    // Time range
    const timeRange = this.getTimeRange(tickets);
    if (timeRange) {
      summary += isChinese ? `\n**departureTimeRange:** ${timeRange}\n` : `\n**Departure Times:** ${timeRange}\n`;
    }
    
    // Recommendations
    summary += isChinese ? '\n**💡 Suggestions:**\n' : '\n**💡 Recommendations:**\n';
    if (availableCount === 0) {
      summary += isChinese ? '• Sorry，SelectedTrainappear to be sold out。SuggestionsTryother dates or enable waitlist。\n' : '• Sorry, all trains appear to be sold out. Try another date or join waitlist.\n';
    } else {
      if (tickets.length > 5) {
        summary += isChinese ? '• Plenty of options，SuggestionsChooseTimeearliest orfarebest fareschedule。\n' : '• Many options available, consider earliest or cheapest.\n';
      }
      if (this.hasHighSpeedTrains(tickets)) {
        summary += isChinese ? '• Recommendedhigh-speedschedule，for faster travel。\n' : '• High-speed trains available for faster travel.\n';
      }
    }
    
    return summary;
  }

  /**
   * Guess train type from train number
   */
  private guessTrainType(trainNo: string): string {
    const upperNo = trainNo.toUpperCase();
    
    if (upperNo.startsWith('G')) return 'High-speed (G)';
    if (upperNo.startsWith('D')) return 'Bullet (D)';
    if (upperNo.startsWith('C')) return 'Intercity (C)';
    if (upperNo.startsWith('Z')) return 'Direct Express (Z)';
    if (upperNo.startsWith('T')) return 'Express (T)';
    if (upperNo.startsWith('K')) return 'Fast (K)';
    if (/^\d/.test(trainNo)) return 'Regular';
    
    return 'Other';
  }

  /**
   * Get price range
   */
  private getPriceRange(tickets: any[]): string {
    let minPrice: number | null = null;
    let maxPrice: number | null = null;
    
    for (const ticket of tickets) {
      if (ticket.price) {
        const priceValue = typeof ticket.price === 'number' 
          ? ticket.price 
          : parseFloat(String(ticket.price).replace(/[^0-9.]/g, ''));
        
        if (!isNaN(priceValue)) {
          if (minPrice === null || priceValue < minPrice) {
            minPrice = priceValue;
          }
          if (maxPrice === null || priceValue > maxPrice) {
            maxPrice = priceValue;
          }
        }
      }
    }
    
    if (minPrice !== null && maxPrice !== null) {
      return `¥${minPrice.toFixed(2)} - ¥${maxPrice.toFixed(2)}`;
    }
    
    return 'N/A';
  }

  /**
   * Get time range
   */
  private getTimeRange(tickets: any[]): string {
    const times: Date[] = [];
    
    for (const ticket of tickets) {
      const timeStr = ticket.departureTime || ticket.start_time;
      if (timeStr) {
        try {
          const date = new Date(timeStr);
          if (!isNaN(date.getTime())) {
            times.push(date);
          }
        } catch {
          // Ignore invalid dates
        }
      }
    }
    
    if (times.length === 0) {
      return '';
    }
    
    times.sort((a, b) => a.getTime() - b.getTime());
    
    const earliest = times[0];
    const latest = times[times.length - 1];
    
    return `${earliest.getHours().toString().padStart(2, '0')}:${earliest.getMinutes().toString().padStart(2, '0')} - ${latest.getHours().toString().padStart(2, '0')}:${latest.getMinutes().toString().padStart(2, '0')}`;
  }

  /**
   * Check if has high-speed trains
   */
  private hasHighSpeedTrains(tickets: any[]): boolean {
    return tickets.some(ticket => {
      const trainNo = ticket.trainNo || ticket.trainNumber || '';
      return trainNo.toUpperCase().startsWith('G') || trainNo.toUpperCase().startsWith('D');
    });
  }
}

export default TicketDataFormatter;