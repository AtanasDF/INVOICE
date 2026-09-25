"use client";

import { useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { HELP_CHAT_BROKEN, HELP_CHAT_LIMITS, chatTranscript, trimHistory, type HelpMessage } from "@/lib/helpChat";

// The box under the walkthroughs, for the question they did not answer.
//
// It comes last on the page on purpose. The walkthroughs cost nothing to
// serve and always say the same correct thing; this costs money per message
// and can be wrong. Most questions should never get this far.
//
// Every state here leads to the email, because that is the rung below and
// the thing Atanas actually asked for: "anything can be emailed to us".
export default function HelpChat() {
  const [messages, setMessages] = useState<HelpMessage[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  // A ref, not the `asking` state: React applies a disabled attribute on the
  // render AFTER the first press, so two quick presses both get through and
  // both spend a question.
  const inFlight = useRef(false);

  async function headers() {
    const { data } = await supabase.auth.getSession();
    return { "Content-Type": "application/json", ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) };
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const text = question.trim();
    if (!text || inFlight.current) return;
    inFlight.current = true;
    // A refusal must not outlive the thing it describes: a new attempt has
    // started, so last time's reason goes now.
    setError(null);
    setSent(false);
    setAsking(true);
    const asked: HelpMessage[] = [...messages, { role: "you", text }];
    setMessages(asked);
    setQuestion("");
    try {
      const res = await fetch("/api/help-chat", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ messages: trimHistory(asked) }),
      });
      const body = (await res.json().catch(() => ({}))) as { answer?: string; error?: string };
      if (!res.ok || !body.answer) setError(body.error || HELP_CHAT_BROKEN);
      else setMessages([...asked, { role: "app", text: body.answer }]);
    } catch {
      setError(HELP_CHAT_BROKEN);
    } finally {
      inFlight.current = false;
      setAsking(false);
    }
  }

  // The whole conversation goes, not just the last question: what the chat
  // got wrong is the reason they are writing.
  async function emailIt() {
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: await headers(),
        body: JSON.stringify({ message: chatTranscript(messages) || question.trim(), category: "question", page: "/help" }),
      });
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) setError(body.error || "Couldn't send that just now.");
      else setSent(true);
    } catch {
      setError("Couldn't send that just now.");
    }
  }

  const anything = messages.length > 0 || question.trim().length > 0;

  return (
    <section className="mt-8 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
      <h2 className="font-medium">Still stuck? Ask.</h2>
      <p className="mt-1 text-sm text-neutral-600">
        Questions about the app, answered here. It can&apos;t see your invoices or your figures, so for anything about your own numbers
        open the page that shows them.
      </p>

      {messages.length > 0 && (
        <div className="mt-4 space-y-3" aria-live="polite">
          {messages.map((m, i) => (
            <p
              key={i}
              className={`wrap-anywhere rounded-lg px-3 py-2 text-sm ${m.role === "you" ? "bg-neutral-100 text-neutral-900" : "border text-neutral-700"}`}
            >
              <span className="mr-1 text-xs font-medium text-neutral-500">{m.role === "you" ? "You" : "App"}</span>
              {m.text}
            </p>
          ))}
        </div>
      )}

      <form onSubmit={ask} className="mt-4">
        <label htmlFor="help-question" className="text-xs text-neutral-500">
          Your question
        </label>
        <textarea
          id="help-question"
          rows={3}
          maxLength={HELP_CHAT_LIMITS.maxQuestion}
          value={question}
          onChange={(e) => {
            setQuestion(e.target.value);
            if (error) setError(null);
          }}
          className="mt-1 w-full rounded-lg border px-3 py-2 text-sm"
          placeholder="How do I put a deposit on a quote?"
          aria-describedby={error ? "help-question-error" : undefined}
          aria-invalid={error ? true : undefined}
        />
        {error && (
          <p id="help-question-error" role="alert" className="mt-1 wrap-anywhere text-xs text-red-600">
            {error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            disabled={asking || !question.trim()}
            className="min-h-11 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {asking ? "Asking…" : "Ask"}
          </button>
          {anything && !sent && (
            <button type="button" onClick={emailIt} className="min-h-11 text-sm font-medium text-neutral-700 underline">
              Email this to Atanas instead
            </button>
          )}
          {sent && (
            <p role="status" className="text-sm text-neutral-600">
              Sent to Atanas. He replies to the address you signed up with.
            </p>
          )}
        </div>
      </form>
    </section>
  );
}
