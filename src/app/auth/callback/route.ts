import { NextResponse } from "next/server";
import { serverSupabase } from "@/lib/supabase/server";

/** Where the magic link and the GitHub sign-in land. Trades the code for a session cookie. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const failed = (reason: string) => NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(reason)}`, url.origin));
  if (url.searchParams.get("error")) return failed(url.searchParams.get("error_description") ?? "auth_error");
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL) return failed("missing_code");
  const db = await serverSupabase();
  const { error } = await db.auth.exchangeCodeForSession(code);
  if (error) return failed(error.message);
  return NextResponse.redirect(new URL("/", url.origin));
}
