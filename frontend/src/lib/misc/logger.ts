// lib/misc/logger.ts
// ============================================
// Logger Configuration
// ============================================

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
  NONE: 4,
} as const;

type LogLevel = keyof typeof LOG_LEVELS;

// Check if we're in development environment
const isDevelopment = process.env.NODE_ENV === 'development';

// Only use LOG_LEVEL in development, otherwise default to NONE
const currentLogLevel: LogLevel = isDevelopment
  ? (process.env.LOG_LEVEL as LogLevel) || 'DEBUG'
  : 'NONE';

function shouldLog(level: LogLevel): boolean {
  return LOG_LEVELS[level] >= LOG_LEVELS[currentLogLevel];
}

function formatTimestamp(): string {
  return new Date().toISOString();
}

function formatLog(level: LogLevel, module: string, message: string, data?: unknown): void {
  // Only log in development
  if (!isDevelopment) return;
  if (!shouldLog(level)) return;

  const timestamp = formatTimestamp();
  const logEntry = {
    timestamp,
    level,
    module,
    message,
    ...(data ? { data } : {}),
  };

  if (level === 'ERROR') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'WARN') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
}

export const logger = {
  debug: (module: string, message: string, data?: unknown) =>
    formatLog('DEBUG', module, message, data),
  info: (module: string, message: string, data?: unknown) =>
    formatLog('INFO', module, message, data),
  warn: (module: string, message: string, data?: unknown) =>
    formatLog('WARN', module, message, data),
  error: (module: string, message: string, data?: unknown) =>
    formatLog('ERROR', module, message, data),
};
