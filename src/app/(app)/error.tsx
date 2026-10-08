"use client";

import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" className="m-4 rounded-panel border border-high bg-high-soft p-4 md:m-6">
      <div className="flex items-start gap-3">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-high" aria-hidden />
        <div className="min-w-0 flex-1">
          <p className="font-medium">This page could not be loaded.</p>
          <p className="num mt-1 break-words text-12 text-mute">{error.message || "unknown_error"}{error.digest ? ` · ${error.digest}` : ""}</p>
          <Button size="sm" className="mt-3" onClick={reset}>
            Retry
          </Button>
        </div>
      </div>
    </div>
  );
}
