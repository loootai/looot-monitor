/** true when the app runs on seeded data with no Supabase and no looot token. */
export const IS_DEMO = process.env.NEXT_PUBLIC_DEMO === "1";

/** The demo has a fixed clock, so every number on screen is the same on every machine. */
export const DEMO_NOW = "2026-10-08T09:00:00.000Z";

/** The current time. Fixed in demo mode. */
export function now(): Date {
  return IS_DEMO ? new Date(DEMO_NOW) : new Date();
}

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Oct 7" in UTC. Built by hand so the server and the browser print the same text. */
export function shortDate(iso: string | Date): string {
  const d = new Date(iso);
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
}

/** "14:00" in UTC. */
export function clockTime(iso: string | Date): string {
  const d = new Date(iso);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** "Oct 7, 14:00" in UTC. */
export function dateTime(iso: string | Date): string {
  return `${shortDate(iso)}, ${clockTime(iso)}`;
}

/** "2026-10-07", the UTC day an instant falls on. */
export function dayKey(iso: string | Date): string {
  return new Date(iso).toISOString().slice(0, 10);
}

/** "5m ago", "3h ago", "2d ago", then the date. Future times read "in 3h". */
export function relative(iso: string | Date | null | undefined, at: Date = now()): string {
  if (!iso) return "never";
  const diff = at.getTime() - new Date(iso).getTime();
  const abs = Math.abs(diff);
  const text = abs < MIN ? "now" : abs < HOUR ? `${Math.round(abs / MIN)}m` : abs < DAY ? `${Math.round(abs / HOUR)}h` : abs < 14 * DAY ? `${Math.round(abs / DAY)}d` : shortDate(iso);
  if (text === "now" || abs >= 14 * DAY) return text;
  return diff >= 0 ? `${text} ago` : `in ${text}`;
}

/** Heading for a day group: Today, Yesterday, or "Mon, Oct 5". */
export function dayLabel(key: string, at: Date = now()): string {
  const today = dayKey(at);
  const yesterday = dayKey(new Date(at.getTime() - DAY));
  if (key === today) return "Today";
  if (key === yesterday) return "Yesterday";
  const d = new Date(`${key}T00:00:00Z`);
  return `${["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d.getUTCDay()]}, ${shortDate(d)}`;
}
