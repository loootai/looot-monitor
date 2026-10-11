"use client";

import { useRouter } from "next/navigation";

/** Ends the Supabase session and returns to the sign-in page. */
export function SignOutButton() {
  const router = useRouter();
  const signOut = async () => {
    const { browserSupabase } = await import("@/lib/supabase/browser");
    await browserSupabase().auth.signOut();
    router.push("/login");
    router.refresh();
  };
  return (
    <button type="button" onClick={signOut} className="inline-flex h-9 items-center rounded-control border border-line-strong bg-panel px-3 text-13 font-medium text-ink hover:bg-hover">
      Sign out
    </button>
  );
}
