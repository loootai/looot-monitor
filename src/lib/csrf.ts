/**
 * CSRF protection for state-changing requests. Two checks, both must pass:
 *
 * 1. Same origin. The Origin header names this app's own host. A request with no Origin falls back to
 *    Sec-Fetch-Site (same-origin or none). A request with neither is refused.
 * 2. Token. The proxy sets a random token in the readable cookie `monitor_csrf`. The app's own
 *    fetch calls copy it into the `x-monitor-csrf` header. The two must match. A page on another
 *    site can neither read the cookie nor set the header on a cross-site request.
 *
 * Next.js server actions already compare Origin with Host and X-Forwarded-Host (action-handler in
 * next 16.3.8), and this app has none. These checks cover the route handlers, which Next.js does not.
 * No import here, so the proxy, the route handlers and the browser share one rule.
 */
export const CSRF_COOKIE = "monitor_csrf";
export const CSRF_HEADER = "x-monitor-csrf";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/** true for a method that changes state. */
export const isWrite = (method: string): boolean => !SAFE_METHODS.has(method.toUpperCase());

/** A fresh random token, 43 characters of base64url. */
export function newCsrfToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Reads one cookie from a Cookie header. */
export function cookieFrom(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return undefined;
}

/** true when the token has the shape newCsrfToken makes. */
export const validToken = (t: string | null | undefined): t is string => !!t && /^[A-Za-z0-9_-]{43}$/.test(t);

function sameText(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** true when a request that changes state comes from this app's own origin. */
export function sameOrigin(h: Headers): boolean {
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const origin = h.get("origin");
  if (origin) {
    try {
      return !!host && new URL(origin).host === host;
    } catch {
      return false;
    }
  }
  const site = h.get("sec-fetch-site");
  return site === "same-origin" || site === "none";
}

export type CsrfProblem = { status: 403; code: "csrf_origin" | "csrf_token"; error: string };

/** null when the request may change state, else the refusal to send. Safe methods always pass. */
export function csrfProblem(method: string, h: Headers): CsrfProblem | null {
  if (!isWrite(method)) return null;
  if (!sameOrigin(h)) return { status: 403, code: "csrf_origin", error: "Cross-site request refused." };
  const cookie = cookieFrom(h.get("cookie"), CSRF_COOKIE);
  const given = h.get(CSRF_HEADER);
  if (!validToken(cookie) || !validToken(given) || !sameText(cookie, given)) return { status: 403, code: "csrf_token", error: "Missing or wrong CSRF token. Reload the page." };
  return null;
}

/** Set-Cookie value for a new token. Readable by the app's script on purpose. SameSite=Lax, Secure in production. */
export function csrfCookie(token: string, env: Record<string, string | undefined> = process.env): string {
  return `${CSRF_COOKIE}=${token}; Path=/; SameSite=Lax${env.NODE_ENV === "production" ? "; Secure" : ""}`;
}
