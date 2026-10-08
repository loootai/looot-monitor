import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { FileDiff } from "lucide-react";
import { LoginForm } from "@/components/LoginForm";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/misc";
import { SeverityBar, SeverityTag } from "@/components/visuals";
import { IS_DEMO } from "@/lib/clock";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_configured: "Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, or run the demo with npm run demo.",
  missing_code: "That sign-in link is not complete. Ask for a new one.",
  auth_error: "Sign-in did not finish. Try again.",
};

const DIFF: { sign: "+" | "-" | " "; text: string }[] = [
  { sign: " ", text: "## Plans" },
  { sign: "-", text: "Studio: $29 /mo" },
  { sign: "+", text: "Studio: $35 /mo" },
  { sign: " ", text: "For solo designers and studios of up to five people." },
  { sign: "-", text: "Unlimited clients on every plan" },
  { sign: "+", text: "Up to 25 active clients on Studio" },
];

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const q = await searchParams;
  const configured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const error = q.error ? (ERRORS[q.error] ?? q.error) : !configured && !IS_DEMO ? ERRORS.not_configured : null;
  return (
    <main className="grid min-h-dvh grid-cols-[minmax(0,1fr)] lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
      <section className="flex min-w-0 flex-col justify-between gap-10 border-b border-line bg-panel px-6 py-8 lg:border-b-0 lg:border-r lg:px-14 lg:py-12">
        <div className="flex items-center gap-1">
          <Image src="/brand/looot-wordmark-1024.png" alt="looot" width={1024} height={353} priority className="-my-3 -ml-3 h-12 w-auto dark:brightness-0 dark:invert" />
          <span className="border-l border-line-strong pl-3 text-14 font-medium tracking-tight">monitor</span>
        </div>
        <div className="max-w-xl">
          <h1 className="text-balance text-[28px] font-semibold leading-9 tracking-tight">Know when your brand or a competitor changes on the web, and what each check costs.</h1>
          <p className="mt-3 max-w-[52ch] text-14 leading-[22px] text-mute">Mentions, Google results, page changes and reviews in one inbox. Every monitor shows its price per run before it runs and stops at the monthly cap you set.</p>
          <div className="mt-8 overflow-hidden rounded-panel border border-line" aria-label="Sample alert">
            <div className="relative flex h-14 items-center gap-3 border-b border-line bg-panel pl-4 pr-3">
              <SeverityBar severity="high" />
              <FileDiff className="size-4 shrink-0 text-mute" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium">Ledgerly pricing page: Studio $29 → $35, Team $79 → $89</p>
                <p className="flex items-center gap-1.5 text-12 text-mute">
                  <SeverityTag severity="high" className="text-11" /> <span className="truncate">Ledgerly pricing page · ledgerly.example</span>
                </p>
              </div>
              <span className="num shrink-0 text-11">
                <span className="text-emerald">+6</span> <span className="text-faint">/</span> <span className="text-high">-4</span>
              </span>
            </div>
            <div className="bg-panel py-1">
              {DIFF.map((l, i) => (
                <div key={i} className={l.sign === "+" ? "flex bg-add" : l.sign === "-" ? "flex bg-del" : "flex"}>
                  <span className={`num w-7 shrink-0 select-none text-center text-12 leading-5 ${l.sign === "+" ? "text-emerald" : l.sign === "-" ? "text-high" : "text-faint"}`}>{l.sign}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-12 leading-5">{l.text}</span>
                </div>
              ))}
            </div>
            <p className="num border-t border-line bg-page px-3 py-1.5 text-11 text-mute">Found by an hourly check. This run cost $0.0002.</p>
          </div>
        </div>
        <p className="text-12 text-mute">
          Open source, MIT. Built on{" "}
          <a href="https://looot.ai" className="text-link underline underline-offset-2">
            looot
          </a>
          . This is not the looot dashboard.
        </p>
      </section>

      <section className="flex min-w-0 items-center justify-center px-6 py-10 lg:px-14">
        <div className="w-full max-w-sm">
          <h2 className="text-20 font-semibold tracking-tight">{IS_DEMO ? "Demo workspace" : "Sign in"}</h2>
          {IS_DEMO ? (
            <>
              <p className="mt-1 text-mute">Ten monitors, sixty-four alerts and thirty days of runs for a made-up invoicing company. Nothing here calls looot or Supabase.</p>
              <Button asChild variant="primary" className="mt-5 w-full">
                <Link href="/">Open the demo workspace</Link>
              </Button>
              <p className="mt-3 flex items-center gap-2 text-12 text-mute">
                <Badge tone="amber">Demo data</Badge> The clock is fixed at Oct 8, 2026, 09:00 UTC.
              </p>
            </>
          ) : (
            <>
              <p className="mt-1 text-mute">Use a magic link or your GitHub account. Your monitors are private to you.</p>
              {error ? (
                <p role="alert" className="mt-4 rounded-control border border-high bg-high-soft px-3 py-2 text-12">
                  {error}
                </p>
              ) : null}
              <div className="mt-5">
                <LoginForm configured={configured} />
              </div>
            </>
          )}
        </div>
      </section>
    </main>
  );
}
