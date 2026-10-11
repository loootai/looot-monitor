"use client";

import * as React from "react";
import { Copy, Download, Monitor as Desktop, Moon, Smartphone, Sun } from "lucide-react";
import { Empty } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Field, Select } from "@/components/ui/input";
import { Badge, Segmented } from "@/components/ui/misc";
import { useToast } from "@/components/ui/toast";
import { SEV_LABEL } from "@/components/visuals";
import { renderDigest, type DigestOptions } from "@/lib/digest";
import type { Alert, Severity } from "@/lib/types";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/apiFetch";

interface Props {
  alerts: Alert[];
  monitors: { id: string; name: string }[];
  changes: NonNullable<DigestOptions["changes"]>;
  periods: Record<"daily" | "weekly", { from: string; to: string; spendMicros: number }>;
  initial: { period: "daily" | "weekly"; severities: Severity[]; hour: number };
}

/** Controls on the left, the rendered email on the right. The HTML comes from renderDigest, the same function a sender would use. */
export function DigestClient({ alerts, monitors, changes, periods, initial }: Props) {
  const toast = useToast();
  const [period, setPeriod] = React.useState(initial.period);
  const [severities, setSeverities] = React.useState<Severity[]>(initial.severities);
  const [picked, setPicked] = React.useState<string[]>([]);
  const [hour, setHour] = React.useState(initial.hour);
  const [width, setWidth] = React.useState<"desktop" | "phone">("desktop");
  const [theme, setTheme] = React.useState<"light" | "dark">("light");

  const digest = React.useMemo(
    () => renderDigest(alerts, { period, from: periods[period].from, to: periods[period].to, severities, monitorIds: picked, monitorNames: Object.fromEntries(monitors.map((m) => [m.id, m.name])), spendMicros: periods[period].spendMicros, theme, changes }),
    [alerts, period, periods, severities, picked, monitors, theme, changes],
  );

  const save = (patch: Record<string, unknown>) => void apiFetch("/api/settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) }).catch(() => {});
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(digest.html);
      toast({ text: "HTML copied" });
    } catch {
      toast({ text: "Could not copy. Use Download instead.", tone: "error" });
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([digest.html], { type: "text/html" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `looot-monitor-digest-${periods[period].to.slice(0, 10)}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="grid min-h-full lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="space-y-5 border-b border-line bg-panel p-4 md:p-6 lg:border-b-0 lg:border-r">
        <div className="flex flex-col gap-1.5">
          <span className="text-12 font-medium">Period</span>
          <Segmented
            label="Period"
            value={period}
            onChange={(v) => {
              setPeriod(v);
              save({ digestPeriod: v });
            }}
            options={[
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
            className="self-start"
          />
        </div>
        <fieldset>
          <legend className="text-12 font-medium">Severities to include</legend>
          <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1">
            {(["high", "medium", "low"] as Severity[]).map((s) => (
              <label key={s} className="flex h-9 cursor-pointer items-center gap-2 md:h-7">
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--brand)]"
                  checked={severities.includes(s)}
                  onChange={(e) => {
                    const next = e.target.checked ? [...severities, s] : severities.filter((x) => x !== s);
                    setSeverities(next);
                    save({ digestSeverities: next });
                  }}
                />
                {SEV_LABEL[s]}
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset>
          <legend className="flex w-full items-center justify-between text-12 font-medium">
            Monitors
            <button type="button" className="font-normal text-link underline-offset-2 hover:underline" onClick={() => setPicked([])}>
              {picked.length === 0 ? "All included" : "Include all"}
            </button>
          </legend>
          <div className="scroll-thin mt-1.5 max-h-56 overflow-y-auto rounded-control border border-line">
            {monitors.map((m) => (
              <label key={m.id} className="flex h-9 cursor-pointer items-center gap-2 border-b border-line px-2 last:border-0 hover:bg-hover md:h-8">
                <input type="checkbox" className="size-3.5 shrink-0 accent-[var(--brand)]" checked={picked.length === 0 || picked.includes(m.id)} onChange={(e) => setPicked((cur) => (cur.length === 0 ? monitors.map((x) => x.id).filter((x) => x !== m.id) : e.target.checked ? [...cur, m.id] : cur.filter((x) => x !== m.id)))} />
                <span className="truncate">{m.name}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <Field label="Send hour, UTC" htmlFor="d-hour" help="Stored with your settings. Sending comes later: for now copy or download the HTML.">
          <div className="flex items-center gap-2">
            <Select
              id="d-hour"
              className="num w-28"
              value={hour}
              onChange={(e) => {
                setHour(Number(e.target.value));
                save({ digestHour: Number(e.target.value) });
              }}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <option key={h} value={h}>
                  {String(h).padStart(2, "0")}:00
                </option>
              ))}
            </Select>
            <Badge>sending comes later</Badge>
          </div>
        </Field>
        <div className="flex flex-wrap gap-2 border-t border-line pt-4">
          <Button variant="primary" onClick={copy} disabled={digest.total === 0}>
            <Copy /> Copy HTML
          </Button>
          <Button onClick={download} disabled={digest.total === 0}>
            <Download /> Download .html
          </Button>
        </div>
      </aside>

      <section aria-label="Email preview" className="min-w-0 p-4 md:p-6">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="text-11 text-mute">Subject</p>
            <p className="truncate font-medium">{digest.subject}</p>
          </div>
          <div className="flex gap-2">
            <Segmented
              label="Preview width"
              value={width}
              onChange={setWidth}
              options={[
                { value: "desktop", label: (<><Desktop className="size-3.5" aria-hidden /> 600</>) },
                { value: "phone", label: (<><Smartphone className="size-3.5" aria-hidden /> 375</>) },
              ]}
            />
            <Segmented
              label="Preview theme"
              value={theme}
              onChange={setTheme}
              options={[
                { value: "light", label: (<><Sun className="size-3.5" aria-hidden /> Light</>) },
                { value: "dark", label: (<><Moon className="size-3.5" aria-hidden /> Dark</>) },
              ]}
            />
          </div>
        </div>
        {digest.total === 0 ? (
          <div className="rounded-panel border border-line bg-panel">
            <Empty title={digest.text} note="Widen the period or include more severities." />
          </div>
        ) : (
          <div className={cn("mx-auto overflow-hidden rounded-panel border border-line transition-[max-width] duration-100", width === "desktop" ? "max-w-[648px]" : "max-w-[375px]")}>
            <iframe title="Digest email preview" sandbox="" srcDoc={digest.html} className="block h-[calc(100dvh-200px)] min-h-[480px] w-full bg-panel" />
          </div>
        )}
      </section>
    </div>
  );
}
