import { createClient } from "@supabase/supabase-js";
import type { LinePrice, RequestItem } from "@/lib/quoteCompare";
import { todayISO } from "@/lib/today";

export type PublicQuoteRequest = {
  from: string;
  supplierName: string;
  title: string;
  items: RequestItem[];
  notes: string;
  neededBy: string | null;
  siteAddress: string;
  state: "open" | "closed" | "expired";
  // Their own online answer is shown back to them; one the owner entered
  // for them (typed in or read from their document) only as "received".
  answer:
    | null
    | { status: "replied" | "declined"; at: string; own: false }
    | { status: "replied" | "declined"; at: string; own: true; prices: Record<string, LinePrice>; delivery: number | null; vatIncluded: boolean; validUntil: string | null; note: string; name: string | null };
};

// What a supplier's request link shows, read with the service role on the
// server and scoped to the link's owner: the list as the email gave it, and
// nothing else about the owner than their business name.
export async function loadPublicQuoteRequest(token: string): Promise<PublicQuoteRequest | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: row } = await admin
    .from("quote_request_suppliers")
    .select("request_id, supplier_id, user_id, status, responded_at, source, responder_name, prices, delivery, vat_included, valid_until, note")
    .eq("token", token)
    .maybeSingle();
  if (!row) return null;
  const [{ data: req }, { data: supplier }, { data: bp }] = await Promise.all([
    admin.from("quote_requests").select("title, items, notes, needed_by, site_address, status").eq("id", row.request_id).eq("user_id", row.user_id).maybeSingle(),
    admin.from("clients").select("name, contact_person").eq("id", row.supplier_id).eq("user_id", row.user_id).maybeSingle(),
    admin.from("business_profile").select("business_name").eq("user_id", row.user_id).maybeSingle(),
  ]);
  if (!req) return null;

  const today = todayISO();
  const answered = row.status === "replied" || row.status === "declined";
  return {
    from: bp?.business_name ?? "",
    supplierName: supplier?.contact_person || supplier?.name || "",
    title: req.title,
    items: ((req.items ?? []) as RequestItem[]).map((it) => ({ id: it.id, description: it.description ?? "", quantity: Number(it.quantity) || 0, unit: it.unit ?? "", note: it.note ?? "" })),
    notes: req.notes ?? "",
    neededBy: req.needed_by,
    siteAddress: req.site_address ?? "",
    state: req.status === "closed" ? "closed" : req.needed_by && req.needed_by < today ? "expired" : "open",
    answer: !answered
      ? null
      : row.source === "online"
        ? {
            status: row.status,
            at: row.responded_at,
            own: true,
            prices: row.prices ?? {},
            delivery: row.delivery === null ? null : Number(row.delivery),
            vatIncluded: !!row.vat_included,
            validUntil: row.valid_until,
            note: row.note ?? "",
            name: row.responder_name,
          }
        : { status: row.status, at: row.responded_at, own: false },
  };
}
