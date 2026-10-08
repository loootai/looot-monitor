#!/usr/bin/env node
// Runs one scheduler tick against a local or deployed app: node scripts/tick.mjs [base URL]
// Needs CRON_SECRET in the environment, the same value the app has.
const base = (process.argv[2] ?? process.env.APP_URL ?? "http://localhost:3000").replace(/\/+$/, "");
const secret = process.env.CRON_SECRET;
if (!secret) {
  console.error("Set CRON_SECRET first. It must match the value the app runs with.");
  process.exit(2);
}
const res = await fetch(`${base}/api/cron`, { headers: { Authorization: `Bearer ${secret}` } });
console.log(res.status, JSON.stringify(await res.json(), null, 2));
process.exit(res.ok ? 0 : 1);
