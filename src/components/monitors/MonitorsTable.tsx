"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, Copy, Ellipsis, Pause, Pencil, Play, Plus, Search, Trash2 } from "lucide-react";
import { RunNowSheet } from "@/components/monitors/RunNowSheet";
import { Empty } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Table, Td, Th } from "@/components/ui/misc";
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/overlay";
import { useToast } from "@/components/ui/toast";
import { CapBar, KIND_NAME, SourceIcon, STATUS_LABEL, StatusDot } from "@/components/visuals";
import { relative } from "@/lib/clock";
import { usd } from "@/lib/money";
import { SCHEDULE_LABEL } from "@/lib/schedule";
import type { Monitor, MonitorKind, MonitorStatus, SourceId } from "@/lib/types";
import { targetOf } from "@/lib/monitorText";
import { cn, middle } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

export interface MonitorRow extends Monitor {
  sources: SourceId[];
  openAlerts: number;
  monthMicros: number;
  lastResult: string;
}

type SortKey = "name" | "lastRunAt" | "openAlerts" | "monthMicros";


async function call(url: string, method: string, body?: unknown) {
  const res = await apiFetch(url, { method, headers: body ? { "Content-Type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? `Request failed (${res.status})`);
  return res.json();
}

function StatusCell({ m }: { m: MonitorRow }) {
  if (m.status === "active") return null;
  return (
    <span className={cn("text-11", m.status === "failing" ? "text-high" : m.status === "paused_budget" ? "text-amber" : "text-mute")}>
      {STATUS_LABEL[m.status]}
      {m.status === "failing" && m.lastErrorCode ? <span className="num"> · {m.lastErrorCode}</span> : null}
      {m.status === "paused_budget" ? (
        <>
          {" · "}
          <Link href={`/monitors/${m.id}/edit#budget`} onClick={(e) => e.stopPropagation()} className="text-link underline underline-offset-2">
            Raise cap
          </Link>
        </>
      ) : null}
    </span>
  );
}

/** The monitors table with search, filters, sort, bulk pause and the row menu. Stacked rows on phones. */
/** Columns that only fit beside the rail on wide screens. Each value is also on the monitor page. */
const WIDE = "hidden min-[1400px]:table-cell";

export function MonitorsTable({ rows, canRun, initialRunId }: { rows: MonitorRow[]; canRun: boolean; initialRunId?: string }) {
  const router = useRouter();
  const toast = useToast();
  const [q, setQ] = React.useState("");
  const [kind, setKind] = React.useState<MonitorKind | "all">("all");
  const [status, setStatus] = React.useState<MonitorStatus | "all">("all");
  const [sort, setSort] = React.useState<{ key: SortKey; dir: 1 | -1 }>({ key: "monthMicros", dir: -1 });
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const [running, setRunning] = React.useState<MonitorRow | null>(() => rows.find((m) => m.id === initialRunId) ?? null);
  const [deleting, setDeleting] = React.useState<MonitorRow | null>(null);

  const visible = React.useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = rows.filter((m) => (kind === "all" || m.kind === kind) && (status === "all" || m.status === status) && (!needle || `${m.name} ${targetOf(m)}`.toLowerCase().includes(needle)));
    return [...list].sort((a, b) => {
      const av = sort.key === "name" ? a.name.toLowerCase() : (a[sort.key] ?? "");
      const bv = sort.key === "name" ? b.name.toLowerCase() : (b[sort.key] ?? "");
      return (av < bv ? -1 : av > bv ? 1 : 0) * sort.dir;
    });
  }, [rows, q, kind, status, sort]);

  const act = async (fn: () => Promise<unknown>, done: string) => {
    try {
      await fn();
      toast({ text: done });
      router.refresh();
    } catch (e) {
      toast({ text: (e as Error).message, tone: "error" });
    }
  };
  const setPaused = (ids: string[], paused: boolean) => act(() => Promise.all(ids.map((id) => call(`/api/monitors/${id}`, "PATCH", { status: paused ? "paused" : "active" }))), `${ids.length} ${ids.length === 1 ? "monitor" : "monitors"} ${paused ? "paused" : "resumed"}`).then(() => setPicked(new Set()));
  const duplicate = (m: MonitorRow) =>
    act(() => call("/api/monitors", "POST", { name: `${m.name} copy`, kind: m.kind, ownerTag: m.ownerTag, competitorName: m.competitorName, config: m.config, schedule: m.schedule, runHour: m.runHour, maxCostPerRunMicros: m.maxCostPerRunMicros, monthlyCapMicros: m.monthlyCapMicros }), "Monitor duplicated");

  const sortTh = (k: SortKey, label: string, className?: string) => (
    <Th className={className} aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
      <button type="button" onClick={() => setSort((cur) => ({ key: k, dir: cur.key === k ? (cur.dir === 1 ? -1 : 1) : k === "name" ? 1 : -1 }))} className="inline-flex items-center gap-1 hover:text-ink">
        {label}
        {sort.key === k ? sort.dir === 1 ? <ArrowUp className="size-3" aria-hidden /> : <ArrowDown className="size-3" aria-hidden /> : null}
      </button>
    </Th>
  );

  const menu = (m: MonitorRow) => (
    <Menu>
      <MenuTrigger asChild>
        <Button variant="ghost" size="icon" aria-label={`Actions for ${m.name}`} onClick={(e) => e.stopPropagation()} className="md:size-7">
          <Ellipsis />
        </Button>
      </MenuTrigger>
      <MenuContent onClick={(e) => e.stopPropagation()}>
        <MenuItem onSelect={() => setRunning(m)}>
          <Play /> Run now
        </MenuItem>
        {m.status === "paused" || m.status === "paused_budget" ? (
          <MenuItem onSelect={() => setPaused([m.id], false)}>
            <Play /> Resume
          </MenuItem>
        ) : (
          <MenuItem onSelect={() => setPaused([m.id], true)}>
            <Pause /> Pause
          </MenuItem>
        )}
        <MenuItem onSelect={() => router.push(`/monitors/${m.id}/edit`)}>
          <Pencil /> Edit
        </MenuItem>
        <MenuItem onSelect={() => duplicate(m)}>
          <Copy /> Duplicate
        </MenuItem>
        <MenuSeparator />
        <MenuItem danger onSelect={() => setDeleting(m)}>
          <Trash2 /> Delete
        </MenuItem>
      </MenuContent>
    </Menu>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line bg-panel px-4 py-2 md:px-6">
        <div className="relative min-w-40 flex-1 md:max-w-xs">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
          <Input aria-label="Search monitors" placeholder="Search monitors" value={q} onChange={(e) => setQ(e.target.value)} className="pl-7" />
        </div>
        <Select aria-label="Filter by type" value={kind} onChange={(e) => setKind(e.target.value as MonitorKind | "all")} className="w-auto">
          <option value="all">All types</option>
          {(Object.keys(KIND_NAME) as MonitorKind[]).map((k) => (
            <option key={k} value={k}>
              {KIND_NAME[k]}
            </option>
          ))}
        </Select>
        <Select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value as MonitorStatus | "all")} className="w-auto">
          <option value="all">All statuses</option>
          {(Object.keys(STATUS_LABEL) as MonitorStatus[]).map((s) => (
            <option key={s} value={s}>
              {STATUS_LABEL[s]}
            </option>
          ))}
        </Select>
        {picked.size > 0 ? (
          <div className="flex items-center gap-2 text-12">
            <span className="font-medium text-link">{picked.size} selected</span>
            <Button size="sm" onClick={() => setPaused([...picked], true)}>
              <Pause /> Pause
            </Button>
            <Button size="sm" onClick={() => setPaused([...picked], false)}>
              <Play /> Resume
            </Button>
          </div>
        ) : null}
        <Button asChild variant="primary" className="ml-auto">
          <Link href="/monitors/new">
            <Plus /> New monitor
          </Link>
        </Button>
      </div>

      {visible.length === 0 ? (
        <Empty title="No monitor matches" note="Change the search or the filters.">
          <Button
            size="sm"
            onClick={() => {
              setQ("");
              setKind("all");
              setStatus("all");
            }}
          >
            Clear filters
          </Button>
        </Empty>
      ) : (
        <>
          <div className="relative hidden overflow-x-auto bg-panel lg:block">
            <Table className="[&_td]:px-2 [&_th]:px-2">
              <caption className="sr-only">Monitors</caption>
              <thead>
                <tr>
                  <Th className="w-8 pr-0">
                    <input type="checkbox" aria-label="Select all monitors" className="size-3.5 accent-[var(--brand)]" checked={picked.size === visible.length} onChange={(e) => setPicked(e.target.checked ? new Set(visible.map((m) => m.id)) : new Set())} />
                  </Th>
                  {sortTh("name", "Name")}
                  <Th className={WIDE}>Type</Th>
                  <Th>Target</Th>
                  <Th className={WIDE}>Sources</Th>
                  <Th className="hidden xl:table-cell">Schedule</Th>
                  {sortTh("lastRunAt", "Last run")}
                  <Th className={WIDE}>Next run</Th>
                  {sortTh("openAlerts", "Open", "text-right")}
                  {sortTh("monthMicros", "Month / cap")}
                  <Th className="w-10">
                    <span className="sr-only">Actions</span>
                  </Th>
                </tr>
              </thead>
              <tbody>
                {visible.map((m) => (
                  <tr key={m.id} onClick={() => router.push(`/monitors/${m.id}`)} className={cn("cursor-pointer hover:bg-hover", picked.has(m.id) && "bg-brand-soft")}>
                    <Td className="pr-0" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label={`Select ${m.name}`} className="size-3.5 accent-[var(--brand)]" checked={picked.has(m.id)} onChange={() => setPicked((p) => (p.has(m.id) ? new Set([...p].filter((x) => x !== m.id)) : new Set(p).add(m.id)))} />
                    </Td>
                    <Td className="max-w-52">
                      <span className="flex items-center gap-2">
                        <StatusDot status={m.status} />
                        <span className="min-w-0">
                          <Link href={`/monitors/${m.id}`} onClick={(e) => e.stopPropagation()} className="block truncate font-medium hover:underline">
                            {m.name}
                          </Link>
                          <StatusCell m={m} />
                        </span>
                      </span>
                    </Td>
                    <Td className={cn(WIDE, "whitespace-nowrap text-mute")}>{KIND_NAME[m.kind]}</Td>
                    <Td className="num max-w-44 truncate text-12 text-mute" title={targetOf(m)}>
                      {middle(targetOf(m), 26)}
                    </Td>
                    <Td className={WIDE}>
                      <span className="flex gap-1.5">
                        {m.sources.map((s) => (
                          <SourceIcon key={s} source={s} className="size-3.5" />
                        ))}
                      </span>
                    </Td>
                    <Td className="hidden whitespace-nowrap text-mute xl:table-cell">{SCHEDULE_LABEL[m.schedule]}</Td>
                    <Td className="whitespace-nowrap">
                      <span className="tabular-nums">{relative(m.lastRunAt)}</span>
                      <span className={cn("block text-11", m.lastResult.startsWith("failed") ? "text-high" : "text-mute")}>{m.lastResult}</span>
                    </Td>
                    <Td className={cn(WIDE, "whitespace-nowrap tabular-nums text-mute")}>{m.status === "paused" ? "paused" : relative(m.nextRunAt)}</Td>
                    <Td className="num text-right">{m.openAlerts}</Td>
                    <Td>
                      <span className="flex items-center gap-2">
                        <CapBar spent={m.monthMicros} cap={m.monthlyCapMicros} />
                        <span className="num whitespace-nowrap text-12">
                          {usd(m.monthMicros)} <span className="text-faint">/</span> <span className="text-mute">{usd(m.monthlyCapMicros)}</span>
                        </span>
                      </span>
                    </Td>
                    <Td className="pl-0" onClick={(e) => e.stopPropagation()}>
                      {menu(m)}
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
          <ul className="divide-y divide-line bg-panel lg:hidden">
            {visible.map((m) => (
              <li key={m.id} className="flex items-start gap-2 py-3 pl-4 pr-1">
                <div className="min-w-0 flex-1">
                  <Link href={`/monitors/${m.id}`} className="block">
                    <span className="flex items-center gap-2">
                      <StatusDot status={m.status} />
                      <span className="truncate font-medium">{m.name}</span>
                    </span>
                    <span className="num mt-0.5 block truncate text-12 text-mute">{targetOf(m)}</span>
                    <span className="mt-0.5 block text-12 text-mute">
                      {KIND_NAME[m.kind]} · {SCHEDULE_LABEL[m.schedule]} · {m.openAlerts} open
                    </span>
                  </Link>
                  <StatusCell m={m} />
                  <span className="mt-2 flex items-center gap-2">
                    <CapBar spent={m.monthMicros} cap={m.monthlyCapMicros} className="w-24" />
                    <span className="num text-12">
                      {usd(m.monthMicros)} <span className="text-faint">/</span> <span className="text-mute">{usd(m.monthlyCapMicros)}</span>
                    </span>
                  </span>
                </div>
                {menu(m)}
              </li>
            ))}
          </ul>
        </>
      )}

      <RunNowSheet monitor={running} open={running !== null} onOpenChange={(v) => !v && setRunning(null)} canRun={canRun} />
      <Dialog open={deleting !== null} onOpenChange={(v) => !v && setDeleting(null)}>
        <DialogContent title={`Delete ${deleting?.name ?? "monitor"}?`} description="Its alerts, runs and snapshots are deleted with it. This cannot be undone.">
          <div className="flex justify-end gap-2 p-3">
            <Button onClick={() => setDeleting(null)}>Cancel</Button>
            <Button
              variant="danger"
              onClick={() => {
                const id = deleting!.id;
                setDeleting(null);
                void act(() => call(`/api/monitors/${id}`, "DELETE"), "Monitor deleted");
              }}
            >
              <Trash2 /> Delete monitor
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
