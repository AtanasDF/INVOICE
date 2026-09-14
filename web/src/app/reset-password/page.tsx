"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type Status = "checking" | "ready" | "invalid" | "done";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function establishSession() {
      // Supabase's reset-password link can arrive either as a PKCE
      // ?code=... to exchange, or as tokens supabase-js already picked
      // up from the URL hash on load. Handle both rather than assuming
      // one flow.
      const code = searchParams.get("code");
      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (cancelled) return;
        if (error) {
          setStatus("invalid");
          return;
        }
      }
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      setStatus(data.session ? "ready" : "invalid");
    }

    establishSession();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords don't match.");
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setStatus("done");
      setTimeout(() => router.replace("/"), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update your password.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "checking") {
    return <p className="mx-auto max-w-sm text-sm text-neutral-500">Checking your reset link…</p>;
  }

  if (status === "invalid") {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Link expired</h1>
        <p className="text-neutral-600">
          This password reset link is invalid or has expired. Request a new one from the sign-in page.
        </p>
        <button onClick={() => router.push("/login")} className="text-sm font-medium text-blue-600">
          Back to sign in
        </button>
      </div>
    );
  }

  if (status === "done") {
    return (
      <div className="mx-auto max-w-sm space-y-4">
        <h1 className="text-2xl font-bold">Password updated</h1>
        <p className="text-neutral-600">Taking you to your dashboard…</p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Set a new password</h1>
        <p className="mt-1 text-neutral-600">Choose something you&apos;ll remember.</p>
      </div>
      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="New password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          type="password"
          required
          minLength={6}
          autoComplete="new-password"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Confirm new password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          disabled={saving}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {saving ? "Saving…" : "Set new password"}
        </button>
      </form>
    </div>
  );
}
