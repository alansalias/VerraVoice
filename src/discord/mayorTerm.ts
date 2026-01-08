import { DateTime } from "luxon";

function safeZone(tz: string | null | undefined) {
  const trimmed = tz?.trim();
  if (!trimmed) return "UTC";
  const dt = DateTime.now().setZone(trimmed);
  return dt.isValid ? trimmed : "UTC";
}

/**
 * Returns the timestamp (ms) for the next monthly election cutoff: the 5th of next month at 23:59:00.
 * Uses the server's configured timezone; falls back to UTC if invalid.
 */
export function nextElectionTermEndMs(timezone: string | null | undefined) {
  const zone = safeZone(timezone);
  const now = DateTime.now().setZone(zone);
  const target = now.plus({ months: 1 }).set({ day: 5, hour: 23, minute: 59, second: 0, millisecond: 0 });
  if (target.isValid) return target.toMillis();
  const fallback = DateTime.now().setZone("UTC").plus({ months: 1 }).set({ day: 5, hour: 23, minute: 59, second: 0, millisecond: 0 });
  return fallback.toMillis();
}
