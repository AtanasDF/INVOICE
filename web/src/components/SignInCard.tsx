"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { saveFailed, PASSWORDS_DIFFER } from "@/lib/errorText";
import { THROWAWAY_REFUSED, isThrowawayEmail } from "@/lib/throwawayEmail";
import { readSource } from "@/lib/source";
import { claimInvite, forgetInvite, invitesOn, readInvite } from "@/lib/invites";
import Turnstile, { turnstileOn } from "@/components/Turnstile";
import { peopleCheckProblem } from "@/lib/peopleCheck";

// One box for signing in and one for making an account, with the choice
// between them in plain sight (Atanas, 2026-09-22: "it should be simple
// saying new registration, sign up... make it simple for babies and for
// old people too"). Bigger type, a label over every box, the password
// typed twice when the account is new, and nothing else on the screen.
// Named so the box it is about can carry it: see
// harness/test-error-on-the-field.mjs.
const WRONG_CODE = "The code is the six numbers in the email.";

function PasswordField({
  value,
  onChange,
  autoComplete,
  id = "password",
  name = "password",
  label = "Password",
  hint,
  invalid,
  describedBy,
}: {
  value: string;
  onChange: (v: string) => void;
  autoComplete: string;
  id?: string;
  name?: string;
  label?: string;
  hint?: string;
  invalid?: boolean;
  describedBy?: string;
}) {
  const [show, setShow] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="text-base font-medium text-neutral-800">
        {label}
      </label>
      {hint && <p className="text-sm text-neutral-600">{hint}</p>}
      <div className="relative mt-1">
        <input
          name={name}
          id={id}
          type={show ? "text" : "password"}
          required
          minLength={6}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          autoComplete={autoComplete}
          className="w-full rounded-lg border px-3 py-3 pr-12 text-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute inset-y-0 right-0 flex items-center px-3 text-sm font-medium text-neutral-600 hover:text-neutral-900"
        >
          {show ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}

type Mode = "signin" | "signup" | "forgot" | "check-email";

export default function SignInCard({ start = "signin" }: { start?: "signin" | "signup" }) {
  const [mode, setMode] = useState<Mode>(start);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pendingEmail, setPendingEmail] = useState("");
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [code, setCode] = useState("");
  // Proof that a person is at the other end, when the check is switched on.
  // A token is good for one attempt, so the widget is reset after each.
  const [captchaToken, setCaptchaToken] = useState("");
  const [captchaRound, setCaptchaRound] = useState(0);

  // A confirmation or reset link that has expired lands back here with the
  // reason in the address; say it in plain words rather than show nothing.
  useEffect(() => {
    const timer = setTimeout(() => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const reason = hash.get("error_description") ?? "";
      if (!reason) return;
      setError(/expired|invalid/i.test(reason) ? "That link has run out or was already used. Sign in and, if it asks, send yourself a new one." : reason.replace(/\+/g, " "));
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  // The confirmation link comes back to where they were going, not to the
  // dashboard.
  const confirmTo = () => {
    const next = new URLSearchParams(window.location.search).get("next") ?? "/";
    return { emailRedirectTo: `${window.location.origin}/login?next=${encodeURIComponent(next.startsWith("/") && !next.startsWith("//") ? next : "/")}` };
  };

  function go(next: Mode) {
    setMode(next);
    setError(null);
    setInfo(null);
  }

  async function confirmWithCode(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\D/g, "");
    if (token.length !== 6) {
      setError(WRONG_CODE);
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.verifyOtp({ email: pendingEmail, token, type: "signup" });
      if (error) throw error;
      setInfo("That's you. Signing you in…");
    } catch (err) {
      setError(/expired|invalid/i.test(err instanceof Error ? err.message : "") ? "That code has run out or isn't right. Check it, or send the email again." : saveFailed(err, "Couldn't check the code just now."));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    const to = pendingEmail || email;
    if (!to) return;
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const { error } = await supabase.auth.resend({ type: "signup", email: to, options: confirmTo() });
      if (error) throw error;
      setInfo(`Sent again to ${to}. Give it a minute, and look in the junk folder too.`);
    } catch (err) {
      setError(peopleCheckProblem(err) ?? saveFailed(err, "Couldn't send it again just now."));
    } finally {
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    // Read straight from the form as well: Chrome's autofill sometimes
    // fills a box without telling the page.
    const formData = new FormData(e.currentTarget);
    const formEmail = (formData.get("email") as string) || email;
    const formPassword = (formData.get("password") as string) || password;
    const formAgain = (formData.get("again") as string) || again;
    if (mode === "signup" && formPassword !== formAgain) {
      setError(PASSWORDS_DIFFER);
      return;
    }
    setBusy(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(formEmail, { redirectTo: `${window.location.origin}/reset-password`, ...(captchaToken ? { captchaToken } : {}) });
        if (error) throw error;
        setInfo("If that email has an account, a link to make a new password is on its way.");
      } else if (mode === "signin") {
        setUnconfirmed(false);
        const { error } = await supabase.auth.signInWithPassword({ email: formEmail, password: formPassword, ...(captchaToken ? { options: { captchaToken } } : {}) });
        if (error) {
          if (/not confirmed/i.test(error.message)) {
            setPendingEmail(formEmail);
            setUnconfirmed(true);
            throw new Error("You haven't said yes to our email yet. Open it and tap the button, or send it again below.");
          }
          throw error;
        }
      } else {
        if (isThrowawayEmail(formEmail)) throw new Error(THROWAWAY_REFUSED);
        // The flyer they came from, if any, rides along on the account itself
        // rather than needing a table of its own -- it is one short tag, and
        // it is only ever read to tell one depot from another.
        const cameFrom = readSource();
        const { data, error } = await supabase.auth.signUp({
          email: formEmail,
          password: formPassword,
          options: { ...confirmTo(), ...(cameFrom ? { data: { came_from: cameFrom } } : {}), ...(captchaToken ? { captchaToken } : {}) },
        });
        if (error) throw error;
        // A friend's code, recorded now that there is an account to record it
        // against. It pays nothing here: the bonus comes when they actually
        // read a document, which is what stops this being a way to make
        // accounts for money.
        if (invitesOn() && data.session) {
          const code = readInvite();
          if (code) {
            const r = await claimInvite(code);
            if (r.claimed || r.reason === "already" || r.reason === "self") forgetInvite();
          }
        }
        if (!data.session) {
          setPendingEmail(formEmail);
          go("check-email");
        }
      }
    } catch (err) {
      setError(peopleCheckProblem(err) ?? saveFailed(err, "Something went wrong."));
    } finally {
      setBusy(false);
      // Spent either way: a token is good for one attempt, so a second try
      // needs a fresh one.
      if (turnstileOn()) setCaptchaRound((n) => n + 1);
    }
  }

  const card = "space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm";
  const bigButton = "w-full rounded-lg bg-neutral-900 px-4 py-3.5 text-base font-bold text-white disabled:opacity-50";

  if (mode === "check-email") {
    return (
      <div className={card}>
        <div>
          <h2 className="text-xl font-bold">One last thing: check your email</h2>
          <p className="mt-1 text-base text-neutral-700">
            We sent an email to <strong>{pendingEmail}</strong>. Open it and tap the button inside. That&apos;s it.
          </p>
        </div>
        <form onSubmit={confirmWithCode} className="space-y-2">
          <label htmlFor="signup-code" className="text-base font-medium text-neutral-800">
            Or type the 6 numbers from the email
          </label>
          <div className="flex gap-2">
            <input
              id="signup-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={8}
              className="min-w-0 flex-1 rounded-lg border px-3 py-3 text-lg tracking-widest"
              value={code}
              aria-invalid={error === WRONG_CODE || undefined}
              aria-describedby={error === WRONG_CODE ? "code-error" : undefined}
              onChange={(e) => setCode(e.target.value)}
            />
            <button disabled={busy} className="rounded-lg border px-4 py-3 text-base font-medium text-neutral-700 disabled:opacity-50">
              Done
            </button>
          </div>
        </form>
        {error && <p id="code-error" role="alert" className="text-base text-red-600">{error}</p>}
        {info && <p className="text-base text-neutral-700">{info}</p>}
        <p role="status" className="sr-only">{info ?? ""}</p>
        <p className="text-base text-neutral-600">Nothing after a minute? Look in the junk folder, or send it again.</p>
        <button type="button" onClick={resend} disabled={busy} className={bigButton}>
          {busy ? "Sending…" : "Send it again"}
        </button>
        <button type="button" onClick={() => go("signin")} className="w-full rounded-lg border px-4 py-3 text-base font-medium text-neutral-700">
          I&apos;ve done it, sign me in
        </button>
        <button type="button" onClick={() => go("signup")} className="text-base font-medium text-neutral-700 underline">
          Wrong email? Start again
        </button>
      </div>
    );
  }

  if (mode === "forgot") {
    return (
      <div className={card}>
        <div>
          <h2 className="text-xl font-bold">Forgotten your password</h2>
          <p className="mt-1 text-base text-neutral-700">Tell us your email and we&apos;ll send a link to make a new one.</p>
        </div>
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="text-base font-medium text-neutral-800">
              Your email
            </label>
            <input name="email" id="email" type="email" required autoComplete="email" className="mt-1 w-full rounded-lg border px-3 py-3 text-base" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          {error && <p role="alert" className="text-base text-red-600">{error}</p>}
          {info && <p className="text-base text-neutral-700">{info}</p>}
          <Turnstile onToken={setCaptchaToken} resetKey={captchaRound} />
          <button disabled={busy} className={bigButton}>
            {busy ? "Sending…" : "Send me a link"}
          </button>
        </form>
        <button type="button" onClick={() => go("signin")} className="text-base font-medium text-neutral-700 underline">
          Back to signing in
        </button>
      </div>
    );
  }

  const newAccount = mode === "signup";
  return (
    <div className={card}>
      {/* The two choices, side by side, so neither is hidden behind a link. */}
      <div role="tablist" aria-label="Sign in or make an account" className="grid grid-cols-2 gap-1 rounded-lg bg-neutral-100 p-1">
        {([
          ["signin", "Sign in"],
          ["signup", "New here"],
        ] as const).map(([value, text]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={mode === value}
            onClick={() => go(value)}
            className={`rounded-md px-3 py-2.5 text-base font-medium ${mode === value ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {text}
          </button>
        ))}
      </div>

      <div>
        <h2 className="text-xl font-bold">{newAccount ? "Make an account" : "Sign in"}</h2>
        <p className="mt-1 text-base text-neutral-700">
          {newAccount ? "It's free. We'll send one email to check it's you." : "Welcome back."}
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="text-base font-medium text-neutral-800">
            Your email
          </label>
          <input
            name="email"
            id="email"
            type="email"
            required
            autoComplete="email"
            className="mt-1 w-full rounded-lg border px-3 py-3 text-base"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        <PasswordField
          value={password}
          onChange={setPassword}
          autoComplete={newAccount ? "new-password" : "current-password"}
          label={newAccount ? "Make a password" : "Password"}
          hint={newAccount ? "Six letters or numbers, or more." : undefined}
        />
        {newAccount && (
          <PasswordField
            value={again}
            onChange={setAgain}
            autoComplete="new-password"
            invalid={error === PASSWORDS_DIFFER}
            describedBy={error === PASSWORDS_DIFFER ? "signin-error" : undefined}
            id="password-again"
            name="again"
            label="Type the password again"
            hint="So we know there's no typing mistake."
          />
        )}
        {error && <p id="signin-error" role="alert" className="text-base text-red-600">{error}</p>}
        {unconfirmed && (
          <button type="button" onClick={resend} disabled={busy} className="rounded-lg border px-4 py-2.5 text-base font-medium text-neutral-700 disabled:opacity-50">
            Send the email again
          </button>
        )}
        {info && <p className="text-base text-neutral-700">{info}</p>}
        <p role="status" className="sr-only">{info ?? ""}</p>
        <Turnstile onToken={setCaptchaToken} resetKey={captchaRound} />
        <button disabled={busy} className={bigButton}>
          {busy ? (newAccount ? "Making your account…" : "Signing you in…") : newAccount ? "Make my account" : "Sign me in"}
        </button>
      </form>

      {!newAccount && (
        <button type="button" onClick={() => go("forgot")} className="text-base font-medium text-neutral-700 underline">
          Forgotten your password?
        </button>
      )}
    </div>
  );
}
