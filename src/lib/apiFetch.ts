import { CSRF_COOKIE, CSRF_HEADER, cookieFrom } from "./csrf";

/** fetch for this app's own API. Adds the CSRF token from the cookie the proxy set. Use it for every call to /api. */
export function apiFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = typeof document === "undefined" ? undefined : cookieFrom(document.cookie, CSRF_COOKIE);
  const headers = new Headers(init.headers);
  if (token) headers.set(CSRF_HEADER, token);
  return fetch(url, { ...init, headers, credentials: "same-origin" });
}
