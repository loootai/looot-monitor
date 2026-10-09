import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found" };

/** Shown for any address the app does not have. */
export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-page px-4 text-center">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/brand/looot-mark.svg" alt="" width={32} height={32} />
      <div>
        <p className="num text-12 text-mute">404</p>
        <h1 className="mt-1 text-16 font-semibold text-ink">This page does not exist</h1>
        <p className="mt-1 text-13 text-mute">The link may be old, or the monitor or alert was deleted.</p>
      </div>
      <div className="flex gap-2">
        <Link href="/" className="inline-flex h-9 items-center rounded-control bg-brand px-3 text-13 font-medium text-brand-ink hover:opacity-90">
          Open the inbox
        </Link>
        <Link href="/monitors" className="inline-flex h-9 items-center rounded-control border border-line-strong bg-panel px-3 text-13 font-medium text-ink hover:bg-hover">
          Monitors
        </Link>
      </div>
    </main>
  );
}
