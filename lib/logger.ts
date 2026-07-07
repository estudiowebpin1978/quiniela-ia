const LOG_LEVELS = { error: 0, warn: 1, info: 2, debug: 3 } as const
type Level = keyof typeof LOG_LEVELS

const currentLevel: Level = (process.env.LOG_LEVEL as Level) || "info"

function shouldLog(level: Level): boolean {
  return (LOG_LEVELS[level] ?? 2) <= (LOG_LEVELS[currentLevel] ?? 2)
}

function formatMsg(level: Level, msg: string, meta?: Record<string, any>): string {
  const ts = new Date().toISOString()
  const metaStr = meta ? " " + JSON.stringify(meta) : ""
  return `${ts} [${level.toUpperCase()}]: ${msg}${metaStr}`
}

const logger = {
  error(msg: string, meta?: Record<string, any>) {
    if (shouldLog("error")) console.error(formatMsg("error", msg, meta))
  },
  warn(msg: string, meta?: Record<string, any>) {
    if (shouldLog("warn")) console.warn(formatMsg("warn", msg, meta))
  },
  info(msg: string, meta?: Record<string, any>) {
    if (shouldLog("info")) console.log(formatMsg("info", msg, meta))
  },
  debug(msg: string, meta?: Record<string, any>) {
    if (shouldLog("debug")) console.log(formatMsg("debug", msg, meta))
  },
}

export default logger