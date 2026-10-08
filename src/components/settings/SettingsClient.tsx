"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, CircleCheck, CircleX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChipInput } from "@/components/ui/chips";
import { Field, Input, Select } from "@/components/ui/input";
import { Badge, Segmented, Table, Td, Th } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { usdPrecise } from "@/lib/money";
import type { Settings } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SourceRow {
  label: string;
  jobId: string;
  endpointId: string;
  priceMicros: number;
  priceDated: string;
  shapeVerified: boolean;
}

const SECTIONS = [
  ["looot", "looot connection"],
  ["budget", "Budget"],
  ["severity", "Severity rules"],
  ["noise", "Noise"],
  ["retention", "Retention"],
  ["appearance", "Appearance"],
  ["sources", "Source status"],
  ["account", "Account"],
] as const;

const ZONES = ["UTC", "Europe/London", "Europe/Paris", "Europe/Berlin", "America/New_York", "America/Chicago", "America/Los_Angeles", "Asia/Dubai", "Asia/Kolkata", "Asia/Singapore", "Asia/Tokyo", "Australia/Sydney"];
const dollars = (micros: number) => (micros / 1_000_000).toFixed(2);

function Section({ id, title, note, children }: { id: string; title: string; note?: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="scroll-mt-4 border-b border-line py-6 first:pt-0 last:border-0">
      <h2 id={`${id}-h`} className="text-14 font-medium">
        {title}
      </h2>
      {note ? <p className="mt-0.5 max-w-prose text-12 text-mute">{note}</p> : null}
      <div className="mt-4 space-y-4">{children}</div>
    </section>
  );
}

/** Settings on one page, with an anchor list on the left. Each section saves on its own. */
export function SettingsClient({ initial, tokenSet, tokenEnv, demo, user, sources }: { initial: Settings; tokenSet: boolean; tokenEnv: string; demo: boolean; user: { name: string; email: string }; sources: SourceRow[] }) {
  const router = useRouter();
  const toast = useToast();
  const [s, setS] = React.useState(initial);
  const [cap, setCap] = React.useState(dollars(initial.workspaceCapMicros));
  const [defCap, setDefCap] = React.useState(dollars(initial.defaultCapMicros));
  const [test, setTest] = React.useState<{ state: "idle" | "busy" | "ok" | "error"; text?: string }>({ state: "idle" });
  const [preview, setPreview] = React.useState<string | null>(null);
  const [theme, setThemeState] = React.useState<"light" | "dark" | "system">("system");
  const [confirm, setConfirm] = React.useState("");
  const [deleting, setDeleting] = React.useState(false);

  React.useEffect(() => {
    try {
      const t = localStorage.getItem("theme");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads the saved theme once, after hydration
      if (t === "light" || t === "dark") setThemeState(t);
    } catch {}
  }, []);

  const save = async (patch: Partial<Settings>, done = "Saved") => {
    try {
      const res = await fetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not save");
      toast({ text: done });
      router.refresh();
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    }
  };
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setS((cur) => ({ ...cur, [k]: v }));

  const testConnection = async () => {
    setTest({ state: "busy" });
    try {
      const res = await fetch("/api/balance");
      const data = (await res.json()) as { balanceUsd?: number | null; error?: string; code?: string; demo?: boolean };
      if (!res.ok) throw new Error(`${data.error ?? "Failed"}${data.code ? ` (${data.code})` : ""}`);
      setTest({ state: "ok", text: `${data.demo ? "Demo balance" : "Connected. Balance"} ${typeof data.balanceUsd === "number" ? `$${data.balanceUsd.toFixed(2)}` : "not reported"}` });
    } catch (e) {
      setTest({ state: "error", text: (e as Error).message });
    }
  };
  const runPreview = async () => {
    setPreview("Checking...");
    try {
      const res = await fetch("/api/settings/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ escalationWords: s.escalationWords, priorityDomains: s.priorityDomains }) });
      const d = (await res.json()) as { changed: number; checked: number; up: number; down: number };
      setPreview(d.changed === 0 ? `No change across ${d.checked} mention alerts from the last 30 days.` : `${d.changed} of ${d.checked} mention alerts from the last 30 days would change severity: ${d.up} up, ${d.down} lower.`);
    } catch {
      setPreview("The preview could not be run.");
    }
  };
  const setTheme = (t: "light" | "dark" | "system") => {
    setThemeState(t);
    const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.classList.toggle("dark", dark);
    try {
      localStorage.setItem("theme", t);
    } catch {}
    window.dispatchEvent(new CustomEvent("themechange"));
  };
  const signOut = async () => {
    if (!demo) {
      const { browserSupabase } = await import("@/lib/supabase/browser");
      await browserSupabase().auth.signOut();
    }
    router.push("/login");
  };
  const deleteData = async () => {
    setDeleting(false);
    try {
      const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirm }) });
      if (!res.ok) throw new Error(((await res.json()) as { error?: string }).error ?? "Could not delete");
      toast({ text: "Your data was deleted" });
      router.push("/");
      router.refresh();
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    }
  };

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-x-10 px-4 py-5 md:px-6 lg:grid-cols-[180px_minmax(0,1fr)]">
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="sticky top-5 space-y-px">
          {SECTIONS.map(([id, label]) => (
            <li key={id}>
              <a href={`#${id}`} className="flex h-8 items-center rounded-control px-2 text-mute hover:bg-hover hover:text-ink">
                {label}
              </a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="min-w-0">
        <Section id="looot" title="looot connection" note={`The token lives in the server environment as ${tokenEnv}. It is never sent to the browser and never shown here.`}>
          <div className="flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5">
              {tokenSet ? <CircleCheck className="size-4 text-emerald" aria-hidden /> : <CircleX className={cn("size-4", demo ? "text-faint" : "text-high")} aria-hidden />}
              {tokenEnv} is {tokenSet ? "set" : "not set"} on the server
            </span>
            {demo ? <Badge tone="amber">Demo data, no token needed</Badge> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={testConnection} disabled={test.state === "busy"}>
              {test.state === "busy" ? "Testing..." : "Test connection"}
            </Button>
            <Button asChild variant="ghost">
              <a href="https://looot.ai/settings" target="_blank" rel="noopener noreferrer">
                Top up or make a token <ArrowUpRight />
              </a>
            </Button>
            <span aria-live="polite" className={cn("num text-12", test.state === "error" ? "text-high" : "text-mute")}>
              {test.text}
            </span>
          </div>
          {!tokenSet && !demo ? <p className="text-12 text-mute">Add {tokenEnv} to the environment of your deployment, then redeploy. Reading the balance is free.</p> : null}
        </Section>

        <Section id="budget" title="Budget" note="Both caps are checked before every run. A run that would pass a cap is refused and no call is made.">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Workspace monthly cap, in dollars" htmlFor="s-cap" help="Across all monitors, per calendar month.">
              <Input id="s-cap" inputMode="decimal" className="num" value={cap} onChange={(e) => setCap(e.target.value)} />
            </Field>
            <Field label="Default cap for new monitors, in dollars" htmlFor="s-def" help="The form suggests 1.5 times the projection when that is higher.">
              <Input id="s-def" inputMode="decimal" className="num" value={defCap} onChange={(e) => setDefCap(e.target.value)} />
            </Field>
          </div>
          <Button
            onClick={() => {
              const a = Math.round(Number(cap) * 1_000_000);
              const b = Math.round(Number(defCap) * 1_000_000);
              if (!Number.isFinite(a) || a < 0 || !Number.isFinite(b) || b < 0) return toast({ text: "Enter amounts of zero or more", tone: "error" });
              void save({ workspaceCapMicros: a, defaultCapMicros: b }, "Budget saved");
            }}
          >
            Save budget
          </Button>
        </Section>

        <Section id="severity" title="Severity rules" note="Rules run in order and the first match wins. An escalation word makes a mention high. A priority outlet makes it medium. Competitor domains matter for Google monitors.">
          <Field label="Escalation words" htmlFor="s-esc" help="Matched as whole words in the title and the snippet.">
            <ChipInput id="s-esc" label="Escalation words" value={s.escalationWords} onChange={(v) => set("escalationWords", v)} placeholder="outage" />
          </Field>
          <Field label="Priority outlets" htmlFor="s-pri" help="Domains. A mention from one of these is at least medium.">
            <ChipInput id="s-pri" label="Priority outlets" value={s.priorityDomains} onChange={(v) => set("priorityDomains", v)} placeholder="designledgerweekly.example" mono />
          </Field>
          <Field label="Competitor domains" htmlFor="s-comp" help="One of these entering the top 3 of a Google monitor is a high alert.">
            <ChipInput id="s-comp" label="Competitor domains" value={s.competitorDomains} onChange={(v) => set("competitorDomains", v)} placeholder="ledgerly.example" mono />
          </Field>
          <div className="flex flex-wrap items-center gap-2">
            <Button onClick={() => save({ escalationWords: s.escalationWords, priorityDomains: s.priorityDomains, competitorDomains: s.competitorDomains }, "Rules saved")}>Save rules</Button>
            <Button variant="ghost" onClick={runPreview}>
              Preview
            </Button>
            <span aria-live="polite" className="text-12 text-mute">
              {preview}
            </span>
          </div>
        </Section>

        <Section id="noise" title="Noise" note="Lines matching these are dropped from every page monitor before the text is compared. Plain text or a regular expression.">
          <Field label="Default ignore patterns" htmlFor="s-ign">
            <ChipInput id="s-ign" label="Default ignore patterns" value={s.ignorePatterns} onChange={(v) => set("ignorePatterns", v)} placeholder="cookie" mono />
          </Field>
          <Button onClick={() => save({ ignorePatterns: s.ignorePatterns }, "Patterns saved")}>Save patterns</Button>
        </Section>

        <Section id="retention" title="Retention">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Keep snapshots, in days" htmlFor="s-snap">
              <Input id="s-snap" type="number" min={1} max={3650} className="num" value={s.snapshotRetentionDays} onChange={(e) => set("snapshotRetentionDays", Number(e.target.value))} />
            </Field>
            <Field label="Keep raw results, in days" htmlFor="s-raw">
              <Input id="s-raw" type="number" min={1} max={3650} className="num" value={s.rawRetentionDays} onChange={(e) => set("rawRetentionDays", Number(e.target.value))} />
            </Field>
          </div>
          <Button onClick={() => save({ snapshotRetentionDays: s.snapshotRetentionDays, rawRetentionDays: s.rawRetentionDays }, "Retention saved")}>Save retention</Button>
        </Section>

        <Section id="appearance" title="Appearance">
          <div className="flex flex-col gap-1.5">
            <span className="text-12 font-medium">Theme</span>
            <Segmented
              label="Theme"
              value={theme}
              onChange={setTheme}
              className="self-start"
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
                { value: "system", label: "System" },
              ]}
            />
          </div>
          <Field label="Time zone" htmlFor="s-tz" help="Stored for the digest. Times in the app are shown in UTC." className="max-w-xs">
            <Select
              id="s-tz"
              value={s.timezone}
              onChange={(e) => {
                set("timezone", e.target.value);
                void save({ timezone: e.target.value }, "Time zone saved");
              }}
            >
              {[...new Set([s.timezone, ...ZONES])].map((z) => (
                <option key={z}>{z}</option>
              ))}
            </Select>
          </Field>
        </Section>

        <Section id="sources" title="Source status" note="Every source the app can run, with the looot job, the pinned endpoint and its price. Unverified means nobody has checked a real response against the parser yet.">
          <div className="overflow-x-auto rounded-panel border border-line">
            <Table className="min-w-[640px]">
              <thead>
                <tr>
                  <Th className="md:first:pl-3">Source</Th>
                  <Th>looot job</Th>
                  <Th>Endpoint</Th>
                  <Th className="text-right">Price a call</Th>
                  <Th>Price dated</Th>
                  <Th className="md:last:pr-3">Response shape</Th>
                </tr>
              </thead>
              <tbody>
                {sources.map((r) => (
                  <tr key={r.endpointId} className="last:[&>td]:border-0">
                    <Td className="whitespace-nowrap md:first:pl-3">{r.label}</Td>
                    <Td className="num text-12 text-mute">{r.jobId}</Td>
                    <Td className="num text-12">{r.endpointId}</Td>
                    <Td className="num text-right">{usdPrecise(r.priceMicros)}</Td>
                    <Td className="num text-12 text-mute">{r.priceDated}</Td>
                    <Td className="md:last:pr-3">{r.shapeVerified ? <Badge tone="brand">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}</Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        </Section>

        <Section id="account" title="Account">
          <p>
            <span className="font-medium">{user.name}</span> <span className="num text-12 text-mute">{user.email}</span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button onClick={signOut}>{demo ? "Leave the demo" : "Sign out"}</Button>
            <Button variant="danger" onClick={() => setDeleting(true)}>
              Delete my data
            </Button>
          </div>
        </Section>
      </div>

      <Dialog
        open={deleting}
        onOpenChange={(v) => {
          setDeleting(v);
          if (!v) setConfirm("");
        }}
      >
        <DialogContent title="Delete all of your data?" description="Every monitor, alert, run, snapshot and setting is deleted. This cannot be undone.">
          <div className="space-y-3 p-4">
            <Field label='Type "delete my data" to confirm' htmlFor="s-del">
              <Input id="s-del" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" />
            </Field>
            <div className="flex justify-end gap-2">
              <Button onClick={() => setDeleting(false)}>Cancel</Button>
              <Button variant="danger" disabled={confirm !== "delete my data"} onClick={deleteData}>
                Delete everything
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
