// Checks a watchlist of pages once and writes a markdown digest. No UI, no Supabase, no sign-in.
//   npm run watch -- --config watchlists/example.yaml --out digests/ [--state file.json] [--dry-run] [--force]
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, resolve } from "node:path";
import { parseArgs } from "node:util";
import { dayKey } from "@/lib/clock";
import { LoootError, loootFromEnv } from "@/lib/looot";
import { usdPrecise } from "@/lib/money";
import { FALLBACK_PRICES, fetchPrices } from "@/lib/prices";
import { PRICES_AS_OF } from "@/lib/sources";
import { renderPlan, renderWatchDigest } from "./markdown";
import { planWatch, runWatch, type WatchState } from "./watch";
import { parseWatchlist, WatchlistError } from "./watchlist";

const HELP = `Usage: npm run watch -- --config <watchlist.yaml> [options]

  --config <file>   The watchlist (YAML). Required.
  --out <dir>       Where the digest goes, as YYYY-MM-DD.md. Default: digests
  --state <file>    Last-seen text and spend. Default: state/<watchlist name>.json
  --dry-run         Make no looot call. Print what would run and the list-price total.
  --force           Run again in a day that already ran. It is charged again.

Needs LOOOT_TOKEN in the environment, except with --dry-run.`;

function fail(message: string, code = 1): never {
  console.error(message);
  process.exit(code);
}

async function main(): Promise<void> {
  let args;
  try {
    args = parseArgs({ options: { config: { type: "string" }, out: { type: "string", default: "digests" }, state: { type: "string" }, "dry-run": { type: "boolean", default: false }, force: { type: "boolean", default: false }, help: { type: "boolean", default: false } } }).values;
  } catch (e) {
    fail(`${(e as Error).message}\n\n${HELP}`, 2);
  }
  if (args.help) return console.log(HELP);
  if (!args.config) fail(`--config is required.\n\n${HELP}`, 2);

  const configPath = resolve(args.config);
  if (!existsSync(configPath)) fail(`No watchlist at ${args.config}`, 2);
  let list;
  try {
    list = parseWatchlist(readFileSync(configPath, "utf8"));
  } catch (e) {
    if (e instanceof WatchlistError) fail(e.message, 2);
    throw e;
  }
  const statePath = resolve(args.state ?? join("state", `${basename(configPath, extname(configPath))}.json`));
  const state: WatchState | null = existsSync(statePath) ? (JSON.parse(readFileSync(statePath, "utf8")) as WatchState) : null;
  const known = new Set((state?.snapshots ?? []).map((s) => s.monitorId));
  const firstTime = list.pages.filter((p) => !known.has(p.id)).length;

  if (args["dry-run"]) {
    console.log(renderPlan(list, planWatch(list, FALLBACK_PRICES), { priceNote: `list prices dated ${PRICES_AS_OF}` }));
    console.log(`\n${firstTime} of ${list.pages.length} pages have no snapshot yet. Their first run stores one and reports no change.`);
    console.log("Dry run: no looot call was made and nothing was written.");
    return;
  }

  let looot;
  try {
    looot = loootFromEnv();
  } catch (e) {
    if (e instanceof LoootError) fail("LOOOT_TOKEN is not set. Create an agent token at https://looot.ai/settings, or use --dry-run.", 2);
    throw e;
  }
  const priced = await fetchPrices([...new Set(planWatch(list, FALLBACK_PRICES).lines.map((l) => l.endpointId))]);
  const plan = planWatch(list, priced.prices);
  console.log(renderPlan(list, plan, { priceNote: priced.source === "catalog" ? "live prices from the looot catalog" : `list prices dated ${PRICES_AS_OF}` }));
  if (priced.unread.length > 0) console.log(`\nThe live price of ${priced.unread.join(", ")} could not be read. Pages on it will not run.`);
  console.log(`\nRunning ${plan.lines.filter((l) => l.included).length} pages, at most ${usdPrecise(plan.plannedMicros)}.\n`);

  const now = new Date();
  const { state: next, report } = await runWatch({ list, state, looot, prices: priced.prices, unpriced: priced.unread, now, force: args.force });

  // State first: it holds the spend and the idempotency keys of the calls just made.
  mkdirSync(dirname(statePath), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(next, null, 1)}\n`);

  if (report.pages.every((p) => p.status === "already_ran")) {
    console.log("Every page was already checked today, so no call was made and no digest was written. Use --force to run again.");
    return;
  }
  const digest = renderWatchDigest(report);
  const outDir = resolve(args.out);
  mkdirSync(outDir, { recursive: true });
  const digestPath = join(outDir, `${dayKey(now)}.md`);
  // A second run in the same day adds its section under the first.
  writeFileSync(digestPath, existsSync(digestPath) ? `${readFileSync(digestPath, "utf8").trimEnd()}\n\n---\n\n${digest}` : digest);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, digest);

  console.log(digest);
  console.log(`Digest: ${digestPath}\nState: ${statePath}`);
  const attempted = report.pages.filter((p) => ["changed", "unchanged", "baseline", "failed"].includes(p.status));
  if (attempted.length > 0 && attempted.every((p) => p.status === "failed")) fail("Every page failed. See the digest for the error codes.");
}

main().catch((e) => fail(e instanceof Error ? (e.stack ?? e.message) : String(e)));
