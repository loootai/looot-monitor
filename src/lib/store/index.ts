import "server-only";
import { redirect } from "next/navigation";
import { DEMO_USER } from "@/demo/seed";
import { IS_DEMO } from "../clock";
import { serverSupabase } from "../supabase/server";
import { demoStore } from "./demo";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export interface Session {
  store: Store;
  user: { name: string; email: string; workspace: string };
}

/**
 * The store and user for this request. Demo mode gets the seeded in-memory store. Otherwise the
 * signed-in Supabase user, or null when nobody is signed in.
 */
export async function getSession(): Promise<Session | null> {
  if (IS_DEMO) return { store: demoStore(), user: DEMO_USER };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return null;
  const db = await serverSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return null;
  const email = data.user.email ?? "";
  const name = (data.user.user_metadata?.full_name as string | undefined) ?? (data.user.user_metadata?.user_name as string | undefined) ?? email.split("@")[0] ?? "You";
  return { store: new SupabaseStore(db, data.user.id), user: { name, email, workspace: "Workspace" } };
}

/** For pages: the session, or a redirect to the sign-in page. */
export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}
