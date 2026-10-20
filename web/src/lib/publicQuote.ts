import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { BusinessProfile, Client, Quote } from "@/lib/storage";
import { logoForOwner } from "@/lib/logoServer";
import { must } from "@/lib/publicRead";
import { todayISO } from "@/lib/today";

export type PublicQuote = {
  quote: Quote;
  client: Client | null;
  profile: BusinessProfile;
  response: { answer: "accepted" | "declined"; at: string; name: string | null } | null;
  expired: boolean;
  logo: string | null;
};

// What the customer's quote link shows, read with the service role on the
// server and scoped to the link's owner: the quote as its PDF shows it, and
// whether it has been answered. Drafts and unknown tokens get nothing.
export async function loadPublicQuote(token: string, client?: SupabaseClient): Promise<PublicQuote | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!client && (!url || !key)) return null;
  const admin = client ?? createClient(url!, key!, { auth: { persistSession: false } });

  const link = must(await admin.from("quote_links").select("quote_id, user_id, response, responded_at, responder_name").eq("token", token).maybeSingle(), "link");
  if (!link) return null;
  const COLUMNS = "client_id, number, date, valid_until, items, notes, status, deposit_percent, deposit_amount";
  // vat_registered is migration-033; asking for it against a database
  // without it fails the whole select, so fall back to the old list and
  // carry on following the account's setting, exactly as before.
  const first = await admin
    .from("quotes")
    .select(`${COLUMNS}, vat_registered`)
    .eq("id", link.quote_id)
    .eq("user_id", link.user_id)
    .maybeSingle();
  let q = first.data;
  if (first.error) {
    const fallback = must(await admin.from("quotes").select(COLUMNS).eq("id", link.quote_id).eq("user_id", link.user_id).maybeSingle(), "quote");
    q = fallback ? { ...fallback, vat_registered: null } : null;
  }
  if (!q || q.status === "draft") return null;

  const [clientRes, bpRes] = await Promise.all([
    q.client_id
      ? admin.from("clients").select("name, email, address, vat_number, is_company, contact_person").eq("id", q.client_id).eq("user_id", link.user_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin.from("business_profile").select("business_name, address, vat_number, vat_registered, logo_url").eq("user_id", link.user_id).maybeSingle(),
  ]);
  const customer = must(clientRes, "customer");
  // An older quote with no VAT snapshot is priced by the account's setting,
  // so a failed profile read would have priced it ex VAT.
  const bp = must(bpRes, "business profile");

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
      // What it was priced under when it was sent; null follows the
      // account's setting, as it always did.
      vatRegistered: q.vat_registered ?? null,
      // When the owner sent it is the owner's business, not the customer's.
      sentAt: null,
    },
    client: customer
      ? {
          id: "",
          name: customer.name,
          email: customer.email ?? "",
          address: customer.address ?? "",
          vatNumber: customer.vat_number ?? "",
          isCompany: customer.is_company ?? true,
          kind: "client",
          paymentTerms: "",
          defaultCurrency: "",
          contactPerson: customer.contact_person ?? "",
          phone: "",
          companyNumber: "",
          endUserDeclared: false,
          remindersEnabled: true,
          archived: false,
        }
      : null,
    profile: {
      businessName: bp?.business_name ?? "",
      address: bp?.address ?? "",
      vatNumber: bp?.vat_number ?? "",
      // The setting the quote was priced under, not the one in force
      // today: a customer holding a link must never see the total change
      // under them, least of all on the button they tap to accept.
      vatRegistered: q.vat_registered ?? bp?.vat_registered ?? false,
    } as BusinessProfile,
    // An answer counts while the quote still stands on it: if the owner has
    // put it back to sent, the customer can answer again.
    response:
      link.response && (link.response === "declined" ? q.status === "declined" : q.status === "accepted" || q.status === "invoiced")
        ? { answer: link.response, at: link.responded_at, name: link.responder_name }
        : null,
    expired: !!q.valid_until && q.valid_until < today,
    logo: await logoForOwner(admin, link.user_id, bp?.logo_url),
  };
}
