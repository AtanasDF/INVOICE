"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Client, DocumentDetails, DocumentType, Receipt, businessProfileStore, clientsStore, receiptsStore } from "@/lib/storage";
import { CATEGORIES, effectiveCategories, mostUsedCategory } from "@/lib/categories";
import { CURRENCIES, getFxRate } from "@/lib/fx";
import type { ScanDocumentType, ScanResult } from "@/lib/scanExtraction";
import type { ScanEngine } from "@/lib/extractors";
import { documentDetailsFromScan, extractPages } from "@/lib/scanClient";
import { matchSupplier, normaliseSupplierName } from "@/lib/supplierMatch";
import { findDuplicate, sameNumber, sameSupplier } from "@/lib/duplicates";
import { dropUploadMarker, leftOutNote, takeScanCapture, takeUploads, uploadMarked } from "@/lib/scanHandoff";
import DocumentCapture, { CapturedFile } from "@/components/DocumentCapture";
import UploadFilesButton from "@/components/UploadFilesButton";
import CaptureButton from "@/components/CaptureButton";
import PagesStrip, { Capture } from "@/components/scan/PagesStrip";
import DateConfirm from "@/components/scan/DateConfirm";
import LineItemsTable, { EditableLine, lineTotalOf } from "@/components/scan/LineItemsTable";
import DocumentDetailsFields from "@/components/scan/DocumentDetailsFields";
import PaidChoice from "@/components/scan/PaidChoice";
import CreditOfSelect from "@/components/scan/CreditOfSelect";
import FieldFlag, { Confidence } from "@/components/scan/FieldFlag";

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

function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

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
function readEngine(): ScanEngine {
  try {
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

export default function ScanPage() {
  const router = useRouter();

  const [clients, setClients] = useState<Client[]>([]);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [categories, setCategories] = useState<string[]>([...CATEGORIES]);

  const [pages, setPages] = useState<CapturedFile[]>([]);
  // Files picked on another page arrive without the camera opening.
  const [capture, setCapture] = useState<Capture | null>(() => (uploadMarked() ? null : { kind: "first" }));
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [engine, setEngine] = useState<ScanEngine>(readEngine);
  const [batch, setBatch] = useState<{ docs: CapturedFile[][]; index: number } | null>(null);
  // Picked files waiting for the supplier lists; kept here so Try again
  // can still read them if the lists failed to load.
  const [pendingUploads, setPendingUploads] = useState<CapturedFile[][] | null>(null);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const readsRef = useRef<Promise<ScanResult>[]>([]);

  const [form, setForm] = useState<Form>(() => ({ ...EMPTY_FORM, date: todayIso() }));
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [fxLoading, setFxLoading] = useState(false);
  const [fxError, setFxError] = useState<string | null>(null);
  const [supplierSaved, setSupplierSaved] = useState(false);
  const [supplierDuplicate, setSupplierDuplicate] = useState(false);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<Receipt | null>(null);

  // Extraction generation: a result from an older run is dropped.
  const runRef = useRef(0);
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

  function supplierCategory(f: Form, clientId: string, supplierList: Client[], receiptList: Receipt[]): Partial<Form> {
    if (touchedRef.current.has("category")) return {};
    const usual = usualCategory(clientId, supplierList, receiptList);
    return usual ? { category: usual, categoryUsual: true } : { category: f.categoryGuess || f.category, categoryUsual: false };
  }

  function pickSupplier(clientId: string, supplierList: Client[] = suppliers) {
    touch("clientId");
    setForm((f) => ({ ...f, clientId, ...supplierCategory(f, clientId, supplierList, receipts) }));
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
        if (handoff) runExtraction([handoff], l.cats, l.suppliers, l.receipts);
        if (docs) {
          setPendingUploads(null);
          startBatch(docs, l);
        }
      })
      .catch((err) => {
        setScanning(false);
        setScanError(err instanceof Error ? err.message : "Couldn't load your suppliers and receipts.");
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const suppliers = clients.filter((c) => c.kind === "supplier" && !c.archived);
  const scannedInvoices = receipts.filter((r) => r.documentType === "invoice");
  const mode = modeOf(form);
  const baseMode = modeOf({ ...form, typeOverride: null });
  const heading = headingFor(form, mode);
  const remaining = batch ? batch.docs.length - batch.index - 1 : 0;

  async function loadLists() {
    const [c, r, profile] = await Promise.all([clientsStore.all(), receiptsStore.all(), businessProfileStore.get()]);
    setClients(c);
    setReceipts(r);
    const cats = effectiveCategories(profile.customCategories);
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
      setScanError(err instanceof Error ? err.message : "Couldn't load your suppliers and receipts.");
    }
  }

  function beginHandoff(file: CapturedFile) {
    setPages([file]);
    setCapture(null);
    setScanning(true);
  }

  function applyResult(result: ScanResult, supplierList: Client[], receiptList: Receipt[]) {
    const touched = touchedRef.current;
    // A UK document writes the day first, so "08/09/26" is 8 September and
    // there's nothing to ask. Only a document in another currency (an
    // American supplier, say) might mean 9 August.
    const askOrder = !!result.currency && result.currency !== "GBP";
    const unless = (k: keyof Form, fields: Partial<Form>) => (touched.has(k) ? {} : fields);
    setForm((f) => {
      const match = touched.has("clientId") || !result.vendor ? null : matchSupplier(result.vendor, supplierList);
      const credited = receiptList.find(
        (r) => r.documentType === "invoice" && sameNumber(r.invoiceNumber, result.creditedInvoiceNumber)
      );
      const lines = result.lineItems.map((li) => ({
        description: li.description,
        quantity: String(li.quantity),
        unitPrice: String(li.unitPrice),
        lineTotal: li.lineTotal,
      }));
      const clientId = touched.has("clientId") ? f.clientId : match?.id ?? "";
      const categoryGuess = result.category ?? f.category;
      return {
        ...f,
        docType: result.documentType,
        ...unless("clientId", { clientId: match?.id ?? "" }),
        ...unless("vendor", { vendor: result.vendor ?? "", vendorConf: result.vendorConfidence }),
        ...unless("invoiceNumber", { invoiceNumber: result.invoiceNumber ?? "" }),
        ...unless("date", {
          date: result.date ?? f.date,
          dateConf: result.dateConfidence,
          dateAsPrinted: result.dateAsPrinted,
          dateAlternative: askOrder && result.date && result.dateAmbiguous ? result.dateAlternative : null,
        }),
        ...unless("dueDate", {
          dueDate: result.dueDate ?? "",
          dueDateAsPrinted: result.dueDateAsPrinted,
          dueDateAlternative: askOrder && result.dueDate && result.dueDateAmbiguous ? result.dueDateAlternative : null,
        }),
        categoryGuess,
        ...supplierCategory({ ...f, categoryGuess }, clientId, supplierList, receiptList),
        ...unless("totalAmount", {
          totalAmount: result.totalAmount !== null ? String(result.totalAmount) : "",
          totalConf: result.totalAmountConfidence,
        }),
        ...unless("vatAmount", {
          vatAmount: result.vatAmount !== null ? String(result.vatAmount) : "",
          vatConf: result.vatAmountConfidence,
        }),
        ...unless("details", { details: documentDetailsFromScan(result.details) }),
        ...unless("notes", { notes: result.notes ?? "" }),
        lines: touched.has("lines") ? [...f.lines, ...lines.slice(f.lines.length)] : lines,
        paid: f.paidTouched ? f.paid : !result.dueDate,
        ...unless("creditOfReceiptId", { creditOfReceiptId: credited?.id ?? "" }),
        ...unless("contactPerson", { contactPerson: result.contactPerson ?? "" }),
        ...unless("contactEmail", { contactEmail: result.contactEmail ?? "" }),
      };
    });
    if (touched.has("currency") || touched.has("fxRateInput")) return;
    if (result.currency && result.currency !== "GBP") onCurrencyChange(result.currency);
    else {
      set({ currency: "GBP", fxRateInput: "" });
      setFxError(null);
    }
  }

  async function runExtraction(
    toRead: CapturedFile[],
    cats: string[],
    supplierList: Client[],
    receiptList: Receipt[],
    pending?: Promise<ScanResult>
  ) {
    const run = ++runRef.current;
    setScanning(true);
    setScanError(null);
    // A warning about the previous reading doesn't describe the next one.
    setDuplicate(null);
    try {
      const result = await (pending ?? extractPages(toRead, cats, engine));
      if (run !== runRef.current) return;
      applyResult(result, supplierList, receiptList);
    } catch (err) {
      if (run !== runRef.current) return;
      setScanError(err instanceof Error ? err.message : "Scanning failed.");
    } finally {
      if (run === runRef.current) setScanning(false);
    }
  }

  async function retry() {
    if (pendingUploads) {
      readUploads(pendingUploads, uploadNote);
      return;
    }
    if (listsLoadedRef.current) {
      runExtraction(pages, categories, suppliers, receipts);
      return;
    }
    setScanning(true);
    setScanError(null);
    try {
      const l = await loadLists();
      runExtraction(pages, l.cats, l.suppliers, l.receipts);
    } catch (err) {
      setScanning(false);
      setScanError(err instanceof Error ? err.message : "Couldn't load your suppliers and receipts.");
    }
  }

  function onCaptured(file: CapturedFile, current: Capture) {
    let next: CapturedFile[];
    if (current.kind === "retake") next = pages.map((p, i) => (i === current.index ? file : p));
    else if (current.kind === "add") next = [...pages, file];
    else {
      // The iOS native camera can't ask before it opens (a confirm costs
      // the tap iOS needs), so it asks now, before dropping queued documents.
      if (remaining && !confirmStartNew()) return;
      dropBatch();
      resetDocument();
      next = [file];
    }
    setPages(next);
    setCapture(null);
    setSupplierSaved(false);
    setSupplierDuplicate(false);
    runExtraction(next, categories, suppliers, receipts);
  }

  function startBatch(docs: CapturedFile[][], lists?: { cats: string[]; suppliers: Client[]; receipts: Receipt[] }) {
    const limit = limiter(READ_CONCURRENCY);
    const cats = lists?.cats ?? categories;
    if (lists) suppliersRef.current = lists.suppliers;
    readsRef.current = docs.map((d) => {
      const read = limit(() => extractPages(d, cats, engine));
      read.catch(() => {});
      return read;
    });
    setBatch({ docs, index: 0 });
    openDoc(docs, 0, lists?.receipts);
  }

  // Suppliers as they are now: one added while an earlier document in the
  // batch was open must be matched against the next.
  const suppliersRef = useRef<Client[]>([]);
  useEffect(() => {
    suppliersRef.current = suppliers;
  });

  function openDoc(docs: CapturedFile[][], index: number, receiptList: Receipt[] = receipts) {
    resetDocument();
    setPages(docs[index]);
    setCapture(null);
    setSupplierSaved(false);
    setSupplierDuplicate(false);
    runExtraction(docs[index], categories, suppliersRef.current, receiptList, readsRef.current[index]);
  }

  // True when there was another document in the batch to move on to.
  // `receiptList` carries a receipt saved a moment ago, so a credit note
  // later in the batch can link to an invoice saved earlier in it.
  function advance(receiptList: Receipt[] = receipts): boolean {
    if (!batch || batch.index + 1 >= batch.docs.length) return false;
    const index = batch.index + 1;
    setBatch({ ...batch, index });
    openDoc(batch.docs, index, receiptList);
    window.scrollTo({ top: 0 });
    return true;
  }

  function dropBatch() {
    runRef.current++;
    readsRef.current = [];
    setBatch(null);
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
      const from = batch!.index + 2;
      const queued = remaining === 1 ? `document ${from}` : `documents ${from}–${batch!.docs.length}`;
      return window.confirm(`Start a new scan? This document and ${queued} from this batch haven't been saved and will be dropped.`);
    }
    return !pages.length || window.confirm("Start a new document? This scan hasn't been saved.");
  }

  // Runs once the replacement's first page is in hand rather than when
  // the camera opens, so backing out of the camera keeps the current scan.
  function resetDocument() {
    runRef.current++;
    touchedRef.current = new Set();
    setForm({ ...EMPTY_FORM, date: todayIso(), category: form.category });
    setSaveError(null);
    setDuplicate(null);
    setFxError(null);
    setTypePickerOpen(false);
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
      setFxError(err instanceof Error ? err.message : "Couldn't fetch an exchange rate -- enter one manually.");
    } finally {
      setFxLoading(false);
    }
  }

  // Same conversion as the manual Receipts form: figures stay in
  // `currency` until save time, when they're converted to GBP.
  function gbpAmounts() {
    const total = parseFloat(form.totalAmount) || 0;
    const vat = parseFloat(form.vatAmount) || 0;
    if (form.currency === "GBP") {
      return { netGbp: Math.max(0, total - vat), vatGbp: vat, originalAmount: null, originalVatAmount: null, originalCurrency: null, fxRate: null };
    }
    const rate = parseFloat(form.fxRateInput) || 0;
    const totalGbp = total * rate;
    const vatGbp = vat * rate;
    return { netGbp: Math.max(0, totalGbp - vatGbp), vatGbp, originalAmount: total, originalVatAmount: vat, originalCurrency: form.currency, fxRate: rate };
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
      const existing = suppliers.find((c) => normaliseSupplierName(c.name) === normaliseSupplierName(name));
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
        remindersEnabled: true,
      });
      setClients((prev) => [...prev, created]);
      pickSupplier(created.id, [...suppliers, created]);
      setSupplierSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
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

  async function save(force = false) {
    if (blockedReason) return;
    if (mode !== "archival" && !form.totalAmount) {
      setSaveError("Enter a total before saving.");
      return;
    }
    if (form.currency !== "GBP" && !form.fxRateInput) {
      setSaveError("Enter an exchange rate before saving (or wait for it to load).");
      return;
    }
    if (mode === "invoice" && !form.paid && !form.dueDate) {
      setSaveError("A bill to be paid needs a due date.");
      return;
    }
    const { netGbp, vatGbp, originalAmount, originalVatAmount, originalCurrency, fxRate } = gbpAmounts();
    const sign = mode === "credit_note" ? -1 : 1;
    // A second tap, or a Skip, while this save waits must not start another.
    if (savingRef.current) return;
    // The duplicate check is only as good as the list it checks: if the
    // first load failed (a weak signal), load it now rather than check nothing.
    let receiptList = receipts;
    if (!listsLoadedRef.current) {
      savingRef.current = true;
      setSaving(true);
      setSaveError(null);
      try {
        receiptList = (await loadLists()).receipts;
      } catch {
        setSaveError("Couldn't load your saved documents to check for duplicates. Check your connection and try again.");
        return;
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
    }
    // Linked when none was picked to a supplier of exactly this name, such
    // as one added since the document was read. Nothing looser: the form
    // didn't show it. A supplier is never made here: only "Add as
    // supplier" does that.
    const clearedSupplier = touchedRef.current.has("clientId") && !form.clientId;
    const clientId =
      form.clientId ||
      (clearedSupplier || !form.vendor.trim()
        ? ""
        : (suppliersRef.current.find((c) => normaliseSupplierName(c.name) === normaliseSupplierName(form.vendor))?.id ?? ""));
    if (!force && mode !== "archival") {
      const dup = findDuplicate(
        {
          clientId,
          vendor: form.vendor,
          invoiceNumber: form.invoiceNumber.trim() || null,
          date: form.date,
          gross: sign * (netGbp + vatGbp),
          isCreditNote: mode === "credit_note",
        },
        receiptList
      );
      if (dup) {
        setDuplicate(dup);
        return;
      }
    }
    setDuplicate(null);
    savingRef.current = true;
    setSaving(true);
    setSaveError(null);
    try {
      const details: DocumentDetails = { ...form.details };
      if (clearedSupplier) details.noSupplier = true;
      const other = (details.other ?? []).filter((o) => o.label.trim() && o.value.trim());
      if (other.length) details.other = other;
      else delete details.other;
      const saved = await receiptsStore.add(
        {
          clientId,
          date: form.date,
          vendor: form.vendor,
          category: form.category || "Other",
          amount: sign * netGbp,
          vatAmount: sign * vatGbp,
          originalAmount,
          originalVatAmount,
          originalCurrency,
          fxRate,
          imageDataUrl: pages[0]?.dataUrl ?? null,
          notes: form.notes,
          starred: false,
          needsReview: false,
          warrantyMonths: null,
          tags: [],
          lineItems: form.lines.map((l) => ({
            description: l.description,
            quantity: parseFloat(l.quantity) || 0,
            unitPrice: parseFloat(l.unitPrice) || 0,
            category: null,
          })),
          documentType: SAVED_TYPE[mode],
          invoiceNumber: form.invoiceNumber.trim() || null,
          dueDate: showDueDate && form.dueDate ? form.dueDate : null,
          paid: mode === "invoice" ? form.paid : true,
          details,
          creditOfReceiptId: mode === "credit_note" && form.creditOfReceiptId ? form.creditOfReceiptId : null,
        },
        pages.slice(1).map((p) => p.dataUrl)
      );
      const nextReceipts = [...receiptList, saved];
      setReceipts(nextReceipts);
      if (!advance(nextReceipts)) router.push("/receipts");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }


  function discard() {
    if (saving || savingRef.current) return;
    if (remaining) {
      if (window.confirm("Skip this document? It won't be saved.")) advance();
      return;
    }
    if (window.confirm("Discard this scan? Nothing has been saved.")) router.push("/");
  }

  if (capture) {
    return (
      <DocumentCapture
        onCapture={capture.kind === "first" ? undefined : (file) => onCaptured(file, capture)}
        onBatch={capture.kind === "first" ? startBatch : undefined}
        onClose={onCaptureClosed}
        pageNumber={capture.kind === "add" ? pages.length + 1 : capture.kind === "retake" ? capture.index + 1 : undefined}
        failureMessage={capture.kind === "retake" ? capture.failureMessage : undefined}
      />
    );
  }

  const amounts = gbpAmounts();
  const money = (n: number) => `${form.currency === "GBP" ? "£" : `${form.currency} `}${n.toFixed(2)}`;
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

  const pagesStrip = (
    <PagesStrip
      pages={pages}
      scanning={scanning}
      onOpen={setCapture}
      onCaptured={onCaptured}
      confirmStartNew={confirmStartNew}
    />
  );

  const errorBanner = scanError && (
    <div className="rounded-lg border border-red-200 bg-red-50 p-3">
      <p className="text-sm text-red-600">{scanError}</p>
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
        {batch && batch.docs.length > 1 && (
          <p className="mb-1 text-xs font-medium text-neutral-500">
            Document {batch.index + 1} of {batch.docs.length}
          </p>
        )}
        {uploadNote && <p className="mb-1 text-xs text-amber-700">{uploadNote}</p>}
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl font-bold">{form.docType ? heading : "Scan"}</h1>
          {form.docType && (
            <button type="button" onClick={() => setTypePickerOpen((o) => !o)} className="text-xs font-medium text-blue-600">
              {changeLabel}
            </button>
          )}
        </div>
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
                : `${engine === "gemini" ? "Gemini" : "Claude"} read the document — check the details below before saving.`}
          </p>
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
        </div>
      </div>

      <fieldset disabled={scanning} className="min-w-0 space-y-4 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        {errorBanner}

        {mode === "contact" ? (
          <>
            {pagesStrip}
            <div>
              <label className="text-xs text-neutral-500">Company name</label>
              <input className="w-full rounded-lg border px-3 py-2" value={form.vendor} onChange={(e) => patch({ vendor: e.target.value })} />
              <FieldFlag confidence={form.vendorConf} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Contact person</label>
              <input className="w-full rounded-lg border px-3 py-2" value={form.contactPerson} onChange={(e) => patch({ contactPerson: e.target.value })} />
            </div>
            <div>
              <label className="text-xs text-neutral-500">Email</label>
              <input className="w-full rounded-lg border px-3 py-2" value={form.contactEmail} onChange={(e) => patch({ contactEmail: e.target.value })} />
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
            {supplierSaved && <p className="text-sm text-green-700">Saved as a new supplier.</p>}
            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
            <div className="flex gap-3">
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
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="text-xs text-neutral-500">Supplier</label>
              {!form.clientId && (
                <div className="mt-1 flex gap-2">
                  <input
                    className="w-full rounded-lg border px-3 py-2 font-medium"
                    placeholder="Supplier name as printed"
                    value={form.vendor}
                    onChange={(e) => patch({ vendor: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={addAsSupplier}
                    disabled={saving || !form.vendor.trim()}
                    className="shrink-0 rounded-lg border px-4 py-2 text-sm font-medium text-neutral-700 disabled:opacity-50"
                  >
                    Add as new supplier
                  </button>
                </div>
              )}
              <FieldFlag confidence={form.vendorConf} />
              <select
                className="mt-2 w-full rounded-lg border px-3 py-2"
                value={form.clientId}
                onChange={(e) => pickSupplier(e.target.value)}
              >
                <option value="">{form.clientId ? "No supplier / general expense" : "Or pick an existing supplier…"}</option>
                {suppliers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              {form.clientId && form.vendor && (
                <p className="mt-1 text-xs text-neutral-500">Read as &quot;{form.vendor}&quot;.</p>
              )}
              {supplierSaved && <p className="mt-1 text-sm text-green-700">Saved as a new supplier.</p>}
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
                  {categories.map((c) => <option key={c} value={c}>{c}</option>)}
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
                  onChange={(e) => patch({ totalAmount: e.target.value })}
                  inputMode="decimal"
                />
                <FieldFlag confidence={form.totalConf} />
              </div>
              <div>
                <label className="text-xs text-neutral-500">Of which VAT ({form.currency}, optional)</label>
                <input
                  className="w-full rounded-lg border px-3 py-2"
                  value={form.vatAmount}
                  onChange={(e) => patch({ vatAmount: e.target.value })}
                  inputMode="decimal"
                />
                <FieldFlag confidence={form.vatConf} />
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
            {mode === "archival" && (
              <p className="text-xs text-neutral-500">
                {heading}s aren&apos;t usually a single expense — leave the total blank to just file this away.
              </p>
            )}
            {form.totalAmount && (
              <p className="text-xs text-neutral-500">
                → {mode === "credit_note" ? "Refund of " : ""}£{amounts.netGbp.toFixed(2)} net · £{amounts.vatGbp.toFixed(2)} VAT · £{(amounts.netGbp + amounts.vatGbp).toFixed(2)} total
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

            {saveError && <p className="text-sm text-red-600">{saveError}</p>}
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
              {blockedReason && !saving && <span className="text-xs text-neutral-500">{blockedReason}</span>}
            </div>
          </>
        )}
      </fieldset>
    </div>
  );
}
