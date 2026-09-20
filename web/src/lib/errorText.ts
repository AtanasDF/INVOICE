// Supabase errors are plain objects with a message, not Error instances.
export function errorText(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}

// A page that couldn't load says the same plain thing however it failed:
// "JSON object requested, multiple rows returned" tells the person holding
// the phone nothing, and what they can actually do is check their signal.
// The real reason still goes to the console for us.
export function loadFailed(err: unknown, what: string, advice = "Check your connection and try again."): string {
  console.error(`Couldn't load ${what}`, err);
  return `Couldn't load ${what}. ${advice}`;
}
