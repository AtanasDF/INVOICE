import { createClient } from "@supabase/supabase-js";
import type { BusinessProfile, Client, Quote } from "@/lib/storage";
import { todayISO } from "@/lib/today";

export type PublicQuote = {
  quote: Quote;
  client: Client | null;
  profile: BusinessProfile;
  response: { answer: "accepted" | "declined"; at: string; name: string | null } | null;
  expired: boolean;
};

// What the customer's quote link shows, read with the service role on the
// server and scoped to the link's owner: the quote as its PDF shows it, and
// whether it has been answered. Drafts and unknown tokens get nothing.
export async function loadPublicQuote(token: string): Promise<PublicQuote | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: link } = await admin.from("quote_links").select("quote_id, user_id, response, responded_at, responder_name").eq("token", token).maybeSingle();
  if (!link) return null;
  const { data: q } = await admin
    .from("quotes")
    .select("client_id, number, date, valid_until, items, notes, status, deposit_percent, deposit_amount")
    .eq("id", link.quote_id)
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (!q || q.status === "draft") return null;

  const [{ data: client }, { data: bp }] = await Promise.all([
    q.client_id
      ? admin.from("clients").select("name, email, address, vat_number, is_company, contact_person").eq("id", q.client_id).eq("user_id", link.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    admin.from("business_profile").select("business_name, address, vat_number, vat_registered").eq("user_id", link.user_id).maybeSingle(),
  ]);

  const today = todayISO();
  return {
    // Ids left blank: none of them is needed in the customer's browser.
    quote: {
      id: "",
      clientId: "",
      number: q.number,
      date: q.date,
      validUntil: q.valid_until,
      items: (q.items ?? []).map((it: Quote["items"][number]) => ({ ...it, vatRate: it.vatRate ?? "standard" })),
      notes: q.notes ?? "",
      status: q.status,
      invoiceId: null,
      deposit:
        q.deposit_percent != null
          ? { kind: "percent", value: Number(q.deposit_percent) }
          : q.deposit_amount != null
            ? { kind: "amount", value: Number(q.deposit_amount) }
            : null,
      depositInvoiceId: null,
      depositClaimed: false,
    },
    client: client
      ? {
          id: "",
          name: client.name,
          email: client.email ?? "",
          address: client.address ?? "",
          vatNumber: client.vat_number ?? "",
          isCompany: client.is_company ?? true,
          kind: "client",
          paymentTerms: "",
          defaultCurrency: "",
          contactPerson: client.contact_person ?? "",
          phone: "",
          companyNumber: "",
          remindersEnabled: true,
          archived: false,
        }
      : null,
    profile: {
      businessName: bp?.business_name ?? "",
      address: bp?.address ?? "",
      vatNumber: bp?.vat_number ?? "",
      vatRegistered: bp?.vat_registered ?? false,
    } as BusinessProfile,
    // An answer counts while the quote still stands on it: if the owner has
    // put it back to sent, the customer can answer again.
    response:
      link.response && (link.response === "declined" ? q.status === "declined" : q.status === "accepted" || q.status === "invoiced")
        ? { answer: link.response, at: link.responded_at, name: link.responder_name }
        : null,
    expired: !!q.valid_until && q.valid_until < today,
  };
}
