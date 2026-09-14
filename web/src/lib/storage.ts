import { supabase } from "./supabaseClient";

export type ClientKind = "client" | "supplier";

export type Client = {
  id: string;
  name: string;
  isCompany: boolean;
  email: string;
  address: string;
  kind: ClientKind;
  vatNumber: string;
  paymentTerms: string;
  defaultCurrency: string;
  contactPerson: string;
};

export type Receipt = {
  id: string;
  clientId: string;
  date: string;
  vendor: string;
  category: string;
  amount: number;
  vatAmount: number;
  imageDataUrl: string | null;
  notes: string;
  starred: boolean;
  warrantyMonths: number | null;
  tags: string[];
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
};

export type Invoice = {
  id: string;
  clientId: string;
  date: string;
  number: string;
  items: InvoiceItem[];
  notes: string;
  dueDate: string | null;
  paymentTerms: string;
  paid: boolean;
  tags: string[];
};

export type CreditNote = {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  reason: string;
};

async function currentUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("You need to be signed in.");
  return id;
}

type ClientRow = {
  id: string;
  name: string;
  is_company: boolean;
  email: string | null;
  address: string | null;
  kind: ClientKind | null;
  vat_number: string | null;
  payment_terms: string | null;
  default_currency: string | null;
  contact_person: string | null;
};

function clientFromRow(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    isCompany: r.is_company,
    email: r.email ?? "",
    address: r.address ?? "",
    kind: r.kind ?? "client",
    vatNumber: r.vat_number ?? "",
    paymentTerms: r.payment_terms ?? "",
    defaultCurrency: r.default_currency ?? "",
    contactPerson: r.contact_person ?? "",
  };
}

export const clientsStore = {
  async all(): Promise<Client[]> {
    const { data, error } = await supabase.from("clients").select("*").order("name");
    if (error) throw error;
    return (data as ClientRow[]).map(clientFromRow);
  },
  async add(input: Omit<Client, "id">): Promise<Client> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("clients")
      .insert({
        user_id,
        name: input.name,
        is_company: input.isCompany,
        email: input.email || null,
        address: input.address || null,
        kind: input.kind,
        vat_number: input.vatNumber || null,
        payment_terms: input.paymentTerms || null,
        default_currency: input.defaultCurrency || null,
        contact_person: input.contactPerson || null,
      })
      .select()
      .single();
    if (error) throw error;
    return clientFromRow(data as ClientRow);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) throw error;
  },
};

type ReceiptRow = {
  id: string;
  client_id: string | null;
  date: string;
  vendor: string | null;
  category: string | null;
  amount: number;
  vat_amount: number;
  image_data_url: string | null;
  notes: string | null;
  starred: boolean | null;
  warranty_months: number | null;
  tags: string[] | null;
};

function receiptFromRow(r: ReceiptRow): Receipt {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    date: r.date,
    vendor: r.vendor ?? "",
    category: r.category ?? "",
    amount: Number(r.amount),
    vatAmount: Number(r.vat_amount),
    imageDataUrl: r.image_data_url,
    notes: r.notes ?? "",
    starred: r.starred ?? false,
    warrantyMonths: r.warranty_months,
    tags: r.tags ?? [],
  };
}

export const receiptsStore = {
  async all(): Promise<Receipt[]> {
    const { data, error } = await supabase.from("receipts").select("*").order("date", { ascending: false });
    if (error) throw error;
    return (data as ReceiptRow[]).map(receiptFromRow);
  },
  async add(input: Omit<Receipt, "id">): Promise<Receipt> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("receipts")
      .insert({
        user_id,
        client_id: input.clientId || null,
        date: input.date,
        vendor: input.vendor || null,
        category: input.category || null,
        amount: input.amount,
        vat_amount: input.vatAmount,
        image_data_url: input.imageDataUrl,
        notes: input.notes || null,
        starred: input.starred,
        warranty_months: input.warrantyMonths,
        tags: input.tags,
      })
      .select()
      .single();
    if (error) throw error;
    return receiptFromRow(data as ReceiptRow);
  },
  async update(id: string, patch: Partial<Pick<Receipt, "starred" | "notes" | "warrantyMonths" | "tags">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.starred !== undefined) dbPatch.starred = patch.starred;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
    if (patch.warrantyMonths !== undefined) dbPatch.warranty_months = patch.warrantyMonths;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    const { error } = await supabase.from("receipts").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("receipts").delete().eq("id", id);
    if (error) throw error;
  },
};

type InvoiceRow = {
  id: string;
  client_id: string | null;
  date: string;
  number: string;
  items: InvoiceItem[];
  notes: string | null;
  due_date: string | null;
  payment_terms: string | null;
  paid: boolean | null;
  tags: string[] | null;
};

function invoiceFromRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    date: r.date,
    number: r.number,
    items: r.items ?? [],
    notes: r.notes ?? "",
    dueDate: r.due_date,
    paymentTerms: r.payment_terms ?? "",
    paid: r.paid ?? false,
    tags: r.tags ?? [],
  };
}

export const invoicesStore = {
  async all(): Promise<Invoice[]> {
    const { data, error } = await supabase.from("invoices").select("*").order("date", { ascending: false });
    if (error) throw error;
    return (data as InvoiceRow[]).map(invoiceFromRow);
  },
  async get(id: string): Promise<Invoice | null> {
    const { data, error } = await supabase.from("invoices").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? invoiceFromRow(data as InvoiceRow) : null;
  },
  async add(input: Omit<Invoice, "id">): Promise<Invoice> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("invoices")
      .insert({
        user_id,
        client_id: input.clientId || null,
        date: input.date,
        number: input.number,
        items: input.items,
        notes: input.notes || null,
        due_date: input.dueDate || null,
        payment_terms: input.paymentTerms || null,
        paid: input.paid,
        tags: input.tags,
      })
      .select()
      .single();
    if (error) throw error;
    return invoiceFromRow(data as InvoiceRow);
  },
  async update(id: string, patch: Partial<Pick<Invoice, "paid" | "dueDate" | "paymentTerms" | "tags">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.paid !== undefined) dbPatch.paid = patch.paid;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate || null;
    if (patch.paymentTerms !== undefined) dbPatch.payment_terms = patch.paymentTerms || null;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    const { error } = await supabase.from("invoices").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
  },
};

type CreditNoteRow = {
  id: string;
  invoice_id: string;
  date: string;
  amount: number;
  reason: string | null;
};

function creditNoteFromRow(r: CreditNoteRow): CreditNote {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    date: r.date,
    amount: Number(r.amount),
    reason: r.reason ?? "",
  };
}

export const creditNotesStore = {
  async forInvoice(invoiceId: string): Promise<CreditNote[]> {
    const { data, error } = await supabase
      .from("credit_notes")
      .select("*")
      .eq("invoice_id", invoiceId)
      .order("date", { ascending: false });
    if (error) throw error;
    return (data as CreditNoteRow[]).map(creditNoteFromRow);
  },
  async all(): Promise<CreditNote[]> {
    const { data, error } = await supabase.from("credit_notes").select("*").order("date", { ascending: false });
    if (error) throw error;
    return (data as CreditNoteRow[]).map(creditNoteFromRow);
  },
  async add(input: Omit<CreditNote, "id">): Promise<CreditNote> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("credit_notes")
      .insert({
        user_id,
        invoice_id: input.invoiceId,
        date: input.date,
        amount: input.amount,
        reason: input.reason || null,
      })
      .select()
      .single();
    if (error) throw error;
    return creditNoteFromRow(data as CreditNoteRow);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("credit_notes").delete().eq("id", id);
    if (error) throw error;
  },
};

export type BusinessProfile = {
  businessName: string;
  vatNumber: string;
  address: string;
  logoUrl: string | null;
  showOverdueReminders: boolean;
};

type BusinessProfileRow = {
  business_name: string | null;
  vat_number: string | null;
  address: string | null;
  logo_url: string | null;
  show_overdue_reminders: boolean | null;
};

function businessProfileFromRow(r: BusinessProfileRow): BusinessProfile {
  return {
    businessName: r.business_name ?? "",
    vatNumber: r.vat_number ?? "",
    address: r.address ?? "",
    logoUrl: r.logo_url,
    showOverdueReminders: r.show_overdue_reminders ?? true,
  };
}

const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  businessName: "",
  vatNumber: "",
  address: "",
  logoUrl: null,
  showOverdueReminders: true,
};

export const businessProfileStore = {
  async get(): Promise<BusinessProfile> {
    const { data, error } = await supabase.from("business_profile").select("*").maybeSingle();
    if (error) throw error;
    return data ? businessProfileFromRow(data as BusinessProfileRow) : EMPTY_BUSINESS_PROFILE;
  },
  async save(input: BusinessProfile): Promise<void> {
    const user_id = await currentUserId();
    const { error } = await supabase.from("business_profile").upsert({
      user_id,
      business_name: input.businessName || null,
      vat_number: input.vatNumber || null,
      address: input.address || null,
      logo_url: input.logoUrl,
      show_overdue_reminders: input.showOverdueReminders,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};
