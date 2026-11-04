import { supabase } from "@/lib/supabaseClient";
import { currentUserId } from "@/lib/storage";
import { readEdits, type PriceEdit } from "@/lib/priceList";

// His changes to "What I charge", kept on business_profile.price_list
// (migration-047) so they follow the account to every device. Its own file
// rather than businessProfileStore: Settings saves the profile as a whole,
// and nothing on Settings should be able to overwrite a price list it never
// read, or the other way round.
//
// Until 047 is run the column does not exist. The page still works then,
// read-only, on the learned prices alone: `canSave` says which it is.

// 42703: Postgres's "column does not exist", which PostgREST passes through
// on a select. PGRST204: PostgREST's own, on a write naming the column.
const MISSING = new Set(["42703", "PGRST204"]);

export const priceListStore = {
  async get(): Promise<{ edits: PriceEdit[]; canSave: boolean }> {
    const { data, error } = await supabase.from("business_profile").select("price_list").maybeSingle();
    if (error && MISSING.has(error.code)) return { edits: [], canSave: false };
    if (error) throw error;
    return { edits: readEdits((data as { price_list?: unknown } | null)?.price_list), canSave: true };
  },
  // False when the column is not there yet: nothing was kept.
  async save(edits: PriceEdit[]): Promise<boolean> {
    const user_id = await currentUserId();
    const { error } = await supabase.from("business_profile").upsert({ user_id, price_list: edits }, { onConflict: "user_id" });
    if (error && MISSING.has(error.code)) return false;
    if (error) throw error;
    return true;
  },
};
