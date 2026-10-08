import { DEMO_NOW, shortDate } from "@/lib/clock";
import { usd } from "@/lib/money";
import { contentHash, diffPages, normalize, pageTitle, watchHits } from "@/lib/pageDiff";
import { FALLBACK_PRICES } from "@/lib/prices";
import { buildQuote } from "@/lib/quote";
import { monthStart, nextMonthStart, nextRunAfter, scheduledKey } from "@/lib/schedule";
import { diffSerp } from "@/lib/serpDiff";
import { mentionSeverity, pageSeverity, reviewSeverity, serpSeverity } from "@/lib/severity";
import { endpointFor, sourcesFor } from "@/lib/sources";
import type { SerpResult } from "@/lib/store/types";
import { DEFAULT_SETTINGS, type Alert, type Monitor, type MonitorConfig, type MonitorKind, type Run, type Schedule, type SerpRow, type Settings, type Snapshot, type SourceId } from "@/lib/types";
import { hash } from "@/lib/utils";
import { INVOXA_CHANGELOG, LEDGERLY_PRICING, PAPERKITE_PRICING, type DemoPageVersion } from "./pages";

export const DEMO_OWNER = "demo-owner";
export const DEMO_USER = { name: "Inès Vasseur", email: "ines.vasseur@example.com", workspace: "Tallyroom" };
const START = "2026-09-09T00:00:00.000Z";
const HOUR = 3_600_000;

export interface Seed {
  settings: Settings;
  monitors: Monitor[];
  runs: Run[];
  alerts: Alert[];
  snapshots: Snapshot[];
  serp: SerpResult[];
}

interface MonitorDef {
  id: string;
  name: string;
  kind: MonitorKind;
  ownerTag: "mine" | "competitor";
  competitorName?: string;
  config: MonitorConfig;
  schedule: Schedule;
  runHour?: number;
  capMicros: number;
}

const MONITORS: MonitorDef[] = [
  { id: "mon-01", name: "Tallyroom mentions", kind: "mention", ownerTag: "mine", config: { query: '"Tallyroom"', sources: ["news", "x", "reddit", "linkedin"], country: "us", language: "en" }, schedule: "every_6h", capMicros: 1_000_000 },
  { id: "mon-02", name: "Ledgerly pricing page", kind: "page", ownerTag: "competitor", competitorName: "Ledgerly", config: { url: "https://ledgerly.example/pricing", reader: "jina-reader", screenshotOnChange: true, watchFor: ["Unlimited clients"], ignore: [] }, schedule: "hourly", capMicros: 500_000 },
  { id: "mon-03", name: "Paperkite pricing page", kind: "page", ownerTag: "competitor", competitorName: "Paperkite", config: { url: "https://paperkite.example/pricing", reader: "jina-reader", ignore: [], watchFor: [] }, schedule: "daily", runHour: 5, capMicros: 100_000 },
  { id: "mon-04", name: "Invoxa changelog", kind: "page", ownerTag: "competitor", competitorName: "Invoxa", config: { url: "https://invoxa.example/changelog", reader: "jina-reader", ignore: [], watchFor: [] }, schedule: "every_6h", capMicros: 100_000 },
  { id: "mon-05", name: "invoicing software for design studios", kind: "serp", ownerTag: "mine", config: { query: "invoicing software for design studios", country: "us", language: "en", depth: 20, myDomain: "tallyroom.example", competitorDomains: [] }, schedule: "daily", runHour: 8, capMicros: 100_000 },
  { id: "mon-06", name: "Tallyroom alternatives", kind: "serp", ownerTag: "mine", config: { query: "Tallyroom alternatives", country: "us", language: "en", depth: 10, myDomain: "tallyroom.example", competitorDomains: [] }, schedule: "daily", runHour: 8, capMicros: 100_000 },
  { id: "mon-07", name: "Ledgerly mentions", kind: "mention", ownerTag: "competitor", competitorName: "Ledgerly", config: { query: '"Ledgerly" -ledger', sources: ["news", "reddit"], country: "us", language: "en" }, schedule: "daily", runHour: 6, capMicros: 200_000 },
  { id: "mon-08", name: "Tallyroom iOS reviews", kind: "reviews", ownerTag: "mine", config: { platform: "appstore", productId: "1594820371", country: "us" }, schedule: "daily", runHour: 7, capMicros: 250_000 },
  { id: "mon-09", name: "Ledgerly on X", kind: "mention", ownerTag: "competitor", competitorName: "Ledgerly", config: { query: "Ledgerly OR @ledgerly", sources: ["x"] }, schedule: "hourly", capMicros: 100_000 },
  { id: "mon-10", name: "Northlight Print Co. reviews", kind: "reviews", ownerTag: "mine", config: { platform: "maps", placeId: "ChIJd8Northlight0Print4Co" }, schedule: "weekly", runHour: 9, capMicros: 50_000 },
];

interface MentionDef {
  mon: string;
  source: SourceId;
  at: string;
  title: string;
  domain: string;
  path: string;
  author?: string;
  outlet?: string;
  snippet: string;
  engagement?: number;
}

const X = "x.example";
const RD = "reddit.example";
const LI = "linkedin.example";

const MENTIONS: MentionDef[] = [
  { mon: "mon-01", source: "news", at: "2026-10-06T06:00", title: "Tallyroom outage left studios unable to send invoices for three hours", domain: "designledgerweekly.example", path: "/news/tallyroom-outage-invoices", outlet: "Design Ledger Weekly", author: "Benedikt Aalto", snippet: "Tallyroom confirmed an outage on Monday morning that stopped invoice sending and payment links for about three hours. The company says no data was lost and that queued invoices went out once service returned." },
  { mon: "mon-01", source: "reddit", at: "2026-10-07T12:00", title: "Moved our studio from Ledgerly to Tallyroom, notes after 60 days", domain: RD, path: "/r/freelance/comments/1nq8x2", outlet: "r/freelance", author: "u/halfpixel_studio", engagement: 214, snippet: "Six people, mostly retainers. The import took an afternoon. What we like in Tallyroom: deposit invoices, the client portal, and reminders that sound like a person wrote them. What we miss: Ledgerly's time approval flow." },
  { mon: "mon-01", source: "linkedin", at: "2026-10-02T12:00", title: "We closed our books in two days this quarter. Tallyroom's recurring invoices did most of it.", domain: LI, path: "/posts/aiyana-whitford-7248811", author: "Aiyana Whitford", engagement: 186, snippet: "We closed our books in two days this quarter. Tallyroom's recurring invoices did most of it. The rest was finally agreeing on one way to name projects. Sharing our naming sheet in the comments for other studio leads." },
  { mon: "mon-01", source: "x", at: "2026-09-30T18:00", title: "Tallyroom's deposit invoices are the first time I have not chased a client for the 50% upfront.", domain: X, path: "/kofilamptey/status/18409921", author: "Kofi Lamptey", engagement: 412, snippet: "Tallyroom's deposit invoices are the first time I have not chased a client for the 50% upfront. Client pays, project unlocks, everyone gets on with it." },
  { mon: "mon-01", source: "news", at: "2026-09-25T12:00", title: "Tallyroom adds deposit invoices and late-fee rules for studios", domain: "studiobrief.example", path: "/tools/tallyroom-deposit-invoices", outlet: "Studio Brief", author: "Leocadia Mbeki", snippet: "The invoicing tool for design studios now lets teams ask for a deposit before work starts and apply late fees per client. Both features are on every Tallyroom plan." },
  { mon: "mon-01", source: "news", at: "2026-10-01T06:00", title: "Five invoicing tools small studios switched to this year", domain: "studiobrief.example", path: "/roundups/invoicing-tools-2026", outlet: "Studio Brief", author: "Leocadia Mbeki", snippet: "We asked 140 studio owners what they bill with. Tallyroom, Ledgerly and Paperkite took the top three places, with Invoxa close behind among studios that bill in more than one currency." },
  { mon: "mon-01", source: "reddit", at: "2026-09-19T18:00", title: "Tallyroom vs spreadsheets for a 4 person studio?", domain: RD, path: "/r/graphic_design/comments/1n2k4c", outlet: "r/graphic_design", author: "u/kerning_and_coffee", engagement: 131, snippet: "We bill about 25 invoices a month from a spreadsheet and a PDF template. Is Tallyroom worth it at this size or is it built for bigger teams? Mostly want reminders and a clean client view." },
  { mon: "mon-01", source: "x", at: "2026-10-07T18:00", title: "Set up Tallyroom for a client studio today. Twenty minutes from signup to first invoice sent.", domain: X, path: "/tomaszbrandl/status/18471120", author: "Tomasz Brandl", engagement: 23, snippet: "Set up Tallyroom for a client studio today. Twenty minutes from signup to first invoice sent. The template editor is better than I expected." },
  { mon: "mon-01", source: "linkedin", at: "2026-10-05T12:00", title: "Hiring a studio manager in Cork. You will run scheduling, vendor contracts and billing in Tallyroom.", domain: LI, path: "/posts/sorcha-dunne-7251140", author: "Sorcha Dunne", engagement: 41, snippet: "Hiring a studio manager in Cork. You will run scheduling, vendor contracts and billing in Tallyroom. Four days a week, hybrid. Message me for the full brief." },
  { mon: "mon-01", source: "news", at: "2026-10-04T06:00", title: "Tallyroom hires its first head of partnerships", domain: "inkandmargin.example", path: "/people/tallyroom-head-of-partnerships", outlet: "Ink & Margin", author: "Oluwaseun Hartley", snippet: "Tallyroom has hired Mireille Okonkwo-Lang from a payments company to lead partnerships with accounting firms and studio networks." },
  { mon: "mon-01", source: "x", at: "2026-10-03T06:00", title: "Does anyone know if Tallyroom can split one invoice across two client entities?", domain: X, path: "/priyanair_design/status/18433307", author: "Priya Nair-Olsen", engagement: 6, snippet: "Does anyone know if Tallyroom can split one invoice across two client entities? Agency plus their parent company, 60/40." },
  { mon: "mon-01", source: "news", at: "2026-09-28T12:00", title: "How three studios cut the time they spend on billing", domain: "thestudiodesk.example", path: "/guides/cut-billing-time", outlet: "The Studio Desk", author: "Caspian Ferreira", snippet: "Field & Fathom moved to weekly invoicing, Saltbox Studio automated reminders in Tallyroom, and Northlight Print Co. started asking for deposits. Each saved between three and six hours a month." },
  { mon: "mon-01", source: "linkedin", at: "2026-09-23T06:00", title: "Our finance stack for a 12 person brand studio: Tallyroom, a shared inbox and one very good bookkeeper.", domain: LI, path: "/posts/henrik-aasen-7240062", author: "Henrik Aasen", engagement: 58, snippet: "Our finance stack for a 12 person brand studio: Tallyroom, a shared inbox and one very good bookkeeper. Happy to share the template we use for retainer scopes." },
  { mon: "mon-01", source: "x", at: "2026-09-17T12:00", title: "Tallyroom's invoice PDFs finally respect our brand typeface. Small thing, big smile.", domain: X, path: "/atelier_nord/status/18360211", author: "Atelier Nord", engagement: 17, snippet: "Tallyroom's invoice PDFs finally respect our brand typeface. Small thing, big smile." },
  { mon: "mon-01", source: "reddit", at: "2026-09-12T06:00", title: "Anyone using Tallyroom with a bookkeeper who lives in Xero?", domain: RD, path: "/r/freelance/comments/1mv03b", outlet: "r/freelance", author: "u/margin_notes", engagement: 18, snippet: "Our bookkeeper wants everything in Xero. Does the Tallyroom sync handle partial payments properly or do you reconcile by hand?" },
  { mon: "mon-07", source: "news", at: "2026-09-27T06:00", title: "Ledgerly customers ask for refund after double billing error", domain: "inkandmargin.example", path: "/news/ledgerly-double-billing", outlet: "Ink & Margin", author: "Oluwaseun Hartley", snippet: "A billing error charged some Ledgerly customers twice for September. The company says a refund will reach affected accounts within five working days." },
  { mon: "mon-07", source: "reddit", at: "2026-10-08T06:00", title: "Ledgerly raised prices again, what are people moving to?", domain: RD, path: "/r/smallbusiness/comments/1nr5d9", outlet: "r/smallbusiness", author: "u/two_desks_one_plant", engagement: 157, snippet: "Studio plan went from 29 to 35 and now caps active clients at 25. We have 31. Looking at Tallyroom and Paperkite this week, would like to hear from anyone who moved." },
  { mon: "mon-07", source: "news", at: "2026-10-08T06:00", title: "Ledgerly lifts Studio plan to $35 and caps active clients", domain: "designledgerweekly.example", path: "/news/ledgerly-studio-plan-35", outlet: "Design Ledger Weekly", author: "Benedikt Aalto", snippet: "Ledgerly has raised its Studio plan from $29 to $35 a month and its Team plan from $79 to $89. Studio accounts are now limited to 25 active clients." },
  { mon: "mon-07", source: "news", at: "2026-10-02T06:00", title: "Ledgerly opens a Lisbon office", domain: "thestudiodesk.example", path: "/news/ledgerly-lisbon", outlet: "The Studio Desk", author: "Caspian Ferreira", snippet: "The invoicing company will base its European support team in Lisbon and plans to hire thirty people there by spring." },
  { mon: "mon-07", source: "reddit", at: "2026-09-29T06:00", title: "Ledgerly time approval: how do you handle contractors?", domain: RD, path: "/r/agency/comments/1nh7q1", outlet: "r/agency", author: "u/retainer_math", engagement: 22, snippet: "We have nine contractors logging hours in Ledgerly. Approval works for staff but contractors keep submitting against closed projects." },
  { mon: "mon-07", source: "news", at: "2026-09-21T06:00", title: "Ledgerly adds bank feeds for UK and Irish accounts", domain: "inkandmargin.example", path: "/news/ledgerly-bank-feeds", outlet: "Ink & Margin", author: "Oluwaseun Hartley", snippet: "Ledgerly customers in the UK and Ireland can now match payments to invoices from a live bank feed." },
  { mon: "mon-07", source: "reddit", at: "2026-09-15T06:00", title: "Ledgerly or Invoxa for multi-currency?", domain: RD, path: "/r/freelance/comments/1my9t4", outlet: "r/freelance", author: "u/eur_usd_gbp", engagement: 9, snippet: "Clients in three currencies. Ledgerly handles it on the Team plan only. Is Invoxa better here?" },
  { mon: "mon-09", source: "x", at: "2026-10-05T15:00", title: "Three years on Ledgerly and the thing I still miss is proper deposit invoices.", domain: X, path: "/wren_calloway/status/18455002", author: "Wren Calloway", engagement: 268, snippet: "Three years on Ledgerly and the thing I still miss is proper deposit invoices. Every other tool I have tried has them now." },
  { mon: "mon-09", source: "x", at: "2026-10-03T09:00", title: "Ledgerly webinar on retainers was better than expected. Slides in the thread.", domain: X, path: "/joaquim_reis/status/18434410", author: "Joaquim Reis", engagement: 12, snippet: "Ledgerly webinar on retainers was better than expected. Slides in the thread." },
  { mon: "mon-09", source: "x", at: "2026-10-02T20:00", title: "Is the @ledgerly API rate limit really 60 a minute? Asking before I build an importer.", domain: X, path: "/devnotes_ida/status/18429977", author: "Ida Sorensen", engagement: 4, snippet: "Is the @ledgerly API rate limit really 60 a minute? Asking before I build an importer." },
  { mon: "mon-09", source: "x", at: "2026-09-13T11:00", title: "Ledgerly's new invoice themes look good. The serif one is going straight onto our retainers.", domain: X, path: "/studio_marrow/status/18340718", author: "Studio Marrow", engagement: 31, snippet: "Ledgerly's new invoice themes look good. The serif one is going straight onto our retainers." },
];

interface ReviewDef {
  mon: string;
  at: string;
  rating: number;
  title: string;
  author: string;
  text: string;
}

const REVIEWS: ReviewDef[] = [
  { mon: "mon-08", at: "2026-10-04T07:00", rating: 1, title: "Recurring invoices stopped sending after the update", author: "Marguerite O.", text: "Since version 4.2 none of my monthly invoices have gone out. Three clients paid late because of it. Support answered in a day but there is no fix yet. I run a small studio and cannot check every invoice by hand." },
  { mon: "mon-08", at: "2026-09-22T07:00", rating: 2, title: "Sync with the desktop app keeps signing me out", author: "Dario V.", text: "Every time I open the iPhone app after using the Mac app I have to sign in again. Drafts I started on the phone are sometimes missing." },
  { mon: "mon-08", at: "2026-10-01T07:00", rating: 3, title: "Good, but the iPad layout wastes space", author: "Hye-jin P.", text: "Works well on the phone. On the iPad the invoice list is one narrow column with empty space on both sides. Please use the screen." },
  { mon: "mon-08", at: "2026-09-16T07:00", rating: 3, title: "Does the job, time tracking is basic", author: "Callum R.", text: "Invoicing is solid. The timer has no way to edit an entry after it stops, so I fix it on the desktop." },
  { mon: "mon-08", at: "2026-10-07T07:00", rating: 5, title: "Finally an invoicing app that looks like we made it", author: "Anneliese K.", text: "Our clients notice the invoices. The deposit flow got us paid upfront on two projects this month." },
  { mon: "mon-08", at: "2026-10-02T07:00", rating: 4, title: "Fast and clear", author: "Baptiste L.", text: "I can send an invoice from a client meeting in under a minute. Would like a widget for outstanding totals." },
  { mon: "mon-08", at: "2026-09-26T07:00", rating: 5, title: "Reminders that clients answer", author: "Nomvula D.", text: "The reminder emails are polite and short. Overdue invoices went from nine to two in a month." },
  { mon: "mon-08", at: "2026-09-20T07:00", rating: 5, title: "Best one I have used for retainers", author: "Tobias E.", text: "Retainer invoices go out on the first of the month without me touching anything." },
  { mon: "mon-08", at: "2026-09-11T07:00", rating: 4, title: "Great for a small studio", author: "Ximena F.", text: "Simple to learn. Would give five stars with a better way to attach expenses." },
  { mon: "mon-10", at: "2026-09-14T09:00", rating: 5, title: "Printed our invoice folders and letterheads, the colour match was spot on", author: "Odalys R.", text: "Printed our invoice folders and letterheads, the colour match was spot on. Ready two days early." },
];

const SERP_TITLES: Record<string, string> = {
  "tallyroom.example": "Tallyroom: invoicing software for design studios",
  "ledgerly.example": "Ledgerly: invoicing and payments for creative teams",
  "paperkite.example": "Paperkite: proposals, contracts and invoices",
  "invoxa.example": "Invoxa: multi-currency invoicing for agencies",
  "studiobrief.example": "The best invoicing software for design studios in 2026",
  "designledgerweekly.example": "Invoicing tools compared: what studios pay and what they get",
  "freelancefolio.example": "9 invoicing apps for freelance designers",
  "pixelandprofit.example": "How to invoice design clients, with templates",
  "billablehours.example": "Billable Hours: time tracking and invoices",
  "studioops.example": "Studio operations handbook: billing chapter",
  "inkandmargin.example": "Ink & Margin guide to studio finance tools",
  "creativeledger.example": "Creative Ledger: bookkeeping for agencies",
  "agencytoolbox.example": "Agency Toolbox: invoicing category",
  "quotecraft.example": "QuoteCraft: quotes and invoices for creatives",
  "retainerhq.example": "RetainerHQ: retainer billing made simple",
  "proposalkit.example": "ProposalKit: from proposal to paid",
  "timesheetly.example": "Timesheetly: timesheets that turn into invoices",
  "brandworkshop.example": "Brand Workshop: the tools we run our studio on",
  "thestudiodesk.example": "The Studio Desk: invoicing software reviews",
  "invoiceatlas.example": "Invoice Atlas: invoice rules by country",
  "softwareshelf.example": "Software Shelf: top rated invoicing software for studios",
  "toolreviewer.example": "Tool Reviewer: Tallyroom review and alternatives",
  "makersmoney.example": "Makers Money: getting paid as a small studio",
  "soloagency.example": "Solo Agency: the one person studio stack",
  "comparestack.example": "CompareStack: Tallyroom vs Ledgerly vs Paperkite",
};

const SERP_PATHS: Record<string, string> = { "paperkite.example": "/compare/tallyroom", "ledgerly.example": "/vs/tallyroom", "toolreviewer.example": "/tallyroom-alternatives", "softwareshelf.example": "/invoicing/design-studios", "comparestack.example": "/tallyroom-alternatives" };

interface SerpScript {
  mon: string;
  base: string[];
  /** day index from the start (0 is Sep 9), then what happens on that day. */
  events: { day: number; enter?: { domain: string; position: number }; move?: { domain: string; to: number } }[];
}

const SERP_SCRIPTS: SerpScript[] = [
  {
    mon: "mon-05",
    base: ["studiobrief.example", "ledgerly.example", "freelancefolio.example", "paperkite.example", "designledgerweekly.example", "invoxa.example", "tallyroom.example", "pixelandprofit.example", "billablehours.example", "studioops.example", "inkandmargin.example", "creativeledger.example", "agencytoolbox.example", "quotecraft.example", "retainerhq.example", "proposalkit.example", "timesheetly.example", "brandworkshop.example", "thestudiodesk.example", "invoiceatlas.example"],
    events: [
      { day: 7, enter: { domain: "softwareshelf.example", position: 9 } },
      { day: 15, enter: { domain: "makersmoney.example", position: 17 } },
      { day: 21, move: { domain: "tallyroom.example", to: 4 } },
      { day: 22, enter: { domain: "toolreviewer.example", position: 7 } },
      { day: 27, enter: { domain: "soloagency.example", position: 15 } },
    ],
  },
  {
    mon: "mon-06",
    base: ["toolreviewer.example", "softwareshelf.example", "comparestack.example", "ledgerly.example", "tallyroom.example", "invoxa.example", "studioops.example", "pixelandprofit.example", "agencytoolbox.example", "billablehours.example"],
    events: [
      { day: 11, enter: { domain: "quotecraft.example", position: 8 } },
      { day: 20, enter: { domain: "makersmoney.example", position: 6 } },
      { day: 26, enter: { domain: "paperkite.example", position: 3 } },
    ],
  },
];

const PAGES: Record<string, DemoPageVersion[]> = { "mon-02": LEDGERLY_PRICING, "mon-03": PAPERKITE_PRICING, "mon-04": INVOXA_CHANGELOG };
const FAILED_CALLS = new Set(["mon-01|linkedin|2026-09-17T12:00:00.000Z", "mon-01|linkedin|2026-09-28T18:00:00.000Z", "mon-01|x|2026-10-03T00:00:00.000Z"]);

const iso = (short: string) => new Date(short.length === 16 ? `${short}:00.000Z` : short).toISOString();

/** Builds the whole demo workspace from fixed inputs. The same call always gives the same rows. */
export function buildSeed(): Seed {
  const end = new Date(DEMO_NOW);
  const settings: Settings = {
    ...DEFAULT_SETTINGS,
    workspaceCapMicros: 3_000_000,
    priorityDomains: ["designledgerweekly.example", "studiobrief.example"],
    competitorDomains: ["ledgerly.example", "paperkite.example", "invoxa.example"],
    timezone: "Europe/Paris",
  };
  const runs: Run[] = [];
  const alerts: Alert[] = [];
  const snapshots: Snapshot[] = [];
  const serp: SerpResult[] = [];
  const monitors: Monitor[] = [];
  const runIndex = new Map<string, Run>();
  let runSeq = 0;

  const addRun = (m: MonitorDef, source: SourceId, slot: Date, o: { failed?: string } = {}): Run => {
    const endpointId = endpointFor(source, m.config);
    const price = FALLBACK_PRICES[endpointId] ?? 0;
    const key = scheduledKey(m.id, source, slot);
    const h = hash(key);
    const ms = 600 + (parseInt(h.slice(0, 4), 16) % 2600);
    const run: Run = {
      id: `rn-${String(++runSeq).padStart(5, "0")}`,
      ownerId: DEMO_OWNER,
      monitorId: m.id,
      source,
      trigger: "schedule",
      slot: slot.toISOString(),
      idempotencyKey: key,
      endpointId,
      loootRunId: `run_${h.slice(0, 12)}`,
      status: o.failed ? "failed" : "completed",
      quotedMicros: price,
      actualCostMicros: o.failed ? 0 : price,
      newItems: 0,
      errorCode: o.failed ?? null,
      errorMessage: o.failed === "provider_error" ? "The provider answered with an error. Nothing was charged." : o.failed ? "The provider did not answer in time. Nothing was charged." : null,
      startedAt: slot.toISOString(),
      finishedAt: new Date(slot.getTime() + ms).toISOString(),
    };
    runs.push(run);
    runIndex.set(`${m.id}|${source}|${slot.toISOString()}`, run);
    return run;
  };

  const addAlert = (a: Omit<Alert, "id" | "ownerId" | "state" | "snoozedUntil" | "readAt" | "runId">, source: SourceId | null) => {
    const run = source ? runIndex.get(`${a.monitorId}|${source}|${a.createdAt}`) : undefined;
    if (run) run.newItems++;
    alerts.push({ ...a, id: "", ownerId: DEMO_OWNER, runId: run?.id ?? null, state: "open", snoozedUntil: null, readAt: null });
  };

  for (const m of MONITORS) {
    const quote = buildQuote(m.kind, m.config, m.schedule, FALLBACK_PRICES, DEMO_NOW);
    const sources = sourcesFor(m.kind, m.config);
    const changeTimes = new Set((PAGES[m.id] ?? []).slice(1).map((v) => iso(v.at)));
    let status: Monitor["status"] = "active";
    let failures = 0;
    let lastRunAt: string | null = null;
    let monthKey = "";
    let spent = 0;
    let paused = false;

    // First slot at or after the start, then every slot up to the demo clock.
    let slot = new Date(START);
    if (m.schedule === "daily" || m.schedule === "weekly") slot = nextRunAfter(m.schedule, new Date(new Date(START).getTime() - HOUR), m.runHour ?? 0);
    for (; slot.getTime() <= end.getTime(); slot = nextRunAfter(m.schedule, slot, m.runHour ?? 0)) {
      const mk = slot.toISOString().slice(0, 7);
      if (mk !== monthKey) {
        monthKey = mk;
        spent = 0;
        paused = false;
      }
      if (paused) continue;
      if (spent + quote.maxPerRunMicros > m.capMicros) {
        paused = true;
        const reset = nextMonthStart(slot);
        addAlert({ monitorId: m.id, source: "system", kind: "system", fingerprint: `budget:${mk}`, severity: "medium", severityReason: "Monthly cap reached", title: `${m.name} reached its ${usd(m.capMicros)} cap. Paused until ${shortDate(reset)}.`, url: null, domain: null, author: null, snippet: `Spent ${usd(spent)} of ${usd(m.capMicros)} since ${shortDate(monthStart(slot))}. The next run would cost up to ${usd(quote.maxPerRunMicros)}. No call was made.`, publishedAt: null, payload: {}, createdAt: slot.toISOString() }, null);
        continue;
      }
      let ok = 0;
      for (const s of sources) {
        const failed = m.id === "mon-10" && slot.toISOString() > "2026-09-15" ? "provider_error" : FAILED_CALLS.has(`${m.id}|${s}|${slot.toISOString()}`) ? "provider_timeout" : undefined;
        const r = addRun(m, s, slot, { failed });
        spent += r.actualCostMicros;
        if (!failed) ok++;
      }
      if (m.config.screenshotOnChange && changeTimes.has(slot.toISOString())) spent += addRun(m, "screenshot", slot).actualCostMicros;
      lastRunAt = slot.toISOString();
      failures = ok === 0 ? failures + 1 : 0;
      if (failures === 3) {
        status = "failing";
        addAlert({ monitorId: m.id, source: "system", kind: "system", fingerprint: `failing:${slot.toISOString()}`, severity: "medium", severityReason: "Last error: provider_error", title: `${m.name} failed 3 runs in a row`, url: null, domain: null, author: null, snippet: "The last three checks ended with provider_error. Failed calls cost nothing. The monitor keeps its schedule and will recover on the next good run.", publishedAt: null, payload: {}, createdAt: slot.toISOString() }, null);
      }
    }
    if (paused) status = "paused_budget";
    monitors.push({
      id: m.id,
      ownerId: DEMO_OWNER,
      name: m.name,
      kind: m.kind,
      ownerTag: m.ownerTag,
      competitorName: m.competitorName ?? null,
      config: m.config,
      schedule: m.schedule,
      runHour: m.runHour ?? 0,
      status,
      maxCostPerRunMicros: quote.maxPerRunMicros,
      monthlyCapMicros: m.capMicros,
      confirmedAt: START,
      nextRunAt: status === "paused_budget" ? nextMonthStart(end).toISOString() : nextRunAfter(m.schedule, end, m.runHour ?? 0).toISOString(),
      lastRunAt,
      consecutiveFailures: failures,
      lastErrorCode: status === "failing" ? "provider_error" : null,
      createdAt: START,
    });
  }

  // Page snapshots and the alert for every change, worked out by the same diff the app runs.
  for (const m of MONITORS.filter((d) => PAGES[d.id])) {
    let prev: Snapshot | null = null;
    PAGES[m.id].forEach((v, i) => {
      const text = normalize(v.content, m.config.ignore ?? []);
      const at = iso(v.at);
      const shot = m.config.screenshotOnChange ? (i === PAGES[m.id].length - 1 ? "/demo/ledgerly-pricing-after.svg" : "/demo/ledgerly-pricing-before.svg") : null;
      const snap: Snapshot = { id: `sn-${m.id.slice(4)}-${String(i + 1).padStart(2, "0")}`, ownerId: DEMO_OWNER, monitorId: m.id, runId: runIndex.get(`${m.id}|page|${at}`)?.id ?? null, contentHash: contentHash(text), content: text, title: text.split("\n")[0].replace(/^#\s*/, ""), bytes: text.length, screenshotUrl: shot, changed: i > 0, takenAt: at };
      snapshots.push(snap);
      if (prev) {
        const d = diffPages(prev.content, text);
        const hits = watchHits(d, m.config.watchFor ?? []);
        const v2 = pageSeverity({ priceChanges: d.priceChanges, watchHits: hits, changedRatio: d.changedRatio });
        addAlert({ monitorId: m.id, source: "page", kind: "page_change", fingerprint: `${prev.contentHash}:${snap.contentHash}`, severity: v2.severity, severityReason: v2.reason, title: pageTitle(m.name, d), url: m.config.url ?? null, domain: new URL(m.config.url!).hostname, author: null, snippet: d.lines.find((l) => l.type === "add")?.text ?? null, publishedAt: null, payload: { added: d.added, removed: d.removed, priceChanges: d.priceChanges, watchHits: hits, beforeSnapshotId: prev.id, afterSnapshotId: snap.id }, createdAt: at }, "page");
      }
      prev = snap;
    });
  }

  // Google results: one stored list per day, with scripted entries and a little drift.
  for (const script of SERP_SCRIPTS) {
    const m = MONITORS.find((d) => d.id === script.mon)!;
    const depth = m.config.depth ?? 10;
    let order = [...script.base];
    let previous: SerpRow[] = [];
    for (let day = 0; day < 30; day++) {
      const at = new Date(new Date(START).getTime() + day * 24 * HOUR + (m.runHour ?? 0) * HOUR);
      if (at.getTime() > end.getTime()) break;
      const ev = script.events.filter((e) => e.day === day);
      for (const e of ev) {
        if (e.enter) order.splice(e.enter.position - 1, 0, e.enter.domain);
        if (e.move) {
          order = order.filter((d) => d !== e.move!.domain);
          order.splice(e.move.to - 1, 0, e.move.domain);
        }
      }
      if (ev.length === 0 && day % 4 === 2) {
        // Drift: two neighbours near the bottom trade places.
        const i = depth - 2 - (day % 3);
        [order[i], order[i + 1]] = [order[i + 1], order[i]];
      }
      order = order.slice(0, depth);
      const current: SerpRow[] = order.map((domain, i) => ({ position: i + 1, domain, url: `https://${domain}${SERP_PATHS[domain] ?? "/"}`, title: SERP_TITLES[domain] ?? domain, snippet: `${SERP_TITLES[domain] ?? domain}. Compared for studios of two to twenty people.` }));
      const tracked = [m.config.myDomain!, ...settings.competitorDomains];
      const { rows, events } = diffSerp(previous, current, tracked);
      serp.push({ id: `sr-${m.id.slice(4)}-${String(day + 1).padStart(2, "0")}`, monitorId: m.id, takenAt: at.toISOString(), rows });
      for (const e of events) {
        const v = serpSeverity({ kind: e.kind, domain: e.row.domain, position: e.row.position, previousPosition: e.previousPosition }, { competitorDomains: settings.competitorDomains, myDomain: m.config.myDomain });
        const what = e.kind === "serp_new" ? `enters position ${e.row.position}` : e.kind === "serp_gone" ? `left the results (was ${e.previousPosition})` : `moved from ${e.previousPosition} to ${e.row.position}`;
        const shown = `${e.row.domain}${SERP_PATHS[e.row.domain] ?? ""}`;
        addAlert({ monitorId: m.id, source: "google", kind: e.kind === "serp_new" ? "serp_new" : "serp_move", fingerprint: `${e.kind}:${e.row.domain}:${e.row.position}:${at.toISOString().slice(0, 10)}`, severity: v.severity, severityReason: v.reason, title: `${shown} ${what} for "${m.config.query}"`, url: e.row.url, domain: e.row.domain, author: null, snippet: e.row.snippet ?? null, publishedAt: null, payload: { position: e.row.position, previousPosition: e.previousPosition, query: m.config.query, top: rows.slice(0, 10) }, createdAt: at.toISOString() }, "google");
      }
      previous = current;
    }
  }

  for (const d of MENTIONS) {
    const at = iso(d.at);
    const url = `https://${d.domain}${d.path}`;
    const v = mentionSeverity({ title: d.title, snippet: d.snippet, domain: d.domain, engagement: d.engagement }, settings);
    const label = d.source === "reddit" ? "upvotes" : d.source === "linkedin" ? "reactions" : d.source === "x" ? "likes and reposts" : undefined;
    const terms = MONITORS.find((m) => m.id === d.mon)!.config.query!.replace(/"|-\S+|\bOR\b/g, " ").split(/\s+/).filter(Boolean);
    addAlert({ monitorId: d.mon, source: d.source, kind: "mention", fingerprint: hash(url), severity: v.severity, severityReason: v.reason, title: d.title, url, domain: d.domain, author: d.author ?? null, snippet: d.snippet, publishedAt: new Date(new Date(at).getTime() - 2 * HOUR).toISOString(), payload: { engagement: d.engagement, engagementLabel: label, outlet: d.outlet, matched: terms }, createdAt: at }, d.source);
  }

  for (const r of REVIEWS) {
    const at = iso(r.at);
    const maps = r.mon === "mon-10";
    const v = reviewSeverity(r.rating);
    addAlert({ monitorId: r.mon, source: maps ? "maps_reviews" : "appstore_reviews", kind: "review", fingerprint: hash(`${r.author}|${r.text}`), severity: v.severity, severityReason: v.reason, title: r.title, url: maps ? "https://maps.example/place/northlight-print-co" : "https://apps.example/app/tallyroom/id1594820371", domain: maps ? "maps.example" : "apps.example", author: r.author, snippet: r.text, publishedAt: new Date(new Date(at).getTime() - 9 * HOUR).toISOString(), payload: { rating: r.rating, platform: maps ? "Google Maps" : "App Store" }, createdAt: at }, maps ? "maps_reviews" : "appstore_reviews");
  }

  // Newest first. The oldest 18 are done, 5 older low ones are snoozed, the 23 newest open ones are unread.
  alerts.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : a.title.localeCompare(b.title)));
  alerts.forEach((a, i) => (a.id = `al-${String(alerts.length - i).padStart(3, "0")}`));
  const doneFrom = alerts.length - 18;
  let snoozed = 0;
  let unread = 0;
  alerts.forEach((a, i) => {
    const read = new Date(new Date(a.createdAt).getTime() + 5 * HOUR).toISOString();
    if (i >= doneFrom) {
      a.state = "done";
      a.readAt = read;
    } else if (i >= doneFrom - 14 && a.severity === "low" && snoozed < 5) {
      snoozed++;
      a.state = "snoozed";
      a.readAt = read;
      a.snoozedUntil = "2026-10-09T09:00:00.000Z";
    } else if (unread < 23) unread++;
    else a.readAt = read;
  });
  runs.sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : a.id < b.id ? 1 : -1));
  serp.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
  snapshots.sort((a, b) => (a.takenAt < b.takenAt ? 1 : -1));
  return { settings, monitors, runs, alerts, snapshots, serp };
}
