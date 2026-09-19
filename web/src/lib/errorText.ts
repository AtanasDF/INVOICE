// Supabase errors are plain objects with a message, not Error instances.
export function errorText(err: unknown, fallback: string): string {
  const message = (err as { message?: unknown } | null)?.message;
  return typeof message === "string" && message ? message : fallback;
}
