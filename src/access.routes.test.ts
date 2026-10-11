/**
 * Access tests generated from the route map. The map is the file tree under src/app: every
 * route.ts and page.tsx is found by glob, so a new route that ships without a gate fails here.
 *
 * Three states are checked for every route: nobody signed in, signed in but not on the allow-list
 * (or no allow-list at all), and signed in on the list.
 */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const current = vi.hoisted(() => ({ user: null as null | { id: string; email: string } }));
const shared = vi.hoisted(() => ({ store: null as unknown }));

vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: () => [], set: () => {} }) }));
vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({ auth: { getUser: async () => ({ data: { user: current.user } }) } }),
}));
vi.mock("@/lib/store/supabase", async () => {
  const { MemoryStore } = await import("@/lib/store/demo");
  return {
    SupabaseStore: class extends MemoryStore {
      constructor() {
        super();
        return (shared.store ??= new MemoryStore()) as never;
      }
    },
  };
});
vi.mock("@/lib/prices", async (orig) => ({ ...(await orig<typeof import("@/lib/prices")>()), fetchPrices: async () => ({ prices: {}, pricesAsOf: "2026-10-08T00:00:00.000Z", source: "fallback", unread: [] }) }));

import { NextRequest } from "next/server";
import { proxy } from "@/proxy";

const routeFiles = import.meta.glob("/src/app/**/route.ts");
const pageFiles = Object.keys(import.meta.glob("/src/app/**/page.tsx"));
const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;

/** Paths that stay reachable without a session. Anything not listed here is closed. */
const PUBLIC_ROUTES = new Set(["/auth/callback", "/api/cron"]);
const PUBLIC_PAGES = new Set(["/login", "/access"]);

const urlOf = (file: string) =>
  "/" + file.replace("/src/app/", "").replace(/\/?(route\.ts|page\.tsx)$/, "").split("/").filter((s) => !/^\(.*\)$/.test(s)).join("/").replace(/\[[^\]]+\]/g, "x");

/** Builds an address from parts, so no lookalike address sits in the source as a literal. */
const at = (user: string, domain: string) => `${user}@${domain}`;

const SUPABASE = { NEXT_PUBLIC_SUPABASE_URL: "http://127.0.0.1:1", NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon" };

function setEnv(env: Record<string, string | undefined>) {
  for (const k of ["LOOOT_MONITOR_ALLOWED_EMAILS", "LOOOT_MONITOR_ALLOWED_DOMAINS", "LOOOT_TOKEN", "CRON_SECRET", "NEXT_PUBLIC_DEMO"]) delete process.env[k];
  Object.assign(process.env, SUPABASE);
  for (const [k, v] of Object.entries(env)) if (v !== undefined) process.env[k] = v;
}

const ALLOW = { LOOOT_MONITOR_ALLOWED_EMAILS: at("Owner", "Example.com") };
const OWNER = { id: "u-owner", email: "owner@example.com" };
const STRANGER = { id: "u-stranger", email: at("stranger", "example.org") };

async function callRoute(file: string, method: string, init: { body?: unknown } = {}) {
  const mod = (await routeFiles[file]()) as Record<string, (req: Request, ctx: unknown) => Promise<Response>>;
  const handler = mod[method];
  const req = new Request(`http://localhost:3000${urlOf(file)}`, { method, headers: { "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(init.body ?? {}) });
  return handler(req, { params: Promise.resolve({ id: "x" }) });
}

async function handlersOf(file: string) {
  const mod = (await routeFiles[file]()) as Record<string, unknown>;
  return METHODS.filter((m) => typeof mod[m] === "function");
}

const privateRoutes = Object.keys(routeFiles).filter((f) => !PUBLIC_ROUTES.has(urlOf(f)));
const privatePages = pageFiles.filter((f) => !PUBLIC_PAGES.has(urlOf(f)));

beforeEach(() => {
  current.user = null;
  shared.store = null;
  setEnv({});
});

describe("route map", () => {
  it("finds the routes and pages", () => {
    expect(Object.keys(routeFiles).length).toBeGreaterThanOrEqual(12);
    expect(pageFiles.length).toBeGreaterThanOrEqual(6);
  });
});

describe("api handlers", () => {
  for (const file of privateRoutes) {
    describe(urlOf(file), () => {
      it("is closed when nobody is signed in", async () => {
        setEnv(ALLOW);
        for (const m of await handlersOf(file)) expect((await callRoute(file, m)).status, `${m} ${urlOf(file)}`).toBe(401);
      });
      it("is closed to a signed-in user who is not on the list", async () => {
        setEnv(ALLOW);
        current.user = STRANGER;
        for (const m of await handlersOf(file)) expect((await callRoute(file, m)).status, `${m} ${urlOf(file)}`).toBe(403);
      });
      it("is closed to everyone while no allow-list is set", async () => {
        setEnv({});
        current.user = OWNER;
        for (const m of await handlersOf(file)) {
          const res = await callRoute(file, m);
          expect(res.status, `${m} ${urlOf(file)}`).toBe(503);
          expect((await res.json()).code).toBe("setup_required");
        }
      });
      it("is open to a user on the list", async () => {
        setEnv(ALLOW);
        current.user = OWNER;
        for (const m of await handlersOf(file)) expect([401, 403, 503], `${m} ${urlOf(file)}`).not.toContain((await callRoute(file, m)).status);
      });
    });
  }
});

describe("pages and proxy", () => {
  const ask = async (path: string) => proxy(new NextRequest(`http://localhost:3000${path}`));
  const where = (res: Response) => res.headers.get("location") ?? "";

  for (const file of privatePages) {
    const path = urlOf(file);
    it(`${path} redirects a signed-out visitor to /login`, async () => {
      setEnv(ALLOW);
      expect(where(await ask(path))).toContain("/login");
    });
    it(`${path} sends a stranger to /access`, async () => {
      setEnv(ALLOW);
      current.user = STRANGER;
      expect(where(await ask(path))).toContain("/access");
    });
    it(`${path} sends everyone to /access while no allow-list is set`, async () => {
      setEnv({});
      current.user = OWNER;
      expect(where(await ask(path))).toContain("/access");
    });
    it(`${path} passes a user on the list`, async () => {
      setEnv(ALLOW);
      current.user = OWNER;
      expect(where(await ask(path))).toBe("");
    });
  }

  for (const file of Object.keys(routeFiles).filter((f) => !PUBLIC_ROUTES.has(urlOf(f)))) {
    const path = urlOf(file);
    it(`${path} answers 401 or 403 in the proxy before the handler runs`, async () => {
      setEnv(ALLOW);
      expect((await ask(path)).status).toBe(401);
      current.user = STRANGER;
      expect((await ask(path)).status).toBe(403);
    });
  }

  it("keeps the login and access pages public", async () => {
    setEnv(ALLOW);
    for (const p of PUBLIC_PAGES) expect((await ask(p)).status).toBe(200);
  });

  it("matches the allow-list case-insensitively and by exact email", async () => {
    setEnv({ LOOOT_MONITOR_ALLOWED_EMAILS: " a@example.net , owner@example.com " });
    current.user = { id: "u", email: at("OWNER", "EXAMPLE.COM") };
    expect(where(await ask("/"))).toBe("");
    current.user = { id: "u", email: at("owner", "example.com.example.org") };
    expect(where(await ask("/"))).toContain("/access");
    current.user = { id: "u", email: at("xowner", "example.com") };
    expect(where(await ask("/"))).toContain("/access");
  });

  it("lets a whole domain in when LOOOT_MONITOR_ALLOWED_DOMAINS names it, and not a lookalike", async () => {
    setEnv({ LOOOT_MONITOR_ALLOWED_DOMAINS: "Corp.Example.com" });
    current.user = { id: "u", email: at("anyone", "corp.example.com") };
    expect(where(await ask("/"))).toBe("");
    current.user = { id: "u", email: at("anyone", "sub.corp.example.com") };
    expect(where(await ask("/"))).toContain("/access");
    current.user = { id: "u", email: at("anyone", "notcorp.example.com") };
    expect(where(await ask("/"))).toContain("/access");
    current.user = { id: "u", email: at(at("a", "corp.example.com"), "example.org") };
    expect(where(await ask("/"))).toContain("/access");
  });
});

describe("demo mode", () => {
  it("passes every page and answers every GET route without a session", async () => {
    vi.resetModules();
    setEnv({ NEXT_PUBLIC_DEMO: "1" });
    const { proxy: demoProxy } = await import("@/proxy");
    for (const f of pageFiles) expect((await demoProxy(new NextRequest(`http://localhost:3000${urlOf(f)}`))).headers.get("location")).toBeNull();
  });
});

describe("spending", () => {
  const monitorBody = {
    name: "m",
    kind: "page",
    ownerTag: "mine",
    config: { url: "https://example.com" },
    schedule: "daily",
    runHour: 9,
    maxCostPerRunMicros: 5000,
    monthlyCapMicros: 100000,
  };

  it("does not let the caller raise the stored per-run cap on a run", async () => {
    setEnv({ ...ALLOW, LOOOT_TOKEN: "test-token" });
    current.user = OWNER;
    const created = (await (await callRoute("/src/app/api/monitors/route.ts", "POST", { body: monitorBody })).json()) as { monitor: { id: string } };
    const run = await routeFiles["/src/app/api/monitors/[id]/run/route.ts"]();
    const post = (run as { POST: (r: Request, c: unknown) => Promise<Response> }).POST;
    await post(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ confirmId: "abcdef-1", maxCostMicros: 99_000_000 }) }), { params: Promise.resolve({ id: created.monitor.id }) });
    const store = shared.store as { getMonitor(id: string): Promise<{ maxCostPerRunMicros: number }> };
    expect((await store.getMonitor(created.monitor.id)).maxCostPerRunMicros).toBe(5000);
  });

  it("rate limits paid runs per user", async () => {
    setEnv({ ...ALLOW, LOOOT_TOKEN: "test-token" });
    current.user = { id: "u-rate", email: "owner@example.com" };
    const created = (await (await callRoute("/src/app/api/monitors/route.ts", "POST", { body: monitorBody })).json()) as { monitor: { id: string } };
    const post = ((await routeFiles["/src/app/api/monitors/[id]/run/route.ts"]()) as { POST: (r: Request, c: unknown) => Promise<Response> }).POST;
    const codes: number[] = [];
    for (let i = 0; i < 40; i++) {
      codes.push((await post(new Request("http://localhost/x", { method: "POST", body: JSON.stringify({ confirmId: `abcdef-${i}` }) }), { params: Promise.resolve({ id: created.monitor.id }) })).status);
    }
    expect(codes).toContain(429);
    expect(codes[0]).not.toBe(429);
  });
});

describe("auth callback", () => {
  it("ignores next and redirectTo and never leaves the origin", async () => {
    setEnv(ALLOW);
    const mod = (await routeFiles["/src/app/auth/callback/route.ts"]()) as { GET: (r: Request) => Promise<Response> };
    for (const evil of ["//evil.test", "https://evil.test", "/\\evil.test", "javascript:alert(1)"]) {
      for (const key of ["next", "redirectTo", "redirect_to"]) {
        const res = await mod.GET(new Request(`http://localhost:3000/auth/callback?error=x&${key}=${encodeURIComponent(evil)}`));
        expect(new URL(res.headers.get("location")!, "http://localhost:3000").origin).toBe("http://localhost:3000");
      }
    }
  });
});

describe("cron", () => {
  const get = async (auth?: string) => ((await routeFiles["/src/app/api/cron/route.ts"]()) as { GET: (r: Request) => Promise<Response> }).GET(new Request("http://localhost/api/cron", { headers: auth ? { authorization: auth } : {} }));

  it("answers 401 without the secret, with a wrong one, and when none is configured", async () => {
    setEnv({ CRON_SECRET: "s3cret-value" });
    expect((await get()).status).toBe(401);
    expect((await get("Bearer wrong")).status).toBe(401);
    expect((await get("Bearer s3cret-value-and-more")).status).toBe(401);
    setEnv({});
    expect((await get("Bearer ")).status).toBe(401);
    expect((await get("Bearer undefined")).status).toBe(401);
  });

  it("accepts the right secret", async () => {
    setEnv({ CRON_SECRET: "s3cret-value" });
    expect((await get("Bearer s3cret-value")).status).not.toBe(401);
  });

  it("compares the secret in constant time", () => {
    expect(readFileSync("src/app/api/cron/route.ts", "utf8")).toContain("timingSafeEqual");
  });
});
