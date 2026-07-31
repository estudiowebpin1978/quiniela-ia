/**
 * Structured Logger with Correlation IDs
 * Provides consistent, machine-readable logging across all API routes.
 * Each request gets a unique correlation ID for tracing across services.
 */

const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const
type Level = keyof typeof LOG_LEVELS

const currentLevel: Level = (process.env.LOG_LEVEL as Level) || "info"

function shouldLog(level: Level): boolean {
  return (LOG_LEVELS[level] ?? 2) <= (LOG_LEVELS[currentLevel] ?? 2)
}

/**
 * Generate a short correlation ID (8 chars, base36).
 */
export function generateCorrelationId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
}

/**
 * Create a child logger with a fixed correlation ID and optional context.
 */
export function createLogger(correlationId: string, context?: Record<string, unknown>) {
  return {
    error(msg: string, meta?: Record<string, unknown>) {
      if (shouldLog("error")) {
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: "ERROR",
          corr: correlationId,
          ctx: context,
          msg,
          ...meta,
        }))
      }
    },
    warn(msg: string, meta?: Record<string, unknown>) {
      if (shouldLog("warn")) {
        console.warn(JSON.stringify({
          ts: new Date().toISOString(),
          level: "WARN",
          corr: correlationId,
          ctx: context,
          msg,
          ...meta,
        }))
      }
    },
    info(msg: string, meta?: Record<string, unknown>) {
      if (shouldLog("info")) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: "INFO",
          corr: correlationId,
          ctx: context,
          msg,
          ...meta,
        }))
      }
    },
    debug(msg: string, meta?: Record<string, unknown>) {
      if (shouldLog("debug")) {
        console.log(JSON.stringify({
          ts: new Date().toISOString(),
          level: "DEBUG",
          corr: correlationId,
          ctx: context,
          msg,
          ...meta,
        }))
      }
    },
  }
}

type Logger = ReturnType<typeof createLogger>

/**
 * Default logger (no correlation ID). Use createLogger() for request-scoped logging.
 */
const defaultLogger = {
  error(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("error")) console.error(JSON.stringify({ ts: new Date().toISOString(), level: "ERROR", msg, ...meta }))
  },
  warn(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("warn")) console.warn(JSON.stringify({ ts: new Date().toISOString(), level: "WARN", msg, ...meta }))
  },
  info(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("info")) console.log(JSON.stringify({ ts: new Date().toISOString(), level: "INFO", msg, ...meta }))
  },
  debug(msg: string, meta?: Record<string, unknown>) {
    if (shouldLog("debug")) console.log(JSON.stringify({ ts: new Date().toISOString(), level: "DEBUG", msg, ...meta }))
  },
}

export default defaultLogger
