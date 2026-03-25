/**
 * Centralized logger for ZeraBot API Bridge.
 *
 * Dev  → colored pretty-print to stdout/stderr
 * Prod → one JSON line per entry (LOG_LEVEL env controls minimum level)
 */

type Level = "debug" | "info" | "warn" | "error"

const LEVEL_RANK: Record<Level, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
}

const IS_PROD = process.env.NODE_ENV === "production"
const IS_TTY = process.stdout.isTTY ?? false

const envLevel = process.env.LOG_LEVEL as Level | undefined
const MIN_LEVEL: Level = envLevel ?? (IS_PROD ? "info" : "debug")

// ANSI escape codes — only applied when writing to a real terminal
const C = IS_TTY
  ? {
      reset: "\x1b[0m",
      dim: "\x1b[2m",
      bold: "\x1b[1m",
      gray: "\x1b[90m",
      cyan: "\x1b[36m",
      yellow: "\x1b[33m",
      red: "\x1b[31m",
      magenta: "\x1b[35m",
    }
  : {
      reset: "",
      dim: "",
      bold: "",
      gray: "",
      cyan: "",
      yellow: "",
      red: "",
      magenta: "",
    }

const LEVEL_COLOR: Record<Level, string> = {
  debug: C.gray,
  info: C.cyan,
  warn: C.yellow,
  error: C.red,
}

function shouldLog(level: Level): boolean {
  return LEVEL_RANK[level] >= LEVEL_RANK[MIN_LEVEL]
}

function write(level: Level, module: string, msg: string, ctx?: Record<string, unknown>): void {
  if (!shouldLog(level)) return

  const ts = new Date().toISOString()

  if (IS_PROD) {
    const entry: Record<string, unknown> = { ts, level, module, msg }
    if (ctx) Object.assign(entry, ctx)
    ;(level === "error" ? process.stderr : process.stdout).write(
      JSON.stringify(entry) + "\n",
    )
    return
  }

  // Pretty dev output
  const lvl = `${LEVEL_COLOR[level]}${level.toUpperCase().padEnd(5)}${C.reset}`
  const mod = `${C.bold}${C.magenta}[${module}]${C.reset}`
  const time = `${C.dim}${ts}${C.reset}`
  const ctxStr = ctx && Object.keys(ctx).length > 0 ? ` ${C.gray}${JSON.stringify(ctx)}${C.reset}` : ""
  const line = `${time} ${lvl} ${mod} ${msg}${ctxStr}\n`

  ;(level === "error" ? process.stderr : process.stdout).write(line)
}

export type Logger = ReturnType<typeof createLogger>

export function createLogger(module: string) {
  return {
    debug: (msg: string, ctx?: Record<string, unknown>) => write("debug", module, msg, ctx),
    info: (msg: string, ctx?: Record<string, unknown>) => write("info", module, msg, ctx),
    warn: (msg: string, ctx?: Record<string, unknown>) => write("warn", module, msg, ctx),
    error: (msg: string, ctx?: Record<string, unknown>) => write("error", module, msg, ctx),
  }
}
