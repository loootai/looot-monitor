"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronUp, TriangleAlert } from "lucide-react";
import { QuoteLines } from "@/components/monitors/QuoteLines";
import { Button } from "@/components/ui/button";
import { ChipInput } from "@/components/ui/chips";
import { Field, Input, Select } from "@/components/ui/input";
import { Switch } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { KIND_ICON, KIND_NAME, SOURCE_NAME, SourceIcon } from "@/components/visuals";
import { IS_DEMO, dateTime } from "@/lib/clock";
import { usd, usdPrecise } from "@/lib/money";
import { defaultCapMicros, pauseWeek, type PriceMap, type Quote } from "@/lib/quote";
import { SCHEDULE_LABEL } from "@/lib/schedule";
import { MENTION_SOURCES, SERPER_WEBPAGE, SOURCES } from "@/lib/sources";
import type { Monitor, MonitorConfig, MonitorKind, OwnerTag, Schedule, SourceId } from "@/lib/types";
import { cn } from "@/lib/utils";

const KIND_NOTE: Record<MonitorKind, string> = {
  mention: "A name or phrase in news, X, Reddit and LinkedIn.",
  serp: "New domains and position moves for one query.",
  page: "A text diff when a page changes, with prices picked out.",
  reviews: "New Google Maps or App Store reviews.",
};
const KINDS: MonitorKind[] = ["mention", "serp", "page", "reviews"];
const SCHEDULES: Schedule[] = ["hourly", "every_6h", "daily", "weekly"];
const dollars = (micros: number) => (micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : micros % 100 === 0 ? 4 : 5);

interface Existing {
  id: string;
  name: string;
  kind: MonitorKind;
  target: string;
}

interface Props {
  mode: "new" | "edit";
  initial?: Monitor;
  initialKind?: MonitorKind;
  initialQuote: Quote;
  prices: PriceMap;
  canRun: boolean;
  existing: Existing[];
  defaultCapMicros: number;
}

/** The new and edit form, with the live quote beside it. Nothing is called until the user saves and runs. */
export function MonitorForm({ mode, initial, initialKind, initialQuote, prices, canRun, existing }: Props) {
  const router = useRouter();
  const toast = useToast();
  const c = initial?.config ?? {};
  const [kind, setKind] = React.useState<MonitorKind>(initial?.kind ?? initialKind ?? "mention");
  const [name, setName] = React.useState(initial?.name ?? "");
  const [query, setQuery] = React.useState(c.query ?? "");
  const [sources, setSources] = React.useState<SourceId[]>(c.sources ?? ["news"]);
  const [country, setCountry] = React.useState(c.country ?? "us");
  const [language, setLanguage] = React.useState(c.language ?? "en");
  const [depth, setDepth] = React.useState<10 | 20>(c.depth ?? 10);
  const [myDomain, setMyDomain] = React.useState(c.myDomain ?? "");
  const [competitorDomains, setCompetitorDomains] = React.useState<string[]>(c.competitorDomains ?? []);
  const [url, setUrl] = React.useState(c.url ?? "");
  const [reader, setReader] = React.useState<"jina-reader" | "serper-webpage">(c.reader ?? "jina-reader");
  const [ignore, setIgnore] = React.useState<string[]>(c.ignore ?? []);
  const [watchFor, setWatchFor] = React.useState<string[]>(c.watchFor ?? []);
  const [shot, setShot] = React.useState(c.screenshotOnChange ?? false);
  const [platform, setPlatform] = React.useState<"maps" | "appstore">(c.platform ?? "appstore");
  const [placeId, setPlaceId] = React.useState(c.placeId ?? "");
  const [productId, setProductId] = React.useState(c.productId ?? "");
  const [ownerTag, setOwnerTag] = React.useState<OwnerTag>(initial?.ownerTag ?? "mine");
  const [competitorName, setCompetitorName] = React.useState(initial?.competitorName ?? "");
  const [schedule, setSchedule] = React.useState<Schedule>(initial?.schedule ?? "daily");
  const [runHour, setRunHour] = React.useState(initial?.runHour ?? 8);
  const [maxText, setMaxText] = React.useState<string | null>(initial ? dollars(initial.maxCostPerRunMicros) : null);
  const [capText, setCapText] = React.useState<string | null>(initial ? dollars(initial.monthlyCapMicros) : null);
  const [quote, setQuote] = React.useState<Quote>(initialQuote);
  const [quoting, setQuoting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState<"run" | "save" | null>(null);
  const [panelOpen, setPanelOpen] = React.useState(false);

  const config: MonitorConfig = React.useMemo(() => {
    if (kind === "mention") return { query, sources: MENTION_SOURCES.filter((s) => sources.includes(s)), ...(sources.includes("news") ? { country, language } : {}) };
    if (kind === "serp") return { query, country, language, depth, ...(myDomain ? { myDomain } : {}), competitorDomains };
    if (kind === "page") return { url, reader, ignore, watchFor, screenshotOnChange: shot };
    return platform === "maps" ? { platform, placeId } : { platform, productId, country };
  }, [kind, query, sources, country, language, depth, myDomain, competitorDomains, url, reader, ignore, watchFor, shot, platform, placeId, productId]);

  // The quote depends on a few fields only. It is fetched 300 ms after the last change.
  const quoteKey = JSON.stringify([kind, schedule, kind === "mention" ? config.sources : null, kind === "page" ? [reader, shot] : null, kind === "reviews" ? platform : null]);
  const first = React.useRef(true);
  React.useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    setQuoting(true);
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind, schedule, config }) });
        if (res.ok && live) setQuote((await res.json()) as Quote);
      } finally {
        if (live) setQuoting(false);
      }
    }, 300);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- quoteKey stands for the fields that change the price
  }, [quoteKey]);

  const maxMicros = maxText === null ? quote.maxPerRunMicros : Math.round(Number(maxText) * 1_000_000);
  const capMicros = capText === null ? defaultCapMicros(quote.perMonthMicros) : Math.round(Number(capText) * 1_000_000);
  const week = pauseWeek(quote, capMicros);
  const target = kind === "page" ? url.trim() : kind === "reviews" ? (platform === "maps" ? placeId.trim() : productId.trim()) : query.trim();
  const dup = target ? existing.find((e) => e.kind === kind && e.target === target && e.id !== initial?.id) : undefined;
  const suggested = kind === "page" ? (() => { try { return `${new URL(url).hostname.replace(/^www\./, "")} page`; } catch { return ""; } })() : kind === "reviews" ? (platform === "maps" ? "Maps reviews" : "App Store reviews") : query.replace(/"/g, "").trim() ? `${query.replace(/"/g, "").trim()}${kind === "mention" ? " mentions" : ""}` : "";

  const validate = (): Record<string, string> => {
    const e: Record<string, string> = {};
    if ((kind === "mention" || kind === "serp") && !query.trim()) e["config.query"] = "Enter a query";
    if (kind === "mention" && config.sources?.length === 0) e["config.sources"] = "Pick at least one source";
    if (kind === "page" && !/^https?:\/\/\S+\.\S+/.test(url.trim())) e["config.url"] = "Enter a full http or https URL";
    if (kind === "reviews" && platform === "maps" && !placeId.trim()) e["config"] = "Enter the place id";
    if (kind === "reviews" && platform === "appstore" && !/^\d+$/.test(productId.trim())) e["config"] = "Enter the numeric App Store product id";
    if (!Number.isFinite(maxMicros) || maxMicros <= 0) e.maxCostPerRunMicros = "Enter an amount above zero";
    if (!Number.isFinite(capMicros) || capMicros <= 0) e.monthlyCapMicros = "Enter an amount above zero";
    else if (capMicros < maxMicros) e.monthlyCapMicros = "The monthly cap cannot be below the cost of one run";
    return e;
  };

  const submit = async (run: boolean) => {
    const e = validate();
    setErrors(e);
    if (Object.keys(e).length > 0) {
      document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    setSaving(run ? "run" : "save");
    try {
      const body = { name: name.trim() || suggested || "Untitled monitor", kind, ownerTag, competitorName: ownerTag === "competitor" ? competitorName.trim() || null : null, config, schedule, runHour, maxCostPerRunMicros: maxMicros, monthlyCapMicros: capMicros, run, confirmId: crypto.randomUUID() };
      const res = await fetch(mode === "edit" ? `/api/monitors/${initial!.id}` : "/api/monitors", { method: mode === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = (await res.json()) as { monitor?: Monitor; error?: string; fields?: Record<string, string>; outcome?: { newAlerts: number; status: string } };
      if (!res.ok || !data.monitor) {
        if (data.fields) setErrors(data.fields);
        throw new Error(data.error ?? `Save failed (${res.status})`);
      }
      toast({ text: mode === "edit" ? "Changes saved" : run ? (kind === "page" ? "Saved. The first check stored a baseline." : `Saved. First check found ${data.outcome?.newAlerts ?? 0} alerts.`) : "Monitor saved" });
      router.push(`/monitors/${data.monitor.id}`);
      router.refresh();
    } catch (err) {
      toast({ text: (err as Error).message, tone: "error" });
      setSaving(null);
    }
  };

  const priceOf = (s: SourceId) => prices[SOURCES[s].endpointId] ?? SOURCES[s].fallbackMicros;
  const panel = (
    <div className="space-y-4">
      <QuoteLines quote={quote} dim={quoting} />
      <dl className={cn("space-y-1.5 text-12 transition-opacity duration-100", quoting && "opacity-50")}>
        <div className="flex justify-between">
          <dt className="text-mute">Runs per month, {SCHEDULE_LABEL[schedule].toLowerCase()}</dt>
          <dd className="num">{quote.runsPerMonth}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Projected month</dt>
          <dd className="num font-medium">{usdPrecise(quote.perMonthMicros)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-mute">Monthly cap</dt>
          <dd className="num">{Number.isFinite(capMicros) ? usd(capMicros) : "not set"}</dd>
        </div>
        {quote.maxPerRunMicros !== quote.perRunMicros ? (
          <div className="flex justify-between">
            <dt className="text-mute">Most a run can cost</dt>
            <dd className="num">{usdPrecise(quote.maxPerRunMicros)}</dd>
          </div>
        ) : null}
      </dl>
      {week ? (
        <p className="flex gap-2 rounded-control border border-amber bg-amber-soft px-2.5 py-2 text-12">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
          The projection is above the cap. This monitor would pause in week {week} of the month.
        </p>
      ) : null}
      {quote.priceSource === "fallback" ? (
        <p className="flex gap-2 rounded-control border border-amber bg-amber-soft px-2.5 py-2 text-12">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
          The catalog could not be read. These are fallback prices dated {quote.pricesAsOf.slice(0, 10)}.
        </p>
      ) : (
        <p className="num text-11 text-mute">Prices as of {dateTime(quote.pricesAsOf)} UTC</p>
      )}
    </div>
  );

  return (
    <form
      className="mx-auto grid w-full max-w-6xl gap-x-10 px-4 pb-40 pt-5 md:px-6 lg:grid-cols-[minmax(0,1fr)_320px] lg:pb-10"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(mode === "new" && canRun);
      }}
      noValidate
    >
      <div className="min-w-0 space-y-8">
        {!canRun ? (
          <p className="flex gap-2 rounded-control border border-amber bg-amber-soft px-3 py-2 text-12">
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
            <span>
              The looot token is not set on the server. You can save this monitor, but it cannot run yet.{" "}
              <Link href="/settings#looot" className="text-link underline underline-offset-2">
                Open Settings
              </Link>
            </span>
          </p>
        ) : null}

        <fieldset disabled={mode === "edit"}>
          <legend className="text-12 font-medium">Type</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {KINDS.map((k) => {
              const Icon = KIND_ICON[k];
              return (
                <label key={k} className={cn("flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-panel p-3 transition-colors duration-100 hover:border-line-strong has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-emerald", kind === k && "border-brand bg-brand-soft hover:border-brand", mode === "edit" && kind !== k && "opacity-50")}>
                  <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="sr-only" />
                  <Icon className={cn("mt-0.5 size-4 shrink-0 text-mute", kind === k && "text-link")} aria-hidden />
                  <span>
                    <span className="block font-medium">{KIND_NAME[k]}</span>
                    <span className="block text-12 text-mute">{KIND_NOTE[k]}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <section aria-labelledby="f-target" className="space-y-4">
          <h2 id="f-target" className="border-b border-line pb-2 text-12 font-medium">
            Target
          </h2>
          {kind === "mention" || kind === "serp" ? (
            <Field label="Query" htmlFor="f-query" error={errors["config.query"]} help={kind === "mention" ? 'Use "quoted phrases", OR between alternatives and -word to leave results out.' : "The search exactly as you would type it into Google."}>
              <Input id="f-query" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={kind === "mention" ? '"Tallyroom" OR @tallyroom -jobs' : "invoicing software for design studios"} aria-invalid={Boolean(errors["config.query"])} autoComplete="off" />
            </Field>
          ) : null}
          {kind === "mention" ? (
            <fieldset>
              <legend className="text-12 font-medium">Sources</legend>
              <div className="mt-1.5 divide-y divide-line rounded-panel border border-line bg-panel">
                {MENTION_SOURCES.map((s) => (
                  <label key={s} className="flex h-11 cursor-pointer items-center gap-3 px-3 md:h-10">
                    <SourceIcon source={s} />
                    <span className="flex-1">{SOURCE_NAME[s]}</span>
                    <span className="num text-12 text-mute">{usdPrecise(priceOf(s))} a call</span>
                    <Switch checked={sources.includes(s)} onCheckedChange={(on) => setSources((cur) => (on ? [...cur, s] : cur.filter((x) => x !== s)))} aria-label={`Search ${SOURCE_NAME[s]}`} />
                  </label>
                ))}
              </div>
              {errors["config.sources"] ? (
                <p className="mt-1.5 text-12 text-high" role="alert">
                  {errors["config.sources"]}
                </p>
              ) : null}
            </fieldset>
          ) : null}
          {(kind === "mention" && sources.includes("news")) || kind === "serp" ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Field label="Country" htmlFor="f-country" help={kind === "mention" ? "For News" : undefined}>
                <Input id="f-country" value={country} onChange={(e) => setCountry(e.target.value.toLowerCase())} maxLength={2} className="num" />
              </Field>
              <Field label="Language" htmlFor="f-lang">
                <Input id="f-lang" value={language} onChange={(e) => setLanguage(e.target.value.toLowerCase())} maxLength={2} className="num" />
              </Field>
              {kind === "serp" ? (
                <Field label="Depth" htmlFor="f-depth">
                  <Select id="f-depth" value={depth} onChange={(e) => setDepth(Number(e.target.value) as 10 | 20)}>
                    <option value={10}>Top 10</option>
                    <option value={20}>Top 20</option>
                  </Select>
                </Field>
              ) : null}
            </div>
          ) : null}
          {kind === "serp" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="My domain (optional)" htmlFor="f-mine" help="You are alerted when it leaves the top 10 or moves three places.">
                <Input id="f-mine" value={myDomain} onChange={(e) => setMyDomain(e.target.value.trim())} placeholder="tallyroom.example" className="num" />
              </Field>
              <Field label="Competitor domains (optional)" htmlFor="f-comp" help="One entering the top 3 is a high alert.">
                <ChipInput id="f-comp" label="Competitor domains" value={competitorDomains} onChange={setCompetitorDomains} placeholder="ledgerly.example" mono />
              </Field>
            </div>
          ) : null}
          {kind === "page" ? (
            <>
              <Field label="URL" htmlFor="f-url" error={errors["config.url"]}>
                <Input id="f-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ledgerly.example/pricing" className="num" aria-invalid={Boolean(errors["config.url"])} autoComplete="off" />
              </Field>
              <Field label="Reader" htmlFor="f-reader" help="Both return the page as text. Try the second if the first misses content.">
                <Select id="f-reader" value={reader} onChange={(e) => setReader(e.target.value as typeof reader)}>
                  <option value="jina-reader">jina-reader, {usdPrecise(prices["jina-reader"] ?? SOURCES.page.fallbackMicros)} a call</option>
                  <option value="serper-webpage">serper-webpage, {usdPrecise(prices["serper-webpage"] ?? SERPER_WEBPAGE.fallbackMicros)} a call</option>
                </Select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Ignore lines containing" htmlFor="f-ignore" help="Cookie banners, dates and counters that change on every load.">
                  <ChipInput id="f-ignore" label="Ignore lines containing" value={ignore} onChange={setIgnore} placeholder="last updated" />
                </Field>
                <Field label="Watch for" htmlFor="f-watch" help="A high alert when one of these is added or removed.">
                  <ChipInput id="f-watch" label="Watch for phrases" value={watchFor} onChange={setWatchFor} placeholder="Unlimited clients" />
                </Field>
              </div>
              <label className="flex cursor-pointer items-start gap-3 rounded-panel border border-line bg-panel p-3">
                <Switch checked={shot} onCheckedChange={setShot} aria-label="Take a screenshot when a change is found" className="mt-0.5" />
                <span>
                  <span className="block font-medium">Take a screenshot when a change is found</span>
                  <span className="block text-12 text-mute">
                    Adds <span className="num">{usdPrecise(prices[SOURCES.screenshot.endpointId] ?? SOURCES.screenshot.fallbackMicros)}</span> only on runs that find a change.
                  </span>
                </span>
              </label>
              <p className="text-12 text-mute">The first run stores a baseline and creates no alert.</p>
            </>
          ) : null}
          {kind === "reviews" ? (
            <>
              <Field label="Platform" htmlFor="f-platform">
                <Select id="f-platform" value={platform} onChange={(e) => setPlatform(e.target.value as typeof platform)}>
                  <option value="appstore">App Store, {usdPrecise(priceOf("appstore_reviews"))} a call</option>
                  <option value="maps">Google Maps, {usdPrecise(priceOf("maps_reviews"))} a call</option>
                </Select>
              </Field>
              {platform === "maps" ? (
                <Field label="Place id" htmlFor="f-place" error={errors.config} help="Open the place in Google Maps, share it, and copy the id that starts with ChIJ. A cid or fid also works.">
                  <Input id="f-place" value={placeId} onChange={(e) => setPlaceId(e.target.value)} placeholder="ChIJ..." className="num" aria-invalid={Boolean(errors.config)} autoComplete="off" />
                </Field>
              ) : (
                <Field label="App Store product id" htmlFor="f-product" error={errors.config} help="The number after id in the App Store link, for example 1594820371.">
                  <Input id="f-product" value={productId} onChange={(e) => setProductId(e.target.value)} inputMode="numeric" placeholder="1594820371" className="num" aria-invalid={Boolean(errors.config)} autoComplete="off" />
                </Field>
              )}
            </>
          ) : null}
          <Field label="Name" htmlFor="f-name" help={suggested && !name ? `Left empty, it is saved as "${suggested}".` : undefined}>
            <Input id="f-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggested || "A short name for the left rail"} maxLength={120} autoComplete="off" />
          </Field>
          {dup ? (
            <p className="flex gap-2 rounded-control border border-amber bg-amber-soft px-3 py-2 text-12">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-amber" aria-hidden />
              <span>
                <Link href={`/monitors/${dup.id}`} className="text-link underline underline-offset-2">
                  {dup.name}
                </Link>{" "}
                already watches this target. You can still save a second one.
              </span>
            </p>
          ) : null}
        </section>

        <section aria-labelledby="f-owner" className="space-y-4">
          <h2 id="f-owner" className="border-b border-line pb-2 text-12 font-medium">
            Owner tag
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="This is about" htmlFor="f-tag" help="The inbox can split alerts by this tag.">
              <Select id="f-tag" value={ownerTag} onChange={(e) => setOwnerTag(e.target.value as OwnerTag)}>
                <option value="mine">Mine</option>
                <option value="competitor">Competitor</option>
              </Select>
            </Field>
            {ownerTag === "competitor" ? (
              <Field label="Competitor name" htmlFor="f-cname">
                <Input id="f-cname" value={competitorName} onChange={(e) => setCompetitorName(e.target.value)} placeholder="Ledgerly" autoComplete="off" />
              </Field>
            ) : null}
          </div>
        </section>

        <section aria-labelledby="f-schedule" className="space-y-4">
          <h2 id="f-schedule" className="border-b border-line pb-2 text-12 font-medium">
            Schedule
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Run" htmlFor="f-sched">
              <Select id="f-sched" value={schedule} onChange={(e) => setSchedule(e.target.value as Schedule)}>
                {SCHEDULES.map((s) => (
                  <option key={s} value={s}>
                    {SCHEDULE_LABEL[s]}
                  </option>
                ))}
              </Select>
            </Field>
            {schedule === "daily" || schedule === "weekly" ? (
              <Field label="At, in UTC" htmlFor="f-hour" help={schedule === "weekly" ? "On Mondays." : undefined}>
                <Select id="f-hour" value={runHour} onChange={(e) => setRunHour(Number(e.target.value))} className="num">
                  {Array.from({ length: 24 }, (_, h) => (
                    <option key={h} value={h}>
                      {String(h).padStart(2, "0")}:00
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
          </div>
        </section>

        <section id="budget" aria-labelledby="f-budget" className="scroll-mt-4 space-y-4">
          <h2 id="f-budget" className="border-b border-line pb-2 text-12 font-medium">
            Budget
          </h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Max cost per run, in dollars" htmlFor="f-max" error={errors.maxCostPerRunMicros} help="A run is refused when the live price is above this.">
              <Input id="f-max" inputMode="decimal" className="num" value={maxText ?? dollars(quote.maxPerRunMicros)} onChange={(e) => setMaxText(e.target.value)} aria-invalid={Boolean(errors.maxCostPerRunMicros)} />
            </Field>
            <Field label="Monthly cap, in dollars" htmlFor="f-cap" error={errors.monthlyCapMicros} help="The monitor pauses when the month's spend plus one run would pass this.">
              <Input id="f-cap" inputMode="decimal" className="num" value={capText ?? dollars(defaultCapMicros(quote.perMonthMicros))} onChange={(e) => setCapText(e.target.value)} aria-invalid={Boolean(errors.monthlyCapMicros)} />
            </Field>
          </div>
        </section>

        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          {mode === "new" ? (
            <>
              <Button type="submit" variant="primary" disabled={saving !== null || !canRun}>
                {saving === "run" ? "Running the first check..." : `Save and run, up to ${Number.isFinite(maxMicros) && maxMicros > 0 ? usdPrecise(maxMicros) : "$0"}`}
              </Button>
              <Button type="button" disabled={saving !== null} onClick={() => submit(false)}>
                {saving === "save" ? "Saving..." : "Save without running"}
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" disabled={saving !== null} onClick={() => submit(false)}>
              {saving ? "Saving..." : "Save changes"}
            </Button>
          )}
          <Button asChild variant="ghost">
            <Link href={initial ? `/monitors/${initial.id}` : "/monitors"}>Cancel</Link>
          </Button>
          {IS_DEMO && mode === "new" ? <span className="text-12 text-mute">Demo data. The first check plays a recorded fixture.</span> : null}
        </div>
      </div>

      <aside aria-label="Quote" className="hidden lg:block">
        <div className="sticky top-5 rounded-panel border border-line bg-panel p-4">
          <h2 className="mb-3 text-12 font-medium">Quote</h2>
          {panel}
        </div>
      </aside>

      <div className="fixed inset-x-0 bottom-14 z-20 border-t border-line bg-panel shadow-pop md:bottom-0 lg:hidden" aria-label="Quote">
        {panelOpen ? <div className="max-h-[50dvh] overflow-y-auto border-b border-line p-4">{panel}</div> : null}
        <button type="button" aria-expanded={panelOpen} onClick={() => setPanelOpen((v) => !v)} className="flex h-12 w-full items-center gap-3 px-4 text-12">
          <span className="text-mute">Per run</span>
          <span className={cn("num font-medium", quoting && "opacity-50")}>{usdPrecise(quote.perRunMicros)}</span>
          <span className="text-mute">Month</span>
          <span className={cn("num font-medium", quoting && "opacity-50")}>{usdPrecise(quote.perMonthMicros)}</span>
          <span className="ml-auto inline-flex items-center gap-1 text-link">
            {panelOpen ? "Hide" : "Quote"} <ChevronUp className={cn("size-4 transition-transform", panelOpen && "rotate-180")} aria-hidden />
          </span>
        </button>
      </div>
    </form>
  );
}
