"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.nextElectionTermEndMs = nextElectionTermEndMs;
const luxon_1 = require("luxon");
function safeZone(tz) {
    const trimmed = tz?.trim();
    if (!trimmed)
        return "UTC";
    const dt = luxon_1.DateTime.now().setZone(trimmed);
    return dt.isValid ? trimmed : "UTC";
}
/**
 * Returns the timestamp (ms) for the next monthly election cutoff: the 5th of next month at 23:59:00.
 * Uses the server's configured timezone; falls back to UTC if invalid.
 */
function nextElectionTermEndMs(timezone) {
    const zone = safeZone(timezone);
    const now = luxon_1.DateTime.now().setZone(zone);
    const target = now.plus({ months: 1 }).set({ day: 5, hour: 23, minute: 59, second: 0, millisecond: 0 });
    if (target.isValid)
        return target.toMillis();
    const fallback = luxon_1.DateTime.now().setZone("UTC").plus({ months: 1 }).set({ day: 5, hour: 23, minute: 59, second: 0, millisecond: 0 });
    return fallback.toMillis();
}
