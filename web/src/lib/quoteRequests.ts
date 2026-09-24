import { supabase } from "./supabaseClient";
import { currentUserId, newLinkToken } from "./storage";
import { RECEIPTS_BUCKET } from "./receiptsBucket";
import type { LinePrice, Offer, Picks, RequestItem } from "./quoteCompare";
import { SIGNED_OUT } from "@/lib/errorText";

// Asking suppliers to price a list (migration-028). A request is Atanas's
// list; each supplier asked has its own row, link and answer.

export type QuoteRequest = {
  id: string;
  title: string;
  items: RequestItem[];
  notes: string;
  neededBy: string | null;
  siteAddress: string;
  status: "open" | "closed";
  choice: Picks | null;
  createdAt: string;
};

export type AnswerStatus = "waiting" | "replied" | "declined";
export type AnswerSource = "online" | "manual" | "scan";

export type RequestSupplier = {
  id: string;
  requestId: string;
  supplierId: string;
  token: string;
  sentAt: string | null;
  status: AnswerStatus;
  // Exactly as the database gave it: passed back to prove which answer the
  // page showed.
  respondedAt: string | null;
  source: AnswerSource | null;
  responderName: string | null;
  prices: Record<string, LinePrice>;
  delivery: number | null;
  vatIncluded: boolean;
  validUntil: string | null;
  note: string;
  documentPath: string | null;
};

export type Answer = Pick<RequestSupplier, "prices" | "delivery" | "vatIncluded" | "validUntil" | "note"> & { status: AnswerStatus };

type RequestRow = {
  id: string;
  title: string;
  items: RequestItem[] | null;
  notes: string | null;
  needed_by: string | null;
  site_address: string | null;
  status: "open" | "closed";
  choice: Picks | null;
  created_at: string;
};

type SupplierRow = {
  id: string;
  request_id: string;
  supplier_id: string;
  token: string;
  sent_at: string | null;
  status: AnswerStatus;
  responded_at: string | null;
  source: AnswerSource | null;
  responder_name: string | null;
  prices: Record<string, LinePrice> | null;
  delivery: number | string | null;
  vat_included: boolean | null;
  valid_until: string | null;
  note: string | null;
  document_path: string | null;
};

const SUPPLIER_COLUMNS = "id, request_id, supplier_id, token, sent_at, status, responded_at, source, responder_name, prices, delivery, vat_included, valid_until, note, document_path";

const requestFromRow = (r: RequestRow): QuoteRequest => ({
  id: r.id,
  title: r.title,
  items: (r.items ?? []).map((it) => ({ id: it.id, description: it.description ?? "", quantity: Number(it.quantity) || 0, unit: it.unit ?? "", note: it.note ?? "" })),
  notes: r.notes ?? "",
  neededBy: r.needed_by,
  siteAddress: r.site_address ?? "",
  status: r.status,
  choice: r.choice,
  createdAt: r.created_at,
});

export const supplierFromRow = (r: SupplierRow): RequestSupplier => ({
  id: r.id,
  requestId: r.request_id,
  supplierId: r.supplier_id,
  token: r.token,
  sentAt: r.sent_at,
  status: r.status,
  respondedAt: r.responded_at,
  source: r.source,
  responderName: r.responder_name,
  prices: r.prices ?? {},
  delivery: r.delivery === null ? null : Number(r.delivery),
  vatIncluded: r.vat_included ?? false,
  validUntil: r.valid_until,
  note: r.note ?? "",
  documentPath: r.document_path,
});

export const newItemId = () => crypto.randomUUID().replace(/-/g, "").slice(0, 10);

export type RequestInput = Pick<QuoteRequest, "title" | "items" | "notes" | "neededBy" | "siteAddress">;

const requestColumns = (input: Partial<RequestInput>) => {
  const out: Record<string, unknown> = {};
  if (input.title !== undefined) out.title = input.title.trim();
  if (input.items !== undefined) out.items = input.items;
  if (input.notes !== undefined) out.notes = input.notes;
  if (input.neededBy !== undefined) out.needed_by = input.neededBy || null;
  if (input.siteAddress !== undefined) out.site_address = input.siteAddress;
  return out;
};

export const quoteRequestsStore = {
  async all(): Promise<QuoteRequest[]> {
    const { data, error } = await supabase.from("quote_requests").select("*").order("created_at", { ascending: false });
    if (error) throw error;
    return (data as RequestRow[]).map(requestFromRow);
  },
  async get(id: string): Promise<QuoteRequest | null> {
    const { data, error } = await supabase.from("quote_requests").select("*").eq("id", id).maybeSingle();
    if (error) throw error;
    return data ? requestFromRow(data as RequestRow) : null;
  },
  async add(input: RequestInput): Promise<QuoteRequest> {
    const user_id = await currentUserId();
    const { data, error } = await supabase.from("quote_requests").insert({ user_id, ...requestColumns(input) }).select().single();
    if (error) throw error;
    return requestFromRow(data as RequestRow);
  },
  // The list itself only changes until it has gone to a supplier (the
  // database refuses after that).
  async update(id: string, patch: Partial<RequestInput>): Promise<void> {
    const { error } = await supabase.from("quote_requests").update(requestColumns(patch)).eq("id", id);
    if (error) throw error;
  },
  async setStatus(id: string, status: QuoteRequest["status"]): Promise<void> {
    const { error } = await supabase.from("quote_requests").update({ status }).eq("id", id);
    if (error) throw error;
  },
  async saveChoice(id: string, choice: Picks | null): Promise<void> {
    const { error } = await supabase.from("quote_requests").update({ choice }).eq("id", id);
    if (error) throw error;
  },
};

export const requestSuppliersStore = {
  async all(): Promise<RequestSupplier[]> {
    const { data, error } = await supabase.from("quote_request_suppliers").select(SUPPLIER_COLUMNS).order("created_at");
    if (error) throw error;
    return (data as SupplierRow[]).map(supplierFromRow);
  },
  async forRequest(requestId: string): Promise<RequestSupplier[]> {
    const { data, error } = await supabase.from("quote_request_suppliers").select(SUPPLIER_COLUMNS).eq("request_id", requestId).order("created_at");
    if (error) throw error;
    return (data as SupplierRow[]).map(supplierFromRow);
  },
  async add(requestId: string, supplierIds: string[]): Promise<void> {
    if (!supplierIds.length) return;
    const user_id = await currentUserId();
    const { error } = await supabase
      .from("quote_request_suppliers")
      .insert(supplierIds.map((supplier_id) => ({ request_id: requestId, supplier_id, user_id, token: newLinkToken() })));
    if (error) {
      if (error.code === "23505") throw new Error("That supplier is already on this request. Reload to see it.");
      throw error;
    }
  },
  // Given the link another way (copied, texted): counts as sent.
  async markSent(id: string): Promise<void> {
    const { error } = await supabase.from("quote_request_suppliers").update({ sent_at: new Date().toISOString() }).eq("id", id).is("sent_at", null);
    if (error) throw error;
  },
  // A new token: the old link stops working at once.
  async replaceToken(id: string): Promise<void> {
    const { error } = await supabase.from("quote_request_suppliers").update({ token: newLinkToken() }).eq("id", id);
    if (error) throw error;
  },
  // Prices typed in or read from their document, or back to waiting. Only
  // over the answer the page showed; the one replaced is kept.
  async record(row: Pick<RequestSupplier, "id" | "respondedAt">, answer: Answer, source: "manual" | "scan", documentPath: string | null = null): Promise<void> {
    const { error } = await supabase.rpc("record_quote_request_response", {
      p_id: row.id,
      p_seen_responded_at: row.respondedAt,
      p_status: answer.status,
      p_source: source,
      p_prices: answer.prices,
      p_delivery: answer.delivery,
      p_vat_included: answer.vatIncluded,
      p_valid_until: answer.validUntil || null,
      p_note: answer.note,
      p_document_path: documentPath,
    });
    if (error) throw error;
  },
  // Emailed by the server to the supplier's saved address, which the page
  // shows; the server refuses if it has changed since.
  async send(id: string, to: string): Promise<{ sentAt: string }> {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error(SIGNED_OUT);
    const res = await fetch("/api/quote-requests/send", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ id, to }),
    });
    const body = (await res.json().catch(() => ({}))) as { sentAt?: string; error?: string };
    if (!res.ok || !body.sentAt) throw new Error(body.error || "The email couldn't be sent. Try again in a minute.");
    return { sentAt: body.sentAt };
  },
};

export const requestLinkUrl = (token: string) => `${typeof window === "undefined" ? "" : window.location.origin}/r/${token}`;

export function offerOf(row: RequestSupplier, name: string): Offer {
  return { id: row.id, name, prices: row.prices, delivery: row.delivery, vatIncluded: row.vatIncluded, validUntil: row.validUntil };
}

// The supplier's own PDF or photo, kept in the private receipts bucket under
// the owner's folder (the bucket's policies allow nothing else).
export async function uploadQuoteDocument(rowId: string, dataUrl: string): Promise<string> {
  const user_id = await currentUserId();
  const blob = await (await fetch(dataUrl)).blob();
  const ext = blob.type === "application/pdf" ? "pdf" : blob.type === "image/png" ? "png" : blob.type === "image/webp" ? "webp" : "jpg";
  const path = `${user_id}/quote-requests/${rowId}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage.from(RECEIPTS_BUCKET).upload(path, blob, { contentType: blob.type, upsert: false });
  if (error) throw new Error("Their document couldn't be stored. Check your connection and try again.");
  return path;
}

export async function quoteDocumentUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60 * 60);
  return data?.signedUrl ?? null;
}

export const ANSWER_LABELS: Record<AnswerStatus | "unsent", string> = { unsent: "Not sent", waiting: "Waiting", replied: "Replied", declined: "Can't quote" };
export const ANSWER_BADGES: Record<AnswerStatus | "unsent", string> = {
  unsent: "border border-neutral-300 text-neutral-600",
  waiting: "bg-neutral-100 text-neutral-800",
  replied: "bg-neutral-900 text-white",
  declined: "bg-neutral-200 text-neutral-600",
};
export const answerKey = (row: Pick<RequestSupplier, "status" | "sentAt">) => (row.status === "waiting" && !row.sentAt ? "unsent" : row.status);
