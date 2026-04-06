import * as fs from 'fs';
import * as path from 'path';
import { LOGS_DIR } from './constants';
export var LogLevel;
(function (LogLevel) {
    LogLevel["DEBUG"] = "DEBUG";
    LogLevel["INFO"] = "INFO";
    LogLevel["WARN"] = "WARN";
    LogLevel["ERROR"] = "ERROR";
})(LogLevel || (LogLevel = {}));
export class Logger {
    constructor() {
        this.logLevel = LogLevel.INFO;
        // Ensure log directory exists
        if (!fs.existsSync(LOGS_DIR)) {
            fs.mkdirSync(LOGS_DIR, { recursive: true });
        }
        // Create date-named log file
        const date = new Date().toISOString().split('T')[0];
        this.logFile = path.join(LOGS_DIR, `mcpilot-${date}.log`);
    }
    static getInstance() {
        if (!Logger.instance) {
            Logger.instance = new Logger();
        }
        return Logger.instance;
    }
    setLogLevel(level) {
        this.logLevel = level;
    }
    shouldLog(level) {
        const levels = [LogLevel.DEBUG, LogLevel.INFO, LogLevel.WARN, LogLevel.ERROR];
        return levels.indexOf(level) >= levels.indexOf(this.logLevel);
    }
    formatMessage(level, message, context) {
        const timestamp = new Date().toISOString();
        const contextStr = context ? ` ${JSON.stringify(context)}` : '';
        return `[${timestamp}] [${level}] ${message}${contextStr}`;
    }
    writeToFile(message) {
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
        }
        catch (error) {
            // If file write fails, at least output to console
            console.error(`Failed to write to log file ${this.logFile}: ${error.message}`);
        }
    }
    debug(message, context) {
        if (this.shouldLog(LogLevel.DEBUG)) {
            const formatted = this.formatMessage(LogLevel.DEBUG, message, context);
            console.debug(formatted);
            this.writeToFile(formatted);
        }
    }
    info(message, context) {
        if (this.shouldLog(LogLevel.INFO)) {
            const formatted = this.formatMessage(LogLevel.INFO, message, context);
            console.info(formatted);
            this.writeToFile(formatted);
        }
    }
    warn(message, context) {
        if (this.shouldLog(LogLevel.WARN)) {
            const formatted = this.formatMessage(LogLevel.WARN, message, context);
            console.warn(formatted);
            this.writeToFile(formatted);
        }
    }
    error(message, context) {
        if (this.shouldLog(LogLevel.ERROR)) {
            const formatted = this.formatMessage(LogLevel.ERROR, message, context);
            console.error(formatted);
            this.writeToFile(formatted);
        }
    }
    logRequest(command, data) {
        this.info(`Received command: ${command}`, { data });
    }
    logServiceEvent(serviceName, event, details) {
        this.info(`Service ${serviceName}: ${event}`, details);
    }
    logAIQuery(query, result) {
        this.info(`AI Query: "${query}"`, { result });
    }
    logConfigUpdate(configType, config) {
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
