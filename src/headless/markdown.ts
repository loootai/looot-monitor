import { clockTime, dayKey } from "@/lib/clock";
import { usd, usdPrecise } from "@/lib/money";
import { RUNS_PER_MONTH } from "@/lib/schedule";
import type { PageResult, PageStatus, WatchPlan, WatchReport } from "./watch";
import type { Watchlist } from "./watchlist";

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const MAX_LINES = 60;
const MAX_LINE = 400;
const SEVERITY_ORDER = { high: 0, medium: 1, low: 2 };
const NOT_RUN: Partial<Record<PageStatus, string>> = {
  skipped_run_cap: "over the run cap",
  skipped_month_cap: "monthly cap reached",
  blocked_price: "price guard",
  already_ran: "already checked today",
};

/** Text for the terminal: what a run would call, page by page, with the price of each and the totals. */
export function renderPlan(list: Watchlist, plan: WatchPlan, o: { priceNote: string }): string {
  const out: string[] = [`${list.name}: ${plural(plan.lines.length, "page")}, ${o.priceNote}`, ""];
  let group = "";
  for (const l of plan.lines) {
    if (l.page.group !== group) {
      group = l.page.group;
      out.push(`${group}`);
    }
    out.push(`  ${l.included ? " " : "x"} ${usdPrecise(l.priceMicros)}  ${l.endpointId}  ${l.page.name}  ${l.page.url}`);
  }
  const left = plan.lines.filter((l) => !l.included);
  out.push("");
  out.push(`Per run: ${usdPrecise(plan.plannedMicros)} for ${plural(plan.lines.length - left.length, "page")}. Run cap ${usdPrecise(list.maxSpendPerRunMicros)}.`);
  if (left.length > 0) out.push(`Over the run cap, not run (marked x): ${plural(left.length, "page")}. The whole list is ${usdPrecise(plan.totalMicros)} a run.`);
  out.push(`Per month at one run a day: ${usd(plan.plannedMicros * RUNS_PER_MONTH.daily)}. Monthly cap ${usd(list.monthlyCapMicros)}.`);
  return out.join("\n");
}

const clip = (s: string) => (s.length > MAX_LINE ? `${s.slice(0, MAX_LINE - 3)}...` : s).replace(/```/g, "'''");
const cell = (s: string) => s.replace(/\|/g, "\\|");
const pct = (p: number | null) => (p === null ? "" : `${p > 0 ? "+" : ""}${p}%`);

function changedSection(p: PageResult): string[] {
  const out = [`### ${p.page.name} (${p.severity ?? "low"})`, "", `${p.page.group} · ${p.page.url}`, ""];
  if (p.reason) out.push(`${p.reason}`, "");
  if (p.priceChanges.length > 0) {
    out.push("| What | Before | After | Change |", "|---|---|---|---|");
    for (const c of p.priceChanges) out.push(`| ${cell(c.label)} | ${cell(c.before)} | ${cell(c.after)} | ${pct(c.pct)} |`);
    out.push("");
  }
  const lines = [...p.edits.flatMap((e) => [`- ${clip(e.before)}`, `+ ${clip(e.after)}`]), ...p.added.map((l) => `+ ${clip(l)}`), ...p.removed.map((l) => `- ${clip(l)}`)];
  if (lines.length > 0) {
    out.push("```diff", ...lines.slice(0, MAX_LINES), "```");
    if (lines.length > MAX_LINES) out.push("", `${plural(lines.length - MAX_LINES, "more changed line")} not shown.`);
    out.push("");
  }
  if (p.note) out.push(p.note, "");
  return out;
}

/** The markdown digest of one run: what changed per page with old and new text, what failed, what was not run, and the spend. */
export function renderWatchDigest(r: WatchReport): string {
  const of = (...s: PageStatus[]) => r.pages.filter((p) => s.includes(p.status));
  const changed = of("changed").sort((a, b) => SEVERITY_ORDER[a.severity ?? "low"] - SEVERITY_ORDER[b.severity ?? "low"]);
  const failed = of("failed");
  const notRun = of("skipped_run_cap", "skipped_month_cap", "blocked_price", "already_ran");
  const baseline = of("baseline");
  const unchanged = of("unchanged");
  const checked = r.pages.length - notRun.length;

  const out = [`# ${r.name}, ${dayKey(r.startedAt)}`, ""];
  const counts = [`${plural(checked, "page")} checked`, `${changed.length} changed`];
  if (baseline.length > 0) counts.push(`${baseline.length} new (first snapshot stored)`);
  if (failed.length > 0) counts.push(`${failed.length} failed`);
  if (notRun.length > 0) counts.push(`${notRun.length} not run`);
  out.push(`Run at ${clockTime(r.startedAt)} UTC. ${counts.join(", ")}.`, "");
  out.push(`Spent ${usdPrecise(r.spentMicros)} of a ${usdPrecise(r.runCapMicros)} run cap. This month: ${usd(r.monthSpentMicros)} of ${usd(r.monthlyCapMicros)}.`, "");

  if (changed.length > 0) {
    out.push("## Changed", "");
    for (const p of changed) out.push(...changedSection(p));
  }
  if (failed.length > 0) {
    out.push("## Failed", "", "A failed looot run costs nothing.", "");
    for (const p of failed) out.push(`- ${p.page.name}: \`${p.error ?? "unknown"}\` · ${p.page.url}`);
    out.push("");
  }
  if (notRun.length > 0) {
    out.push("## Not run", "");
    for (const p of notRun) out.push(`- ${p.page.name}: ${NOT_RUN[p.status]}${p.status === "blocked_price" && p.error ? `. ${p.error}` : ""}`);
    out.push("");
  }
  if (baseline.length > 0) {
    out.push("## First snapshot", "", "These pages were read for the first time. Changes show from the next run.", "");
    for (const p of baseline) out.push(`- ${p.page.name}${p.note ? `. ${p.note}` : ""}`);
    out.push("");
  }
  if (unchanged.length > 0) out.push("## Unchanged", "", unchanged.map((p) => p.page.name).join(", "), "");
  return `${out.join("\n").trimEnd()}\n`;
}
