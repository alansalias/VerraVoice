export type LogLevel = "debug" | "info" | "warn" | "error";

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export class Logger {
  constructor(private readonly minLevel: LogLevel = "info") {}

  private enabled(level: LogLevel) {
    return levelOrder[level] >= levelOrder[this.minLevel];
  }

  debug(message: string, meta?: unknown) {
    if (this.enabled("debug")) console.log(`[debug] ${message}`, meta ?? "");
  }
  info(message: string, meta?: unknown) {
    if (this.enabled("info")) console.log(`[info] ${message}`, meta ?? "");
  }
  warn(message: string, meta?: unknown) {
    if (this.enabled("warn")) console.warn(`[warn] ${message}`, meta ?? "");
  }
  error(message: string, meta?: unknown) {
    if (this.enabled("error")) console.error(`[error] ${message}`, meta ?? "");
  }
}

