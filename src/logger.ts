export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

type LogContext = Record<string, string | number | boolean | null | undefined>;

function timestamp() {
  return new Date().toISOString();
}

export class Logger {
  constructor(private readonly minLevel: LogLevel = "info", private readonly context: LogContext = {}) {}

  child(extra: LogContext) {
    return new Logger(this.minLevel, { ...this.context, ...extra });
  }

  private enabled(level: LogLevel) {
    return levelOrder[level] >= levelOrder[this.minLevel];
  }

  private emit(level: LogLevel, message: string, meta?: unknown) {
    if (!this.enabled(level)) return;
    const base = { ts: timestamp(), level, message, ...this.context };
    const payload = meta ? { ...base, meta } : base;
    const line = JSON.stringify(payload);
    if (level === "warn") {
      console.warn(line);
    } else if (level === "error") {
      console.error(line);
    } else {
      console.log(line);
    }
  }

  debug(message: string, meta?: unknown) {
    this.emit("debug", message, meta);
  }
  info(message: string, meta?: unknown) {
    this.emit("info", message, meta);
  }
  warn(message: string, meta?: unknown) {
    this.emit("warn", message, meta);
  }
  error(message: string, meta?: unknown) {
    this.emit("error", message, meta);
  }
}

