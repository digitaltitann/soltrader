export enum LogLevel {
  INFO = 'INFO',
  WARN = 'WARN',
  ERROR = 'ERROR',
  TRADE = 'TRADE',
  SIGNAL = 'SIGNAL',
  AGENT = 'AGENT',
}

function log(level: LogLevel, message: string, data?: any): void {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level}]`;
  if (data !== undefined) {
    console.log(`${prefix} ${message}`, typeof data === 'string' ? data : JSON.stringify(data, null, 2));
  } else {
    console.log(`${prefix} ${message}`);
  }
}

export const logInfo = (msg: string, data?: any) => log(LogLevel.INFO, msg, data);
export const logWarn = (msg: string, data?: any) => log(LogLevel.WARN, msg, data);
export const logError = (msg: string, data?: any) => log(LogLevel.ERROR, msg, data);
export const logTrade = (msg: string, data?: any) => log(LogLevel.TRADE, msg, data);
export const logSignal = (msg: string, data?: any) => log(LogLevel.SIGNAL, msg, data);
export const logAgent = (msg: string, data?: any) => log(LogLevel.AGENT, msg, data);
