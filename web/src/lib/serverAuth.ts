import { createClient } from "@supabase/supabase-js";

const FIVE_MINUTES = 5 * 60 * 1000;

// Verified tokens are remembered for a few minutes so a burst of typing
// doesn't ask Supabase each time.
const verified = new Map<string, number>();
export async function isSignedIn(authorization: string | null): Promise<boolean> {
  const token = authorization?.replace(/^Bearer\s+/i, "") ?? "";
  if (!token) return false;
  const seen = verified.get(token);
  if (seen && Date.now() - seen < FIVE_MINUTES) return true;
  const auth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data } = await auth.auth.getUser(token).catch(() => ({ data: { user: null } }));
  if (!data.user) return false;
  if (verified.size > 1000) verified.clear();
  verified.set(token, Date.now());
  return true;
}
