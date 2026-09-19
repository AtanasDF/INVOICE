import { createClient } from "@supabase/supabase-js";

const FIVE_MINUTES = 5 * 60 * 1000;

// Verified tokens are remembered for a few minutes so a burst of typing
// doesn't ask Supabase each time.
const verified = new Map<string, { id: string; at: number }>();
export async function signedInUser(authorization: string | null): Promise<string | null> {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return null;
  const seen = verified.get(token);
  if (seen && Date.now() - seen.at < FIVE_MINUTES) return seen.id;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await auth.auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!data.user) return null;
  if (verified.size > 1000) verified.clear();
  verified.set(token, { id: data.user.id, at: Date.now() });
  return data.user.id;
}

export async function isSignedIn(authorization: string | null): Promise<boolean> {
  return (await signedInUser(authorization)) !== null;
}
