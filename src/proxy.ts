import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { accessFor } from "@/lib/access";

/**
 * Refreshes the Supabase session cookie on every request. Signed-out visitors go to /login, and a
 * signed-in user who is not on the owner allow-list goes to /access (pages) or gets 403 (API).
 * With no allow-list set, pages go to /access and the API answers 503. Public: /login, /access,
 * /auth/*, and /api/cron (it checks its own secret). Every handler checks again on its own.
 * Demo mode has no Supabase, so the request passes straight through.
 */
export async function proxy(request: NextRequest) {
  if (process.env.NEXT_PUBLIC_DEMO === "1") return NextResponse.next({ request });
  const path = request.nextUrl.pathname;
  const isApi = path.startsWith("/api/");
  const open = path === "/login" || path === "/access" || path.startsWith("/auth/");
  const deny = (status: number, code: string, error: string) => NextResponse.json({ error, code }, { status, headers: { "Cache-Control": "no-store" } });
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    if (open) return NextResponse.next({ request });
    if (isApi) return deny(401, "unauthorized", "Sign in first.");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "?error=not_configured";
    return NextResponse.redirect(url);
  }
  let response = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (open) return response;
  if (!data.user) {
    if (isApi) return deny(401, "unauthorized", "Sign in first.");
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  const access = accessFor(data.user.email);
  if (access !== "allowed") {
    if (isApi) return access === "setup_required" ? deny(503, "setup_required", "Set LOOOT_MONITOR_ALLOWED_EMAILS on the server first.") : deny(403, "forbidden", "Not authorised for this workspace.");
    const url = request.nextUrl.clone();
    url.pathname = "/access";
    url.search = access === "setup_required" ? "?why=setup" : "?why=denied";
    return NextResponse.redirect(url);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|brand/|demo/|api/cron).*)"],
};
