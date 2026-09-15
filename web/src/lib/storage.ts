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

export type ReceiptLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  category: string | null;
};

export type Receipt = {
  id: string;
  clientId: string;
  date: string;
  vendor: string;
  category: string;
  // amount/vatAmount are always GBP, converted at entry time if the
  // original purchase was in another currency -- every existing report,
  // total, and export reads these two fields and stays correct without
  // any changes. original* below is provenance only, never read for math.
  amount: number;
  vatAmount: number;
  originalAmount: number | null;
  originalVatAmount: number | null;
  originalCurrency: string | null;
  fxRate: number | null;
  imageDataUrl: string | null;
  notes: string;
  starred: boolean;
  warrantyMonths: number | null;
  tags: string[];
  lineItems: ReceiptLineItem[];
  // true for a receipt created from an emailed-in document, until the
  // account holder confirms the AI's extraction was correct. Nobody's
  // watching a live screen the way they are for a scan, so these don't
  // silently become "real" data until someone's actually checked them.
  needsReview: boolean;
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
  original_amount: number | null;
  original_vat_amount: number | null;
  original_currency: string | null;
  fx_rate: number | null;
  image_data_url: string | null;
  notes: string | null;
  starred: boolean | null;
  warranty_months: number | null;
  tags: string[] | null;
  line_items: ReceiptLineItem[] | null;
  needs_review: boolean | null;
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
    originalAmount: r.original_amount === null ? null : Number(r.original_amount),
    originalVatAmount: r.original_vat_amount === null ? null : Number(r.original_vat_amount),
    originalCurrency: r.original_currency,
    fxRate: r.fx_rate === null ? null : Number(r.fx_rate),
    imageDataUrl: r.image_data_url,
    notes: r.notes ?? "",
    starred: r.starred ?? false,
    warrantyMonths: r.warranty_months,
    tags: r.tags ?? [],
    lineItems: r.line_items ?? [],
    needsReview: r.needs_review ?? false,
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
        original_amount: input.originalAmount,
        original_vat_amount: input.originalVatAmount,
        original_currency: input.originalCurrency,
        fx_rate: input.fxRate,
        image_data_url: input.imageDataUrl,
        notes: input.notes || null,
        starred: input.starred,
        warranty_months: input.warrantyMonths,
        tags: input.tags,
        line_items: input.lineItems,
        needs_review: input.needsReview,
      })
      .select()
      .single();
    if (error) throw error;
    return receiptFromRow(data as ReceiptRow);
  },
  async update(
    id: string,
    patch: Partial<
      Pick<
        Receipt,
        "starred" | "notes" | "warrantyMonths" | "tags" | "lineItems" | "vendor" | "date" | "category" | "amount" | "vatAmount" | "needsReview"
      >
    >
  ): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.starred !== undefined) dbPatch.starred = patch.starred;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
    if (patch.warrantyMonths !== undefined) dbPatch.warranty_months = patch.warrantyMonths;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.lineItems !== undefined) dbPatch.line_items = patch.lineItems;
    if (patch.vendor !== undefined) dbPatch.vendor = patch.vendor || null;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.category !== undefined) dbPatch.category = patch.category || null;
    if (patch.amount !== undefined) dbPatch.amount = patch.amount;
    if (patch.vatAmount !== undefined) dbPatch.vat_amount = patch.vatAmount;
    if (patch.needsReview !== undefined) dbPatch.needs_review = patch.needsReview;
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
  customCategories: string[] | null;
  // The <token> in u-<token>@invoiceover.com -- an opaque, unguessable
  // per-account address for the email inbox-import feature. Null until
  // generated. This token IS the entire security boundary for that
  // feature (anyone who knows it can address mail to this account), so
  // it's generated client-side via the Web Crypto API (generateInboxToken
  // in lib/inboxToken.ts), never anything guessable.
  inboxToken: string | null;
};

type BusinessProfileRow = {
  business_name: string | null;
  vat_number: string | null;
  address: string | null;
  logo_url: string | null;
  show_overdue_reminders: boolean | null;
  custom_categories: string[] | null;
  inbox_token: string | null;
};

function businessProfileFromRow(r: BusinessProfileRow): BusinessProfile {
  return {
    businessName: r.business_name ?? "",
    vatNumber: r.vat_number ?? "",
    address: r.address ?? "",
    logoUrl: r.logo_url,
    showOverdueReminders: r.show_overdue_reminders ?? true,
    customCategories: r.custom_categories ?? null,
    inboxToken: r.inbox_token,
  };
}

const EMPTY_BUSINESS_PROFILE: BusinessProfile = {
  businessName: "",
  vatNumber: "",
  address: "",
  logoUrl: null,
  showOverdueReminders: true,
  customCategories: null,
  inboxToken: null,
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
      custom_categories: input.customCategories,
      inbox_token: input.inboxToken,
      updated_at: new Date().toISOString(),
    });
    if (error) throw error;
  },
};

export type Feedback = {
  id: string;
  message: string;
  category: string;
  page: string;
  createdAt: string;
};

type FeedbackRow = {
  id: string;
  message: string;
  category: string | null;
  page: string | null;
  created_at: string;
};

function feedbackFromRow(r: FeedbackRow): Feedback {
  return {
    id: r.id,
    message: r.message,
    category: r.category ?? "",
    page: r.page ?? "",
    createdAt: r.created_at,
  };
}

export const feedbackStore = {
  async all(): Promise<Feedback[]> {
    const { data, error } = await supabase.from("feedback").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data as FeedbackRow[]).map(feedbackFromRow);
  },
  async add(input: { message: string; category: string; page: string }): Promise<Feedback> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("feedback")
      .insert({ user_id, message: input.message, category: input.category || null, page: input.page || null })
      .select()
      .single();
    if (error) throw error;
    return feedbackFromRow(data as FeedbackRow);
  },
};

export type RecurringExpense = {
  id: string;
  description: string;
  category: string;
  amount: number;
  vatAmount: number;
  supplierId: string;
  dayOfMonth: number;
  nextDueDate: string;
  active: boolean;
};

type RecurringExpenseRow = {
  id: string;
  description: string;
  category: string | null;
  amount: number;
  vat_amount: number;
  supplier_id: string | null;
  day_of_month: number;
  next_due_date: string;
  active: boolean;
};

function recurringExpenseFromRow(r: RecurringExpenseRow): RecurringExpense {
  return {
    id: r.id,
    description: r.description,
    category: r.category ?? "",
    amount: Number(r.amount),
    vatAmount: Number(r.vat_amount),
    supplierId: r.supplier_id ?? "",
    dayOfMonth: r.day_of_month,
    nextDueDate: r.next_due_date,
    active: r.active,
  };
}

export const recurringExpensesStore = {
  async all(): Promise<RecurringExpense[]> {
    const { data, error } = await supabase.from("recurring_expenses").select("*").order("next_due_date");
    if (error) throw error;
    return (data as RecurringExpenseRow[]).map(recurringExpenseFromRow);
  },
  async add(input: Omit<RecurringExpense, "id">): Promise<RecurringExpense> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("recurring_expenses")
      .insert({
        user_id,
        description: input.description,
        category: input.category || null,
        amount: input.amount,
        vat_amount: input.vatAmount,
        supplier_id: input.supplierId || null,
        day_of_month: input.dayOfMonth,
        next_due_date: input.nextDueDate,
        active: input.active,
      })
      .select()
      .single();
    if (error) throw error;
    return recurringExpenseFromRow(data as RecurringExpenseRow);
  },
  async update(id: string, patch: Partial<Pick<RecurringExpense, "nextDueDate" | "active">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.nextDueDate !== undefined) dbPatch.next_due_date = patch.nextDueDate;
    if (patch.active !== undefined) dbPatch.active = patch.active;
    const { error } = await supabase.from("recurring_expenses").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("recurring_expenses").delete().eq("id", id);
    if (error) throw error;
  },
};

export const pushSubscriptionsStore = {
  async isSubscribed(endpoint: string): Promise<boolean> {
    const { data, error } = await supabase
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", endpoint)
      .maybeSingle();
    if (error) throw error;
    return data !== null;
  },
  async subscribe(sub: { endpoint: string; p256dh: string; authKey: string }): Promise<void> {
    const user_id = await currentUserId();
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(
        { user_id, endpoint: sub.endpoint, p256dh: sub.p256dh, auth_key: sub.authKey },
        { onConflict: "endpoint" }
      );
    if (error) throw error;
  },
  async unsubscribe(endpoint: string): Promise<void> {
    const { error } = await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
    if (error) throw error;
  },
};
