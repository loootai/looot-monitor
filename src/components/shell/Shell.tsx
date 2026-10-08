"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Ellipsis, Inbox, LogOut, Mail, Monitor as MonitorIcon, Moon, Plus, Radar, Search, Settings as SettingsIcon, Sun, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge, Kbd } from "@/components/ui/misc";
import { Dialog, DialogContent, Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger, TooltipProvider, Tip } from "@/components/ui/overlay";
import { ToastProvider } from "@/components/ui/toast";
import { CapBar, StatusDot } from "@/components/visuals";
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

const NAV = [
  { href: "/", label: "Inbox", icon: Inbox, keys: "g i" },
  { href: "/monitors", label: "Monitors", icon: Radar, keys: "g m" },
  { href: "/digest", label: "Digest", icon: Mail, keys: "g d" },
  { href: "/spend", label: "Spend", icon: Wallet, keys: "g s" },
  { href: "/settings", label: "Settings", icon: SettingsIcon, keys: "" },
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
  return NAV.find((n) => n.href !== "/" && path.startsWith(n.href))?.label ?? "looot-monitor";
}

type Theme = "light" | "dark" | "system";

function applyTheme(t: Theme) {
  const dark = t === "dark" || (t === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", t);
  } catch {}
  window.dispatchEvent(new CustomEvent("themechange"));
}

/** true while the page shows the dark theme. Follows the class on <html>. */
export function useIsDark(): boolean {
  return React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("themechange", cb);
      return () => window.removeEventListener("themechange", cb);
    },
    () => document.documentElement.classList.contains("dark"),
    () => false,
  );
}

const typing = (e: KeyboardEvent) => {
  const el = e.target as HTMLElement | null;
  return Boolean(el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable));
};

export function Shell({ data, children }: { data: ShellData; children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const params = useSearchParams();
  const dark = useIsDark();
  const [palette, setPalette] = React.useState(false);
  const [keys, setKeys] = React.useState(false);
  const [more, setMore] = React.useState(false);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const gAt = React.useRef(0);

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

  const active = (href: string) => (href === "/" ? path === "/" || path.startsWith("/alerts") : path.startsWith(href));
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
        <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-[70] focus:rounded-control focus:bg-panel focus:px-3 focus:py-2 focus:shadow-pop">
          Skip to content
        </a>
        <div className="flex h-dvh">
          <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-panel md:flex">
            <Link href="/" className="flex h-12 shrink-0 items-center gap-2 border-b border-line px-4">
              <Image src="/brand/looot-mark.svg" alt="looot" width={24} height={24} priority />
              <span className="text-13 font-medium tracking-tight">monitor</span>
            </Link>
            <nav aria-label="Main" className="flex flex-col gap-px p-2">
              {NAV.map((n) => (
                <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={cn("flex h-8 items-center gap-2 rounded-control px-2 text-mute transition-colors duration-100 hover:bg-hover hover:text-ink", active(n.href) && "bg-brand-soft font-medium text-link hover:bg-brand-soft hover:text-link")}>
                  <n.icon className="size-4" aria-hidden />
                  <span className="flex-1">{n.label}</span>
                  {n.href === "/" && data.unreadCount > 0 ? <span className="num text-11">{data.unreadCount}</span> : null}
                </Link>
              ))}
            </nav>
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="text-11 font-medium text-mute">Monitors</span>
              <Tip label="New monitor (n)">
                <Link href="/monitors/new" aria-label="New monitor" className="flex size-6 items-center justify-center rounded-control text-mute hover:bg-hover hover:text-ink">
                  <Plus className="size-3.5" />
                </Link>
              </Tip>
            </div>
            <nav aria-label="Monitors" className="scroll-thin flex min-h-0 flex-1 flex-col gap-px overflow-y-auto px-2 pb-2">
              {data.monitors.length === 0 ? <p className="px-2 py-1 text-12 text-faint">None yet</p> : null}
              {data.monitors.map((m) => (
                <Link key={m.id} href={`/monitors/${m.id}`} aria-current={path === `/monitors/${m.id}` ? "page" : undefined} className={cn("flex h-7 items-center gap-2 rounded-control px-2 text-12 text-mute hover:bg-hover hover:text-ink", path.startsWith(`/monitors/${m.id}`) && "bg-hover text-ink")}>
                  <StatusDot status={m.status} className="size-1.5" />
                  <span className="min-w-0 flex-1 truncate">{m.name}</span>
                  {m.unread > 0 ? <span className="num text-11 text-ink">{m.unread}</span> : null}
                </Link>
              ))}
            </nav>
            <Link href="/spend" className="block border-t border-line px-4 py-3 hover:bg-hover">
              <div className="flex items-baseline justify-between">
                <span className="text-11 text-mute">{data.monthLabel} spend</span>
                <span className="num text-11 text-mute">cap {usd(data.capMicros)}</span>
              </div>
              <div className="num mt-0.5 text-14 font-medium">{usd(data.monthMicros)}</div>
              <CapBar spent={data.monthMicros} cap={data.capMicros} className="mt-1.5 w-full" />
            </Link>
          </aside>

          <div className="flex min-w-0 flex-1 flex-col">
            <header className="flex h-12 shrink-0 items-center gap-2 border-b border-line bg-panel px-3 md:px-4">
              <Link href="/" className="md:hidden" aria-label="looot-monitor home">
                <Image src="/brand/looot-mark.svg" alt="" width={24} height={24} />
              </Link>
              <h1 className="truncate text-16 font-semibold tracking-tight">{titleFor(path)}</h1>
              {data.demo ? (
                <Tip label="Seeded data with a fixed clock. No looot call is made." side="bottom">
                  <Badge tone="amber" className="shrink-0" tabIndex={0}>
                    Demo data
                  </Badge>
                </Tip>
              ) : null}
              <form
                role="search"
                className="relative ml-auto hidden w-64 sm:block"
                onSubmit={(e) => {
                  e.preventDefault();
                  const q = searchRef.current?.value.trim() ?? "";
                  router.push(q ? `/?q=${encodeURIComponent(q)}` : "/");
                }}
              >
                <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-faint" aria-hidden />
                <input ref={searchRef} name="q" defaultValue={path === "/" ? (params.get("q") ?? "") : ""} aria-label="Search alerts" placeholder="Search alerts" className="h-8 w-full rounded-control border border-line bg-page pl-7 pr-8 text-13 hover:border-line-strong focus-visible:border-emerald focus-visible:outline-offset-0" />
                <Kbd className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2">/</Kbd>
              </form>
              <div className="ml-auto flex items-center gap-0.5 sm:ml-0">
                <Tip label="Command palette (⌘K)" side="bottom">
                  <Button variant="ghost" size="icon" aria-label="Open command palette" onClick={() => setPalette(true)} className="hidden sm:inline-flex">
                    <span className="num text-11 text-mute">⌘K</span>
                  </Button>
                </Tip>
                <Tip label={dark ? "Switch to light" : "Switch to dark"} side="bottom">
                  <Button variant="ghost" size="icon" aria-label={dark ? "Switch to light theme" : "Switch to dark theme"} onClick={() => applyTheme(dark ? "light" : "dark")}>
                    {dark ? <Sun /> : <Moon />}
                  </Button>
                </Tip>
                <Menu>
                  <MenuTrigger asChild>
                    <button type="button" aria-label="Account menu" className="ml-1 flex size-8 items-center justify-center rounded-full bg-brand text-11 font-medium text-brand-ink">
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
            </header>
            <main id="main" className="scroll-thin min-h-0 flex-1 overflow-y-auto pb-16 md:pb-0">
              {children}
            </main>
          </div>
        </div>

        <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-30 grid h-14 grid-cols-4 border-t border-line bg-panel pb-[env(safe-area-inset-bottom)] md:hidden">
          {[NAV[0], NAV[1], NAV[3]].map((n) => (
            <Link key={n.href} href={n.href} aria-current={active(n.href) ? "page" : undefined} className={cn("relative flex flex-col items-center justify-center gap-0.5 text-11 text-mute", active(n.href) && "font-medium text-link")}>
              <n.icon className="size-5" aria-hidden />
              {n.label}
              {n.href === "/" && data.unreadCount > 0 ? <span className="num absolute right-[calc(50%-22px)] top-1.5 rounded-full bg-brand px-1 text-[10px] leading-4 text-brand-ink">{data.unreadCount}</span> : null}
            </Link>
          ))}
          <button type="button" onClick={() => setMore(true)} className={cn("flex flex-col items-center justify-center gap-0.5 text-11 text-mute", (active("/digest") || active("/settings")) && "font-medium text-link")}>
            <Ellipsis className="size-5" aria-hidden />
            More
          </button>
        </nav>

        <Dialog open={more} onOpenChange={setMore}>
          <DialogContent title="More" side="bottom">
            <div className="flex flex-col p-2">
              {[
                { href: "/digest", label: "Digest", icon: Mail },
                { href: "/settings", label: "Settings", icon: SettingsIcon },
                { href: "/monitors/new", label: "New monitor", icon: Plus },
              ].map((n) => (
                <Link key={n.href} href={n.href} onClick={() => setMore(false)} className="flex h-11 items-center gap-3 rounded-control px-3 hover:bg-hover">
                  <n.icon className="size-4 text-mute" aria-hidden /> {n.label}
                </Link>
              ))}
              <div className="mt-1 border-t border-line px-3 py-3 text-12 text-mute">
                {data.monthLabel} spend <span className="num text-ink">{usd(data.monthMicros)}</span> of <span className="num">{usd(data.capMicros)}</span>
              </div>
            </div>
          </DialogContent>
        </Dialog>

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

        <Palette open={palette} onOpenChange={setPalette} data={data} onKeys={() => setKeys(true)} onTheme={() => applyTheme(dark ? "light" : "dark")} />
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
      ...NAV.map((n) => ({ label: n.label, hint: n.keys, group: "Go to", run: go(n.href) })),
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
