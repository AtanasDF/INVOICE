import { supabase } from "@/lib/supabaseClient";

// The extra 600, asked for once a month (notes/scan-limits-design.md). It is
// claimed rather than granted automatically on purpose: the point of the wall
// is that it is seen once, and the generosity is felt.
export type TopUp = { granted: boolean; reason?: string };

export async function claimTopUp(): Promise<TopUp> {
  try {
    const { data, error } = await supabase.rpc("claim_scan_topup");
    if (error) return { granted: false, reason: "failed" };
    return (data as TopUp) ?? { granted: false, reason: "failed" };
  } catch {
    return { granted: false, reason: "failed" };
  }
}

// True when a thrown scan error was a refusal that can still be topped up.
export function topUpOffered(err: unknown): boolean {
  return !!(err as { limit?: { topUpAvailable?: boolean } } | null)?.limit?.topUpAvailable;
}
