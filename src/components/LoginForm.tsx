"use client";

import * as React from "react";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/input";

function GithubMark() {
  return (
    <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

type State = { step: "idle" } | { step: "busy" } | { step: "sent"; email: string } | { step: "error"; message: string };

/** Magic link and GitHub sign-in through Supabase Auth. */
export function LoginForm({ configured }: { configured: boolean }) {
  const [email, setEmail] = React.useState("");
  const [state, setState] = React.useState<State>({ step: "idle" });
  const [invalid, setInvalid] = React.useState(false);

  const client = async () => (await import("@/lib/supabase/browser")).browserSupabase();
  const redirectTo = () => `${window.location.origin}/auth/callback`;
  const explain = (message: string, status?: number) => (status === 429 || /rate limit/i.test(message) ? "Too many attempts. Wait a minute, then try again." : message);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    setState({ step: "busy" });
    try {
      const { error } = await (await client()).auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: redirectTo() } });
      if (error) setState({ step: "error", message: explain(error.message, error.status) });
      else setState({ step: "sent", email: email.trim() });
    } catch (err) {
      setState({ step: "error", message: (err as Error).message });
    }
  };
  const github = async () => {
    setState({ step: "busy" });
    try {
      const { error } = await (await client()).auth.signInWithOAuth({ provider: "github", options: { redirectTo: redirectTo() } });
      if (error) setState({ step: "error", message: explain(error.message, error.status) });
    } catch (err) {
      setState({ step: "error", message: (err as Error).message });
    }
  };

  if (state.step === "sent") {
    return (
      <div role="status" className="rounded-panel border border-line bg-panel p-4">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-1 text-mute">
          We sent a sign-in link to <span className="num text-ink">{state.email}</span>. It works once and expires in an hour.
        </p>
        <Button variant="link" className="mt-2 h-auto md:h-auto" onClick={() => setState({ step: "idle" })}>
          Use another address
        </Button>
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <form onSubmit={send} noValidate className="space-y-3">
        <Field label="Work email" htmlFor="l-email" error={invalid ? "Enter a valid email address" : undefined}>
          <Input id="l-email" type="email" name="email" autoComplete="email" inputMode="email" placeholder="Work email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={invalid} disabled={!configured} />
        </Field>
        <Button type="submit" variant="primary" className="w-full" disabled={!configured || state.step === "busy"}>
          <Mail /> {state.step === "busy" ? "Sending..." : "Email me a sign-in link"}
        </Button>
      </form>
      <div className="flex items-center gap-3 text-11 text-faint">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>
      <Button className="w-full" onClick={github} disabled={!configured || state.step === "busy"}>
        <GithubMark /> Continue with GitHub
      </Button>
      {state.step === "error" ? (
        <p role="alert" className="rounded-control border border-high bg-high-soft px-3 py-2 text-12">
          {state.message}
        </p>
      ) : null}
    </div>
  );
}
