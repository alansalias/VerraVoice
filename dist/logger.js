"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Logger = void 0;
const levelOrder = {
    debug: 10,
    info: 20,
    warn: 30,
    error: 40,
};
function timestamp() {
    return new Date().toISOString();
}
class Logger {
    minLevel;
    context;
    constructor(minLevel = "info", context = {}) {
        this.minLevel = minLevel;
        this.context = context;
    }
    child(extra) {
        return new Logger(this.minLevel, { ...this.context, ...extra });
    }
    enabled(level) {
        return levelOrder[level] >= levelOrder[this.minLevel];
    }
    emit(level, message, meta) {
        if (!this.enabled(level))
            return;
        const base = { ts: timestamp(), level, message, ...this.context };
        const payload = meta ? { ...base, meta } : base;
        const line = JSON.stringify(payload);
        if (level === "warn") {
            console.warn(line);
        }
        else if (level === "error") {
            console.error(line);
        }
        else {
            console.log(line);
        }
    }
    debug(message, meta) {
        this.emit("debug", message, meta);
    }
    info(message, meta) {
        this.emit("info", message, meta);
    }
    warn(message, meta) {
        this.emit("warn", message, meta);
    }
    error(message, meta) {
        this.emit("error", message, meta);
    }
}
exports.Logger = Logger;
