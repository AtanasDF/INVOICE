// Supabase errors are plain objects with a message, not Error instances.
export function errorText(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

// A save that failed. Errors the app raised itself are already written for
// the person reading them ("This invoice has payments recorded against it")
// and go straight through; the database's own codes and a dropped
// connection get plain English instead of "Failed to fetch" or "23505".
export function saveFailed(err: unknown, fallback: string): string {
  const e = err as { code?: unknown; message?: unknown } | null;
  const message = typeof e?.message === "string" ? e.message : "";
  if (/failed to fetch|networkerror|load failed|network request failed/i.test(message)) {
    return "Couldn't reach your records. Check your connection and try again.";
  }
  if (err instanceof Error) return message || fallback;
  const code = typeof e?.code === "string" ? e.code : "";
  if (code === "23505") return "That one is already there.";
  if (code === "23503") return "Something else in your records is linked to this, so it can't be changed.";
  if (code === "42501") return "This account isn't allowed to do that.";
  if (code === "PGRST204") return "This needs a database change that hasn't been run yet. Nothing was saved.";
  // Our own database functions raise their own sentences, already written
  // for the person reading them, under a chosen SQLSTATE: P0001, and these
  // three, which nothing else in this app raises. 23503 and 42501 are NOT on
  // the list -- Postgres raises those itself, in its own words, and the two
  // sentences above are what to say instead.
  //   40001  the answer changed since the page loaded
  //   55000  this list has gone out / this request is closed
  //   22023  that isn't an answer the app knows
  if (["P0001", "40001", "55000", "22023"].includes(code) && message) return message;
  // Anything else: the caller's sentence knows what was being done, which
  // "XX000" never will. The real one goes to the console.
  console.error(fallback, err);
  return fallback;
}

// A page that couldn't load says the same plain thing however it failed:
// "JSON object requested, multiple rows returned" tells the person holding
// the phone nothing, and what they can actually do is check their signal.
// The real reason still goes to the console for us.
export function loadFailed(err: unknown, what: string, advice = "Check your connection and try again."): string {
  console.error(`Couldn't load ${what}`, err);
  return `Couldn't load ${what}. ${advice}`;
}

// Neither invoicePdf.ts nor documentPdf.ts throws a sentence written for a
// person, so anything they throw is pdf-lib's or the browser's. Two of the
// three places this is shown are pages a CUSTOMER sees, where nobody signed in
// is watching and a stray "Invalid PDF structure" would be the whole of what
// they are told.
export const PDF_FAILED = "Couldn't make the PDF. Try again, or use Print instead.";
