"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { amount, money as gbp } from "@/lib/money";
import { useRouter } from "next/navigation";
import { Client, DocumentDetails, DocumentType, Receipt, ReceiptInput, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, effectiveCategories, mostUsedCategory, withCurrent } from "@/lib/categories";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import type { ScanDocumentType, ScanResult } from "@/lib/scanExtraction";
import type { ScanEngine } from "@/lib/extractors";
import { documentDetailsFromScan, extractPages, mergeScanResults } from "@/lib/scanClient";
import { type DocumentPart, splitDocuments } from "@/lib/splitDocuments";
import { matchSupplier, normaliseSupplierName } from "@/lib/supplierMatch";
import { findDuplicate, sameNumber, sameSupplier } from "@/lib/duplicates";
import { dropUploadMarker, leftOutNote, takeScanCapture, takeUploads, uploadMarked, scanCaptureWaiting } from "@/lib/scanHandoff";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import Link from "next/link";
import UploadFilesButton from "@/components/UploadFilesButton";
import { SAFARI_CAMERA_TIP } from "@/lib/camera";
import { useIsIOS } from "@/lib/platform";
import CaptureButton from "@/components/CaptureButton";
import PagesStrip, { Capture } from "@/components/scan/PagesStrip";
import DateConfirm from "@/components/scan/DateConfirm";
import LineItemsTable, { EditableLine, lineTotalOf } from "@/components/scan/LineItemsTable";
import DocumentDetailsFields from "@/components/scan/DocumentDetailsFields";
import PaidChoice from "@/components/scan/PaidChoice";
import CreditOfSelect from "@/components/scan/CreditOfSelect";
import FieldFlag, { Confidence } from "@/components/scan/FieldFlag";
import ContactField, { type Usage } from "@/components/ContactField";
import { type RegisterCheck, RegisterNote, useRegisterCheck } from "@/components/RegisterBits";
import { useCompanyLookup } from "@/lib/companyConfigured";
import { saveFailed } from "@/lib/errorText";
import ScanLimitNotice from "@/components/ScanLimitNotice";
import ScansLeft from "@/components/ScansLeft";
import { topUpOffered } from "@/lib/scanAllowance";
import { todayISO } from "@/lib/today";
import { vatForReading, vatFromRate, workedOutNote } from "@/lib/vatFromRate";
import Tip from "@/components/Tip";

type TransactionalType = "invoice" | "receipt" | "credit_note";
type Mode = TransactionalType | "archival" | "contact";

type Form = {
  docType: ScanDocumentType | null;
  typeOverride: TransactionalType | null;
  clientId: string;
  vendor: string;
  vendorConf: Confidence | null;
  invoiceNumber: string;
  date: string;
  dateConf: Confidence | null;
  dateAsPrinted: string | null;
  // Non-null while the day-first reading still needs confirming.
  dateAlternative: string | null;
  dueDate: string;
  dueDateAsPrinted: string | null;
  dueDateAlternative: string | null;
  category: string;
  // The model's category, restored when a supplier with no history is picked.
  categoryGuess: string;
  categoryUsual: boolean;
  totalAmount: string;
  totalConf: Confidence | null;
  vatAmount: string;
  vatConf: Confidence | null;
  // The printed rate the VAT was worked out from, when the document shows no figure.
  vatWorkedOut: number | null;
  currency: string;
  fxRateInput: string;
  details: DocumentDetails;
  notes: string;
  lines: EditableLine[];
  paid: boolean;
  paidTouched: boolean;
  creditOfReceiptId: string;
  contactPerson: string;
  contactEmail: string;
};

const EMPTY_FORM: Form = {
  docType: null,
  typeOverride: null,
  clientId: "",
  vendor: "",
  vendorConf: null,
  invoiceNumber: "",
  date: "",
  dateConf: null,
  dateAsPrinted: null,
  dateAlternative: null,
  dueDate: "",
  dueDateAsPrinted: null,
  dueDateAlternative: null,
  category: "",
  categoryGuess: "",
  categoryUsual: false,
  totalAmount: "",
  totalConf: null,
  vatAmount: "",
  vatConf: null,
  vatWorkedOut: null,
  currency: "GBP",
  fxRateInput: "",
  details: {},
  notes: "",
  lines: [],
  paid: true,
  paidTouched: false,
  creditOfReceiptId: "",
  contactPerson: "",
  contactEmail: "",
};

const TYPE_WORD: Record<TransactionalType, string> = { invoice: "Invoice", receipt: "Receipt", credit_note: "Credit note" };
const SAVED_TYPE: Record<Mode, DocumentType> = { invoice: "invoice", receipt: "receipt", credit_note: "credit_note", archival: "other", contact: "other" };
const TRANSACTIONAL: ScanDocumentType[] = ["receipt", "invoice", "credit_note"];

function modeOf(f: Form): Mode {
  if (f.typeOverride) return f.typeOverride;
  if (f.docType === "business_card") return "contact";
  if (f.docType === "bank_statement" || f.docType === "contract" || f.docType === "barcode") return "archival";
  if (f.docType === "invoice" || f.docType === "credit_note") return f.docType;
  return "receipt";
}

function headingFor(f: Form, mode: Mode): string {
  if (mode === "archival" || mode === "contact") return (f.docType ?? "document").replace("_", " ").replace(/^\w/, (c) => c.toUpperCase());
  return TYPE_WORD[mode];
}

const ENGINE_KEY = "scan-engine";

// Gemini unless Claude was picked: on the live site it read a receipt in
// 3.7s to Claude's 9.6s, with the same result, and longer PDFs widen that
// gap. Claude stays a tap away under "Read with".
// /scan?engine=claude (or gemini) sets the choice on this device and shows
// the picker from then on; nothing else writes the key.
function readEngine(): ScanEngine {
  try {
    const asked = new URLSearchParams(window.location.search).get("engine");
    if (asked === "claude" || asked === "gemini") localStorage.setItem(ENGINE_KEY, asked);
    return localStorage.getItem(ENGINE_KEY) === "claude" ? "claude" : "gemini";
  } catch {
    return "gemini";
  }
}

const pill = (on: boolean) => `rounded-full px-3 py-1 text-xs font-medium ${on ? "bg-neutral-900 text-white" : "border text-neutral-700"}`;

// Reads for a batch start together, a few at a time, so the next
// document is usually ready by the time the current one is saved.
const READ_CONCURRENCY = 3;

function limiter(n: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => {
    if (active >= n || !queue.length) return;
    active++;
    queue.shift()!();
  };
  return <T,>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      queue.push(() =>
        fn()
          .then(resolve, reject)
          .finally(() => {
            active--;
            next();
          })
      );
      next();
    });
}

function usualCategory(clientId: string, supplierList: Client[], receiptList: Receipt[]): string | null {
  if (!clientId) return null;
  const vendor = supplierList.find((c) => c.id === clientId)?.name ?? "";
  return mostUsedCategory(receiptList.filter((r) => sameSupplier(r, { clientId, vendor })).map((r) => r.category));
}

function exactSupplier(name: string, supplierList: Client[]): Client | undefined {
  const n = normaliseSupplierName(name);
  return n ? supplierList.find((c) => normaliseSupplierName(c.name) === n) : undefined;
}

function supplierCategory(f: Form, clientId: string, supplierList: Client[], receiptList: Receipt[], touched: Set<keyof Form>): Partial<Form> {
  if (touched.has("category")) return {};
  const usual = usualCategory(clientId, supplierList, receiptList);
  return usual ? { category: usual, categoryUsual: true } : { category: f.categoryGuess || f.category, categoryUsual: false };
}

// A reading fills the form except what was typed by hand. On the form
// he's looking at (`shown`) a supplier is matched loosely, since he sees
// the match; a document Save all files unseen is linked only to a supplier
// of exactly the same name.
function formFromResult(result: ScanResult, f: Form, touched: Set<keyof Form>, supplierList: Client[], receiptList: Receipt[], shown: boolean): Form {
  // A UK document writes the day first, so "08/09/26" is 8 September and
  // there's nothing to ask. Only a document in another currency (an
  // American supplier, say) might mean 9 August.
  const askOrder = !!result.currency && result.currency !== "GBP";
  const unless = (k: keyof Form, fields: Partial<Form>) => (touched.has(k) ? {} : fields);
  const match =
    touched.has("clientId") || !result.vendor
      ? null
      : shown
        ? matchSupplier(result.vendor, supplierList)
        : (exactSupplier(result.vendor, supplierList) ?? null);
  const credited = receiptList.find((r) => r.documentType === "invoice" && sameNumber(r.invoiceNumber, result.creditedInvoiceNumber));
  // Same belt-and-braces as documentDetailsFromScan: conformToSchema
  // guarantees the list, and a missing one must read as no lines rather
  // than take the page down.
  const lines = (result.lineItems ?? []).map((li) => ({
    description: li.description,
    quantity: String(li.quantity),
    unitPrice: String(li.unitPrice),
    lineTotal: li.lineTotal,
  }));
  const clientId = touched.has("clientId") ? f.clientId : match?.id ?? "";
  const categoryGuess = result.category ?? f.category;
  const vat = vatForReading(result);
  return {
    ...f,
    docType: result.documentType,
    ...unless("clientId", { clientId: match?.id ?? "" }),
    ...unless("vendor", { vendor: result.vendor ?? "", vendorConf: result.vendorConfidence }),
    ...unless("invoiceNumber", { invoiceNumber: result.invoiceNumber ?? "" }),
    ...unless("date", {
      date: result.date ?? f.date,
      // No date on the document means the box holds today's date, which is
      // not what the document says. The model's own confidence is about
      // what it read, and for a receipt with no date printed the honest
      // answer to that is "high" -- so mark it low here instead, or a
      // July receipt scanned in September is saved into the wrong quarter
      // with nothing on screen suggesting it should be checked.
      dateConf: result.date ? result.dateConfidence : "low",
      dateAsPrinted: result.dateAsPrinted,
      dateAlternative: askOrder && result.date && result.dateAmbiguous ? result.dateAlternative : null,
    }),
    ...unless("dueDate", {
      dueDate: result.dueDate ?? "",
      dueDateAsPrinted: result.dueDateAsPrinted,
      dueDateAlternative: askOrder && result.dueDate && result.dueDateAmbiguous ? result.dueDateAlternative : null,
    }),
    categoryGuess,
    ...supplierCategory({ ...f, categoryGuess }, clientId, supplierList, receiptList, touched),
    ...unless("totalAmount", {
      totalAmount: result.totalAmount !== null ? String(result.totalAmount) : "",
      totalConf: result.totalAmountConfidence,
    }),
    ...unless("vatAmount", {
      vatAmount: vat.vatAmount !== null ? String(vat.vatAmount) : "",
      vatConf: vat.vatAmountConfidence,
      vatWorkedOut: vat.workedOutFromRate,
    }),
    ...unless("details", { details: documentDetailsFromScan(result.details) }),
    ...unless("notes", { notes: result.notes ?? "" }),
    lines: touched.has("lines") ? [...f.lines, ...lines.slice(f.lines.length)] : lines,
    // What the document says wins (an online order paid by card still
    // prints a due date); otherwise a printed due date means it's a bill.
    paid: f.paidTouched ? f.paid : (result.paidOnDocument ?? !result.dueDate),
    ...unless("creditOfReceiptId", { creditOfReceiptId: credited?.id ?? "" }),
    ...unless("contactPerson", { contactPerson: result.contactPerson ?? "" }),
    ...unless("contactEmail", { contactEmail: result.contactEmail ?? "" }),
  };
}

// Same conversion as the manual Receipts form: figures stay in
// `currency` until save time, when they're converted to GBP.
function gbpAmounts(f: Form) {
  const total = parseFloat(f.totalAmount) || 0;
  const vat = parseFloat(f.vatAmount) || 0;
  if (f.currency === "GBP") {
    return { netGbp: Math.max(0, total - vat), vatGbp: vat, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
  }
  const rate = parseFloat(f.fxRateInput) || 0;
  const totalGbp = total * rate;
  const vatGbp = vat * rate;
  return { netGbp: Math.max(0, totalGbp - vatGbp), vatGbp, originalAmount: total, originalVatAmount: vat, originalCurrency: f.currency, fxRate: rate };
}

function saveProblem(f: Form): string | null {
  const mode = modeOf(f);
  if (mode !== "archival" && !f.totalAmount) return "Enter a total before saving.";
  if (f.currency !== "GBP" && !f.fxRateInput) return "Enter an exchange rate before saving (or wait for it to load).";
  if (mode === "invoice" && !f.paid && !f.dueDate) return "A bill to be paid needs a due date.";
  return null;
}

// Why Save all leaves a document for him to check, or null when it needs
// nothing: read, a receipt/invoice/credit note, a total it's sure of, a
// date, nothing to confirm. Currency and duplicates are checked after.
function lookReason(f: Form, result: ScanResult | null, touched: Set<keyof Form>): string | null {
  if (!result) return "couldn't be read";
  const mode = modeOf(f);
  if (mode === "archival" || mode === "contact" || (!f.typeOverride && !TRANSACTIONAL.includes(result.documentType))) return "not a receipt or invoice";
  if (!f.totalAmount) return "no total read";
  if (f.totalConf === "low" && !touched.has("totalAmount")) return "total unclear";
  // A VAT figure the model called a guess goes straight into box 4 of the
  // VAT return. It earns an amber flag when he is looking at the form, so
  // it must not be saved unseen either.
  if (f.vatConf === "low" && !touched.has("vatAmount")) return "VAT unclear";
  if (!result.date && !touched.has("date")) return "no date read";
  if (f.dateAlternative || (mode === "invoice" && f.dueDateAlternative)) return "date to confirm";
  if (mode === "invoice" && !f.paid && !f.dueDate) return "no due date";
  return null;
}

// Everything a save needs, for the Save button and Save all alike. Linked
// to the supplier the form showed or, when none was picked, to one of
// exactly this name (such as one added since the document was read).
// Nothing looser, and a supplier is never made here: only "Add as
// supplier" does that.
function prepareSave(f: Form, docPages: CapturedFile[], supplierList: Client[], receiptList: Receipt[], clearedSupplier: boolean) {
  const mode = modeOf(f);
  const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = gbpAmounts(f);
  const sign = mode === "credit_note" ? -1 : 1;
  const clientId = f.clientId || (clearedSupplier || !f.vendor.trim() ? "" : (exactSupplier(f.vendor, supplierList)?.id ?? ""));
  const invoiceNumber = f.invoiceNumber.trim() || null;
  const duplicate =
    mode === "archival"
      ? null
      : findDuplicate(
          { clientId, vendor: f.vendor, invoiceNumber, date: f.date, gross: sign * (netGbp + vatGbp), isCreditNote: mode === "credit_note" },
          receiptList
        );
  const details: DocumentDetails = { ...f.details };
  if (clearedSupplier) details.noSupplier = true;
  const other = (details.other ?? []).filter((o) => o.label.trim() && o.value.trim());
  if (other.length) details.other = other;
  else delete details.other;
  const input: ReceiptInput = {
    clientId,
    date: f.date,
    vendor: f.vendor,
    category: f.category || "Other",
    amount: sign * netGbp,
    vatAmount: sign * vatGbp,
    originalAmount,
    originalVatAmount,
    originalCurrency,
    fxRate,
    imageDataUrl: docPages[0]?.dataUrl ?? null,
    notes: f.notes,
    starred: false,
    needsReview: false,
    warrantyMonths: null,
    tags: [],
    lineItems: f.lines.map((l) => ({
      description: l.description,
      quantity: parseFloat(l.quantity) || 0,
      unitPrice: parseFloat(l.unitPrice) || 0,
      category: null,
    })),
    documentType: SAVED_TYPE[mode],
    invoiceNumber,
    dueDate: mode === "invoice" && f.dueDate ? f.dueDate : null,
    paid: mode === "invoice" ? f.paid : true,
    details,
    creditOfReceiptId: mode === "credit_note" && f.creditOfReceiptId ? f.creditOfReceiptId : null,
  };
  return { input, extraPages: docPages.slice(1).map((p) => p.dataUrl), duplicate };
}

// One document in the walk through a batch. A capture or file the reader
// finds several documents in is replaced by one entry per document.
type WalkDoc = {
  id: number;
  pages: CapturedFile[];
  result: ScanResult | null;
  error: string | null;
  // Pages put together by hand (joined in the stack, added or retaken) are
  // one document whatever the reading says.
  joined: boolean;
  // Pages that are only the whole shared photo, kept after a crop.
  context: number[];
  splitNote: string | null;
  done: "saved" | "skipped" | null;
  // Why Save all left it.
  look: string | null;
};

type Walk = { docs: WalkDoc[]; current: number };
type Lists = { cats: string[]; suppliers: Client[]; receipts: Receipt[] };

function sourceName(pages: CapturedFile[]): string {
  if (pages.length > 1) return "These pages";
  return pages[0]?.mediaType === "application/pdf" ? "This file" : "This photo";
}

export default function ScanPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);

  const [pages, setPages] = useState<CapturedFile[]>([]);
  // Files picked on another page arrive without the camera opening.
  const [capture, setCapture] = useState<Capture | null>(() => (uploadMarked() || scanCaptureWaiting() ? null : { kind: "first" }));
  // The camera on this page opens on arrival, so a person with it blocked
  // used to land on a black "Camera access was denied" screen with no way to
  // scan at all -- from the biggest button in the app. Only the camera we
  // opened ourselves closes itself; a deliberate tap keeps Try again.
  const [autoOpened] = useState(() => !uploadMarked() && !scanCaptureWaiting());
  const [cameraBlocked, setCameraBlocked] = useState(false);
  const isIOS = useIsIOS();
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  // A refusal is not a failure -- it carries what to offer next, which a
  // string cannot. Kept beside the message so the wall can show its button.
  const [refusal, setRefusal] = useState<unknown>(null);
  const [engine, setEngine] = useState<ScanEngine>(readEngine);
  // The Claude / Gemini choice is for whoever has already made one on this
  // device; everyone else just gets the document read.
  const [engineChosen] = useState(() => typeof window !== "undefined" && localStorage.getItem(ENGINE_KEY) !== null);
  const [walk, setWalkState] = useState<Walk | null>(null);
  // Picked files waiting for the supplier lists; kept here so Try again
  // can still read them if the lists failed to load.
  const [pendingUploads, setPendingUploads] = useState<CapturedFile[][] | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ saved: number; looks: string[] } | null>(null);
  // Save all's progress while it runs.
  const [bulk, setBulk] = useState<string | null>(null);

  const [form, setForm] = useState<Form>(() => ({ ...EMPTY_FORM, date: todayISO() }));
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [supplierDuplicate, setSupplierDuplicate] = useState(false);
  const [supplierCheck, setSupplierCheck] = useState<RegisterCheck>({ company: null, note: null, checking: false });
  // What the register put into the form for the document open now, so it
  // can be taken back out.
  const [registerFill, setRegisterFill] = useState<{ key: string; what: string } | null>(null);

  // A company number the register filled in belongs on the supplier's row
  // when one is added from this document.
  function registerCompanyNumber(f: Form): string {
    const found = (f.details.other ?? []).find((o) => /company number/i.test(o.label))?.value ?? "";
    return /^[A-Z0-9]{6,10}$/.test(found.toUpperCase()) ? found.toUpperCase() : "";
  }
  const [recheck, setRecheck] = useState(0);
  const filledRef = useRef<string | null>(null);
  const undoneRef = useRef<string | null>(null);
  const previousDetailsRef = useRef<DocumentDetails>({});
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Receipt | null>(null);

  // Reads land after the page has moved on, so the walk and the lists they
  // need are kept in refs as well as state.
  const walkRef = useRef<Walk | null>(null);
  const receiptsRef = useRef<Receipt[]>([]);
  const readsRef = useRef(new Map<number, Promise<void>>());
  // A document's reading generation: a result from an older read is dropped.
  const readGenRef = useRef(new Map<number, number>());
  const idRef = useRef(0);
  // Fields the user has edited, which a re-read must not overwrite.
  const touchedRef = useRef(new Set<keyof Form>());
  const listsLoadedRef = useRef(false);

  const touch = (...keys: (keyof Form)[]) => keys.forEach((k) => touchedRef.current.add(k));
  const set = (p: Partial<Form>) => setForm((f) => ({ ...f, ...p }));
  const patch = (p: Partial<Form>) => {
    touch(...(Object.keys(p) as (keyof Form)[]));
    set(p);
    setDuplicate(null);
  };

  function setWalk(next: Walk | null) {
    walkRef.current = next;
    setWalkState(next);
  }

  function updateDoc(id: number, change: Partial<WalkDoc>) {
    const w = walkRef.current;
    if (w) setWalk({ ...w, docs: w.docs.map((d) => (d.id === id ? { ...d, ...change } : d)) });
  }

  function currentDoc(): WalkDoc | null {
    const w = walkRef.current;
    return w?.docs.find((d) => d.id === w.current) ?? null;
  }

  function putReceipts(list: Receipt[]) {
    receiptsRef.current = list;
    setReceipts(list);
  }

  function pickSupplier(clientId: string, supplierList: Client[] = suppliers) {
    touch("clientId");
    setForm((f) => ({ ...f, clientId, ...supplierCategory(f, clientId, supplierList, receipts, touchedRef.current) }));
    setDuplicate(null);
  }

  useEffect(() => {
    // The iOS dashboard handoff is read synchronously so the capture
    // screen never renders for it; extraction waits for the lists to load.
    const handoff = takeScanCapture();
    if (handoff) beginHandoff(handoff);
    // Files picked with "Upload from files": each one a document, read
    // together as a batch once the suppliers are in.
    const marked = !handoff && uploadMarked();
    const uploaded = marked ? takeUploads("/scan") : null;
    const docs = uploaded ? uploaded.files.map((f) => [f]) : null;
    if (marked) dropUploadMarker();
    if (docs) beginUploads(docs, leftOutNote(uploaded!.failed, uploaded!.files.length + uploaded!.failed));
    else if (marked) uploadsLost();
    loadLists()
      .then((l) => {
        if (handoff) startBatch([[handoff]], l);
        if (docs) {
          setPendingUploads(null);
          startBatch(docs, l);
        }
      })
      .catch((err) => {
        setScanning(false);
        setScanError(saveFailed(err, "Couldn't load your suppliers and receipts."));
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier" && !c.archived);
  const supplierUsage = useMemo(() => {
    const out: Usage = {};
    for (const r of receipts) {
      if (!r.clientId) continue;
      const seen = out[r.clientId];
      out[r.clientId] = { count: (seen?.count ?? 0) + 1, last: seen && seen.last > r.date ? seen.last : r.date };
    }
    return out;
  }, [receipts]);
  const scannedInvoices = receipts.filter((r) => r.documentType === "invoice");
  const lookupOn = useCompanyLookup();
  const mode = modeOf(form);
  // A business card names a company too, so it gets the same check.
  const cardCheck = useRegisterCheck(form.vendor, null, lookupOn && mode === "contact");
  const baseMode = modeOf({ ...form, typeOverride: null });
  const heading = headingFor(form, mode);
  const position = walk ? walk.docs.findIndex((d) => d.id === walk.current) : -1;
  const doc = walk && position >= 0 ? walk.docs[position] : null;
  const remaining = walk ? walk.docs.slice(position + 1).filter((d) => !d.done).length : 0;
  const unsaved = walk ? walk.docs.filter((d) => !d.done).length : 0;

  async function loadLists(): Promise<Lists> {
    const [c, r, profile] = await Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get()]);
    setClients(c);
    putReceipts(r);
    const cats = effectiveCategories(profile.customCategories, profile.accountKind);
    setCategories(cats);
    const usual = mostUsedCategory(r.map((receipt) => receipt.category));
    if (usual) setForm((f) => (f.category ? f : { ...f, category: usual }));
    listsLoadedRef.current = true;
    return { cats, suppliers: c.filter((x) => x.kind === "supplier" && !x.archived), receipts: r };
  }

  function beginUploads(docs: CapturedFile[][], note: string | null) {
    setPendingUploads(docs);
    setUploadNote(note);
    setCapture(null);
    setScanning(true);
  }

  function uploadsLost() {
    setScanError("Your files didn't come through. Pick them again.");
  }

  async function readUploads(docs: CapturedFile[][], note: string | null) {
    beginUploads(docs, note);
    setScanError(null);
    try {
      const l = listsLoadedRef.current ? undefined : await loadLists();
      setPendingUploads(null);
      startBatch(docs, l);
    } catch (err) {
      setScanning(false);
      setScanError(saveFailed(err, "Couldn't load your suppliers and receipts."));
    }
  }

  function beginHandoff(file: CapturedFile) {
    setPages([file]);
    setCapture(null);
    setScanning(true);
  }

  function applyResult(result: ScanResult) {
    const touched = touchedRef.current;
    setForm((f) => formFromResult(result, f, touched, suppliersRef.current, receiptsRef.current, true));
    // A reading replaces the details, so whatever the register put there is
    // gone: ask again and let it fill the new gaps. An undo still stands.
    filledRef.current = null;
    setRegisterFill(null);
    setRecheck((n) => n + 1);
    if (touched.has("currency") || touched.has("fxRateInput")) return;
    if (result.currency && result.currency !== "GBP") onCurrencyChange(result.currency);
    else {
      set({ currency: "GBP", fxRateInput: "" });
      setFxError(null);
    }
  }

  // The open document as its reading stands: still reading, read, or failed.
  function show(d: WalkDoc) {
    setPages(d.pages);
    setScanning(!d.result && !d.error);
    setScanError(d.error);
    if (d.result && !d.error) applyResult(d.result);
  }

  // A batch's reads queue in `limit`; one he asked for (Try again, a page
  // added or retaken) starts at once.
  function readDoc(d: WalkDoc, cats: string[], limit?: ReturnType<typeof limiter>) {
    const { id } = d;
    const gen = (readGenRef.current.get(id) ?? 0) + 1;
    readGenRef.current.set(id, gen);
    const latest = () => readGenRef.current.get(id) === gen;
    const extract = () => extractPages(d.pages, cats, engine);
    const read = (limit ? limit(extract) : extract())
      .then((found) => {
        if (!d.joined) return splitDocuments(d.pages, found);
        // A part cut from a shared photo still carries the whole photo,
        // where the reader finds the other documents again: those are left out.
        const own = found.filter((f) => !f.pages?.length || f.pages.some((p) => !d.context.includes(p)));
        return [{ pages: d.pages, result: mergeScanResults(own.length ? own : found), context: d.context }];
      })
      .then(
        (parts) => {
          if (latest()) onRead(id, parts);
        },
        (err) => {
          if (latest()) {
            if (topUpOffered(err)) setRefusal(err);
            onReadFailed(id, saveFailed(err, "Scanning failed."));
          }
        }
      );
    readsRef.current.set(id, read);
  }

  function onRead(id: number, parts: DocumentPart[]) {
    const w = walkRef.current;
    const at = w ? w.docs.findIndex((d) => d.id === id) : -1;
    if (!w || at < 0) return;
    const d = w.docs[at];
    const splitNote = parts.length > 1 ? `${sourceName(d.pages)} had ${parts.length} documents — they're listed separately.` : d.splitNote;
    const replaced = parts.map((p, k) => ({ ...d, id: k ? ++idRef.current : id, pages: p.pages, result: p.result, context: p.context, error: null, splitNote }));
    setWalk({ ...w, docs: [...w.docs.slice(0, at), ...replaced, ...w.docs.slice(at + 1)] });
    if (w.current === id) show(replaced[0]);
  }

  function onReadFailed(id: number, error: string) {
    updateDoc(id, { error });
    const d = currentDoc();
    if (d?.id === id) show(d);
  }

  async function retry() {
    if (pendingUploads) {
      readUploads(pendingUploads, uploadNote);
      return;
    }
    let lists: Lists | undefined;
    if (!listsLoadedRef.current) {
      setScanning(true);
      setScanError(null);
      try {
        lists = await loadLists();
      } catch (err) {
        setScanning(false);
        setScanError(saveFailed(err, "Couldn't load your suppliers and receipts."));
        return;
      }
    }
    const d = currentDoc();
    if (!d) {
      startBatch([pages], lists);
      return;
    }
    updateDoc(d.id, { error: null, look: null });
    setScanning(true);
    setScanError(null);
    setRefusal(null);
    setDuplicate(null);
    readDoc(d, lists?.cats ?? categories);
  }

  function onCaptured(file: CapturedFile, current: Capture) {
    if (current.kind === "first") {
      // The iOS native camera can't ask before it opens (a confirm costs
      // the tap iOS needs), so it asks now, before dropping queued documents.
      if (remaining && !confirmStartNew()) return;
      startBatch([[file]]);
      return;
    }
    const next = current.kind === "retake" ? pages.map((p, i) => (i === current.index ? file : p)) : [...pages, file];
    setPages(next);
    setCapture(null);
    setSupplierSaved(false);
    setSupplierDuplicate(false);
    const d = currentDoc();
    if (!d) {
      startBatch([next]);
      return;
    }
    const change = { pages: next, joined: true, error: null, look: null };
    updateDoc(d.id, change);
    setScanning(true);
    setScanError(null);
    setRefusal(null);
    // A warning about the previous reading doesn't describe the next one.
    setDuplicate(null);
    readDoc({ ...d, ...change }, categories);
  }

  function startBatch(docs: CapturedFile[][], lists?: Lists) {
    readsRef.current = new Map();
    const cats = lists?.cats ?? categories;
    if (lists) suppliersRef.current = lists.suppliers;
    const entries: WalkDoc[] = docs.map((d) => ({
      id: ++idRef.current,
      pages: d,
      result: null,
      error: null,
      joined: d.length > 1,
      context: [],
      splitNote: null,
      done: null,
      look: null,
    }));
    setSummary(null);
    // A refusal describes the read that met it, and nothing after. It used to
    // be set in one place and cleared in none, so once somebody hit the wall
    // on this page the notice owned the error slot for the rest of the page's
    // life -- and the next document that genuinely failed showed the old
    // message about the limit, with no Try again anywhere.
    setRefusal(null);
    setWalk({ docs: entries, current: entries[0].id });
    const limit = limiter(READ_CONCURRENCY);
    entries.forEach((e) => readDoc(e, cats, limit));
    openDoc(entries[0]);
  }

  // Suppliers as they are now: one added while an earlier document in the
  // batch was open must be matched against the next.
  const suppliersRef = useRef<Client[]>([]);
  const formRef = useRef(form);
  useEffect(() => {
    suppliersRef.current = suppliers;
    formRef.current = form;
  });

  function openDoc(d: WalkDoc) {
    resetDocument();
    setWalk({ ...walkRef.current!, current: d.id });
    setCapture(null);
    setSupplierSaved(false);
    setSupplierDuplicate(false);
    show(d);
  }

  // True when there was another document in the batch to move on to.
  function advance(): boolean {
    const w = walkRef.current;
    const at = w ? w.docs.findIndex((d) => d.id === w.current) : -1;
    const next = w?.docs.slice(at + 1).find((d) => !d.done);
    if (!next) return false;
    openDoc(next);
    window.scrollTo({ top: 0 });
    return true;
  }

  function onEngineChange(next: ScanEngine) {
    setEngine(next);
    try {
      localStorage.setItem(ENGINE_KEY, next);
    } catch {}
  }

  function onCaptureClosed() {
    if (pages.length) setCapture(null);
    else router.push("/");
  }

  function confirmStartNew() {
    if (remaining) {
      const more = remaining === 1 ? "1 more document" : `${remaining} more documents`;
      return window.confirm(`Start a new scan? This document and ${more} from this batch haven't been saved and will be dropped.`);
    }
    return !pages.length || window.confirm("Start a new document? This scan hasn't been saved.");
  }

  function scanMore() {
    setWalk(null);
    setSummary(null);
    setPages([]);
    resetDocument();
    setCapture({ kind: "first" });
  }

  // Runs once the replacement's first page is in hand rather than when
  // the camera opens, so backing out of the camera keeps the current scan.
  function resetDocument() {
    touchedRef.current = new Set();
    setForm((f) => ({ ...EMPTY_FORM, date: todayISO(), category: f.category }));
    setSaveError(null);
    setDuplicate(null);
    setFxError(null);
    setTypePickerOpen(false);
    setRegisterFill(null);
    filledRef.current = null;
    undoneRef.current = null;
  }


  // What the document didn't print but the register holds: the registered
  // address when none was read, and the company number. Never over what
  // the document said, and undoable. `set`, not `patch`, so a re-read of
  // the document still wins and the fill is worked out again after it.
  function onRegisterCheck(check: RegisterCheck) {
    setSupplierCheck(check);
    const c = check.company;
    const f = formRef.current;
    const key = `${walkRef.current?.current ?? 0}:${normaliseSupplierName(f.vendor)}`;
    if (!c || !f.vendor.trim() || filledRef.current === key || undoneRef.current === key) return;
    filledRef.current = key;
    const previous = f.details;
    const next: DocumentDetails = { ...previous };
    const added: string[] = [];
    if (!previous.supplierAddress?.trim() && c.address) {
      // One line: the detail fields are single-line inputs, which drop \n.
      next.supplierAddress = c.address.replace(/\n/g, ", ");
      added.push("the registered address");
    }
    if (!(previous.other ?? []).some((o) => /company number/i.test(o.label))) {
      next.other = [...(previous.other ?? []), { label: "Company number", value: c.number }];
      added.push("the company number");
    }
    if (!added.length) return;
    previousDetailsRef.current = previous;
    set({ details: next });
    setRegisterFill({ key, what: added.join(" and ") });
  }

  function undoRegisterFill() {
    undoneRef.current = registerFill?.key ?? null;
    set({ details: previousDetailsRef.current });
    setRegisterFill(null);
  }

  async function onCurrencyChange(next: string) {
    set({ currency: next });
    setFxError(null);
    if (next === "GBP") {
      set({ fxRateInput: "" });
      return;
    }
    setFxLoading(true);
    try {
      const rate = await getFxRate(next, "GBP");
      set({ fxRateInput: String(rate) });
    } catch (err) {
      setFxError(saveFailed(err, "Couldn't fetch an exchange rate -- enter one manually."));
    } finally {
      setFxLoading(false);
    }
  }

  async function addAsSupplier() {
    const name = form.vendor.trim();
    if (!name) {
      setSaveError("Enter a supplier name first.");
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      const existing = exactSupplier(name, suppliers);
      if (existing) {
        pickSupplier(existing.id);
        setSupplierDuplicate(true);
        return;
      }
      const created = await clientsStore.add({
        name,
        isCompany: true,
        kind: "supplier",
        email: form.details.supplierEmail ?? form.contactEmail,
        address: form.details.supplierAddress ?? "",
        vatNumber: form.details.supplierVatNumber ?? "",
        paymentTerms: form.details.paymentTerms ?? "",
        defaultCurrency: form.currency === "GBP" ? "" : form.currency,
        contactPerson: form.contactPerson,
        phone: form.details.supplierPhone ?? "",
        companyNumber: registerCompanyNumber(form),
        remindersEnabled: true,
      });
      setClients((prev) => [...prev, created]);
      pickSupplier(created.id, [...suppliers, created]);
      setSupplierSaved(true);
    } catch (err) {
      setSaveError(saveFailed(err, "Couldn't save."));
    } finally {
      setSaving(false);
    }
  }

  const showDueDate = mode === "invoice";
  const blockedReason = scanning
    ? "Wait for the pages to be read."
    : form.dateAlternative
      ? "Confirm the date first."
      : showDueDate && form.dueDateAlternative
        ? "Confirm the due date first."
        : null;

  // The duplicate check is only as good as the list it checks: if the
  // first load failed (a weak signal), load it now rather than check nothing.
  async function checkedReceipts(): Promise<Receipt[] | null> {
    if (listsLoadedRef.current) return receiptsRef.current;
    try {
      return (await loadLists()).receipts;
    } catch {
      setSaveError("Couldn't load your saved documents to check for duplicates. Check your connection and try again.");
      return null;
    }
  }

  async function save(force = false) {
    if (blockedReason) return;
    const problem = saveProblem(form);
    if (problem) {
      setSaveError(problem);
      return;
    }
    // A second tap, or a Skip, while this save waits must not start another.
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const receiptList = await checkedReceipts();
      if (!receiptList) return;
      const clearedSupplier = touchedRef.current.has("clientId") && !form.clientId;
      const prepared = prepareSave(form, pages, suppliersRef.current, receiptList, clearedSupplier);
      if (!force && prepared.duplicate) {
        setDuplicate(prepared.duplicate);
        return;
      }
      setDuplicate(null);
      const saved = await receiptsStore.add(prepared.input, prepared.extraPages);
      putReceipts([...receiptList, saved]);
      const d = currentDoc();
      if (d) updateDoc(d.id, { done: "saved", look: null });
      if (!advance()) router.push("/receipts");
    } catch (err) {
      setSaveError(saveFailed(err, "Couldn't save."));
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  // Saves, through the same checks as Save, every document left in the
  // batch that needs nothing from him, and leaves the rest in the walk
  // with the reason. Waits for reads still running. The open document goes
  // as its form stands.
  async function saveAll() {
    const w = walkRef.current;
    if (!w || savingRef.current || scanning) return;
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setDuplicate(null);
    setBulk("Saving…");
    const shown = { id: w.current, form, pages, touched: new Set(touchedRef.current) };
    const clearedSupplier = shown.touched.has("clientId") && !form.clientId;
    try {
      let receiptList = await checkedReceipts();
      if (!receiptList) return;
      const reading = w.docs.filter((d) => !d.done && !d.result && !d.error).length;
      if (reading) setBulk(`Waiting for ${reading} to be read…`);
      await Promise.all(readsRef.current.values());
      const all = walkRef.current!.docs;
      const todo = all.filter((d) => !d.done);
      const defaultCategory = mostUsedCategory(receiptList.map((r) => r.category)) ?? form.category;
      const rates = new Map<string, Promise<number>>();
      const saved = new Set<number>();
      const looks = new Map<number, string>();
      const names = new Map<number, string>();
      for (const [n, d] of todo.entries()) {
        setBulk(`Saving ${n + 1} of ${todo.length}…`);
        const isShown = d.id === shown.id;
        let f: Form | null = isShown ? shown.form : null;
        if (!isShown && d.result) {
          const read = formFromResult(d.result, { ...EMPTY_FORM, date: todayISO(), category: defaultCategory }, new Set(), suppliersRef.current, receiptList, false);
          f = { ...read, currency: d.result.currency && d.result.currency !== "GBP" ? d.result.currency : "GBP" };
        }
        let look = !f || d.error ? "couldn't be read" : lookReason(f, d.result, isShown ? shown.touched : new Set());
        if (f && !look && f.currency !== "GBP" && !f.fxRateInput) {
          if (!rates.has(f.currency)) rates.set(f.currency, getFxRate(f.currency, "GBP"));
          try {
            f = { ...f, fxRateInput: String(await rates.get(f.currency)) };
          } catch {
            look = `in ${f.currency}, no exchange rate`;
          }
        }
        if (f && !look) {
          const prepared = prepareSave(f, isShown ? shown.pages : d.pages, suppliersRef.current, receiptList, isShown && clearedSupplier);
          if (prepared.duplicate) look = "possible duplicate";
          else {
            try {
              receiptList = [...receiptList, await receiptsStore.add(prepared.input, prepared.extraPages)];
              saved.add(d.id);
            } catch {
              look = "couldn't be saved";
            }
          }
        }
        if (look) {
          looks.set(d.id, look);
          names.set(d.id, (isShown ? shown.form.vendor : d.result?.vendor) || `Document ${all.indexOf(d) + 1}`);
        }
      }
      putReceipts(receiptList);
      const now = walkRef.current!;
      setWalk({
        ...now,
        docs: now.docs.map((d) =>
          saved.has(d.id) ? { ...d, done: "saved" as const, look: null } : looks.has(d.id) ? { ...d, look: looks.get(d.id)! } : d
        ),
      });
      setSummary({ saved: saved.size, looks: todo.filter((d) => looks.has(d.id)).map((d) => `${names.get(d.id)} (${looks.get(d.id)})`) });
      if (!saved.has(shown.id) || !advance()) window.scrollTo({ top: 0 });
    } catch (err) {
      setSaveError(saveFailed(err, "Couldn't save."));
    } finally {
      savingRef.current = false;
      setSaving(false);
      setBulk(null);
    }
  }

  function discard() {
    if (saving || savingRef.current) return;
    if (remaining) {
      if (window.confirm("Skip this document? It won't be saved.")) {
        if (doc) updateDoc(doc.id, { done: "skipped" });
        advance();
      }
      return;
    }
    const savedSome = walk?.docs.some((d) => d.done === "saved");
    if (window.confirm(savedSome ? "Discard this document? It won't be saved." : "Discard this scan? Nothing has been saved.")) router.push("/");
  }

  const summaryText =
    summary &&
    `Saved ${summary.saved}.` +
      (summary.looks.length ? ` ${summary.looks.length} need${summary.looks.length === 1 ? "s" : ""} a look: ${summary.looks.join(", ")}.` : "");

  if (capture) {
    return (
      <DocumentCapture
        onCapture={capture.kind === "first" ? undefined : (file) => onCaptured(file, capture)}
        onBatch={capture.kind === "first" ? startBatch : undefined}
        onClose={onCaptureClosed}
        onUnavailable={autoOpened && capture.kind === "first" && !pages.length ? () => { setCapture(null); setCameraBlocked(true); } : undefined}
        pageNumber={capture.kind === "add" ? pages.length + 1 : capture.kind === "retake" ? capture.index + 1 : undefined}
        failureMessage={capture.kind === "retake" ? capture.failureMessage : undefined}
      />
    );
  }

  if (walk && summary && walk.docs.every((d) => d.done)) {
    return (
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold">All saved</h1>
          <p className="mt-1 text-neutral-600">
            Saved {summary.saved} document{summary.saved === 1 ? "" : "s"}. Nothing needs a look.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => router.push("/receipts")}
            className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
          >
            See them in Receipts
          </button>
          <CaptureButton
            onOpen={scanMore}
            onCapture={(file) => startBatch([[file]])}
            className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700"
          >
            Scan more
          </CaptureButton>
        </div>
      </div>
    );
  }

  const amounts = gbpAmounts(form);
  const money = (n: number) => (form.currency === "GBP" ? gbp(n) : `${form.currency} ${amount(n)}`);
  const linesSum = form.lines.reduce((sum, l) => sum + lineTotalOf(l), 0);
  const enteredTotal = parseFloat(form.totalAmount);
  const linesMismatch =
    form.lines.length > 0 &&
    !Number.isNaN(enteredTotal) &&
    Math.abs(linesSum - enteredTotal) > 0.02 + 1e-9 &&
    Math.abs(linesSum - (enteredTotal - (parseFloat(form.vatAmount) || 0))) > 0.02 + 1e-9;
  const saveLabel =
    (mode === "archival" ? "Save to your files" : `Save ${TYPE_WORD[mode as TransactionalType]?.toLowerCase() ?? "document"}`) +
    (remaining ? " and next" : "");
  const changeLabel = mode === "archival" ? "Not right?" : `Not ${mode === "invoice" ? "an invoice" : mode === "receipt" ? "a receipt" : mode === "credit_note" ? "a credit note" : "a business card"}?`;

  // Beside Save rather than at the top, so Save stays the first thing to
  // tap for the document on screen.
  const saveAllButton = unsaved > 1 && (
    <button
      type="button"
      onClick={saveAll}
      disabled={saving || scanning}
      className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
    >
      {bulk ?? "Save all ready"}
    </button>
  );

  const pagesStrip = (
    <PagesStrip
      pages={pages}
      scanning={scanning}
      onOpen={setCapture}
      onCaptured={onCaptured}
      confirmStartNew={confirmStartNew}
    />
  );

  // Meeting a limit is shown its own way: nothing broke, and there is
  // something to do about it.
  const errorBanner = refusal ? (
    <ScanLimitNotice
      error={refusal}
      onTopUp={() => {
        // Only the error goes, so scanning can carry on. The notice stays put,
        // now showing that the extra 600 was granted: clearing it here unmounted
        // the very message that says it worked, so the panel simply vanished
        // and nobody could tell whether pressing the button had done anything.
        setScanError(null);
      }}
      onCarryOn={retry}
    />
  ) : scanError && (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p role="alert" className="text-sm text-red-600">{scanError}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {(pages.length > 0 || pendingUploads) && (
          <button
            type="button"
            onClick={retry}
            className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
          >
            Try again
          </button>
        )}
        {pages.length > 0 ? (
          <CaptureButton
            onOpen={() => setCapture({ kind: "retake", index: pages.length - 1, failureMessage: scanError })}
            onCapture={(file) => onCaptured(file, { kind: "retake", index: pages.length - 1 })}
            disabled={scanning}
            className="rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700 disabled:opacity-50"
          >
            Retake last page
          </CaptureButton>
        ) : (
          !pendingUploads && (
            <>
              <UploadFilesButton
                onFiles={(files, failed) => readUploads(files.map((f) => [f]), leftOutNote(failed, files.length + failed))}
                label="Pick files again"
                disabled={scanning}
                buttonClassName="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white"
              />
              <button
                type="button"
                onClick={() => {
                  setScanError(null);
                  setCapture({ kind: "first" });
                }}
                className="rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700"
              >
                Use the camera
              </button>
            </>
          )
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      <div>
        {summaryText && <p className="mb-3 rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-700">{summaryText}</p>}
        {walk && walk.docs.length > 1 && (
          <p className="mb-1 text-xs font-medium text-neutral-500">
            Document {position + 1} of {walk.docs.length}
          </p>
        )}
        {doc?.splitNote && <p className="mb-1 text-xs text-neutral-500">{doc.splitNote}</p>}
        {doc?.look && <p className="mb-1 text-xs font-medium text-neutral-700">Needs a look: {doc.look}.</p>}
        {uploadNote && <p className="mb-1 text-xs text-amber-700">{uploadNote}</p>}
        <p role="status" className="sr-only">{uploadNote ?? ""}</p>
        {/* Says nothing until there is little left, so a generous allowance
            never feels like a meter running. */}
        <ScansLeft />
        {cameraBlocked && (
          <div role="status" className="mb-3 rounded-xl border bg-neutral-50 p-4 text-neutral-900">
            <p className="text-base font-medium">The camera didn&apos;t open.</p>
            <p className="mt-1 text-base text-neutral-700">
              It&apos;s blocked for this site in your browser&apos;s settings. You can still upload a photo or
              PDF of the document, or type the receipt in yourself.
            </p>
            {/* "Your browser's settings" is not something anybody can act on
                from a phone, and the iPhone's own camera asks this site for
                nothing -- so on iOS the exact route is given, and the way
                that still works is offered first. */}
            {isIOS && <p className="mt-1 text-sm text-neutral-600">{SAFARI_CAMERA_TIP}</p>}
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {isIOS && (
                <UploadFilesButton
                  camera
                  multiple={false}
                  onFiles={(files, failed) => { setCameraBlocked(false); readUploads(files.map((f) => [f]), leftOutNote(failed, files.length + failed)); }}
                  label="Use the iPhone camera instead"
                  buttonClassName="inline-flex items-center gap-1.5 rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white"
                />
              )}
              <UploadFilesButton
                onFiles={(files, failed) => { setCameraBlocked(false); readUploads(files.map((f) => [f]), leftOutNote(failed, files.length + failed)); }}
                label="Upload a photo or PDF"
                buttonClassName={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium ${isIOS ? "border bg-white text-neutral-900 shadow-sm" : "bg-neutral-900 text-white"}`}
              />
              <Link href="/receipts/new" className="inline-block py-1 text-sm font-medium text-neutral-700 underline">
                Add a receipt by hand
              </Link>
              <button type="button" onClick={() => { setCameraBlocked(false); setCapture({ kind: "first" }); }} className="inline-block py-1 text-sm font-medium text-neutral-700 underline">
                Try the camera again
              </button>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{form.docType ? heading : "Scan"}</h1>
          {form.docType && (
            <button type="button" onClick={() => setTypePickerOpen((o) => !o)} className="inline-block py-1 text-xs font-medium text-neutral-700 underline">
              {changeLabel}
            </button>
          )}
        </div>
        <Tip id="scan-how">How it works: hold the phone over the paper. It takes the photo when the page is still, reads what&apos;s on it, and you check the numbers before saving.</Tip>
        {typePickerOpen && (
          <div className="mt-2 flex flex-wrap gap-2">
            {(baseMode === "archival" || baseMode === "contact") && (
              <button
                type="button"
                onClick={() => {
                  patch({ typeOverride: null });
                  setTypePickerOpen(false);
                }}
                className={pill(!form.typeOverride)}
              >
                {headingFor(form, baseMode)}
              </button>
            )}
            {(["invoice", "receipt", "credit_note"] as TransactionalType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  patch({ typeOverride: t });
                  setTypePickerOpen(false);
                }}
                className={pill(mode === t)}
              >
                {TYPE_WORD[t]}
              </button>
            ))}
          </div>
        )}
        <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
          <p className="text-neutral-600">
            {!pages.length
              ? scanning
                ? "Reading your files…"
                : "Nothing read yet."
              : scanning
                ? `Reading ${pages.length} page${pages.length === 1 ? "" : "s"}…`
                : "The document has been read — check the details below before saving."}
          </p>
          {engineChosen && (
          <label className="flex items-center gap-2 text-xs text-neutral-500">
            Read with
            <select
              className="rounded-lg border px-2 py-1 text-sm text-neutral-900"
              value={engine}
              disabled={scanning}
              onChange={(e) => onEngineChange(e.target.value as ScanEngine)}
            >
              <option value="claude">Claude</option>
              <option value="gemini">Gemini</option>
            </select>
          </label>
          )}
        </div>
      </div>

      <fieldset disabled={scanning || bulk !== null} className="min-w-0 space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        {errorBanner}

        {mode === "contact" ? (
          <>
            {pagesStrip}
            <div>
              <label className="text-xs text-neutral-500">Company name</label>
              <input className="w-full rounded-lg border px-3 py-2" value={form.vendor} onChange={(e) => patch({ vendor: e.target.value })} />
              <FieldFlag confidence={form.vendorConf} />
              <RegisterNote check={cardCheck} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Contact person</label>
              <input className="w-full rounded-lg border px-3 py-2" value={form.contactPerson} onChange={(e) => patch({ contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <input type="email" className="w-full rounded-lg border px-3 py-2" value={form.contactEmail} onChange={(e) => patch({ contactEmail: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Notes</label>
              <textarea className="w-full rounded-lg border px-3 py-2" value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </div>
            {supplierDuplicate && (
              <p className="text-sm text-amber-700">
                Already have a supplier named &quot;{form.vendor}&quot; — didn&apos;t create a duplicate.{" "}
                <a href="/clients" className="font-medium underline">View suppliers</a>
              </p>
            )}
            {supplierSaved && <p className="text-sm text-neutral-700">Saved as a new supplier.</p>}
            {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
            <div className="flex flex-wrap gap-3">
              <button
                onClick={addAsSupplier}
                disabled={saving || supplierSaved || scanning}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : supplierSaved ? "Saved" : "Save as new supplier"}
              </button>
              <button type="button" onClick={discard} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                {remaining ? "Skip" : "Discard"}
              </button>
              {saveAllButton}
            </div>
          </>
        ) : (
          <>
            <div>
              <ContactField
                kind="supplier"
                label="Supplier"
                contacts={suppliers}
                selectedId={form.clientId}
                onSelect={(c) => pickSupplier(c?.id ?? "")}
                onCreated={(c) => setClients((prev) => [...prev, c])}
                onCheck={onRegisterCheck}
                checkTyped
                recheck={recheck}
                usage={supplierUsage}
                text={form.vendor}
                onText={(v) => patch({ vendor: v })}
                placeholder="Supplier name as printed"
                emptyOption={form.clientId ? "No supplier / general expense" : "Or pick an existing supplier…"}
                inputClassName="w-full rounded-lg border px-3 py-2 pr-10 font-medium"
              />
              <FieldFlag confidence={form.vendorConf} />
              {!form.clientId && (
                <button
                  type="button"
                  onClick={addAsSupplier}
                  disabled={saving || !form.vendor.trim()}
                  className="mt-2 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                >
                  Add as new supplier
                </button>
              )}
              {registerFill && (
                <p className="mt-1 text-xs text-neutral-500">
                  Companies House filled in {registerFill.what}, which the document doesn&apos;t show.{" "}
                  <button type="button" onClick={undoRegisterFill} className="font-medium underline">Undo</button>
                </p>
              )}
              {supplierCheck.company && supplierCheck.company.name !== form.vendor && (
                <p className="mt-1 text-xs text-neutral-500">
                  Registered as {supplierCheck.company.name}.{" "}
                  <button type="button" onClick={() => patch({ vendor: supplierCheck.company!.name })} className="font-medium underline">Use that name</button>
                </p>
              )}
              {form.clientId && form.vendor && (
                <p className="mt-1 text-xs text-neutral-500">Read as &quot;{form.vendor}&quot;.</p>
              )}
              {supplierSaved && <p className="mt-1 text-sm text-neutral-700">Saved as a new supplier.</p>}
              {supplierDuplicate && <p className="mt-1 text-sm text-amber-700">Already a supplier — using the existing one.</p>}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className={showDueDate ? "" : "col-span-2"}>
                <label className="text-xs text-neutral-500">{mode === "receipt" ? "Receipt number" : mode === "credit_note" ? "Credit note number" : "Invoice number"}</label>
                <input className="w-full rounded-lg border px-3 py-2" value={form.invoiceNumber} onChange={(e) => patch({ invoiceNumber: e.target.value })} />
              </div>
              {showDueDate && (
                <div>
                  <label className="text-xs text-neutral-500">Due date</label>
                  <input
                    type="date"
                    className="w-full rounded-lg border px-3 py-2"
                    value={form.dueDate}
                    onChange={(e) => patch({ dueDate: e.target.value, dueDateAlternative: null })}
                  />
                  {form.dueDateAlternative && (
                    <DateConfirm
                      iso={form.dueDate}
                      alternative={form.dueDateAlternative}
                      printed={form.dueDateAsPrinted}
                      onSwap={() => patch({ dueDate: form.dueDateAlternative!, dueDateAlternative: null })}
                      onConfirm={() => patch({ dueDate: form.dueDate, dueDateAlternative: null })}
                    />
                  )}
                </div>
              )}
              <div>
                <label className="text-xs text-neutral-500">Date</label>
                <input
                  type="date"
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.date}
                  onChange={(e) => patch({ date: e.target.value, dateAlternative: null })}
                />
                <FieldFlag confidence={form.dateConf} />
                {form.dateAlternative && (
                  <DateConfirm
                    iso={form.date}
                    alternative={form.dateAlternative}
                    printed={form.dateAsPrinted}
                    onSwap={() => patch({ date: form.dateAlternative!, dateAlternative: null })}
                    onConfirm={() => patch({ date: form.date, dateAlternative: null })}
                  />
                )}
              </div>
              <div>
                <label className="text-xs text-neutral-500">
                  Category{form.categoryUsual && " (usual for this supplier)"}
                </label>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.category}
                  onChange={(e) => patch({ category: e.target.value, categoryUsual: false })}
                >
                  <option value="">Category…</option>
                  {withCurrent(categories, form.category).map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
            </div>

            {pagesStrip}

            {mode === "archival" && form.docType === "barcode" && form.notes && (
              <p className="rounded-lg bg-neutral-50 p-3 text-sm text-neutral-700">
                Barcode value: <span className="font-mono font-medium">{form.notes}</span>
              </p>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-neutral-500">
                  Total ({form.currency}, incl. VAT{mode === "archival" ? ", optional" : ""})
                </label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.totalAmount}
                  // A VAT figure worked out from the printed rate follows a
                  // corrected total, or the note under it would be a lie.
                  onChange={(e) =>
                    patch({
                      totalAmount: e.target.value,
                      ...(form.vatWorkedOut !== null ? { vatAmount: String(vatFromRate(parseFloat(e.target.value), form.vatWorkedOut) ?? "") } : {}),
                    })
                  }
                  inputMode="decimal"
                />
                <FieldFlag confidence={form.totalConf} />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Of which VAT ({form.currency}, optional)</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.vatAmount}
                  onChange={(e) => patch({ vatAmount: e.target.value, vatWorkedOut: null })}
                  inputMode="decimal"
                />
                <FieldFlag confidence={form.vatConf} />
                {form.vatWorkedOut !== null && <p className="mt-1 text-xs text-neutral-600">{workedOutNote(form.vatWorkedOut)}</p>}
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div>
                <label className="text-xs text-neutral-500">Currency</label>
                <select
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.currency}
                  onChange={(e) => {
                    touch("currency");
                    onCurrencyChange(e.target.value);
                  }}
                >
                  {CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              {form.currency !== "GBP" && (
                <div className="flex items-center gap-2 self-end pb-2">
                  <label className="text-xs text-neutral-500 whitespace-nowrap">1 {form.currency} =</label>
                  <input
                    className="w-28 rounded-lg border px-2 py-1.5 text-sm"
                    value={form.fxRateInput}
                    onChange={(e) => patch({ fxRateInput: e.target.value })}
                    inputMode="decimal"
                    placeholder={fxLoading ? "Loading…" : "rate"}
                  />
                  <span className="text-xs text-neutral-500">GBP {fxLoading && "(fetching today's rate…)"}</span>
                </div>
              )}
            </div>
            {fxError && <p className="text-xs text-amber-700">{fxError}</p>}
            <p role="status" className="sr-only">{fxError ?? ""}</p>
            {mode === "archival" && (
              <p className="text-xs text-neutral-500">
                {heading}s aren&apos;t usually a single expense — leave the total blank to just file this away.
              </p>
            )}
            {form.totalAmount && (
              <p className="text-xs text-neutral-500">
                → {mode === "credit_note" ? "Refund of " : ""}{money(amounts.netGbp)} net · {money(amounts.vatGbp)} VAT · {money((amounts.netGbp + amounts.vatGbp))} total
                {form.currency !== "GBP" ? ", recorded in GBP" : ""}.
              </p>
            )}

            <DocumentDetailsFields details={form.details} onChange={(details) => patch({ details })} />

            <div>
              <label className="text-xs text-neutral-500">Notes</label>
              <textarea className="w-full rounded-lg border px-3 py-2" value={form.notes} onChange={(e) => patch({ notes: e.target.value })} />
            </div>

            {form.lines.length > 0 && (
              <LineItemsTable
                lines={form.lines}
                currency={form.currency}
                onChange={(i, linePatch) => patch({ lines: form.lines.map((l, idx) => (idx === i ? { ...l, ...linePatch } : l)) })}
              />
            )}
            {linesMismatch && (
              <p className="text-xs text-amber-700">
                The lines add up to {money(linesSum)} but the total says {money(enteredTotal)} — worth a check.
              </p>
            )}

            {mode === "invoice" && (
              <PaidChoice paid={form.paid} onChange={(paid) => patch({ paid, paidTouched: true })} />
            )}

            {mode === "credit_note" && (
              <CreditOfSelect
                invoices={scannedInvoices}
                clients={clients}
                clientId={form.clientId}
                vendor={form.vendor}
                value={form.creditOfReceiptId}
                onChange={(id) => patch({ creditOfReceiptId: id })}
              />
            )}

            {saveError && <p role="alert" className="text-sm text-red-600">{saveError}</p>}
            {duplicate && (
              <div className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
                Looks like a duplicate of {duplicate.vendor || clients.find((c) => c.id === duplicate.clientId)?.name || "a saved document"}, £
                {Math.abs(duplicate.amount + duplicate.vatAmount).toFixed(2)} on {duplicate.date}
                {duplicate.invoiceNumber ? `, number ${duplicate.invoiceNumber}` : ""}.
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => save(true)}
                    disabled={saving || !!blockedReason}
                    className="rounded-lg bg-neutral-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
                  >
                    Save anyway
                  </button>
                  <button
                    type="button"
                    onClick={discard}
                    disabled={saving}
                    className="rounded-lg border px-3 py-1.5 text-xs font-medium text-neutral-700"
                  >
                    {remaining ? "Skip this one" : "Discard"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                onClick={() => save()}
                disabled={saving || !!blockedReason}
                className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? "Saving…" : saveLabel}
              </button>
              <button type="button" onClick={discard} disabled={saving} className="rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700">
                {remaining ? "Skip" : "Discard"}
              </button>
              {saveAllButton}
              {blockedReason && !saving && <span className="text-xs text-neutral-500">{blockedReason}</span>}
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
