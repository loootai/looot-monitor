import type { Schedule } from "./types";

export const RUNS_PER_MONTH: Record<Schedule, number> = { hourly: 720, every_6h: 120, daily: 30, weekly: 4 };
export const SCHEDULE_LABEL: Record<Schedule, string> = { hourly: "Hourly", every_6h: "Every 6 h", daily: "Daily", weekly: "Weekly" };
const HOUR = 3_600_000;

/**
 * The schedule boundary a moment falls in, in UTC. Two cron ticks inside the same boundary get
 * the same slot, which is what makes the idempotency key stable.
 */
export function slotFor(schedule: Schedule, at: Date, runHour = 0): Date {
  const d = new Date(at.getTime());
  d.setUTCMinutes(0, 0, 0);
  if (schedule === "hourly") return d;
  if (schedule === "every_6h") {
    d.setUTCHours(Math.floor(d.getUTCHours() / 6) * 6);
    return d;
  }
  if (d.getUTCHours() < runHour) d.setUTCDate(d.getUTCDate() - 1);
  d.setUTCHours(runHour);
  if (schedule === "weekly") {
    // Weeks start on Monday.
    const back = (d.getUTCDay() + 6) % 7;
    d.setUTCDate(d.getUTCDate() - back);
  }
  return d;
}

/** The first slot strictly after the one `at` falls in. */
export function nextRunAfter(schedule: Schedule, at: Date, runHour = 0): Date {
  const slot = slotFor(schedule, at, runHour);
  const step = schedule === "hourly" ? HOUR : schedule === "every_6h" ? 6 * HOUR : schedule === "daily" ? 24 * HOUR : 7 * 24 * HOUR;
  return new Date(slot.getTime() + step);
}

/** Key for a scheduled call. The same monitor, source and slot always give the same key. */
export function scheduledKey(monitorId: string, source: string, slot: Date): string {
  return `mon:${monitorId}:${source}:${slot.toISOString()}`;
}

/** Key for a manual call. The UUID is made when the quote is shown and sent back on confirm. */
export function manualKey(monitorId: string, source: string, confirmId: string): string {
  return `man:${monitorId}:${source}:${confirmId}`;
}

/** First instant of the calendar month `at` is in, UTC. */
export function monthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), 1));
}

/** First instant of the next calendar month, UTC. This is when a budget pause lifts. */
export function nextMonthStart(at: Date): Date {
  return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 1));
}
