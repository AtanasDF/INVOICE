import { supabase } from "./supabaseClient";

export type Client = {
  id: string;
  name: string;
  isCompany: boolean;
  email: string;
  address: string;
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
};

function clientFromRow(r: ClientRow): Client {
  return {
    id: r.id,
    name: r.name,
    isCompany: r.is_company,
    email: r.email ?? "",
    address: r.address ?? "",
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
      })
      .select()
      .single();
    if (error) throw error;
    return receiptFromRow(data as ReceiptRow);
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
};

function invoiceFromRow(r: InvoiceRow): Invoice {
  return {
    id: r.id,
    clientId: r.client_id ?? "",
    date: r.date,
    number: r.number,
    items: r.items ?? [],
    notes: r.notes ?? "",
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
      })
      .select()
      .single();
    if (error) throw error;
    return invoiceFromRow(data as InvoiceRow);
  },
  async remove(id: string): Promise<void> {
    const { error } = await supabase.from("invoices").delete().eq("id", id);
    if (error) throw error;
  },
};
