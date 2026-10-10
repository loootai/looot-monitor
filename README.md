<p align="center"><img src="assets/hero.png" alt="looot-monitor: an alert inbox with a page diff, and a spend dashboard" width="100%"></p>

# looot monitor

[![License](https://img.shields.io/github/license/loootai/looot-monitor)](LICENSE) [![Release](https://img.shields.io/github/v/release/loootai/looot-monitor)](https://github.com/loootai/looot-monitor/releases) [![Docs](https://img.shields.io/badge/docs-docs.looot.ai-12A06A)](https://docs.looot.ai)

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-monitor&env=NEXT_PUBLIC_SUPABASE_URL,NEXT_PUBLIC_SUPABASE_ANON_KEY,LOOOT_TOKEN&envDescription=Supabase%20project%20URL%20and%20anon%20key%2C%20plus%20a%20looot%20agent%20token&envLink=https%3A%2F%2Fgithub.com%2Floootai%2Flooot-monitor%23run-the-web-app-with-sign-in&project-name=looot-monitor&repository-name=looot-monitor)

An open-source monitoring app for your brand and your competitors. You create monitors, each one runs on a schedule, and anything new lands in one alert inbox with a severity. Every monitor shows its price per run before it runs and stops at the monthly cap you set.

It runs on Next.js and Supabase (auth and Postgres), deploys to Vercel, and gets its data from [looot](https://looot.ai): one key and one prepaid balance for 2,500+ data API endpoints. This project is built on looot. It is not the looot dashboard.

## What it replaces

Two subscriptions: a mention tracker (the Mention, Brand24 or Syften kind) and a page-change tracker (the Visualping or Changeflow kind). Those sell seats or credit plans and do not show what one check costs. Here the cost of each check is on every screen, and the demo workspace of ten monitors spent $1.31 in looot calls over 30 days.

What you give up: no reach or sentiment scores, no visual selector for page regions, and no email sending yet. See [Not yet](#not-yet).

## What you need

- Node 20.9 or newer (Next.js 16 requires it; `package.json` has no `engines` field and there is no `.nvmrc`). The tests, lint, typecheck, build, demo and the `watch` command were run on Node 24. The scheduled workflow uses Node 22.
- For the demo, nothing else. No account, no token.
- For `npm run watch` (checks a list of pages from the terminal), a [looot](https://looot.ai) account and an agent token. No Supabase project.
- For the web app, a looot token plus a free Supabase project for sign-in and the database.

Create the looot account at https://looot.ai/auth/sign-up. Then get a token one of two ways.

- Run `npm i -g looot`, then `looot login`. It opens a browser to approve.
- Or in the looot web app go to Settings, "Agent tokens", and create one. See https://docs.looot.ai/get-started/sign-in.

With no browser (CI, a server), create the token in Settings > Agent tokens and run `export LOOOT_TOKEN=...`. The token needs the scopes `runs.execute`, `catalog.read`, `runs.read` and `usage.read`. A paid run needs a funded balance. The minimum top-up is $5, and signing up adds no credit. See https://docs.looot.ai/money.

## Try it in one minute

```bash
git clone https://github.com/loootai/looot-monitor && cd looot-monitor && npm install --ignore-scripts && npm run demo
```

Open http://localhost:3210. Demo mode needs no Supabase project and no looot token, and makes no network call to either. It runs on seeded data for a made-up invoicing company, with the clock fixed at 2026-10-08 09:00 UTC so every number is the same on every machine. A "Demo data" badge sits in the top bar. "Run now" plays a recorded fixture and says so.

In demo mode you can force a state on Inbox, Monitors, Monitor detail, Spend and Digest with `?state=loading`, `?state=empty` or `?state=error`. `?theme=dark` and `?theme=light` set the theme for one view.

`npm run demo` starts `next dev -p 3210`. If that port is busy, run `NEXT_PUBLIC_DEMO=1 node_modules/.bin/next dev -p 4102`. Next.js may write an `AGENTS.md` and a `CLAUDE.md` into the folder on first start. They are not part of this repo.

## Run it with your own data

The quickest real run is the terminal command. It checks a list of pages, compares each with the last text it saw, and writes a markdown digest. It needs a looot token and nothing else: no Supabase project, no sign-in, no server. The command reads `LOOOT_TOKEN` from the shell environment. It does not read `.env.local`.

```bash
npm install --ignore-scripts
npm run watch -- --config watchlists/looot-market.yaml --dry-run
```

The dry run needs no token and makes no looot call. Real output, abridged:

```text
looot market: 53 pages, list prices dated 2026-10-08

Aggregators and direct competitors
    $0.0020  serper-webpage  treg home  https://treg.to/
    $0.0020  serper-webpage  treg pricing  https://treg.to/pricing
    ...
Per run: $0.1060 for 53 pages. Run cap $0.1200.
Per month at one run a day: $3.18. Monthly cap $4.00.

53 of 53 pages have no snapshot yet. Their first run stores one and reports no change.
Dry run: no looot call was made and nothing was written.
```

Then the real run:

```bash
export LOOOT_TOKEN=<your agent token>
npm run watch -- --config watchlists/looot-market.yaml --out digests/
```

It prints the quoted cost, reads each page once, and writes `digests/YYYY-MM-DD.md` and `state/looot-market.json`. Without a token it stops with `LOOOT_TOKEN is not set. Create an agent token at https://looot.ai/settings, or use --dry-run.` and exit code 2. Flags are `--config` (required), `--out` (default `digests`), `--state` (default `state/<watchlist name>.json`), `--dry-run` and `--force`.

To watch your own pages, copy `watchlists/looot-market.yaml` and edit it. The format is in [The watchlist file](#the-watchlist-file).

For the web app, copy `.env.example` to `.env.local` (Next.js reads it) and follow [Run the web app with sign-in](#run-the-web-app-with-sign-in). These are all the variables the code reads.

| Variable | Needed | What it does | Where to get it |
|---|---|---|---|
| `LOOOT_TOKEN` | to run checks | looot agent token. Server only (`src/lib/looot.ts` imports `server-only`). Without it you can still create monitors in the app | Settings > Agent tokens in looot |
| `LOOOT_API_URL` | no | Base URL of the looot API. Defaults to `https://api.looot.ai` | Leave unset |
| `NEXT_PUBLIC_SUPABASE_URL` | web app | Supabase project URL | Supabase, Project Settings, API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | web app | Supabase anon key | Supabase, Project Settings, API |
| `SUPABASE_SERVICE_ROLE_KEY` | for schedules | Server only. Bypasses row level security. Used by `/api/cron` alone | Supabase, Project Settings, API |
| `CRON_SECRET` | for schedules | Any long random string. `/api/cron` answers 401 unless the request carries `Authorization: Bearer <CRON_SECRET>`. Vercel sends it | You make it up, for example `openssl rand -hex 32` |
| `APP_URL` | no | Base URL that `npm run tick` calls. You can pass it as the first argument instead | Your app URL |
| `NEXT_PUBLIC_DEMO` | no | `1` turns on demo mode | Set by `npm run demo` |
| `GITHUB_STEP_SUMMARY` | no | Set by GitHub Actions. `watch` appends the digest to it when present | Set by GitHub |

## Spending

- Every check shows its price before it runs. The terminal command prints the quote, and the app shows a quote panel before you save a monitor.
- `maxSpendPerRunUsd` in the watchlist (default in the example $0.12) stops a run. Pages past it are not called. `monthlyCapUsd` (example $4) is a calendar-month cap in UTC.
- In the app you confirm a max cost per run and a monthly cap for each monitor. A workspace cap in Settings applies across all monitors.
- List prices. A page read on `serper-webpage` is $0.002. A mentions monitor on all four sources is $0.0056 a run. The 53-page watchlist is $0.106 a run, $3.18 a month at one run a day. Full table in [looot jobs and prices](#looot-jobs-and-prices).
- A failed call costs nothing and is recorded with its error code. Each page has one idempotency key per UTC day, so a second run in the same day makes no call. `--force` runs again and is charged again.

## Run the web app with sign-in

The app uses Supabase Auth (magic link and GitHub) and a Postgres database. These steps use a hosted Supabase project, not a local Docker stack.

1. Create a project in the Supabase dashboard. Copy the project URL and the anon key from Project Settings, API into `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
2. Apply the schema. There is one migration, `supabase/migrations/20261008000000_init.sql`. Either link and push from a clone of this repo:

   ```bash
   npx supabase@2.118.0 login
   npx supabase@2.118.0 link --project-ref <your-project-ref>
   npx supabase@2.118.0 db push
   ```

   Or open the SQL editor in the Supabase dashboard, paste the whole file and run it.
3. Under Authentication, URL Configuration, add the redirect URLs. The app sends the magic link and the GitHub sign-in to `<origin>/auth/callback` (`src/app/auth/callback/route.ts`).
   - `http://localhost:3000/auth/callback` for `npm run dev`
   - `https://<your-app-domain>/auth/callback` for the deployed app
   Set the Site URL to your deployed app URL.
4. Optional, for "Continue with GitHub", turn on the GitHub provider under Authentication, Sign In / Providers and enter the client id and secret of a GitHub OAuth app you create. Magic link works without it.
5. Put `LOOOT_TOKEN` in `.env.local`, then `npm run dev` and open http://localhost:3000. Request a magic link and click it.

### Schedules

`vercel.json` calls `GET /api/cron` every hour (`0 * * * *`). A tick runs at most 25 due monitors. Vercel Hobby runs cron jobs once a day, so hourly and 6-hour schedules need Vercel Pro or an external pinger that sends `Authorization: Bearer $CRON_SECRET`. To run one tick by hand:

```bash
CRON_SECRET=<the same value> npm run tick -- http://localhost:3000
```

Without `CRON_SECRET`, `SUPABASE_SERVICE_ROLE_KEY` and `LOOOT_TOKEN` the route answers 401 or 501 and spends nothing. Manual "Run now" still works.

## Deploy

### The web app on Vercel

1. Push the repo to your own GitHub account, or use the Deploy with Vercel button at the top.
2. In Vercel, Add New, Project, import the repo. The framework preset is Next.js and the defaults work.
3. Add these environment variables before the first deploy.

   | Name | Value |
   |---|---|
   | `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | your Supabase anon key |
   | `LOOOT_TOKEN` | your looot agent token |
   | `CRON_SECRET` | a long random string, for scheduled checks |
   | `SUPABASE_SERVICE_ROLE_KEY` | your service role key, for scheduled checks |

4. Deploy, then add `https://<your-vercel-domain>/auth/callback` to the Supabase redirect URLs and set the Site URL to the same domain. `vercel.json` registers the hourly cron.

### The watchlist on GitHub Actions

`.github/workflows/watch.yml` runs the watchlist every day at 06:17 UTC and commits the digest and the state to the repository. To turn it on in your copy of this repo:

1. In your repository, Settings, Secrets and variables, Actions, New repository secret. Name `LOOOT_TOKEN`, value a looot agent token.
2. Optional: a repository variable `WATCHLIST` with the path of your own file. The default is `watchlists/looot-market.yaml`.
3. First run. Actions tab, watch, Run workflow. Tick `dry_run` first to see the quote in the log. The same from a terminal is `gh workflow run watch.yml -f dry_run=true`, and `gh workflow run watch.yml` for a real run. The inputs are `config`, `dry_run` and `force`.

Without the secret the job ends with the notice `LOOOT_TOKEN is not set, so nothing ran. Add it under Settings, Secrets and variables, Actions.` and spends nothing. The workflow needs permission to push (`contents: write` is set in the file). In a public repository the digests and the stored page text are public too, so use a private copy if your watchlist is not something to show.

## The watchlist file

A watchlist is a YAML file:

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

A run writes `digests/YYYY-MM-DD.md`: per changed page, a table of prices that moved (before, after, percent), the edited lines as old and new text, and the new lines, which is where a new changelog entry shows up. Failed pages are listed with their looot error code. The first run of a page stores a snapshot and reports no change.

It is the same code as the app: `src/headless/watch.ts` builds a page monitor per URL and calls `runMonitor`, so the price guard, the monthly cap, the diff and the severity rules are the ones described below. State (the last text of each page, and the month's runs with their cost) lives in `state/<watchlist name>.json`.

[`watchlists/looot-market.yaml`](watchlists/looot-market.yaml) is the list looot runs on its own market: 53 pricing pages and changelogs, $0.106 a run at list price.

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

## Data and security

Seven tables in `supabase/migrations`: `settings`, `monitors`, `monitor_sources`, `runs`, `snapshots`, `serp_results`, `alerts`. Every table has an `owner_id` that defaults to `auth.uid()`, row level security enabled and forced, and select, insert, update and delete policies on `owner_id = auth.uid()`. A trigger rejects a child row whose parent has another owner.

`npm run test:rls` applies the migration to a throwaway local Postgres (`initdb`, `pg_ctl` and `psql` on PATH, no containers) and checks that a second user reads, updates and deletes zero rows of the first in all seven tables. It skips with a note when PostgreSQL is not installed.

## Troubleshooting

These are the exact messages in the code.

| Message | What it means and what to do |
|---|---|
| `LOOOT_TOKEN is not set. Create an agent token at https://looot.ai/settings, or use --dry-run.` (`npm run watch`, exit 2) | Export the token in the shell and run again, or add `--dry-run`. |
| `LOOOT_TOKEN is not set on the server. Add it, then run again.` (HTTP 409, "Run now" in the app) | Set `LOOOT_TOKEN` in `.env.local` or the Vercel variables and restart. |
| `looot returned HTTP 401` or the message looot sends back | The token is wrong, revoked or missing a scope. Create a new one with `runs.execute`, `catalog.read`, `runs.read` and `usage.read`. |
| `looot returned HTTP 402`, or a run that ends as `blocked` | The balance is too low. Top up at https://looot.ai (minimum $5). The run is recorded with its error code and costs $0. |
| `Run ended as blocked` / `Run ended as stopped` / `Run ended as ...` | The call finished without a result. The run table shows the looot run id. |
| `The live price of ... could not be read. No call was made.` / `The live price of ... could not be read. Pages on it will not run.` | The free catalog price read failed. Nothing was charged. Try again later. |
| `The price is now ... micro-dollars a run, above the ... you confirmed.` | The live price rose above the max you confirmed. Raise it (`maxPricePerPageUsd` in a watchlist, or the monitor's max cost) if you accept the price. |
| `This monitor reached its monthly cap.` / `The workspace reached its monthly cap.` | Raise the cap or wait for the next UTC month. Watchlist pages show "monthly cap reached" or "over the run cap". |
| `The page text was N characters long. The reader may be blocked on this site.` | The reader returned almost nothing. Try `reader: serper-webpage`. |
| `Every page failed. See the digest for the error codes.` | All pages failed, usually a token or balance problem. Read the error codes in `digests/`. |
| `unauthorized` (HTTP 401 from `/api/cron`) | The `Authorization: Bearer` value does not match `CRON_SECRET`. |
| `SUPABASE_SERVICE_ROLE_KEY is not set. Scheduled checks are off.` / `LOOOT_TOKEN is not set. Scheduled checks are off.` (HTTP 501) | Set the variable on the server that serves `/api/cron`. |
| `Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or run the demo with npm run demo.` | Set both variables and restart. |
| `That sign-in link is not complete. Ask for a new one.` / `Sign-in did not finish. Try again.` | Request a new link. Check that `<origin>/auth/callback` is in the Supabase redirect URLs. |

A response the parser does not recognise gives an item with fewer fields, not a crash. If a source returns nothing you expected, file an issue.

How to file an issue. Open one at https://github.com/loootai/looot-monitor/issues with the run id (the Runs tab of the monitor, or the digest), the command you used, and the raw response body with secrets removed.

## Status

No paid run was made while building this. Eight sources have parsers written from the provider's public docs and a fixture, not from a real response (the "Unverified" rows above). Only `serper-search` and `serper-webpage` have a known shape. The first real run of an unverified source may need a small parser fix. If a parser fails, open an issue with the raw response body (secrets removed).

The web app was not run end to end against a hosted Supabase project. The migration and row level security were tested on a local Postgres, and the Supabase code path passes typecheck and build.

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

## License

MIT, see [LICENSE](LICENSE).
