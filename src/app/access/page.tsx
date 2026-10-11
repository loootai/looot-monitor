import type { Metadata } from "next";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata: Metadata = { title: "No access" };
export const dynamic = "force-dynamic";

/**
 * Public on purpose. "setup" is shown to everyone while the operator has not set the owner
 * allow-list. "denied" is shown to a signed-in user who is not on it. It reads no data.
 */
export default async function AccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const setup = (await searchParams).why === "setup";
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-4 text-center">
      <div className="max-w-md">
        {setup ? (
          <>
            <h1 className="text-16 font-semibold text-ink">Finish the setup first</h1>
            <p className="mt-2 text-13 text-mute">
              This deployment has no owner allow-list, so it refuses all data, settings and paid runs. Set <code className="num">LOOOT_MONITOR_ALLOWED_EMAILS</code> (comma separated) or <code className="num">LOOOT_MONITOR_ALLOWED_DOMAINS</code> on the server, then redeploy.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-16 font-semibold text-ink">Not authorised for this workspace</h1>
            <p className="mt-2 text-13 text-mute">You are signed in, but your email is not on this deployment&apos;s allow-list. Ask the operator to add it, or sign in with another account.</p>
          </>
        )}
      </div>
      <SignOutButton />
    </main>
  );
}
