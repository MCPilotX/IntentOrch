export declare enum LogLevel {
    DEBUG = "DEBUG",
    INFO = "INFO",
    WARN = "WARN",
    ERROR = "ERROR"
}
export declare class Logger {
    private static instance;
    private logFile;
    private logLevel;
    private constructor();
    static getInstance(): Logger;
    setLogLevel(level: LogLevel): void;
    private shouldLog;
    private formatMessage;
    private writeToFile;
    debug(message: string, context?: any): void;
    info(message: string, context?: any): void;
    warn(message: string, context?: any): void;
    error(message: string, context?: any): void;
    logRequest(command: string, data?: any): void;
    logServiceEvent(serviceName: string, event: string, details?: any): void;
    logAIQuery(query: string, result?: any): void;
    logConfigUpdate(configType: string, config: any): void;
}
export declare const logger: Logger;
//# sourceMappingURL=logger.d.ts.map