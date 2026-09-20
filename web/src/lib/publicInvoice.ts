import { createClient } from "@supabase/supabase-js";
import type { BusinessProfile, Client, CreditNote, Invoice, InvoicePayment } from "@/lib/storage";

export type PublicInvoice = {
  invoice: Invoice;
  client: Client | null;
  profile: BusinessProfile;
  creditNotes: CreditNote[];
  payments: InvoicePayment[];
};

// What the customer's link shows, read with the service role on the server:
// the issued invoice and only the fields its PDF already carries. Drafts
// and unknown or malformed tokens get nothing.
export async function loadPublicInvoice(token: string): Promise<PublicInvoice | null> {
  if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: link } = await admin.from("invoice_links").select("invoice_id, user_id").eq("token", token).maybeSingle();
  if (!link) return null;
  const { data: inv } = await admin
    .from("invoices")
    .select("id, client_id, date, number, items, notes, due_date, payment_terms, status, vat_registered, cis_rate, user_id")
    .eq("id", link.invoice_id)
    .eq("user_id", link.user_id)
    .maybeSingle();
  if (!inv || inv.status === "draft") return null;

  const [{ data: client }, { data: bp }, { data: notes }, { data: pays }] = await Promise.all([
    inv.client_id
      ? admin.from("clients").select("name, email, address, vat_number, is_company").eq("id", inv.client_id).eq("user_id", link.user_id).maybeSingle()
      : Promise.resolve({ data: null }),
    // The whole row, because naming migration-029's columns would break
    // this page on a database that hasn't had it run yet; only the fields
    // the printed invoice shows are passed on below.
    admin.from("business_profile").select("*").eq("user_id", link.user_id).maybeSingle(),
    admin.from("credit_notes").select("date, amount, reason").eq("invoice_id", inv.id).eq("user_id", link.user_id),
    admin.from("invoice_payments").select("date, amount").eq("invoice_id", inv.id).eq("user_id", link.user_id).order("date"),
  ]);

  return {
    // Record ids are left blank: the page is sent to the customer's browser
    // and needs none of them.
    invoice: {
      id: "",
      clientId: "",
      date: inv.date,
      number: inv.number,
      items: (inv.items ?? []).map((it: Invoice["items"][number]) => ({ ...it, vatRate: it.vatRate ?? "zero" })),
      notes: inv.notes ?? "",
      dueDate: inv.due_date,
      paymentTerms: inv.payment_terms ?? "",
      status: inv.status,
      tags: [],
      vatRegistered: inv.vat_registered ?? null,
      cisRate: inv.cis_rate ?? null,
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
          contactPerson: "",
          phone: "",
          remindersEnabled: true,
          archived: false,
        }
      : null,
    // Only what the printed invoice shows; nothing else from Settings.
    profile: {
      businessName: bp?.business_name ?? "",
      registeredName: bp?.registered_name ?? "",
      companyNumber: bp?.company_number ?? "",
      address: bp?.address ?? "",
      vatNumber: bp?.vat_number ?? "",
      vatRegistered: bp?.vat_registered ?? false,
      bankDetails: bp?.bank_details ?? "",
    } as BusinessProfile,
    creditNotes: (notes ?? []).map((c, i) => ({ id: String(i), invoiceId: "", date: c.date, amount: Number(c.amount), reason: c.reason ?? "" })),
    payments: (pays ?? []).map((p, i) => ({ id: String(i), invoiceId: "", date: p.date, amount: Number(p.amount), method: null, note: "" })),
  };
}
