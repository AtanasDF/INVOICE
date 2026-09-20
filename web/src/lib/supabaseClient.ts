import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// The same key supabase-js computes for itself, named here so signOut can
// clear it. Spelling it out changes nothing for an existing session and
// makes the one thing we have to be able to remove -- the stored session --
// ours rather than an implementation detail.
export const AUTH_STORAGE_KEY = `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { storageKey: AUTH_STORAGE_KEY },
});
