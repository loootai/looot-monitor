# Changelog

Built from the GitHub release notes. Each version links to its release page.

## 0.1.5 (2026-10-11)

CSRF protection for every state-changing API route. Versions 0.1.4 and earlier checked who you are but not where a request came from. A page on another site could make a signed-in user's browser send a PATCH, POST or DELETE to a deployed copy (change settings, pause monitors, start a paid run, delete the account data). Upgrade if you run a deployed copy.

- Every POST, PATCH, PUT and DELETE to `/api` must be same-origin (the `Origin` header names the app's own host, or `Sec-Fetch-Site` says same-origin) and carry the token. The proxy sets the token in the `monitor_csrf` cookie. The app's own calls copy it into the `x-monitor-csrf` header through `apiFetch`. A cross-site request gets 403 `csrf_origin`. A missing or wrong token gets 403 `csrf_token`.
- The check runs in the proxy and again in each route handler (`withSession`). It also applies in demo mode.
- Next.js server actions compare Origin with Host themselves in next 16.3.8. This app has none, so route handlers are the whole exposure.
- `/api/cron` is unchanged. It still needs `Authorization: Bearer <CRON_SECRET>`, and Vercel Cron and `npm run tick` keep working. `npm run watch` and the GitHub Actions workflow call the code directly and never touch the HTTP routes.
- The generated route-map tests check every state-changing handler for a cross-site request, a missing token, a wrong token, and a valid request.

## 0.1.4 (2026-10-11)

Security release. Earlier versions (0.1.3 and before) let any signed-in Supabase user use the workspace. A new Supabase project allows open sign-ups, so a stranger could create an account, read data, change settings and spend the operator's LOOOT_TOKEN. If you run a deployed copy, upgrade and set the allow-list.

What changed
- New required env var `LOOOT_MONITOR_ALLOWED_EMAILS` (comma separated, case-insensitive, exact match) and optional `LOOOT_MONITOR_ALLOWED_DOMAINS`. Checked in the proxy and in every page, API route and server read.
- With neither set, nobody gets in. The app shows a setup page and the API answers 503. A user not on the list sees "Not authorised for this workspace" and gets 403.
- A paid run can no longer raise the saved per-run cap. The request may only lower it for that run.
- Paid runs are limited to 10 a minute per user.
- `/api/cron` compares `CRON_SECRET` in constant time.
- README: new "Securing a deployment" section. Also turn off public sign-ups in your Supabase project.

Upgrade: set `LOOOT_MONITOR_ALLOWED_EMAILS` before you deploy, or the app will refuse everyone. Demo mode is unchanged.

[Release page](https://github.com/loootai/looot-monitor/releases/tag/v0.1.4)

## 0.1.3 (2026-10-10)

Sidebar: nested Monitors list with unread badges, flyout in the rail

[Release page](https://github.com/loootai/looot-monitor/releases/tag/v0.1.3)

## 0.1.2 (2026-10-10)

Sidebar layout.

[Release page](https://github.com/loootai/looot-monitor/releases/tag/v0.1.2)

## 0.1.1 (2026-10-10)

Dependency security bump. next and eslint-config-next 16.3.7 to 16.3.8, which fixes six Next.js advisories (GHSA-3w37-wq28-93x7, GHSA-4jqv-mc3x-m676, GHSA-39w2-rjm5-chcv, GHSA-f87g-xv8r-7p7x, GHSA-mcj8-r9mp-w47p, GHSA-cjq9-62q9-8jv4). No code changes. v0.1.0 is unchanged.

[Release page](https://github.com/loootai/looot-monitor/releases/tag/v0.1.1)

## 0.1.0 (2026-10-08)

First release.

- Four monitor types: mentions (News, X, Reddit, LinkedIn), Google results, page change with a text diff and price detection, and reviews (Google Maps, App Store).
- One alert inbox with rule-based severity, keyboard triage, snooze and undo.
- A quote before every paid action, a max cost per run, a monthly cap per monitor and a workspace cap. A run that would pass any of them makes no call.
- Digest preview with Copy HTML and Download. Sending is not built yet.
- Spend dashboard with a ledger and CSV export.
- Demo mode: `npm ci && npm run demo`, no Supabase project and no looot token.

Checked before release: tsc and eslint clean, 110 vitest tests pass, next build passes, the row level security check passes on a throwaway Postgres for all 7 tables, and a build with a fake token leaves neither the value nor the variable name in `.next/static`.

Known gap: eight of the ten source parsers were written from provider docs, not from a real response. See the README.

[Release page](https://github.com/loootai/looot-monitor/releases/tag/v0.1.0)
