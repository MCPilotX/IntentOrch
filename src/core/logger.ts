import * as fs from 'fs';
import * as path from 'path';
import { LOGS_DIR } from './constants';

export enum LogLevel {
  DEBUG = 'DEBUG',
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR'
}

export class Logger {
  private static instance: Logger;
  private logFile: string;
  private logLevel: LogLevel = LogLevel.INFO;

  private constructor() {
    // Ensure log directory exists
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    
    // Create date-named log file
    const date = new Date().toISOString().split('T')[0];
    this.logFile = path.join(LOGS_DIR, `mcpilot-${date}.log`);
  }

  static getInstance(): Logger {
    if (!Logger.instance) {
      Logger.instance = new Logger();
    }
    return Logger.instance;
  }

  setLogLevel(level: LogLevel) {
    this.logLevel = level;
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  private formatMessage(level: LogLevel, message: string, context?: any): string {
    const timestamp = new Date().toISOString();
    const contextStr = context ? ` ${JSON.stringify(context)}` : '';
    return `[${timestamp}] [${level}] ${message}${contextStr}`;
  }

  private writeToFile(message: string) {
    try {
      // Ensure log directory exists
      const logDir = path.dirname(this.logFile);
      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }
      
      // Ensure log file exists
      if (!fs.existsSync(this.logFile)) {
        fs.writeFileSync(this.logFile, '', 'utf8');
      }
      
      fs.appendFileSync(this.logFile, message + '\n', 'utf8');
    } catch (error: any) {
      // If file write fails, at least output to console
      console.error(`Failed to write to log file ${this.logFile}: ${error.message}`);
    }
  }

  debug(message: string, context?: any) {
    if (this.shouldLog(LogLevel.DEBUG)) {
      const formatted = this.formatMessage(LogLevel.DEBUG, message, context);
      console.debug(formatted);
      this.writeToFile(formatted);
    }
  }

  info(message: string, context?: any) {
    if (this.shouldLog(LogLevel.INFO)) {
      const formatted = this.formatMessage(LogLevel.INFO, message, context);
      console.info(formatted);
      this.writeToFile(formatted);
    }
  }

  warn(message: string, context?: any) {
    if (this.shouldLog(LogLevel.WARN)) {
      const formatted = this.formatMessage(LogLevel.WARN, message, context);
      console.warn(formatted);
      this.writeToFile(formatted);
    }
  }

  error(message: string, context?: any) {
    if (this.shouldLog(LogLevel.ERROR)) {
      const formatted = this.formatMessage(LogLevel.ERROR, message, context);
      console.error(formatted);
      this.writeToFile(formatted);
    }
  }

  logRequest(command: string, data?: any) {
    this.info(`Received command: ${command}`, { data });
  }

  logServiceEvent(serviceName: string, event: string, details?: any) {
    this.info(`Service ${serviceName}: ${event}`, details);
  }

  logAIQuery(query: string, result?: any) {
    this.info(`AI Query: "${query}"`, { result });
  }

  logConfigUpdate(configType: string, config: any) {
    // Safely record configuration updates, hide sensitive information
    const safeConfig = { ...config };
    if (safeConfig.apiKey) {
      safeConfig.apiKey = '***' + safeConfig.apiKey.slice(-4);
    }
    this.info(`Configuration updated: ${configType}`, { config: safeConfig });
  }
}

// Export singleton instance
export const logger = Logger.getInstance();
