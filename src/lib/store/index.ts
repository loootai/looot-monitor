import "server-only";
import { redirect } from "next/navigation";
import { DEMO_USER } from "@/demo/seed";
import { accessFor, type Access } from "../access";
import { IS_DEMO } from "../clock";
import { serverSupabase } from "../supabase/server";
import { demoStore } from "./demo";
import { SupabaseStore } from "./supabase";
import type { Store } from "./types";

export interface Session {
  store: Store;
  user: { name: string; email: string; workspace: string; id?: string };
}

export type Resolved = { state: "ok"; session: Session } | { state: "signed_out" } | { state: "not_allowed" } | { state: "setup_required" };

/**
 * Who is asking. Demo mode gets the seeded in-memory store. Otherwise the signed-in Supabase user,
 * who must also be on the owner allow-list (see access.ts). Every page, route and action goes through here.
 */
export async function resolveSession(): Promise<Resolved> {
  if (IS_DEMO) return { state: "ok", session: { store: demoStore(), user: DEMO_USER } };
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { state: "signed_out" };
  const db = await serverSupabase();
  const { data } = await db.auth.getUser();
  if (!data.user) return { state: "signed_out" };
  const access: Access = accessFor(data.user.email);
  if (access !== "allowed") return { state: access };
  const email = data.user.email ?? "";
  const name = (data.user.user_metadata?.full_name as string | undefined) ?? (data.user.user_metadata?.user_name as string | undefined) ?? email.split("@")[0] ?? "You";
  return { state: "ok", session: { store: new SupabaseStore(db, data.user.id), user: { name, email, workspace: "Workspace", id: data.user.id } } };
}

/** The session when the caller is signed in and allowed, otherwise null. */
export async function getSession(): Promise<Session | null> {
  const r = await resolveSession();
  return r.state === "ok" ? r.session : null;
}

/** For pages: the session, or a redirect to the sign-in page or the "not authorised" page. */
export async function requireSession(): Promise<Session> {
  const r = await resolveSession();
  if (r.state === "signed_out") redirect("/login");
  if (r.state !== "ok") redirect(`/access?why=${r.state === "setup_required" ? "setup" : "denied"}`);
  return r.session;
}
