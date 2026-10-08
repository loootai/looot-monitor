"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlarmClock, Check, Square, SquareCheck, X } from "lucide-react";
import { patchAlerts, snoozeUntil } from "@/components/alerts/AlertActions";
import { Empty } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Tip } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { Rating, SEV_LABEL, SeverityBar, SOURCE_NAME, SourceIcon } from "@/components/visuals";
import { dayKey, dayLabel, now, relative, shortDate } from "@/lib/clock";
import { chipOf } from "@/lib/sources";
import type { Alert, AlertState, OwnerTag, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface VolumeDay {
  day: string;
  high: number;
  medium: number;
  low: number;
}

interface Props {
  alerts: Alert[];
  state: AlertState;
  counts: { open: number; snoozed: number; done: number };
  monitors: Record<string, { name: string; ownerTag: OwnerTag }>;
  volume: VolumeDay[];
  selectedId: string | null;
  query: string;
  children: React.ReactNode;
}

type Override = Partial<Alert> & { gone?: boolean };
const SEVERITIES: Severity[] = ["high", "medium", "low"];
const SOURCE_CHIPS = ["news", "google", "page", "x", "reddit", "linkedin", "reviews"];
const SEV_CHIP: Record<Severity, string> = { high: "data-[on=true]:border-high data-[on=true]:bg-high-soft data-[on=true]:text-high", medium: "data-[on=true]:border-medium data-[on=true]:bg-medium-soft data-[on=true]:text-medium", low: "data-[on=true]:border-low data-[on=true]:bg-low-soft data-[on=true]:text-low" };
const SEV_FILL: Record<Severity, string> = { high: "bg-high", medium: "bg-medium", low: "bg-low" };

function Chip({ on, onClick, children, className, label }: { on: boolean; onClick: () => void; children: React.ReactNode; className?: string; label?: string }) {
  return (
    <button type="button" aria-pressed={on} aria-label={label} data-on={on} onClick={onClick} className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control border border-line bg-panel px-2 text-12 text-mute transition-colors duration-100 hover:border-line-strong hover:text-ink data-[on=true]:border-brand data-[on=true]:bg-brand-soft data-[on=true]:font-medium data-[on=true]:text-link md:h-7", className)}>
      {children}
    </button>
  );
}

function toggle<T>(set: Set<T>, v: T): Set<T> {
  const next = new Set(set);
  if (next.has(v)) next.delete(v);
  else next.add(v);
  return next;
}

/** The inbox: filters, the alert list with keyboard triage, and the reading pane next to it. */
export function InboxClient({ alerts, state, counts, monitors, volume, selectedId, query, children }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startNav] = React.useTransition();
  const [overrides, setOverrides] = React.useState<Record<string, Override>>({});
  const [older, setOlder] = React.useState<Alert[]>([]);
  const [loadingOlder, setLoadingOlder] = React.useState(false);
  const [noMore, setNoMore] = React.useState(alerts.length < 50);
  const [sev, setSev] = React.useState<Set<Severity>>(new Set());
  const [src, setSrc] = React.useState<Set<string>>(new Set());
  const [owner, setOwner] = React.useState<OwnerTag | null>(null);
  const [day, setDay] = React.useState<string | null>(null);
  const [sel, setSel] = React.useState<string | null>(selectedId);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const listRef = React.useRef<HTMLDivElement>(null);
  const at = now();

  const rows = React.useMemo(() => {
    const seen = new Set<string>();
    return [...alerts, ...older]
      .filter((a) => (seen.has(a.id) ? false : (seen.add(a.id), true)))
      .map((a) => ({ ...a, ...overrides[a.id] }) as Alert & { gone?: boolean })
      .filter((a) => !a.gone);
  }, [alerts, older, overrides]);

  const needle = query.trim().toLowerCase();
  const base = React.useMemo(() => rows.filter((a) => !needle || `${a.title} ${a.snippet ?? ""} ${a.domain ?? ""} ${a.author ?? ""} ${monitors[a.monitorId]?.name ?? ""}`.toLowerCase().includes(needle)), [rows, needle, monitors]);
  const visible = React.useMemo(
    () => base.filter((a) => (sev.size === 0 || sev.has(a.severity)) && (src.size === 0 || src.has(chipOf(a.source))) && (!owner || monitors[a.monitorId]?.ownerTag === owner) && (!day || dayKey(a.createdAt) === day)),
    [base, sev, src, owner, day, monitors],
  );
  const sevCount = (s: Severity) => base.filter((a) => a.severity === s).length;
  const filtered = sev.size > 0 || src.size > 0 || owner !== null || day !== null || needle !== "";
  const groups = React.useMemo(() => {
    const out: { key: string; items: typeof visible }[] = [];
    for (const a of visible) {
      const k = dayKey(a.createdAt);
      if (out[out.length - 1]?.key === k) out[out.length - 1].items.push(a);
      else out.push({ key: k, items: [a] });
    }
    return out;
  }, [visible]);

  const hrefFor = React.useCallback(
    (id: string | null) => {
      const p = new URLSearchParams();
      if (state !== "open") p.set("s", state);
      if (query) p.set("q", query);
      if (id) p.set("a", id);
      const s = p.toString();
      return s ? `/?${s}` : "/";
    },
    [state, query],
  );

  const apply = React.useCallback((ids: string[], o: Override) => setOverrides((cur) => ({ ...cur, ...Object.fromEntries(ids.map((id) => [id, { ...cur[id], ...o }])) })), []);
  const send = React.useCallback(
    async (ids: string[], patch: Record<string, unknown>, undo?: () => void) => {
      try {
        await patchAlerts(ids, patch);
        router.refresh();
      } catch (e) {
        undo?.();
        toast({ text: (e as Error).message, tone: "error" });
      }
    },
    [router, toast],
  );

  const select = React.useCallback(
    (id: string, opts: { open?: boolean } = {}) => {
      setSel(id);
      const a = rows.find((r) => r.id === id);
      if (opts.open && window.matchMedia("(max-width: 767px)").matches) {
        router.push(`/alerts/${id}`);
        return;
      }
      startNav(() => router.replace(hrefFor(id), { scroll: false }));
      if (a && !a.readAt) {
        const readAt = now().toISOString();
        apply([id], { readAt });
        void send([id], { readAt });
      }
      document.getElementById(`row-${id}`)?.scrollIntoView({ block: "nearest" });
    },
    [rows, router, hrefFor, apply, send],
  );

  const leave = React.useCallback(
    (ids: string[], patch: { state: AlertState; snoozedUntil?: string | null; readAt?: string }, text: string) => {
      const idx = visible.findIndex((a) => a.id === sel);
      const next = visible.filter((a) => !ids.includes(a.id));
      const prev = Object.fromEntries(ids.map((id) => [id, overrides[id]]));
      apply(ids, { ...patch, gone: patch.state !== state });
      setPicked(new Set());
      if (sel && ids.includes(sel)) {
        const n = next[Math.min(idx, next.length - 1)] ?? null;
        setSel(n?.id ?? null);
        startNav(() => router.replace(hrefFor(n?.id ?? null), { scroll: false }));
      }
      const undo = () => {
        setOverrides((cur) => ({ ...cur, ...Object.fromEntries(ids.map((id) => [id, { ...prev[id], gone: false, state }])) }));
        void send(ids, { state, snoozedUntil: null });
      };
      void send(ids, patch, undo);
      toast({ text: ids.length > 1 ? `${ids.length} alerts ${text}` : `Alert ${text}`, action: { label: "Undo", run: undo } });
    },
    [visible, sel, overrides, apply, state, router, hrefFor, send, toast],
  );

  const targets = React.useCallback(() => (picked.size > 0 ? [...picked] : sel ? [sel] : []), [picked, sel]);
  const markDone = React.useCallback(() => {
    const ids = targets();
    if (ids.length > 0 && state !== "done") leave(ids, { state: "done", readAt: now().toISOString() }, "marked done");
  }, [targets, leave, state]);
  const snooze = React.useCallback(() => {
    const ids = targets();
    if (ids.length > 0 && state === "open") leave(ids, { state: "snoozed", snoozedUntil: snoozeUntil() }, "snoozed for 24 hours");
  }, [targets, leave, state]);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey || document.querySelector('[role="dialog"]')) return;
      const i = visible.findIndex((a) => a.id === sel);
      const cur = i >= 0 ? visible[i] : null;
      const k = e.key;
      if (k === "j" || k === "J" || k === "ArrowDown") {
        const n = visible[Math.min(visible.length - 1, i + 1)];
        if (!n) return;
        e.preventDefault();
        if (e.shiftKey && cur) setPicked((p) => new Set(p).add(cur.id).add(n.id));
        select(n.id);
      } else if (k === "k" || k === "K" || k === "ArrowUp") {
        const n = visible[Math.max(0, i - 1)];
        if (!n) return;
        e.preventDefault();
        select(n.id);
      } else if (k === "Enter" && cur && el?.tagName !== "BUTTON" && el?.tagName !== "A") select(cur.id, { open: true });
      else if (k === "e") markDone();
      else if (k === "h") snooze();
      else if (k === "u" && cur) {
        const readAt = cur.readAt ? null : now().toISOString();
        apply([cur.id], { readAt });
        void send([cur.id], { readAt });
      } else if ((k === "1" || k === "2" || k === "3") && cur) {
        const severity = SEVERITIES[Number(k) - 1];
        apply([cur.id], { severity, severityReason: "Set by hand" });
        void send([cur.id], { severity, severityReason: "Set by hand" });
      } else if (k === "o" && cur?.url) window.open(cur.url, "_blank", "noopener,noreferrer");
      else if (k === "x" && cur) setPicked((p) => toggle(p, cur.id));
      else if (k === "Escape") setPicked(new Set());
    };
    const onChanged = (e: Event) => {
      const d = (e as CustomEvent<{ id: string; patch: Partial<Alert> }>).detail;
      if (d) apply([d.id], { ...d.patch, gone: d.patch.state !== undefined && d.patch.state !== state });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("alert-changed", onChanged);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("alert-changed", onChanged);
    };
  }, [visible, sel, select, markDone, snooze, apply, send, state]);

  const loadOlder = async () => {
    const last = rows[rows.length - 1];
    if (!last) return;
    setLoadingOlder(true);
    try {
      const res = await fetch(`/api/alerts?state=${state}&before=${encodeURIComponent(last.createdAt)}`);
      const data = (await res.json()) as { alerts?: Alert[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Could not load older alerts");
      setOlder((o) => [...o, ...(data.alerts ?? [])]);
      if ((data.alerts ?? []).length < 50) setNoMore(true);
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    } finally {
      setLoadingOlder(false);
    }
  };

  const clear = () => {
    setSev(new Set());
    setSrc(new Set());
    setOwner(null);
    setDay(null);
    if (needle) router.push(state === "open" ? "/" : `/?s=${state}`);
  };
  const maxVol = Math.max(1, ...volume.map((v) => v.high + v.medium + v.low));

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="shrink-0 border-b border-line bg-panel">
        <div className="scroll-thin flex items-center gap-2 overflow-x-auto px-3 py-2 md:px-4">
          <div role="tablist" aria-label="Alert state" className="inline-flex h-9 shrink-0 items-center rounded-control border border-line-strong bg-panel p-0.5 md:h-7">
            {(["open", "snoozed", "done"] as AlertState[]).map((s) => (
              <Link key={s} role="tab" aria-selected={state === s} href={s === "open" ? "/" : `/?s=${s}`} className={cn("flex h-full items-center gap-1.5 rounded-[4px] px-2.5 text-12 font-medium capitalize text-mute hover:text-ink", state === s && "bg-brand-soft text-link")}>
                {s} <span className="num font-normal">{counts[s]}</span>
              </Link>
            ))}
          </div>
          <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />
          {SEVERITIES.map((s) => (
            <Chip key={s} on={sev.has(s)} onClick={() => setSev((v) => toggle(v, s))} className={SEV_CHIP[s]}>
              <span className={cn("size-1.5 rounded-full", SEV_FILL[s])} aria-hidden />
              {SEV_LABEL[s]} <span className="num font-normal">{sevCount(s)}</span>
            </Chip>
          ))}
          <div className="ml-auto hidden shrink-0 items-end gap-2 pl-4 xl:flex">
            <span className="pb-0.5 text-11 text-faint">30 days</span>
            <div className="flex h-6 items-end gap-px" role="group" aria-label="Alerts per day, last 30 days">
              {volume.map((v) => {
                const total = v.high + v.medium + v.low;
                const h = (n: number) => `${(n / maxVol) * 24}px`;
                return (
                  <Tip key={v.day} label={<span className="num">{shortDate(v.day)}: {total === 0 ? "no alerts" : `${v.high} high, ${v.medium} medium, ${v.low} low`}</span>}>
                    <button type="button" aria-label={`${shortDate(v.day)}, ${total} alerts`} aria-pressed={day === v.day} onClick={() => setDay((d) => (d === v.day ? null : v.day))} className={cn("flex h-6 w-[7px] flex-col justify-end hover:opacity-70", day && day !== v.day && "opacity-30")}>
                      {total === 0 ? <span className="h-px w-full bg-line-strong" /> : null}
                      <span className="w-full rounded-t-[2px] bg-high" style={{ height: h(v.high) }} />
                      <span className="w-full bg-medium" style={{ height: h(v.medium) }} />
                      <span className="w-full bg-low opacity-60" style={{ height: h(v.low) }} />
                    </button>
                  </Tip>
                );
              })}
            </div>
          </div>
        </div>
        <div className="scroll-thin flex items-center gap-1.5 overflow-x-auto border-t border-line px-3 py-1.5 md:px-4">
          {SOURCE_CHIPS.map((s) => (
            <Chip key={s} on={src.has(s)} onClick={() => setSrc((v) => toggle(v, s))}>
              <SourceIcon source={s} className="size-3.5 text-current" />
              {SOURCE_NAME[s]}
            </Chip>
          ))}
          <span className="mx-1 h-4 w-px shrink-0 bg-line" aria-hidden />
          <Chip on={owner === "mine"} onClick={() => setOwner((o) => (o === "mine" ? null : "mine"))}>Mine</Chip>
          <Chip on={owner === "competitor"} onClick={() => setOwner((o) => (o === "competitor" ? null : "competitor"))}>Competitor</Chip>
          {day ? (
            <Chip on onClick={() => setDay(null)} label={`Clear day filter ${shortDate(day)}`}>
              {shortDate(day)} <X className="size-3" aria-hidden />
            </Chip>
          ) : null}
          {needle ? (
            <Chip on onClick={() => router.push(state === "open" ? "/" : `/?s=${state}`)} label="Clear search">
              &quot;{query}&quot; <X className="size-3" aria-hidden />
            </Chip>
          ) : null}
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        <div ref={listRef} className="scroll-thin w-full shrink-0 overflow-y-auto border-line bg-panel md:w-[360px] md:border-r xl:w-[440px]" role="region" aria-label="Alerts">
          {picked.size > 0 ? (
            <div className="sticky top-0 z-20 flex h-10 items-center gap-2 border-b border-line bg-brand-soft px-3 text-12">
              <span className="font-medium text-link">{picked.size} selected</span>
              <Button size="sm" className="ml-auto md:h-6" onClick={markDone} disabled={state === "done"}>
                <Check /> Done
              </Button>
              <Button size="sm" className="md:h-6" onClick={snooze} disabled={state !== "open"}>
                <AlarmClock /> Snooze
              </Button>
              <Button size="sm" variant="ghost" className="md:h-6" onClick={() => setPicked(new Set())}>
                Clear
              </Button>
            </div>
          ) : null}
          {visible.length === 0 ? (
            filtered ? (
              <Empty title="Nothing matches these filters">
                <Button size="sm" onClick={clear}>
                  Clear filters
                </Button>
              </Empty>
            ) : (
              <Empty title={state === "open" ? "Inbox zero" : state === "snoozed" ? "Nothing is snoozed" : "Nothing is done yet"} note={state === "open" ? "New alerts land here after each check." : undefined} />
            )
          ) : null}
          {groups.map((g) => (
            <section key={g.key} aria-label={dayLabel(g.key, at)}>
              <h2 className="sticky top-0 z-10 flex h-7 items-center justify-between border-b border-line bg-page px-4 text-11 font-medium text-mute">
                {dayLabel(g.key, at)}
                <span className="num font-normal">{g.items.length}</span>
              </h2>
              <ul>
                {g.items.map((a) => {
                  const m = monitors[a.monitorId];
                  const isSel = a.id === sel;
                  const isPicked = picked.has(a.id);
                  return (
                    <li key={a.id} id={`row-${a.id}`} className={cn("group relative flex h-14 items-stretch border-b border-line", isSel ? "hover:bg-hover md:bg-brand-soft md:hover:bg-brand-soft" : "hover:bg-hover", isPicked && !isSel && "bg-hover")}>
                      <SeverityBar severity={a.severity} />
                      <button type="button" role="checkbox" aria-checked={isPicked} aria-label={`Select: ${a.title}`} onClick={() => setPicked((p) => toggle(p, a.id))} className="flex w-9 shrink-0 items-center justify-center pl-1.5 text-faint hover:text-ink">
                        <span className={cn(isPicked ? "block" : "hidden group-focus-within:block group-hover:block")}>{isPicked ? <SquareCheck className="size-4 text-link" /> : <Square className="size-4" />}</span>
                        <span className={cn(isPicked ? "hidden" : "block group-focus-within:hidden group-hover:hidden")}>
                          <SourceIcon source={a.source} className={cn(isSel && "text-link")} />
                        </span>
                      </button>
                      <button type="button" aria-current={isSel ? "true" : undefined} onClick={() => select(a.id, { open: true })} className="flex min-w-0 flex-1 flex-col justify-center gap-0.5 pr-3 text-left focus-visible:outline-offset-[-2px]">
                        <span className="flex items-center gap-2">
                          <span className={cn("min-w-0 flex-1 truncate text-13", a.readAt ? "text-ink" : "font-medium")}>{a.title}</span>
                          {a.kind === "page_change" ? (
                            <span className="num shrink-0 text-11">
                              <span className="text-emerald">+{a.payload.added ?? 0}</span> <span className="text-faint">/</span> <span className="text-high">-{a.payload.removed ?? 0}</span>
                            </span>
                          ) : null}
                          {a.kind === "review" && a.payload.rating !== undefined ? <Rating value={a.payload.rating} className="shrink-0 text-11" /> : null}
                          {!a.readAt ? <span className="size-1.5 shrink-0 rounded-full bg-emerald" role="img" aria-label="Unread" /> : null}
                        </span>
                        <span className="flex items-center gap-1.5 text-12 text-mute">
                          <span className={cn("shrink-0 text-11 font-medium", a.severity === "high" ? "text-high" : a.severity === "medium" ? "text-medium" : "text-low")}>{SEV_LABEL[a.severity]}</span>
                          <span className="min-w-0 truncate">
                            {m?.name ?? "Monitor"}
                            {a.domain ? ` · ${a.domain}` : ""}
                          </span>
                          <span className="ml-auto shrink-0 text-11 tabular-nums" title={a.createdAt}>
                            {relative(a.createdAt, at)}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
          {visible.length > 0 && !noMore ? (
            <div className="p-3">
              <Button className="w-full" onClick={loadOlder} disabled={loadingOlder}>
                {loadingOlder ? "Loading..." : "Load older"}
              </Button>
            </div>
          ) : null}
          {visible.length > 0 ? (
            <p className="hidden items-center gap-1.5 px-4 py-3 text-11 text-faint md:flex">
              <Kbd>j</Kbd>
              <Kbd>k</Kbd> move <Kbd>e</Kbd> done <Kbd>h</Kbd> snooze <Kbd>u</Kbd> unread <Kbd>?</Kbd> all keys
            </p>
          ) : null}
        </div>
        <section aria-label="Selected alert" aria-busy={pending} className={cn("scroll-thin hidden min-w-0 flex-1 overflow-y-auto bg-panel transition-opacity duration-100 md:block", pending && "opacity-60")}>
          {sel ? children : <Empty title="No alert selected" note="Pick an alert from the list to read it here." />}
        </section>
      </div>
    </div>
  );
}
