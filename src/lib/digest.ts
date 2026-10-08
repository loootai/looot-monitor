import { shortDate } from "./clock";
import { usd } from "./money";
import type { Alert, Severity } from "./types";

export interface DigestOptions {
  period: "daily" | "weekly";
  from: string;
  to: string;
  severities: Severity[];
  /** Only these monitors. Empty or missing means all. */
  monitorIds?: string[];
  monitorNames: Record<string, string>;
  /** What the checks in the period cost. */
  spendMicros: number;
  theme?: "light" | "dark";
  /** Changed lines for page alerts, by alert id. */
  changes?: Record<string, { removed: string[]; added: string[] }>;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
  counts: Record<Severity, number>;
  total: number;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const SEV_LABEL: Record<Severity, string> = { high: "High", medium: "Medium", low: "Low" };

const THEMES = {
  light: { page: "#F7F8F5", panel: "#FFFFFF", border: "#E3E7DF", text: "#0B2E22", muted: "#5C6F66", brand: "#0B4A35", high: "#B42318", medium: "#B25E09", low: "#6B7A72", add: "#E3F4EC", del: "#FBEAE8" },
  dark: { page: "#0A1512", panel: "#0F1F1A", border: "#1D332B", text: "#E8EFE9", muted: "#8FA39A", brand: "#35C48D", high: "#F97066", medium: "#F5A54A", low: "#8FA39A", add: "#12301F", del: "#3A1A17" },
};

/**
 * Renders the digest email from alerts. Pure: no clock, no network. The HTML uses tables and
 * inline styles only, with no script, so it can be handed to any mail service as it is.
 */
export function renderDigest(alerts: Alert[], o: DigestOptions): Digest {
  const c = THEMES[o.theme ?? "light"];
  const picked = alerts
    .filter((a) => a.createdAt >= o.from && a.createdAt < o.to && o.severities.includes(a.severity) && (!o.monitorIds?.length || o.monitorIds.includes(a.monitorId)))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const a of picked) counts[a.severity]++;
  const other = counts.medium + counts.low;
  const range = `${shortDate(o.from)} to ${shortDate(o.to)}`;
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  const subject = picked.length === 0 ? `looot-monitor, no alerts, ${range}` : `looot-monitor, ${counts.high} high and ${plural(other, "other alert")}, ${range}`;
  const spendLine = `This digest cost ${usd(o.spendMicros)} in checks`;

  if (picked.length === 0) {
    const none = `No alerts between ${shortDate(o.from)} and ${shortDate(o.to)}. Nothing would be sent.`;
    return { subject, counts, total: 0, text: none, html: shell(c, subject, `<tr><td style="padding:32px 24px;font:14px/1.5 Helvetica,Arial,sans-serif;color:${c.muted}">${esc(none)}</td></tr>`) };
  }

  const meta = (a: Alert) => [o.monitorNames[a.monitorId] ?? "Monitor", a.domain, shortDate(a.createdAt)].filter(Boolean).join(" · ");
  const change = (a: Alert) => {
    const ch = o.changes?.[a.id];
    if (!ch || (ch.removed.length === 0 && ch.added.length === 0)) return "";
    const row = (sign: string, text: string, bg: string) => `<tr><td style="padding:3px 8px;background:${bg};font:12px/1.5 Menlo,Consolas,monospace;color:${c.text}">${sign} ${esc(text)}</td></tr>`;
    return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:8px;border:1px solid ${c.border}">${ch.removed.map((l) => row("-", l, c.del)).join("")}${ch.added.map((l) => row("+", l, c.add)).join("")}</table>`;
  };
  const title = (a: Alert) => (a.url ? `<a href="${esc(a.url)}" style="color:${c.text};text-decoration:none">${esc(a.title)}</a>` : esc(a.title));

  const high = picked.filter((a) => a.severity === "high");
  const rest = picked.filter((a) => a.severity !== "high");
  const parts: string[] = [];
  const text: string[] = [subject, "", `${counts.high} high, ${counts.medium} medium, ${counts.low} low`, ""];

  parts.push(
    `<tr><td style="padding:20px 24px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>${(["high", "medium", "low"] as Severity[])
      .map((s) => `<td width="33%" style="font:12px/1.4 Helvetica,Arial,sans-serif;color:${c.muted}"><span style="font:500 22px/1.2 Menlo,Consolas,monospace;color:${c[s]}">${counts[s]}</span><br>${SEV_LABEL[s]}</td>`)
      .join("")}</tr></table></td></tr>`,
  );

  if (high.length > 0) {
    parts.push(section(c, "High"));
    text.push("HIGH");
    for (const a of high) {
      parts.push(
        `<tr><td style="padding:12px 24px;border-top:1px solid ${c.border}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td width="3" style="background:${c.high}"></td><td style="padding-left:12px"><div style="font:500 14px/1.4 Helvetica,Arial,sans-serif;color:${c.text}">${title(a)}</div><div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:${c.muted};margin-top:2px">${esc(meta(a))}</div><div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:${c.high};margin-top:4px">${esc(a.severityReason)}</div>${a.kind === "page_change" ? change(a) : a.snippet ? `<div style="font:13px/1.5 Helvetica,Arial,sans-serif;color:${c.text};margin-top:6px">${esc(a.snippet.length > 220 ? `${a.snippet.slice(0, 217)}...` : a.snippet)}</div>` : ""}</td></tr></table></td></tr>`,
      );
      text.push(`- ${a.title}`, `  ${meta(a)}`, `  ${a.severityReason}`, ...(a.url ? [`  ${a.url}`] : []));
    }
    text.push("");
  }

  const groups = new Map<string, Alert[]>();
  for (const a of rest) groups.set(a.monitorId, [...(groups.get(a.monitorId) ?? []), a]);
  for (const [monitorId, list] of groups) {
    const name = o.monitorNames[monitorId] ?? "Monitor";
    parts.push(section(c, `${name} (${list.length})`));
    text.push(`${name.toUpperCase()} (${list.length})`);
    for (const a of list.slice(0, 5)) {
      parts.push(
        `<tr><td style="padding:8px 24px;border-top:1px solid ${c.border}"><div style="font:13px/1.45 Helvetica,Arial,sans-serif;color:${c.text}"><span style="font:500 11px/1 Helvetica,Arial,sans-serif;color:${c[a.severity]}">${SEV_LABEL[a.severity]}</span>&nbsp; ${title(a)}</div><div style="font:12px/1.5 Helvetica,Arial,sans-serif;color:${c.muted}">${esc([a.domain, shortDate(a.createdAt)].filter(Boolean).join(" · "))}</div>${a.kind === "page_change" ? change(a) : ""}</td></tr>`,
      );
      text.push(`- [${SEV_LABEL[a.severity]}] ${a.title}`);
    }
    if (list.length > 5) {
      parts.push(`<tr><td style="padding:8px 24px;border-top:1px solid ${c.border};font:12px/1.5 Helvetica,Arial,sans-serif;color:${c.muted}">and ${list.length - 5} more</td></tr>`);
      text.push(`  and ${list.length - 5} more`);
    }
    text.push("");
  }

  parts.push(`<tr><td style="padding:16px 24px;border-top:1px solid ${c.border};font:12px/1.5 Menlo,Consolas,monospace;color:${c.muted}">${esc(spendLine)}</td></tr>`);
  text.push(spendLine);
  return { subject, counts, total: picked.length, html: shell(c, subject, parts.join("")), text: text.join("\n") };
}

function section(c: (typeof THEMES)["light"], label: string): string {
  return `<tr><td style="padding:18px 24px 8px;border-top:1px solid ${c.border};font:500 12px/1 Helvetica,Arial,sans-serif;color:${c.muted}">${esc(label)}</td></tr>`;
}

function shell(c: (typeof THEMES)["light"], subject: string, rows: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head><body style="margin:0;padding:0;background:${c.page}"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${c.page}"><tr><td align="center" style="padding:24px 12px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:${c.panel};border:1px solid ${c.border}"><tr><td style="padding:20px 24px 0;font:500 13px/1 Helvetica,Arial,sans-serif;color:${c.brand}">looot-monitor</td></tr><tr><td style="padding:6px 24px 0;font:500 17px/1.35 Helvetica,Arial,sans-serif;color:${c.text}">${esc(subject.replace(/^looot-monitor, /, "").replace(/^./, (ch) => ch.toUpperCase()))}</td></tr>${rows}</table></td></tr></table></body></html>`;
}
