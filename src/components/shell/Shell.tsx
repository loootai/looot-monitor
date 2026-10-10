"use client";

import * as React from "react";
import { AppShell, type ShellNavSection } from "@/components/AppShell";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { LogOut, Monitor as MonitorIcon, Search, Settings as SettingsIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/misc";
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, TooltipProvider, Tip } from "@/components/ui/overlay";
import { ToastProvider } from "@/components/ui/toast";
import { usd } from "@/lib/money";
import type { MonitorStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface ShellData {
  demo: boolean;
  user: { name: string; email: string; workspace: string };
  monitors: { id: string; name: string; status: MonitorStatus; unread: number }[];
  openCount: number;
  unreadCount: number;
  monthMicros: number;
  capMicros: number;
  monthLabel: string;
}

/** Sidebar nav. The Monitors item carries the monitor list with unread counts. */
function navFor(data: ShellData): ShellNavSection[] {
  return [
    {
      items: [
        { href: "/", label: "Inbox", icon: "inbox", also: ["/alerts"], badge: data.unreadCount },
        { href: "/monitors", label: "Monitors", icon: "radar", sub: { items: data.monitors.map((m) => ({ href: `/monitors/${m.id}`, label: m.name, badge: m.unread })), max: 8 } },
        { href: "/digest", label: "Digest", icon: "mail" },
        { href: "/spend", label: "Spend", icon: "wallet" },
        { href: "/settings", label: "Settings", icon: "settings" },
      ],
    },
  ];
}

/** Go-to shortcuts and the palette entries share these. */
const GO: { href: string; label: string; keys: string }[] = [
  { href: "/", label: "Inbox", keys: "g i" },
  { href: "/monitors", label: "Monitors", keys: "g m" },
  { href: "/digest", label: "Digest", keys: "g d" },
  { href: "/spend", label: "Spend", keys: "g s" },
  { href: "/settings", label: "Settings", keys: "" },
];

const KEYS: [string, string][] = [
  ["g i", "Go to Inbox"],
  ["g m", "Go to Monitors"],
  ["g d", "Go to Digest"],
  ["g s", "Go to Spend"],
  ["/", "Focus search"],
  ["⌘ K", "Command palette"],
  ["n", "New monitor"],
  ["j / k", "Next or previous alert"],
  ["Enter", "Open alert"],
  ["e", "Mark done"],
  ["h", "Snooze 24 hours"],
  ["u", "Toggle unread"],
  ["1 2 3", "Set severity high, medium, low"],
  ["o", "Open source in a new tab"],
  ["x", "Select, Shift+j extends"],
  ["?", "This list"],
];

function titleFor(path: string): string {
  if (path === "/") return "Inbox";
  if (path.startsWith("/alerts/")) return "Alert";
  if (path === "/monitors/new") return "New monitor";
  if (path.endsWith("/edit")) return "Edit monitor";
  if (path.startsWith("/monitors/")) return "Monitor";
  return GO.find((n) => n.href !== "/" && path.startsWith(n.href))?.label ?? "looot-monitor";
}

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", t);
  } catch {}
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
};

export function Shell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const [palette, setPalette] = React.useState(false);
  const [keys, setKeys] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const gAt = React.useRef(0);
  const flipTheme = React.useCallback(() => applyTheme(document.documentElement.classList.contains("dark") ? "light" : "dark"), []);

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette((v) => !v);
        return;
      }
      if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === "?") setKeys(true);
      else if (e.key === "n") router.push("/monitors/new");
      else if (e.key === "g") gAt.current = Date.now();
      else if (Date.now() - gAt.current < 1200) {
        const to = { i: "/", m: "/monitors", d: "/digest", s: "/spend" }[e.key];
        gAt.current = 0;
        if (to) {
          e.preventDefault();
          router.push(to);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const signOut = async () => {
    if (!data.demo) {
      const { browserSupabase } = await import("@/lib/supabase/browser");
      await browserSupabase().auth.signOut();
    }
    router.push("/login");
  };

  return (
    <TooltipProvider>
      <ToastProvider>
        <AppShell
          appName="looot-monitor"
          githubHref="https://github.com/loootai/looot-monitor"
          nav={navFor(data)}
          demoLabel={data.demo ? "Demo data, fixed clock, no looot call" : undefined}
          spend={{ label: `${data.monthLabel} spend, cap ${usd(data.capMicros)}`, spent: usd(data.monthMicros), ratio: data.capMicros > 0 ? data.monthMicros / data.capMicros : 0 }}
          primaryAction={{ href: "/monitors/new", label: "New monitor" }}
        >
          <div className="flex h-[calc(100dvh-56px)] flex-col lg:h-[calc(100dvh-52px)]">
            <h1 className="sr-only">{titleFor(path)}</h1>
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 md:px-4">
              <form
                role="search"
                className="relative min-w-0 flex-1 sm:max-w-sm"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchRef.current?.value.trim() ?? "";
                  router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
                }}
              >
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
                <input ref={searchRef} name="q" defaultValue={path === "/" ? (params.get("q") ?? "") : ""} aria-label="Search alerts" placeholder="Search alerts" className="h-9 w-full rounded-control border border-line bg-page pl-7 pr-8 text-13 hover:border-line-strong focus-visible:border-emerald focus-visible:outline-offset-0" />
                <Kbd className="pointer-events-none absolute right-1.5 top-1/2 hidden -translate-y-1/2 sm:inline-flex">/</Kbd>
              </form>
              <div className="ml-auto flex items-center gap-0.5">
                <Tip label="Command palette (⌘K)" side="bottom">
                  <Button variant="ghost" size="icon" aria-label="Open command palette" onClick={() => setPalette(true)} className="hidden sm:inline-flex">
                    <span className="num text-11 text-mute">⌘K</span>
                  </Button>
                </Tip>
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" aria-label="Account menu" className="ml-1 flex size-9 items-center justify-center rounded-full bg-brand text-11 font-medium text-brand-ink">
                      {data.user.name
                        .split(/\s+/)
                        .map((w) => w[0])
                        .slice(0, 2)
                        .join("")
                        .toUpperCase()}
                    </button>
                  </MenuTrigger>
                  <MenuContent>
                    <MenuLabel>
                      <span className="block text-13 font-medium text-ink">{data.user.name}</span>
                      <span className="block">{data.user.workspace}</span>
                    </MenuLabel>
                    <MenuSeparator />
                    <MenuItem onSelect={() => router.push("/settings")}>
                      <SettingsIcon /> Settings
                    </MenuItem>
                    <MenuItem onSelect={() => applyTheme("system")}>
                      <MonitorIcon /> Use system theme
                    </MenuItem>
                    <MenuItem onSelect={() => setKeys(true)}>
                      <span className="num flex size-4 items-center justify-center text-mute">?</span> Keyboard shortcuts
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem onSelect={signOut}>
                      <LogOut /> {data.demo ? "Leave the demo" : "Sign out"}
                    </MenuItem>
                  </MenuContent>
                </Menu>
              </div>
            </div>
            <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">{children}</div>
          </div>
        </AppShell>

        <Dialog open={keys} onOpenChange={setKeys}>
          <DialogContent title="Keyboard shortcuts" description="Every shortcut also has a visible control.">
            <dl className="grid grid-cols-1 gap-x-6 px-4 py-3 sm:grid-cols-2">
              {KEYS.map(([k, label]) => (
                <div key={k} className="flex h-8 items-center justify-between gap-3 border-b border-line last:border-0">
                  <dt className="text-mute">{label}</dt>
                  <dd className="flex gap-1">
                    {k.split(" ").map((p, i) => (p === "/" && k.length > 1 ? <span key={i} className="text-faint">/</span> : <Kbd key={i}>{p}</Kbd>))}
                  </dd>
                </div>
              ))}
            </dl>
          </DialogContent>
        </Dialog>

        <Palette open={palette} onOpenChange={setPalette} data={data} onKeys={() => setKeys(true)} onTheme={flipTheme} />
      </ToastProvider>
    </TooltipProvider>
  );
}

function Palette({ open, onOpenChange, data, onKeys, onTheme }: { open: boolean; onOpenChange: (v: boolean) => void; data: ShellData; onKeys: () => void; onTheme: () => void }) {
  const router = useRouter();
  const [q, setQ] = React.useState("");
  const [at, setAt] = React.useState(0);
  const items = React.useMemo(() => {
    const go = (href: string) => () => router.push(href);
    const all = [
      ...GO.map((n) => ({ label: n.label, hint: n.keys, group: "Go to", run: go(n.href) })),
      { label: "New monitor", hint: "n", group: "Actions", run: go("/monitors/new") },
      { label: "Toggle theme", hint: "", group: "Actions", run: onTheme },
      { label: "Keyboard shortcuts", hint: "?", group: "Actions", run: onKeys },
      ...data.monitors.map((m) => ({ label: m.name, hint: "", group: "Monitors", run: go(`/monitors/${m.id}`) })),
    ];
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((i) => i.label.toLowerCase().includes(needle)) : all;
  }, [q, data.monitors, router, onKeys, onTheme]);
  const pick = (i: number) => {
    const item = items[i];
    if (!item) return;
    onOpenChange(false);
    setQ("");
    item.run();
  };
  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        onOpenChange(v);
        if (!v) setQ("");
        setAt(0);
      }}
    >
      <DialogContent title="Command palette" hideTitle className="max-w-xl">
        <div className="flex items-center gap-2 border-b border-line px-3">
          <Search className="size-4 text-faint" aria-hidden />
          <input
            autoFocus
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setAt(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setAt((i) => Math.min(items.length - 1, i + 1));
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                setAt((i) => Math.max(0, i - 1));
              } else if (e.key === "Enter") {
                e.preventDefault();
                pick(at);
              }
            }}
            aria-label="Type a command or a monitor name"
            placeholder="Type a command or a monitor name"
            className="h-11 flex-1 bg-transparent text-14 outline-none"
          />
          <Kbd>esc</Kbd>
        </div>
        <ul role="listbox" aria-label="Commands" className="scroll-thin max-h-80 overflow-y-auto p-1">
          {items.length === 0 ? <li className="px-3 py-6 text-center text-mute">Nothing matches &quot;{q}&quot;</li> : null}
          {items.map((it, i) => (
            <li key={`${it.group}-${it.label}`} role="option" aria-selected={i === at}>
              {i === 0 || items[i - 1].group !== it.group ? <div className="px-2 pb-1 pt-2 text-11 text-mute">{it.group}</div> : null}
              <button type="button" onMouseEnter={() => setAt(i)} onClick={() => pick(i)} className={cn("flex h-9 w-full items-center justify-between rounded-[4px] px-2 text-left", i === at && "bg-hover")}>
                <span className="truncate">{it.label}</span>
                {it.hint ? (
                  <span className="flex gap-1">
                    {it.hint.split(" ").map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
