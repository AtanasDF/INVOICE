import { createClient } from "@supabase/supabase-js";

// Spending a free account's document allowance (notes/scan-limits-design.md).
//
// OFF BY DEFAULT. `SCAN_LIMITS` must be "on" in the environment before a
// single document is refused, so this can ship to main and be deployed while
// migration-036 is still unrun, changing nothing for anyone. When the switch
// is off, `spendScans` does nothing and `allowScans` always says yes.
//
// Counted on the server, in the routes that actually call the reader, because
// counting in the browser would be a lock with the key taped to it: the
// camera, the upload button and the batch walker all end here.
const ON = process.env.SCAN_LIMITS === "on";

export type ScanRefusal = { reason: "day" | "month"; usedToday?: number; dayLimit?: number; usedThisMonth?: number; monthLimit?: number; topUpAvailable?: boolean };

const asUser = (token: string) =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

// Asked BEFORE the reader runs, so somebody already over their limit is told
// straight away rather than after a slow read they cannot keep. It only looks;
// nothing is spent here.
export async function allowScans(token: string, count: number): Promise<ScanRefusal | null> {
  if (!ON) return null;
  try {
    const { data, error } = await asUser(token).rpc("scan_allowance");
    if (error || !data) return null;
    const a = data as { dayLimit: number | null; monthLimit: number | null; usedToday: number; usedThisMonth: number; topUpAvailable: boolean };
    if (a.dayLimit !== null && a.usedToday + count > a.dayLimit) {
      return { reason: "day", usedToday: a.usedToday, dayLimit: a.dayLimit };
    }
    if (a.monthLimit !== null && a.usedThisMonth + count > a.monthLimit) {
      return { reason: "month", usedThisMonth: a.usedThisMonth, monthLimit: a.monthLimit, topUpAvailable: a.topUpAvailable };
    }
    return null;
  } catch {
    // A limit that cannot be read must not become a limit of zero: the cost of
    // letting a few documents through is pennies, and the cost of refusing a
    // paying tradesman at a depot is the whole plan.
    return null;
  }
}

// Called AFTER a successful read, for the number of documents that actually
// came back. A read that throws, times out or returns nothing costs nothing --
// nobody should pay for our own mistake, and charging for it would punish
// exactly the awkward documents we most want people to try.
export async function spendScans(token: string, count: number): Promise<void> {
  if (!ON || count < 1) return;
  try {
    await asUser(token).rpc("take_scans", { p_count: Math.min(count, 50) });
  } catch {
    // Already read and already answered; losing the count is the cheaper
    // failure by far.
  }
}

// What the app says when it refuses. Plain words, never an error code, and
// always with what still works — Copy a document and writing an invoice by
// hand cost nothing and keep going.
export function refusalText(r: ScanRefusal): string {
  if (r.reason === "day") {
    return `That's ${r.dayLimit} documents today, which is the most a free account can read in one day. It starts again tomorrow morning. You can still copy a document or write an invoice by hand.`;
  }
  if (r.topUpAvailable) {
    return `That's ${r.monthLimit} documents this month. You can have another 600 for this month — just ask, once.`;
  }
  return `That's the extra 600 used as well. It starts again on the 1st. You can still copy a document or write an invoice by hand.`;
}
