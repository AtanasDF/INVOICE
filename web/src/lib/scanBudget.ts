// How long a read is given before it is given up on, and what is tried next.
//
// NOTHING TIME-BOXED A READ BEFORE THIS. The Gemini client carried a 40s HTTP
// timeout with two attempts, so it could sit for eighty seconds and the backoff
// on top. The Anthropic client carried the SDK's own default, which is TEN
// MINUTES, with two retries behind it. The route's own ceiling is
// maxDuration=300. So a read that went wrong did not fail -- it hung, for as
// long as Vercel allowed, while somebody held a phone over a receipt watching a
// spinner. A 71-second read was measured. Atanas, from his iPhone: "Camera is a
// bit slow at first... each second picture fails."
//
// A failure that arrives is worth more than a success that might.
//
// No imports: the harness compiles this file on its own (tsconfig.logic.json),
// and extractors.ts carries both model SDKs.

// Deliberately not imported from extractors.ts, which this file must not
// depend on. `test-scan-budget` pins the two lists identical.
type Engine = "claude" | "gemini";

// A photograph of a receipt is one unit. A PDF counts as four, because a PDF is
// the multi-page case: `pages` holds files, not printed sides, and one uploaded
// PDF can carry twenty of them. Four is a judgement, not a measurement -- set
// so one PDF gets about twice a photograph's budget, which is the shape of the
// risk rather than a known quantity.
export const PDF_UNITS = 4;
export const READ_BASE_MS = 25_000;
export const READ_PER_UNIT_MS = 7_000;
// Kept under half the route's 300s so a read AND its fallback both finish
// inside it, with room for the request and the reply.
export const READ_CEILING_MS = 100_000;

// Said to the person, so it is a sentence, not a status, and it offers the way
// on -- the same as every other refusal in the app.
export const TOO_SLOW = "That took too long to read. Try again, or type it in by hand.";

export function readUnits(pages: readonly { mediaType: string }[]): number {
  return Math.max(1, pages.reduce((n, p) => n + (p.mediaType === "application/pdf" ? PDF_UNITS : 1), 0));
}

export function readBudgetMs(pages: readonly { mediaType: string }[]): number {
  return Math.min(READ_CEILING_MS, READ_BASE_MS + (readUnits(pages) - 1) * READ_PER_UNIT_MS);
}

// The other engine, tried once. Both directions, because which one is the slow
// one depends on the day: Gemini is 1.6x faster on the ten benchmark documents
// and carries every scan, but a Gemini quota error with a working Anthropic key
// is a read that could have succeeded.
export function fallbackFor(engine: Engine): Engine {
  return engine === "claude" ? "gemini" : "claude";
}

// Past this, the wait is worth mentioning rather than leaving somebody to
// wonder whether anything happened. The ten benchmark documents read in a
// median 4.3s (Gemini) and 7.0s (Claude), so twenty seconds is not a normal
// read by any measure taken so far.
export const SLOW_READ_MS = 20_000;

// What the page says about a read that took a while. Null for an ordinary one,
// which is almost all of them -- a note on every scan would be noise, and
// noise is how a real one gets ignored.
//
// It states the time and stops. It does NOT suggest a better photograph or a
// faster connection: nothing has established which of those a slow read
// actually is, and this app has already shipped three sentences that promised
// something it could not back up (harness/test-promises.mjs).
export function readNoteText(note: { ms: number; fellBack: boolean } | null | undefined): string | null {
  if (!note) return null;
  const seconds = Math.max(1, Math.round(note.ms / 1000));
  if (note.fellBack) return `That was slow to read, so the second reader finished it — ${seconds} seconds in all.`;
  return note.ms >= SLOW_READ_MS ? `That took ${seconds} seconds to read.` : null;
}

// Whether an error off an SDK is "it ran out of time" rather than an answer.
// Each SDK names it differently, none of them documents the name as stable, so
// every shape is listed and the message is the last resort.
export function isTimeout(err: unknown): boolean {
  const e = err as { name?: unknown; status?: unknown; message?: unknown } | null;
  if (!e || typeof e !== "object") return false;
  const name = typeof e.name === "string" ? e.name : "";
  if (/^(AbortError|TimeoutError|APIConnectionTimeoutError|APIUserAbortError)$/.test(name)) return true;
  if (e.status === 408) return true;
  const message = typeof e.message === "string" ? e.message : "";
  return /\b(timed out|timeout|aborted)\b/i.test(message);
}
