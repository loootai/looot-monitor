<p align="center"><img src="assets/hero.png" alt="looot-monitor: an alert inbox with a page diff, and a spend dashboard" width="100%"></p>

# looot monitor

[![License](https://img.shields.io/github/license/loootai/looot-monitor)](LICENSE) [![Release](https://img.shields.io/github/v/release/loootai/looot-monitor)](https://github.com/loootai/looot-monitor/releases) [![Docs](https://img.shields.io/badge/docs-docs.looot.ai-12A06A)](https://docs.looot.ai)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-monitor&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20project%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20agent%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-monitor%23set-up&project-name=looot-monitor&repository-name=looot-monitor)

An open-source monitoring app for your brand and your competitors. You create monitors, each one runs on a schedule, and anything new lands in one alert inbox with a severity. Every monitor shows its price per run before it runs and stops at the monthly cap you set.

It runs on Next.js and Supabase (auth and Postgres), deploys to Vercel, and gets its data from [looot](https://looot.ai): one key and one prepaid balance for 2,500+ data API endpoints. This project is built on looot. It is not the looot dashboard.

## What it replaces

Two subscriptions: a mention tracker (the Mention, Brand24 or Syften kind) and a page-change tracker (the Visualping or Changeflow kind). Those sell seats or credit plans and do not show what one check costs. Here the cost of each check is on every screen, and the demo workspace of ten monitors spent $1.31 in looot calls over 30 days.

What you give up: no reach or sentiment scores, no visual selector for page regions, and no email sending yet. See [Not yet](#not-yet).

## Run the demo in one command

```bash
git clone https://github.com/loootai/looot-monitor && cd looot-monitor && npm ci && npm run demo
```

Open http://localhost:3210. Demo mode needs no Supabase project and no looot token, and makes no network call to either. It runs on seeded data for a made-up invoicing company, with the clock fixed at 2026-10-08 09:00 UTC so every number is the same on every machine. A "Demo data" badge sits in the top bar. "Run now" plays a recorded fixture and says so.

In demo mode you can force a state on Inbox, Monitors, Monitor detail, Spend and Digest with `?state=loading`, `?state=empty` or `?state=error`. `?theme=dark` and `?theme=light` set the theme for one view.

## Run it without the UI

One command checks a list of pages, compares each with the last text it saw, and writes a markdown digest. It needs a looot token and nothing else: no Supabase project, no sign-in, no server.

```bash
npm ci
npm run watch -- --config watchlists/looot-market.yaml --dry-run          # no looot call, prints the pages and the list-price total
LOOOT_TOKEN=<your agent token> npm run watch -- --config watchlists/looot-market.yaml --out digests/
```

A run prints the quoted cost, reads each page once, and writes `digests/YYYY-MM-DD.md`: per changed page, a table of prices that moved (before, after, percent), the edited lines as old and new text, and the new lines, which is where a new changelog entry shows up. Failed pages are listed with their looot error code. The first run of a page stores a snapshot and reports no change.

The watchlist is a YAML file:

```yaml
name: My market
reader: serper-webpage        # $0.002 a page, known response shape. jina-reader is $0.0002, unverified.
maxSpendPerRunUsd: 0.12       # pages past this are not called
monthlyCapUsd: 4              # calendar month, UTC
groups:
  - name: Competitors
    watchFor: ["pay as you go"]   # a changed line with this phrase makes the alert high
    pages:
      - name: Acme pricing
        url: https://acme.example/pricing
        ignore: ["^Trusted by"]   # lines to drop before comparing, regular expressions
```

`ignore` and `watchFor` work at the top, on a group and on a page. `maxPricePerPageUsd` raises the price a page may cost. Without it, a page is refused when looot's live price is above the list price in `src/lib/sources.ts`. `maxChars` (default 200,000) is how much of a page is stored and compared.

It is the same code as the app: `src/headless/watch.ts` builds a page monitor per URL and calls `runMonitor`, so the price guard, the monthly cap, the diff and the severity rules are the ones described below. State (the last text of each page, and the month's runs with their cost) lives in `state/<watchlist name>.json`. Each page has one idempotency key per UTC day, so a second run in the same day makes no call. `--force` runs again and is charged again.

[`watchlists/looot-market.yaml`](watchlists/looot-market.yaml) is the list looot runs on its own market: 53 pricing pages and changelogs, $0.106 a run at list price.

### On a schedule with GitHub Actions

`.github/workflows/watch.yml` runs the watchlist every day at 06:17 UTC and commits the digest and the state to the repository. To turn it on in your copy of this repo:

1. Settings, Secrets and variables, Actions, New repository secret. Name `LOOOT_TOKEN`, value a looot agent token with `runs.execute`.
2. Optional: a repository variable `WATCHLIST` with the path of your own file. The default is `watchlists/looot-market.yaml`.
3. Actions, watch, Run workflow. Tick `dry_run` first to see the quote in the log.

Without the secret the job ends with a notice and spends nothing. In a public repository the digests and the stored page text are public too, so use a private copy if your watchlist is not something to show.

## Screens

| | |
|---|---|
| **Inbox.** Filters by state, severity, source and owner, a 30-day volume strip, and the reading pane. Keys: `j` `k` move, `e` done, `h` snooze, `u` unread, `1` `2` `3` severity. | ![Inbox with a page change alert](docs/screenshots/inbox-light.png) |
| **Page change alert.** Price table, watch phrases, and a split or unified diff with word marks. | ![Page change alert, dark](docs/screenshots/inbox.png) |
| **Mention alert.** Outlet, date, snippet with the matched words, and the rule that set the severity. | ![Mention alert](docs/screenshots/alert-mention.png) |
| **Google result alert.** The new result and the current top 10 with the change since the last run. | ![Google result alert](docs/screenshots/alert-google.png) |
| **Review alert.** Rating, reviewer, date and full text. | ![Review alert](docs/screenshots/alert-review.png) |
| **Monitors.** Status, target, sources, schedule, last and next run, month spend against the cap. | ![Monitors table](docs/screenshots/monitors.png) |
| **New monitor.** Four types, with a quote panel that updates as you type. The save button carries the max cost. | ![New monitor form](docs/screenshots/monitor-new.png) |
| **Monitor detail.** Calls per day by result, with month spend drawn against the cap. | ![Monitor detail](docs/screenshots/monitor-detail-light.png) |
| **Runs.** Every call with its trigger, result, cost and looot run id. | ![Runs tab](docs/screenshots/monitor-runs.png) |
| **Snapshots.** Pick any two snapshots of a page and read the diff. | ![Snapshots tab](docs/screenshots/monitor-snapshots.png) |
| **Google results.** The current top 20 and the position of tracked domains over 30 days. | ![Results tab](docs/screenshots/monitor-results.png) |
| **Digest.** An email preview at 600 and 375 px, light and dark, with Copy HTML and Download. | ![Digest preview](docs/screenshots/digest.png) |
| **Spend.** Month total, projection, daily spend by monitor type, tables by monitor and by endpoint, and a ledger with CSV export. | ![Spend dashboard](docs/screenshots/spend-light.png) |
| **Settings.** Token status, caps, severity rules, noise patterns, retention and the source table. | ![Settings](docs/screenshots/settings.png) |
| **Sign in.** Magic link and GitHub through Supabase Auth. In demo mode, one button. | ![Sign in](docs/screenshots/login-light.png) |

At phone width the left rail becomes a bottom tab bar and an alert opens as its own page.

<p>
<img src="docs/screenshots/m-inbox.png" alt="Inbox on a phone" width="24%"> <img src="docs/screenshots/m-alert.png" alt="Alert on a phone" width="24%"> <img src="docs/screenshots/m-monitors.png" alt="Monitors on a phone" width="24%"> <img src="docs/screenshots/m-spend.png" alt="Spend on a phone" width="24%">
</p>
<p>
<img src="docs/screenshots/m-monitor-new.png" alt="New monitor on a phone" width="24%"> <img src="docs/screenshots/m-monitor-detail.png" alt="Monitor detail on a phone" width="24%"> <img src="docs/screenshots/m-digest.png" alt="Digest on a phone" width="24%"> <img src="docs/screenshots/m-settings.png" alt="Settings on a phone" width="24%">
</p>

## Monitor types

| Type | What a run does | Alert when |
|---|---|---|
| Mentions | Searches News, X, Reddit and LinkedIn for a query. Quoted phrases, `OR` and `-exclude` work. | A result with a new URL appears |
| Google results | Reads the top 10 or 20 for a query | A new domain enters, or a tracked domain moves 3 or more places |
| Page change | Reads a page as text, drops lines that match your ignore patterns, and compares with the last snapshot | The text changed. Prices found on paired lines go in a table |
| Reviews | Reads Google Maps reviews of a place or App Store reviews of an app | A new review appears |

Severity is set by rules, not by a model, so it is cheap and repeatable. A price change or a watch phrase makes a page alert high. An escalation word (`outage`, `breach`, `refund` and others you can edit) makes a mention high. A competitor domain entering the top 3 makes a Google alert high. A 1 or 2 star review is high. Each alert names the rule that fired.

## looot jobs and prices

Prices read from the free public catalog on 2026-10-08. The "Price dated" column is when the catalog last changed that price.

| Source | looot job | Pinned endpoint | Price per call | Price dated | Response shape |
|---|---|---|---|---|---|
| News mentions | `news.search` | `serper-news` | $0.0010 | 2026-10-05 | Unverified |
| Google results | `google.serp.organic` | `serper-search` | $0.0010 | 2026-10-05 | Known |
| Page text | `web.scrape.markdown` | `jina-reader` | $0.0002 | 2026-09-08 | Unverified |
| Page text, second reader | `web.scrape.markdown` | `serper-webpage` | $0.0020 | 2026-10-05 | Known |
| Screenshot on change | `web.screenshot` | `context-dev-web-screenshot` | $0.0025 | 2026-09-06 | Unverified |
| X mentions | `x.post.search` | `anyapi-run-twitter-search` | $0.00075 | 2026-09-30 | Unverified |
| Reddit mentions | `reddit.post.search` | `scrapecreators-reddit-search` | $0.00188 | 2026-09-06 | Unverified |
| LinkedIn mentions | `linkedin.post.search` | `anyapi-run-linkedin-search-posts` | $0.0020 | 2026-09-30 | Unverified |
| Google Maps reviews | `maps.place.reviews` | `serper-reviews` | $0.0010 | 2026-10-05 | Unverified |
| App Store reviews | `reviews.appstore.reviews` | `searchapi-io-apple-product-reviews` | $0.0040 | 2026-09-21 | Unverified |

The app runs a pinned endpoint per source because search inputs differ between providers. It reads the live price from `GET https://api.looot.ai/v1/public-catalog/{endpointId}` (free, no token), and caches it for an hour. When the catalog cannot be read, the quote panel shows the prices in the table above (`src/lib/sources.ts`) with their date and a warning, and a run that needs an unread price is refused.

"Unverified" means the parser was written from the provider's public docs and a fixture, not from a real response, because no paid run was made while building this. Those parsers are tolerant: a missing field gives an item with fewer fields, not a crash. The first real run of such a source may still need a small parser fix. The Settings page lists the same status per source.

What the demo setup costs: a mentions monitor on all four sources is $0.0056 per run, which is $0.68 a month every 6 hours. An hourly page monitor is $0.0002 per run, $0.14 a month. The ten demo monitors project to $1.25 for the month.

## How the cap works

1. Any paid action first calls `POST /api/quote` (free). It returns one line per source, the per-run total, runs per month for the schedule, and the projected month.
2. You confirm a max cost per run and a monthly cap. Both are stored on the monitor.
3. Before each call the server reads the price again. If the run would cost more than the max you confirmed, or the price of one of its endpoints cannot be read, it makes no call, records the run as `blocked_price` and writes a system alert.
4. Before each run the server sums the month's actual cost for the monitor. If that plus the max is above the cap, it makes no call, sets the monitor to "Paused, budget reached" and writes a system alert. A workspace cap in Settings applies the same check across all monitors.
5. Each call carries an idempotency key. A scheduled run uses `mon:{monitorId}:{source}:{slot}`, so a cron retry for the same slot cannot charge twice. The `runs` table has a unique index on it as well.
6. A failed looot run costs nothing and is recorded with its error code.

Money is stored as integer micro-dollars. `LOOOT_TOKEN` is read only in `src/lib/looot.ts`, which starts with `import "server-only"`. The build was checked with a fake token: `grep -r` over `.next/static` finds neither the value nor the variable name.

## Set up

You need a Supabase project, a looot agent token, and Node 20 or newer.

1. Create a Supabase project. In Project Settings, API, copy the project URL and the anon key.
2. Apply the schema from a clone of this repo:

   ```bash
   npx supabase@2.118.0 login
   npx supabase@2.118.0 link --project-ref <your-project-ref>
   npx supabase@2.118.0 db push
   ```

   Or paste `supabase/migrations/20261008000000_init.sql` into the SQL editor and run it.
3. In Supabase, Authentication, URL Configuration, add `<your app URL>/auth/callback` as a redirect URL. Turn on the GitHub provider if you want "Continue with GitHub".
4. Create a looot agent token at https://looot.ai/settings with `catalog.read`, `runs.read` and `runs.execute`, and top up from $5.
5. Copy `.env.example` to `.env.local`, fill in the values, then:

   ```bash
   npm ci
   npm run dev
   ```

| Variable | Needed | What it is |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | yes | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | yes | Supabase anon key |
| `LOOOT_TOKEN` | to run checks | looot agent token, server only. Without it you can still create monitors |
| `LOOOT_API_URL` | no | Defaults to `https://api.looot.ai` |
| `CRON_SECRET` | for schedules | Any long random string. Vercel sends it to `/api/cron` |
| `SUPABASE_SERVICE_ROLE_KEY` | for schedules | Server only, used by `/api/cron` alone |
| `NEXT_PUBLIC_DEMO` | no | `1` turns on demo mode |

### Schedules

`vercel.json` calls `GET /api/cron` every hour. A tick runs at most 25 due monitors. Vercel Hobby runs cron jobs once a day, so hourly and 6-hour schedules need Vercel Pro or an external pinger that sends `Authorization: Bearer $CRON_SECRET`. To run one tick by hand:

```bash
CRON_SECRET=<the same value> npm run tick -- http://localhost:3000
```

Without `CRON_SECRET` and the service role key the route answers 401 or 501 and spends nothing. Manual "Run now" still works.

## Data and security

Seven tables in `supabase/migrations`: `settings`, `monitors`, `monitor_sources`, `runs`, `snapshots`, `serp_results`, `alerts`. Every table has an `owner_id` that defaults to `auth.uid()`, row level security enabled and forced, and select, insert, update and delete policies on `owner_id = auth.uid()`. A trigger rejects a child row whose parent has another owner.

`npm run test:rls` applies the migration to a throwaway local Postgres (`initdb`, `pg_ctl` and `psql` on PATH, no containers) and checks that a second user reads, updates and deletes zero rows of the first in all seven tables. It skips with a note when PostgreSQL is not installed.

## Develop

```bash
npm run typecheck   # tsc --noEmit
npm run lint        # eslint
npm test            # vitest, looot is mocked
npm run test:rls    # row level security on a throwaway Postgres
npm run watch -- --config watchlists/looot-market.yaml --dry-run   # the headless run, no looot call
npm run build
npm run leak-scan   # secret and internal-string scan, also the pre-commit hook
```

Turn the hook on once per clone with `git config core.hooksPath .githooks`. Dependencies are pinned to exact versions and `.npmrc` sets `ignore-scripts=true`.

The pure logic lives in `src/lib` with tests beside it: `quote.ts`, `budget.ts`, `runner.ts` (price guard, cap guard, idempotency), `pageDiff.ts`, `serpDiff.ts`, `severity.ts`, `dedupe.ts`, `parse/` (one parser per source, tested against the fixtures in `src/demo/fixtures`) and `digest.ts` (`renderDigest` returns a subject, table-layout HTML with inline styles, and plain text). `src/headless` is the run without the UI: `watchlist.ts` (the YAML file), `watch.ts` (plan and run) and `markdown.ts` (the digest).

## Not yet

- Sending the digest. The app renders it and lets you copy or download the HTML. Email, Slack and webhooks need a mail key and a sender domain.
- Real responses for eight sources. See "Unverified" above.
- G2, Capterra and Trustpilot reviews, and Hacker News. The looot catalog has no job for them. A page monitor on the public review page is the workaround.
- YouTube, Facebook, Instagram and TikTok mentions, Google Play reviews and Bing results.
- Sentiment and AI summaries. Severity and summaries are rule-built.
- Pixel diff of screenshots. The app diffs text and shows the two screenshots side by side.
- A visual selector to watch one region of a page.
- Teams. One user owns their monitors, and there is no sharing.
- The demo companies (Tallyroom, Ledgerly, Paperkite, Invoxa) are invented and use `.example` domains.

## License

MIT, see [LICENSE](LICENSE).
