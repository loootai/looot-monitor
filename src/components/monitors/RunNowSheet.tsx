"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Play } from "lucide-react";
import { QuoteLines } from "@/components/monitors/QuoteLines";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/misc";
import { Dialog, DialogContent } from "@/components/ui/overlay";
import { IS_DEMO, dateTime } from "@/lib/clock";
import { usdPrecise } from "@/lib/money";
import type { Quote } from "@/lib/quote";
import type { RunOutcome } from "@/lib/runner";
import type { Monitor } from "@/lib/types";
import { apiFetch } from "@/lib/apiFetch";

type Phase = { step: "quote" } | { step: "running" } | { step: "done"; outcome: RunOutcome } | { step: "error"; message: string };

/**
 * The confirm step before a paid run. It shows the quote lines and the max cost, and nothing is
 * called until the button is pressed. The id made here is the idempotency key of the run.
 */
export function RunNowSheet({ monitor, open, onOpenChange, canRun }: { monitor: Pick<Monitor, "id" | "name" | "kind" | "config" | "schedule" | "maxCostPerRunMicros"> | null; open: boolean; onOpenChange: (v: boolean) => void; canRun: boolean }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {monitor && open ? <Body key={monitor.id} monitor={monitor} canRun={canRun} close={() => onOpenChange(false)} /> : null}
    </Dialog>
  );
}

function Body({ monitor, canRun, close }: { monitor: NonNullable<Parameters<typeof RunNowSheet>[0]["monitor"]>; canRun: boolean; close: () => void }) {
  const router = useRouter();
  const [confirmId] = React.useState(() => crypto.randomUUID());
  const [quote, setQuote] = React.useState<Quote | null>(null);
  const [quoteError, setQuoteError] = React.useState<string | null>(null);
  const [max, setMax] = React.useState((monitor.maxCostPerRunMicros / 1_000_000).toString());
  const [phase, setPhase] = React.useState<Phase>({ step: "quote" });

  React.useEffect(() => {
    let live = true;
    apiFetch("/api/quote", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: monitor.kind, config: monitor.config, schedule: monitor.schedule }) })
      .then(async (r) => {
        const data = await r.json();
        if (!live) return;
        if (r.ok) setQuote(data as Quote);
        else setQuoteError((data as { error?: string }).error ?? "The quote could not be loaded.");
      })
      .catch(() => live && setQuoteError("The quote could not be loaded."));
    return () => {
      live = false;
    };
  }, [monitor]);

  const maxMicros = Math.round(Number(max) * 1_000_000);
  const validMax = Number.isFinite(maxMicros) && maxMicros > 0;
  const tooLow = quote !== null && validMax && maxMicros < quote.maxPerRunMicros;

  const run = async () => {
    setPhase({ step: "running" });
    try {
      const res = await apiFetch(`/api/monitors/${monitor.id}/run`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ confirmId, maxCostMicros: maxMicros }) });
      const data = (await res.json()) as { outcome?: RunOutcome; error?: string };
      if (!res.ok || !data.outcome) throw new Error(data.error ?? `The run failed (${res.status})`);
      setPhase({ step: "done", outcome: data.outcome });
      router.refresh();
    } catch (e) {
      setPhase({ step: "error", message: (e as Error).message });
    }
  };

  return (
    <DialogContent title={`Run ${monitor.name} now`} description="Nothing is called until you confirm." side="right">
      <div className="scroll-thin flex-1 space-y-5 overflow-y-auto p-4">
        {IS_DEMO ? <p className="rounded-control border border-amber bg-amber-soft px-3 py-2 text-12 text-ink">Demo data. This plays a recorded fixture. No looot call is made and nothing is charged.</p> : null}
        {quoteError ? (
          <p role="alert" className="text-high">
            {quoteError}
          </p>
        ) : quote ? (
          <>
            <QuoteLines quote={quote} />
            <p className="num text-11 text-mute">
              Prices as of {dateTime(quote.pricesAsOf)} UTC{quote.priceSource === "fallback" ? ", from the fallback table. The catalog could not be read." : ""}
            </p>
          </>
        ) : (
          <div className="space-y-2" aria-busy="true">
            <Skeleton className="h-6" />
            <Skeleton className="h-6" />
            <Skeleton className="h-6 w-2/3" />
          </div>
        )}
        <Field label="Max cost for this run, in dollars" htmlFor="run-max" error={!validMax ? "Enter an amount above zero" : undefined} help={tooLow ? `Below the quote of ${usdPrecise(quote!.maxPerRunMicros)}. The run will be refused and nothing will be called.` : "The run is refused if the live price is above this."}>
          <Input id="run-max" inputMode="decimal" className="num" value={max} onChange={(e) => setMax(e.target.value)} aria-invalid={!validMax} />
        </Field>
        <div aria-live="polite">
          {phase.step === "done" ? <Outcome outcome={phase.outcome} /> : null}
          {phase.step === "error" ? (
            <p role="alert" className="rounded-control border border-high bg-high-soft px-3 py-2 text-12">
              {phase.message}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 border-t border-line p-3">
        <Button onClick={close}>{phase.step === "done" ? "Close" : "Cancel"}</Button>
        {phase.step !== "done" ? (
          <Button variant="primary" disabled={!quote || !validMax || !canRun || phase.step === "running"} onClick={run}>
            <Play /> {phase.step === "running" ? "Running..." : `Run now, up to ${validMax ? usdPrecise(maxMicros) : "$0"}`}
          </Button>
        ) : null}
      </div>
      {!canRun ? <p className="border-t border-line px-4 py-2 text-12 text-mute">The looot token is not set on the server, so runs are off. See Settings.</p> : null}
    </DialogContent>
  );
}

function Outcome({ outcome }: { outcome: RunOutcome }) {
  if (outcome.status !== "ran") {
    return <p className="rounded-control border border-amber bg-amber-soft px-3 py-2 text-12">{outcome.status === "duplicate" ? "This run was already made. Nothing was charged." : `Refused: ${outcome.message ?? outcome.status}. No call was made.`}</p>;
  }
  return (
    <div className="rounded-control border border-line px-3 py-2 text-12">
      <p className="font-medium">
        {outcome.newAlerts === 0 ? "Nothing new" : `${outcome.newAlerts} new ${outcome.newAlerts === 1 ? "alert" : "alerts"}`}
        <span className="num font-normal text-mute"> · cost {usdPrecise(outcome.costMicros)}</span>
      </p>
      <ul className="num mt-1 space-y-0.5 text-11 text-mute">
        {outcome.calls.map((c) => (
          <li key={c.source}>
            {c.source}: {c.status}
            {c.errorCode ? ` (${c.errorCode})` : `, ${c.newItems} new`}
          </li>
        ))}
      </ul>
    </div>
  );
}
