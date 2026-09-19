import { supabase } from "./supabaseClient";
import { VatRateKind } from "./vat";
import { InvoiceStatus } from "./invoiceStatus";
import { resolveImages, storeImages } from "./receiptImages";

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
  phone: string;
  // Payment reminders (3 days before due / on due date / 7 days after)
  // go out for this client unless turned off here. Only meaningful for
  // kind "client" -- suppliers are never invoiced, so it's ignored for them.
  remindersEnabled: boolean;
  // Hides this client/supplier from every client/supplier picker used
  // when creating a new record, without touching any of its existing
  // history -- the alternative to Remove once it would otherwise fail
  // (migration-015 made every FK referencing clients RESTRICT). Never
  // set at creation, so it's excluded from clientsStore.add()'s input.
  archived: boolean;
};

export type ReceiptLineItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  // Kept for existing rows and the manual receipt form; the scanner saves
  // null on every line since a per-line category was never reviewed.
  category: string | null;
};

// Scanned supplier invoices and credit notes are expense documents, so
// they live in receipts next to plain receipts (migration-017) and every
// existing total nets them automatically. The app's own Invoice /
// CreditNote types below are the SALES side and unrelated.
export type DocumentType = "receipt" | "invoice" | "credit_note" | "other";

export type DocumentDetails = {
  accountNumber?: string;
  sortCode?: string;
  iban?: string;
  bic?: string;
  paymentTerms?: string;
  reference?: string;
  poNumber?: string;
  orderNumber?: string;
  customerReference?: string;
  supplierAddress?: string;
  supplierVatNumber?: string;
  supplierEmail?: string;
  supplierPhone?: string;
  deliveryAddress?: string;
  other?: { label: string; value: string }[];
};

export const DOCUMENT_DETAIL_LABELS: Record<Exclude<keyof DocumentDetails, "other">, string> = {
  accountNumber: "Account number",
  sortCode: "Sort code",
  iban: "IBAN",
  bic: "BIC",
  paymentTerms: "Payment terms",
  reference: "Reference",
  poNumber: "PO number",
  orderNumber: "Order number",
  customerReference: "Customer reference",
  supplierAddress: "Supplier address",
  supplierVatNumber: "Supplier VAT number",
  supplierEmail: "Supplier email",
  supplierPhone: "Supplier phone",
  deliveryAddress: "Delivery address",
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
  documentType: DocumentType;
  invoiceNumber: string | null;
  dueDate: string | null;
  // A documentType "invoice" with paid false is a bill: due soon when
  // dueDate is within 3 days, overdue once it's passed. Always true for
  // every other document type.
  paid: boolean;
  details: DocumentDetails;
  // For a credit note: the scanned invoice it refunds. A credit note is
  // stored with NEGATIVE amount and vatAmount so sums net automatically.
  creditOfReceiptId: string | null;
};

export type InvoiceItem = {
  description: string;
  quantity: number;
  unitPrice: number;
  // Defaults to "standard" for a vat-registered account; carried on every
  // item even when the account isn't vat-registered (it's just ignored
  // then) so nothing is lost if VAT registration gets switched on later.
  vatRate: VatRateKind;
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
  status: InvoiceStatus;
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
  phone: string | null;
  reminders_enabled: boolean | null;
  archived: boolean | null;
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
    phone: r.phone ?? "",
    remindersEnabled: r.reminders_enabled ?? true,
    archived: r.archived ?? false,
  };
}

export const clientsStore = {
  async all(): Promise<Client[]> {
    const { data, error } = await supabase.from("clients").select("*").order("name");
    if (error) throw error;
    return (data as ClientRow[]).map(clientFromRow);
  },
  async add(input: Omit<Client, "id" | "archived">): Promise<Client> {
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
        phone: input.phone || null,
        reminders_enabled: input.remindersEnabled,
        archived: false,
      })
      .select()
      .single();
    if (error) throw error;
    return clientFromRow(data as ClientRow);
  },
  // archived deliberately excluded -- it only ever changes through
  // archive()/unarchive() below, which carry a required side effect
  // (archive() also stops this client's recurring invoices and this
  // supplier's recurring expenses). A generic patch path that could set
  // it directly would be a way to skip that.
  async update(id: string, patch: Partial<Omit<Client, "id" | "archived">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.name !== undefined) dbPatch.name = patch.name;
    if (patch.isCompany !== undefined) dbPatch.is_company = patch.isCompany;
    if (patch.email !== undefined) dbPatch.email = patch.email || null;
    if (patch.address !== undefined) dbPatch.address = patch.address || null;
    if (patch.kind !== undefined) dbPatch.kind = patch.kind;
    if (patch.vatNumber !== undefined) dbPatch.vat_number = patch.vatNumber || null;
    if (patch.paymentTerms !== undefined) dbPatch.payment_terms = patch.paymentTerms || null;
    if (patch.defaultCurrency !== undefined) dbPatch.default_currency = patch.defaultCurrency || null;
    if (patch.contactPerson !== undefined) dbPatch.contact_person = patch.contactPerson || null;
    if (patch.phone !== undefined) dbPatch.phone = patch.phone || null;
    if (patch.remindersEnabled !== undefined) dbPatch.reminders_enabled = patch.remindersEnabled;
    const { error } = await supabase.from("clients").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  // Hides this client/supplier from pickers on new records and, since
  // that's specifically what makes Remove impossible for a client with
  // real history, also deactivates its recurring invoices (if it's a
  // client) and recurring expenses (if it's a supplier) -- otherwise
  // "archived" would be a lie the UI tells while the account keeps
  // generating that client's invoice every month regardless.
  // generate_recurring_invoice() (migration-016) also skips an archived
  // client's row directly, so this isn't the only thing stopping it,
  // but leaving the Recurring page showing "active" for something that
  // was just archived would be its own kind of wrong.
  async archive(id: string): Promise<void> {
    const { error } = await supabase.from("clients").update({ archived: true }).eq("id", id);
    if (error) throw error;
    await Promise.all([
      supabase.from("recurring_invoices").update({ active: false }).eq("client_id", id),
      supabase.from("recurring_expenses").update({ active: false }).eq("supplier_id", id),
    ]);
  },
  // Deliberately does NOT reactivate anything archive() paused --
  // un-archiving is "let me reference this again" (fixing a mistake,
  // bringing a client back into the picker list), not "resume billing
  // them automatically." Resuming a specific recurring invoice or
  // expense stays a deliberate action on its own page.
  async unarchive(id: string): Promise<void> {
    const { error } = await supabase.from("clients").update({ archived: false }).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) {
      // 23503 = foreign_key_violation -- migrations 014/015 changed
      // every FK referencing clients (receipts.client_id,
      // invoices.client_id, recurring_invoices.client_id,
      // recurring_expenses.supplier_id) from ON DELETE SET NULL to ON
      // DELETE RESTRICT, since silently detaching a financial record
      // from who it was billed to or bought from is a real integrity
      // problem, not a convenience.
      if (error.code === "23503") {
        throw new Error("Can't remove this client or supplier — it still has receipts, invoices, quotes, or recurring items linked to it. Archive it instead to hide it from new records without losing that history.");
      }
      throw error;
    }
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
  document_type: DocumentType | null;
  invoice_number: string | null;
  due_date: string | null;
  paid: boolean | null;
  details: DocumentDetails | null;
  credit_of_receipt_id: string | null;
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
    documentType: r.document_type ?? "receipt",
    invoiceNumber: r.invoice_number,
    dueDate: r.due_date,
    paid: r.paid ?? true,
    details: r.details ?? {},
    creditOfReceiptId: r.credit_of_receipt_id,
  };
}

type ReceiptDocumentField = "documentType" | "invoiceNumber" | "dueDate" | "paid" | "details" | "creditOfReceiptId";

// The document fields are optional on input so the manual receipt form
// and the recurring-expense logger (both plain receipts) need no change.
export type ReceiptInput = Omit<Receipt, "id" | ReceiptDocumentField> & Partial<Pick<Receipt, ReceiptDocumentField>>;

function receiptRowFromInput(input: ReceiptInput) {
  return {
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
    document_type: input.documentType ?? "receipt",
    invoice_number: input.invoiceNumber ?? null,
    due_date: input.dueDate ?? null,
    paid: input.paid ?? true,
    details: input.details ?? {},
    credit_of_receipt_id: input.creditOfReceiptId ?? null,
  };
}

// Stored photo references become signed URLs for display.
async function withImagesResolved(receipts: Receipt[]): Promise<Receipt[]> {
  const urls = await resolveImages(receipts.map((r) => r.imageDataUrl));
  return receipts.map((r, i) => ({ ...r, imageDataUrl: urls[i] }));
}

export const receiptsStore = {
  async all(): Promise<Receipt[]> {
    const { data, error } = await supabase.from("receipts").select("*").order("date", { ascending: false });
    if (error) throw error;
    return withImagesResolved((data as ReceiptRow[]).map(receiptFromRow));
  },
  // extraPages is page 2 onwards of a multi-page scan (page 1 is
  // input.imageDataUrl). With any, the receipt and its pages go through
  // create_receipt_with_pages so a dropped connection can't leave a
  // document missing its later pages.
  async add(input: ReceiptInput, extraPages: string[] = []): Promise<Receipt> {
    const user_id = await currentUserId();
    // Photos go to storage first; the row keeps references to them.
    const [first, ...rest] = await storeImages(user_id, [input.imageDataUrl, ...extraPages]);
    const row = receiptRowFromInput({ ...input, imageDataUrl: first });
    const pages = rest as string[];
    if (pages.length === 0) {
      const { data, error } = await supabase
        .from("receipts")
        .insert({ user_id, ...row })
        .select()
        .single();
      if (error) throw error;
      return (await withImagesResolved([receiptFromRow(data as ReceiptRow)]))[0];
    }
    const { data: id, error } = await supabase.rpc("create_receipt_with_pages", { p_receipt: row, p_pages: pages });
    if (error) throw error;
    const { data, error: readErr } = await supabase.from("receipts").select("*").eq("id", id).single();
    if (readErr) throw readErr;
    return (await withImagesResolved([receiptFromRow(data as ReceiptRow)]))[0];
  },
  async update(
    id: string,
    patch: Partial<
      Pick<
        Receipt,
        | "starred"
        | "notes"
        | "warrantyMonths"
        | "tags"
        | "lineItems"
        | "vendor"
        | "date"
        | "category"
        | "amount"
        | "vatAmount"
        | "needsReview"
        | "clientId"
        | "originalAmount"
        | "originalVatAmount"
        | "originalCurrency"
        | "fxRate"
        | "documentType"
        | "invoiceNumber"
        | "dueDate"
        | "paid"
        | "details"
        | "creditOfReceiptId"
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
    if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId || null;
    if (patch.originalAmount !== undefined) dbPatch.original_amount = patch.originalAmount;
    if (patch.originalVatAmount !== undefined) dbPatch.original_vat_amount = patch.originalVatAmount;
    if (patch.originalCurrency !== undefined) dbPatch.original_currency = patch.originalCurrency;
    if (patch.fxRate !== undefined) dbPatch.fx_rate = patch.fxRate;
    if (patch.documentType !== undefined) dbPatch.document_type = patch.documentType;
    if (patch.invoiceNumber !== undefined) dbPatch.invoice_number = patch.invoiceNumber || null;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate || null;
    if (patch.paid !== undefined) dbPatch.paid = patch.paid;
    if (patch.details !== undefined) dbPatch.details = patch.details;
    if (patch.creditOfReceiptId !== undefined) dbPatch.credit_of_receipt_id = patch.creditOfReceiptId || null;
    const { error } = await supabase.from("receipts").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("receipts").delete().eq("id", id);
    if (error) {
      // 23503 = foreign_key_violation -- credit_of_receipt_id is ON
      // DELETE RESTRICT (migration-017), so an invoice with a credit note
      // pointing at it can't be removed out from under that credit note.
      if (error.code === "23503") {
        throw new Error("Can't remove this invoice — a credit note is linked to it. Remove the credit note first.");
      }
      throw error;
    }
  },
};

export type ReceiptPage = { id: string; pageIndex: number; imageDataUrl: string };

type ReceiptPageRow = { id: string; receipt_id: string; page_index: number; image_data_url: string };

export const receiptPagesStore = {
  async forReceipt(receiptId: string): Promise<ReceiptPage[]> {
    const { data, error } = await supabase
      .from("receipt_pages")
      .select("id, receipt_id, page_index, image_data_url")
      .eq("receipt_id", receiptId)
      .order("page_index", { ascending: true });
    if (error) throw error;
    const rows = data as ReceiptPageRow[];
    const urls = await resolveImages(rows.map((p) => p.image_data_url));
    return rows.map((p, i) => ({ id: p.id, pageIndex: p.page_index, imageDataUrl: urls[i] ?? "" }));
  },
  // Extra-page count per receipt id, for a "3 pages" hint on the list
  // without ever pulling the page images down.
  async counts(): Promise<Map<string, number>> {
    const { data, error } = await supabase.from("receipt_pages").select("receipt_id");
    if (error) throw error;
    const counts = new Map<string, number>();
    for (const { receipt_id } of data as { receipt_id: string }[]) {
      counts.set(receipt_id, (counts.get(receipt_id) ?? 0) + 1);
    }
    return counts;
  },
  async all(): Promise<{ receiptId: string; pageIndex: number; imageDataUrl: string }[]> {
    const { data, error } = await supabase
      .from("receipt_pages")
      .select("id, receipt_id, page_index, image_data_url")
      .order("receipt_id")
      .order("page_index", { ascending: true });
    if (error) throw error;
    const rows = data as ReceiptPageRow[];
    const urls = await resolveImages(rows.map((p) => p.image_data_url));
    return rows.map((p, i) => ({ receiptId: p.receipt_id, pageIndex: p.page_index, imageDataUrl: urls[i] ?? "" }));
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
  status: InvoiceStatus | null;
  tags: string[] | null;
};

function invoiceFromRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    date: r.date,
    number: r.number,
    // A missing vatRate means this item predates VAT tracking entirely --
    // the app never charged or displayed VAT before this feature existed,
    // so "no rate recorded" reliably means "no VAT was ever part of this
    // invoice", not "assume standard". Defaulting to standard here would
    // make a historical invoice silently start showing 20% VAT it never
    // actually had, the moment VAT registration gets turned on -- exactly
    // the kind of thing an invoice, locked once issued, should never do.
    items: (r.items ?? []).map((it) => ({ ...it, vatRate: it.vatRate ?? "zero" })),
    notes: r.notes ?? "",
    dueDate: r.due_date,
    paymentTerms: r.payment_terms ?? "",
    // Migration-011 backfills every pre-existing row, so this should
    // never actually be null -- "sent" (not "draft") is the safe fallback
    // if it somehow is, since only a genuinely new invoice should ever
    // start as an editable draft.
    status: r.status ?? "sent",
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
        status: input.status,
        tags: input.tags,
      })
      .select()
      .single();
    if (error) {
      // 23505 = unique_violation -- the DB-level backstop for
      // (user_id, number) added in migration-010, since the field stays
      // freely editable and a client-side check alone can't be trusted.
      if (error.code === "23505") {
        throw new Error(`Invoice number "${input.number}" is already in use.`);
      }
      throw error;
    }
    return invoiceFromRow(data as InvoiceRow);
  },
  // Deliberately excludes number/date/items/clientId -- once an invoice
  // has been sent it's what was actually issued, and changing any of
  // those after the fact is exactly the silent-mutation problem credit
  // notes exist to avoid. Everything patchable here is administrative,
  // not financial. status IS allowed here -- moving through
  // draft/sent/partial/paid is an administrative transition, not a
  // change to what was billed. Use updateDraft() instead while status
  // is still "draft", when the financial content itself is still fair
  // game to edit.
  async update(id: string, patch: Partial<Pick<Invoice, "status" | "dueDate" | "paymentTerms" | "tags" | "notes">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.status !== undefined) dbPatch.status = patch.status;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate || null;
    if (patch.paymentTerms !== undefined) dbPatch.payment_terms = patch.paymentTerms || null;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
    const { error } = await supabase.from("invoices").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  // Full-content edit, only ever valid while status is still "draft" --
  // callers are responsible for that check, same as the UI only showing
  // this form for a draft. Once marked sent, this becomes exactly the
  // "changing what was billed" problem update() deliberately can't do.
  async updateDraft(
    id: string,
    patch: Partial<Pick<Invoice, "clientId" | "date" | "items" | "dueDate" | "paymentTerms" | "notes" | "tags">>
  ): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId || null;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.items !== undefined) dbPatch.items = patch.items;
    if (patch.dueDate !== undefined) dbPatch.due_date = patch.dueDate || null;
    if (patch.paymentTerms !== undefined) dbPatch.payment_terms = patch.paymentTerms || null;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes || null;
    if (patch.tags !== undefined) dbPatch.tags = patch.tags;
    const { error } = await supabase.from("invoices").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  // Atomically assigns the real invoice number, advances the account's
  // number counter, and flips status to sent -- one Postgres transaction
  // (assign_invoice_number, migration-012) rather than separate
  // round-trips, so a dropped connection mid-call can never advance the
  // counter without the invoice actually ending up marked sent (or vice
  // versa). This is the only way a draft's number is ever set -- there's
  // no manual override.
  async markSentWithNumber(id: string): Promise<string> {
    const { data, error } = await supabase.rpc("assign_invoice_number", { p_invoice_id: id });
    if (error) {
      if (error.code === "23505") {
        throw new Error("The next invoice number is already in use — check Settings → Invoice numbering and adjust the next number.");
      }
      throw error;
    }
    return data as string;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) {
      // invoice_payments.invoice_id is ON DELETE RESTRICT (migration-023).
      if (error.code === "23503") throw new Error("This invoice has payments recorded against it, so it can't be removed.");
      throw error;
    }
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
  // Sequential invoice numbering: the next invoice defaults to
  // `${invoicePrefix}${invoiceNextNumber}`, editable at save time same as
  // before. invoiceNextNumber advances by one on every invoice actually
  // created, regardless of what number ends up saved (an override doesn't
  // stall the counter).
  invoicePrefix: string;
  invoiceNextNumber: number;
  // Whether this account can charge VAT at all. Off hides the entire VAT
  // block on new/existing invoices and suppresses the VAT number on the
  // printed invoice, even if one happens to still be filled in below --
  // deregistering shouldn't require also clearing that field.
  vatRegistered: boolean;
  // Free text, but its own field rather than folded into invoice notes --
  // shown on the printed invoice as a dedicated "How to pay" block.
  bankDetails: string;
  // Editable wording for the three fixed payment-reminder slots (3 days
  // before due / on due date / 7 days after). Null means "use the app's
  // built-in default text" -- these only hold an override.
  reminderTextBefore: string | null;
  reminderTextDue: string | null;
  reminderTextAfter: string | null;
  reminderTextLate: string | null;
  reminderTextFinal: string | null;
  // Mention statutory late-payment interest in the final notice to
  // business clients.
  reminderLatePaymentInterest: boolean;
};

type BusinessProfileRow = {
  business_name: string | null;
  vat_number: string | null;
  address: string | null;
  logo_url: string | null;
  show_overdue_reminders: boolean | null;
  custom_categories: string[] | null;
  inbox_token: string | null;
  invoice_prefix: string | null;
  invoice_next_number: number | null;
  vat_registered: boolean | null;
  bank_details: string | null;
  reminder_text_before: string | null;
  reminder_text_due: string | null;
  reminder_text_after: string | null;
  reminder_text_late: string | null;
  reminder_text_final: string | null;
  reminder_late_payment_interest: boolean | null;
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
    invoicePrefix: r.invoice_prefix ?? "INV-",
    invoiceNextNumber: r.invoice_next_number ?? 1,
    vatRegistered: r.vat_registered ?? false,
    bankDetails: r.bank_details ?? "",
    reminderTextBefore: r.reminder_text_before,
    reminderTextDue: r.reminder_text_due,
    reminderTextAfter: r.reminder_text_after,
    reminderTextLate: r.reminder_text_late ?? null,
    reminderTextFinal: r.reminder_text_final ?? null,
    reminderLatePaymentInterest: r.reminder_late_payment_interest ?? false,
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
  invoicePrefix: "INV-",
  invoiceNextNumber: 1,
  vatRegistered: false,
  bankDetails: "",
  reminderTextBefore: null,
  reminderTextDue: null,
  reminderTextAfter: null,
  reminderTextLate: null,
  reminderTextFinal: null,
  reminderLatePaymentInterest: false,
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
      invoice_prefix: input.invoicePrefix || null,
      invoice_next_number: input.invoiceNextNumber,
      vat_registered: input.vatRegistered,
      bank_details: input.bankDetails || null,
      reminder_text_before: input.reminderTextBefore || null,
      reminder_text_due: input.reminderTextDue || null,
      reminder_text_after: input.reminderTextAfter || null,
      reminder_text_late: input.reminderTextLate || null,
      reminder_text_final: input.reminderTextFinal || null,
      reminder_late_payment_interest: input.reminderLatePaymentInterest,
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

export type RecurringInvoice = {
  id: string;
  clientId: string;
  items: InvoiceItem[];
  paymentTerms: string;
  notes: string;
  dayOfMonth: number;
  nextDueDate: string;
  active: boolean;
};

type RecurringInvoiceRow = {
  id: string;
  client_id: string | null;
  items: InvoiceItem[] | null;
  payment_terms: string | null;
  notes: string | null;
  day_of_month: number;
  next_due_date: string;
  active: boolean;
};

function recurringInvoiceFromRow(r: RecurringInvoiceRow): RecurringInvoice {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    items: (r.items ?? []).map((it) => ({ ...it, vatRate: it.vatRate ?? "zero" })),
    paymentTerms: r.payment_terms ?? "",
    notes: r.notes ?? "",
    dayOfMonth: r.day_of_month,
    nextDueDate: r.next_due_date,
    active: r.active,
  };
}

export const recurringInvoicesStore = {
  async all(): Promise<RecurringInvoice[]> {
    const { data, error } = await supabase.from("recurring_invoices").select("*").order("next_due_date");
    if (error) throw error;
    return (data as RecurringInvoiceRow[]).map(recurringInvoiceFromRow);
  },
  async add(input: Omit<RecurringInvoice, "id">): Promise<RecurringInvoice> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("recurring_invoices")
      .insert({
        user_id,
        client_id: input.clientId || null,
        items: input.items,
        payment_terms: input.paymentTerms || null,
        notes: input.notes || null,
        day_of_month: input.dayOfMonth,
        next_due_date: input.nextDueDate,
        active: input.active,
      })
      .select()
      .single();
    if (error) throw error;
    return recurringInvoiceFromRow(data as RecurringInvoiceRow);
  },
  async update(id: string, patch: Partial<Pick<RecurringInvoice, "nextDueDate" | "active">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.nextDueDate !== undefined) dbPatch.next_due_date = patch.nextDueDate;
    if (patch.active !== undefined) dbPatch.active = patch.active;
    const { error } = await supabase.from("recurring_invoices").update(dbPatch).eq("id", id);
    if (error) throw error;
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("recurring_invoices").delete().eq("id", id);
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

export type QuoteStatus = "draft" | "sent" | "accepted" | "declined" | "invoiced";

// A deposit asked for on a quote: a share of its total or a fixed amount
// (gross, incl. VAT).
export type QuoteDeposit = { kind: "percent" | "amount"; value: number };

// A priced offer to a client; accepting it can turn it into a draft
// invoice, which invoiceId then points at. A deposit, if asked for, is
// invoiced on its own first (depositInvoiceId).
export type Quote = {
  id: string;
  clientId: string;
  number: string;
  date: string;
  validUntil: string | null;
  items: InvoiceItem[];
  notes: string;
  status: QuoteStatus;
  invoiceId: string | null;
  deposit: QuoteDeposit | null;
  depositInvoiceId: string | null;
  depositClaimed: boolean;
};

type QuoteRow = {
  id: string;
  client_id: string | null;
  number: string;
  date: string;
  valid_until: string | null;
  items: InvoiceItem[] | null;
  notes: string | null;
  status: QuoteStatus;
  invoice_id: string | null;
  deposit_percent: number | string | null;
  deposit_amount: number | string | null;
  deposit_invoice_id: string | null;
  deposit_claimed: boolean | null;
};

function quoteFromRow(r: QuoteRow): Quote {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    number: r.number,
    date: r.date,
    validUntil: r.valid_until,
    items: (r.items ?? []).map((it) => ({ ...it, vatRate: it.vatRate ?? "standard" })),
    notes: r.notes ?? "",
    status: r.status,
    invoiceId: r.invoice_id,
    deposit:
      r.deposit_percent != null
        ? { kind: "percent", value: Number(r.deposit_percent) }
        : r.deposit_amount != null
          ? { kind: "amount", value: Number(r.deposit_amount) }
          : null,
    depositInvoiceId: r.deposit_invoice_id ?? null,
    depositClaimed: r.deposit_claimed ?? false,
  };
}

function depositColumns(d: QuoteDeposit | null) {
  return { deposit_percent: d?.kind === "percent" ? d.value : null, deposit_amount: d?.kind === "amount" ? d.value : null };
}

// Q-0001, Q-0002...: one past the highest number already used.
export function nextQuoteNumber(existing: Quote[]): string {
  const highest = existing.reduce((max, q) => Math.max(max, Number(/^Q-(\d+)$/.exec(q.number)?.[1] ?? 0)), 0);
  return `Q-${String(highest + 1).padStart(4, "0")}`;
}

export const quotesStore = {
  async all(): Promise<Quote[]> {
    const { data, error } = await supabase.from("quotes").select("*").order("date", { ascending: false }).order("number", { ascending: false });
    if (error) throw error;
    return (data as QuoteRow[]).map(quoteFromRow);
  },
  async get(id: string): Promise<Quote | null> {
    const { data, error } = await supabase.from("quotes").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? quoteFromRow(data as QuoteRow) : null;
  },
  async add(input: Omit<Quote, "id" | "status" | "invoiceId" | "depositInvoiceId" | "depositClaimed">): Promise<Quote> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("quotes")
      .insert({
        user_id,
        client_id: input.clientId || null,
        number: input.number,
        date: input.date,
        valid_until: input.validUntil || null,
        items: input.items,
        notes: input.notes,
        ...depositColumns(input.deposit),
        status: "draft",
      })
      .select()
      .single();
    if (error) {
      if (error.code === "23505") throw new Error(`Quote number "${input.number}" is already in use.`);
      throw error;
    }
    return quoteFromRow(data as QuoteRow);
  },
  // The offer itself (lines, client, dates) is only editable as a draft;
  // once sent, only its status moves.
  async updateDraft(id: string, patch: Partial<Pick<Quote, "clientId" | "number" | "date" | "validUntil" | "items" | "notes" | "deposit">>): Promise<void> {
    const dbPatch: Record<string, unknown> = {};
    if (patch.clientId !== undefined) dbPatch.client_id = patch.clientId || null;
    if (patch.number !== undefined) dbPatch.number = patch.number;
    if (patch.date !== undefined) dbPatch.date = patch.date;
    if (patch.validUntil !== undefined) dbPatch.valid_until = patch.validUntil || null;
    if (patch.items !== undefined) dbPatch.items = patch.items;
    if (patch.notes !== undefined) dbPatch.notes = patch.notes;
    if (patch.deposit !== undefined) Object.assign(dbPatch, depositColumns(patch.deposit));
    const { data, error } = await supabase.from("quotes").update(dbPatch).eq("id", id).eq("status", "draft").select("id");
    if (error) {
      if (error.code === "23505") throw new Error(`Quote number "${patch.number}" is already in use.`);
      throw error;
    }
    if (!data?.length) throw new Error("This quote isn't a draft any more, so it can't be changed. Reload to see it.");
  },
  // An invoiced quote stays invoiced: its invoice exists.
  async setStatus(id: string, status: Exclude<QuoteStatus, "invoiced">): Promise<void> {
    const { data, error } = await supabase.from("quotes").update({ status }).eq("id", id).neq("status", "invoiced").select("id");
    if (error) throw error;
    if (!data?.length) throw new Error("This quote has already been turned into an invoice. Reload to see it.");
  },
  // A draft becomes sent when it's emailed; anything further along stays.
  async markSent(id: string): Promise<boolean> {
    const { data, error } = await supabase.from("quotes").update({ status: "sent" }).eq("id", id).eq("status", "draft").select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
  // Turning a quote into an invoice claims it first (status invoiced, no
  // invoice yet), so a second tap or tab can't make a second invoice; the
  // invoice is then made from the claimed row, not from what a possibly
  // stale page shows, and linked. claim returns null if another tap got
  // there first; release puts it back if no invoice was made.
  async claimForInvoice(id: string): Promise<Quote | null> {
    const { data, error } = await supabase
      .from("quotes")
      .update({ status: "invoiced" })
      .eq("id", id)
      .neq("status", "invoiced")
      .is("invoice_id", null)
      .select("*");
    if (error) throw error;
    return data?.length ? quoteFromRow(data[0] as QuoteRow) : null;
  },
  async releaseClaim(id: string, status: Exclude<QuoteStatus, "invoiced">): Promise<void> {
    const { error } = await supabase.from("quotes").update({ status }).eq("id", id).eq("status", "invoiced").is("invoice_id", null);
    if (error) throw error;
  },
  // The deposit invoice is claimed like the final one: deposit_claimed first,
  // so a double tap or another tab can't make two; released if no invoice
  // was made, linked once it was. Only an accepted quote with a deposit.
  async claimDeposit(id: string): Promise<Quote | null> {
    const { data, error } = await supabase
      .from("quotes")
      .update({ deposit_claimed: true })
      .eq("id", id)
      .eq("status", "accepted")
      .eq("deposit_claimed", false)
      .is("deposit_invoice_id", null)
      .or("deposit_percent.not.is.null,deposit_amount.not.is.null")
      .select("*");
    if (error) throw error;
    return data?.length ? quoteFromRow(data[0] as QuoteRow) : null;
  },
  async releaseDeposit(id: string): Promise<void> {
    const { error } = await supabase.from("quotes").update({ deposit_claimed: false }).eq("id", id).is("deposit_invoice_id", null);
    if (error) throw error;
  },
  // False if another deposit invoice was linked first (another tab).
  async linkDeposit(id: string, invoiceId: string): Promise<boolean> {
    const { data, error } = await supabase.from("quotes").update({ deposit_invoice_id: invoiceId, deposit_claimed: true }).eq("id", id).is("deposit_invoice_id", null).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
  // Linking also sets invoiced: the invoice exists, even if the claim was
  // put back from another tab meanwhile.
  // False if another invoice was linked first (another tab).
  async linkInvoice(id: string, invoiceId: string): Promise<boolean> {
    const { data, error } = await supabase.from("quotes").update({ invoice_id: invoiceId, status: "invoiced" }).eq("id", id).is("invoice_id", null).select("id");
    if (error) throw error;
    return (data ?? []).length > 0;
  },
};

// The cron's log of reminders already emailed for an invoice (read-only for
// the owner; only the service role writes it).
export const remindersSentStore = {
  async forInvoice(invoiceId: string): Promise<{ kind: string; sentAt: string }[]> {
    const { data, error } = await supabase.from("invoice_reminders_sent").select("kind, sent_at").eq("invoice_id", invoiceId);
    if (error) throw error;
    return (data ?? []).map((r) => ({ kind: r.kind as string, sentAt: r.sent_at as string }));
  },
};

export type PaymentMethod = "bank" | "card" | "cash" | "cheque" | "other";

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  bank: "Bank transfer",
  card: "Card",
  cash: "Cash",
  cheque: "Cheque",
  other: "Other",
};

// Money received against a sales invoice (migration-023).
export type InvoicePayment = {
  id: string;
  invoiceId: string;
  date: string;
  amount: number;
  method: PaymentMethod | null;
  note: string;
};

type InvoicePaymentRow = { id: string; invoice_id: string; date: string; amount: number | string; method: PaymentMethod | null; note: string | null };

const paymentFromRow = (r: InvoicePaymentRow): InvoicePayment => ({
  id: r.id,
  invoiceId: r.invoice_id,
  date: r.date,
  amount: Number(r.amount),
  method: r.method,
  note: r.note ?? "",
});

export const paymentsStore = {
  async all(): Promise<InvoicePayment[]> {
    const { data, error } = await supabase.from("invoice_payments").select("*").order("date");
    if (error) throw error;
    return (data as InvoicePaymentRow[]).map(paymentFromRow);
  },
  async forInvoice(invoiceId: string): Promise<InvoicePayment[]> {
    const { data, error } = await supabase.from("invoice_payments").select("*").eq("invoice_id", invoiceId).order("date");
    if (error) throw error;
    return (data as InvoicePaymentRow[]).map(paymentFromRow);
  },
  async add(input: Omit<InvoicePayment, "id">): Promise<InvoicePayment> {
    const user_id = await currentUserId();
    const { data, error } = await supabase
      .from("invoice_payments")
      .insert({ user_id, invoice_id: input.invoiceId, date: input.date, amount: input.amount, method: input.method, note: input.note })
      .select()
      .single();
    if (error) throw error;
    return paymentFromRow(data as InvoicePaymentRow);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("invoice_payments").delete().eq("id", id);
    if (error) throw error;
  },
};
