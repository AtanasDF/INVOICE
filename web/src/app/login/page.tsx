"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { saveFailed } from "@/lib/errorText";

function PasswordField({
  value,
  onChange,
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        name="password"
        id="password"
        type={show ? "text" : "password"}
        required
        minLength={6}
        autoComplete={autoComplete}
        className="w-full rounded-lg border px-3 py-2 pr-10"
        placeholder="Password"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setShow((v) => !v)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-neutral-500 hover:text-neutral-900"
      >
        {show ? (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12c1.292 4.338 5.31 7.5 10.066 7.5a10.5 10.5 0 0 0 4.478-.99M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.5a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

// After sign-in the Gate in AppShell owns the redirect (it reads ?next).
export default function LoginPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setBusy(true);
    // Read straight from the form instead of trusting only the React state:
    // Chrome autofill sometimes fills the inputs without firing onChange,
    // which would otherwise leave email/password stuck at "" until the
    // user edits a character by hand.
    const formData = new FormData(e.currentTarget);
    const formEmail = (formData.get("email") as string) || email;
    const formPassword = (formData.get("password") as string) || password;
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(formEmail, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        setInfo("If that email has an account, a password reset link is on its way. Check your inbox.");
      } else if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email: formEmail, password: formPassword });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({ email: formEmail, password: formPassword });
        if (error) throw error;
        if (!data.session) {
          setInfo("Account created. Check your email to confirm it, then sign in.");
          setMode("signin");
        }
      }
    } catch (err) {
      setError(saveFailed(err, "Something went wrong."));
    } finally {
      setBusy(false);
    }
  }

  const titles = {
    signin: ["Sign in", "Welcome back."],
    signup: ["Create your account", "Track invoices, receipts and expenses in one place."],
    forgot: ["Reset your password", "We'll email you a link to set a new one."],
  } as const;
  const [title, subtitle] = titles[mode];

  return (
    <div className="mx-auto max-w-sm space-y-6">
      <div>
        <p className="text-sm font-medium text-neutral-500">Invoicer — invoices, receipts, and expenses in one place.</p>
        <h1 className="mt-3 text-2xl font-bold">{title}</h1>
        <p className="mt-1 text-neutral-600">{subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <input
          name="email"
          id="email"
          type="email"
          required
          autoComplete="email"
          className="w-full rounded-lg border px-3 py-2"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        {mode !== "forgot" && (
          <PasswordField
            value={password}
            onChange={setPassword}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
          />
        )}
        {mode === "signin" && (
          <button
            type="button"
            onClick={() => {
              setMode("forgot");
              setError(null);
              setInfo(null);
            }}
            className="text-sm font-medium text-blue-600"
          >
            Forgot password?
          </button>
        )}
        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
        {info && <p role="status" className="text-sm text-green-700">{info}</p>}
        <button
          disabled={busy}
          className="w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Sign up" : "Send reset link"}
        </button>
      </form>

      <button
        onClick={() => {
          setMode(mode === "signin" ? "signup" : "signin");
          setError(null);
          setInfo(null);
        }}
        className="text-sm font-medium text-blue-600"
      >
        {mode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up"}
      </button>
    </div>
  );
}
