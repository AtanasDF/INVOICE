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

function load<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T[]) : [];
  } catch {
    return [];
  }
}

function save<T>(key: string, items: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(items));
}

export const clientsStore = {
  all: (): Client[] => load<Client>("clients"),
  save: (items: Client[]) => save("clients", items),
};

export const receiptsStore = {
  all: (): Receipt[] => load<Receipt>("receipts"),
  save: (items: Receipt[]) => save("receipts", items),
};

export const invoicesStore = {
  all: (): Invoice[] => load<Invoice>("invoices"),
  save: (items: Invoice[]) => save("invoices", items),
};

export function uid(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
