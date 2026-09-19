"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  paymentsStore,
  Invoice,
  invoicesStore,
  Receipt,
  receiptsStore,
  recurringExpensesStore,
} from "@/lib/storage";
import { computeInvoiceTotals } from "@/lib/vat";
import { isOverdue } from "@/lib/invoiceStatus";
import { FolderIcon, RepeatIcon } from "@/components/icons";
import { readScannerMode, useIsIOS } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { stashScanCapture } from "@/lib/scanHandoff";
import { loadOpenCV } from "@/lib/opencv";
import { useAuth } from "@/lib/authContext";
import Tip from "@/components/Tip";
import TaxSoFar from "@/components/TaxSoFar";
import { TaxEstimate, estimateTax } from "@/lib/taxEstimate";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import { showOnAppIcon } from "@/lib/appBadge";

function ScanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <circle cx="12" cy="12" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
}

function billDueLabel(dueDate: string | null, today: string): { text: string; className: string } {
  if (!dueDate) return { text: "No due date", className: "text-neutral-500" };
  const days = daysBetween(today, dueDate);
  if (days < 0) return { text: `Overdue by ${-days} ${days === -1 ? "day" : "days"}`, className: "text-red-700" };
  if (days === 0) return { text: "Due today", className: "text-amber-700" };
  if (days === 1) return { text: "Due tomorrow", className: "text-amber-700" };
  if (days <= 3) return { text: `Due in ${days} days`, className: "text-amber-700" };
  return { text: `Due ${shortDate(dueDate)}`, className: "text-neutral-500" };
}

const AGING_BUCKETS = [
  { label: "Not yet due", test: (days: number) => days <= 0 },
  { label: "1–30 days overdue", test: (days: number) => days >= 1 && days <= 30 },
  { label: "31–60 days overdue", test: (days: number) => days >= 31 && days <= 60 },
  { label: "61–90 days overdue", test: (days: number) => days >= 61 && days <= 90 },
  { label: "91+ days overdue", test: (days: number) => days >= 91 },
];

export default function Dashboard() {
  const router = useRouter();
  const isIOS = useIsIOS();
  const { user } = useAuth();
  const [scanHandoffBusy, setScanHandoffBusy] = useState(false);

  const [outstandingInvoices, setOutstandingInvoices] = useState<{ invoice: Invoice; amountDue: number; clientName: string }[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [tax, setTax] = useState<TaxEstimate | null>(null);
  const [monthVat, setMonthVat] = useState(0);
  const [showOverdueBanner, setShowOverdueBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dueRecurringCount, setDueRecurringCount] = useState(0);
  const [recurringBannerDismissed, setRecurringBannerDismissed] = useState(false);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [bills, setBills] = useState<Receipt[]>([]);
  const [billCredits, setBillCredits] = useState<Map<string, number>>(new Map());
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());
  const [billsBannerDismissed, setBillsBannerDismissed] = useState(false);
  const [billsError, setBillsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // On iOS with the native camera chosen, the dashboard's Scan tap is
  // the one real user gesture available -- spending it on navigation to
  // /scan and only opening the camera once that page mounts (via a
  // second tap on "Take a photo") is one tap more than iOS actually
  // needs. A label-wrapped file input fires from this same gesture, so
  // the camera opens immediately; the captured photo is downscaled and
  // handed to /scan via sessionStorage (scanHandoff) rather than a route
  // param, then that page reads it on mount and skips straight to
  // extraction instead of showing its own capture screen. Everything
  // else keeps the plain Link -- the in-page camera already opens
  // instantly on /scan with no extra tap, so there's nothing to save.
  async function onIOSScanCapture(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setScanHandoffBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = await downscaleImageDataUrl(reader.result as string);
        stashScanCapture({ dataUrl, mediaType: "image/jpeg" });
      } catch {
        // Downscaling failed -- fall through to a plain /scan visit
        // rather than losing the capture; its own capture screen (with
        // its own upload option) still works from there.
      }
      router.push("/scan");
    };
    reader.onerror = () => router.push("/scan");
    reader.readAsDataURL(file);
  }

  // Warm-up for the in-app scanner: fetching the OpenCV script here puts
  // it in the HTTP cache and initialises the runtime before Scan is
  // tapped, and loadOpenCV caches its promise module-wide, so the capture
  // screen then resolves instantly. Failures are its problem to report.
  useEffect(() => {
    if (!user || readScannerMode() === "native") return;
    const warm = () => {
      loadOpenCV().catch(() => {});
    };
    if ("requestIdleCallback" in window) {
      const id = window.requestIdleCallback(warm);
      return () => window.cancelIdleCallback(id);
    }
    const t = setTimeout(warm, 2000);
    return () => clearTimeout(t);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const [clients, receipts, invoices, profile, recurring, creditNotes, payments] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        invoicesStore.all(),
        businessProfileStore.get(),
        recurringExpensesStore.all(),
        creditNotesStore.all(),
        paymentsStore.all(),
      ]);
      if (cancelled) return;
      const today = new Date().toISOString().slice(0, 10);
      // Compare "YYYY-MM" string prefixes rather than Date object fields --
      // constructing a Date from a bare date string and reading local
      // month/year back out is a real source of off-by-one-day bugs
      // whenever the viewer's timezone offset isn't exactly zero.
      const thisMonth = today.slice(0, 7);
      // Excludes anything still needing review -- an emailed-in receipt
      // nobody's confirmed yet shouldn't silently skew these totals
      // before it's actually been checked.
      const monthReceipts = receipts.filter((r) => r.date.slice(0, 7) === thisMonth && !r.needsReview);
      setTax(estimateTax({ invoices, creditNotes, receipts, vatRegistered: profile.vatRegistered, today }));
      setMonthTotal(monthReceipts.reduce((s, r) => s + r.amount, 0));
      setMonthVat(monthReceipts.reduce((s, r) => s + r.vatAmount, 0));

      const creditByInvoice = new Map<string, number>();
      for (const c of creditNotes) creditByInvoice.set(c.invoiceId, (creditByInvoice.get(c.invoiceId) ?? 0) + c.amount);
      const paidByInvoice = new Map<string, number>();
      for (const p of payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);

      const outstanding = invoices
        .filter((inv) => inv.status === "sent" || inv.status === "partial")
        .map((inv) => {
          const gross = computeInvoiceTotals(inv.items, invoiceVat(inv, profile.vatRegistered)).total;
          const amountDue = invoiceBalance({ total: gross, credited: creditByInvoice.get(inv.id) ?? 0, paid: paidByInvoice.get(inv.id) ?? 0, status: inv.status });
          const clientName = clients.find((c) => c.id === inv.clientId)?.name || "No client";
          return { invoice: inv, amountDue, clientName };
        });
      setOutstandingInvoices(outstanding);

      const overdue = outstanding.filter((o) => isOverdue(o.invoice.status, o.invoice.dueDate, today));
      setShowOverdueBanner(profile.showOverdueReminders && overdue.length > 0);
      setDueRecurringCount(recurring.filter((r) => r.active && r.nextDueDate <= today).length);
      setNeedsReviewCount(receipts.filter((r) => r.needsReview).length);
      setBills(receipts.filter((r) => r.documentType === "invoice" && !r.paid && !r.needsReview));
      const credits = new Map<string, number>();
      for (const r of receipts) {
        if (r.documentType !== "credit_note" || !r.creditOfReceiptId) continue;
        credits.set(r.creditOfReceiptId, (credits.get(r.creditOfReceiptId) ?? 0) + r.amount + r.vatAmount);
      }
      setBillCredits(credits);
      setSupplierNames(new Map(clients.map((c) => [c.id, c.name])));
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const overdueInvoices = useMemo(
    () => outstandingInvoices.filter((o) => isOverdue(o.invoice.status, o.invoice.dueDate, today)),
    [outstandingInvoices, today]
  );
  const owedToMe = useMemo(() => outstandingInvoices.reduce((s, o) => s + o.amountDue, 0), [outstandingInvoices]);
  const overdueAmount = useMemo(() => overdueInvoices.reduce((s, o) => s + o.amountDue, 0), [overdueInvoices]);

  const awaitingPayment = useMemo(
    () =>
      [...outstandingInvoices]
        .sort((a, b) => {
          if (!a.invoice.dueDate) return 1;
          if (!b.invoice.dueDate) return -1;
          return a.invoice.dueDate < b.invoice.dueDate ? -1 : 1;
        })
        .slice(0, 5),
    [outstandingInvoices]
  );

  const sortedBills = useMemo(
    () =>
      [...bills].sort((a, b) => {
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate < b.dueDate ? -1 : 1;
      }),
    [bills]
  );
  const billsDueSoon = useMemo(
    () => bills.filter((b) => b.dueDate && daysBetween(today, b.dueDate) <= 3).length,
    [bills, today]
  );

  useEffect(() => {
    if (!loading) showOnAppIcon(overdueInvoices.length + dueRecurringCount + billsDueSoon);
  }, [loading, overdueInvoices.length, dueRecurringCount, billsDueSoon]);

  async function markBillPaid(bill: Receipt) {
    setBillsError(null);
    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    try {
      await receiptsStore.update(bill.id, { paid: true });
    } catch (err) {
      setBills((prev) => [...prev, bill]);
      setBillsError(err instanceof Error ? err.message : "Could not mark this bill as paid.");
    }
  }

  const buckets = useMemo(() => {
    return AGING_BUCKETS.map((bucket) => {
      const total = outstandingInvoices
        .filter((o) => {
          if (!o.invoice.dueDate) return bucket.label === "Not yet due";
          const days = Math.floor((new Date(today).getTime() - new Date(o.invoice.dueDate).getTime()) / 86400000);
          return bucket.test(days);
        })
        .reduce((s, o) => s + o.amountDue, 0);
      return { label: bucket.label, total };
    });
  }, [outstandingInvoices, today]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-neutral-600">
          Scan receipts, create invoices and see what&apos;s owed to you at a glance.
        </p>
      </div>

      <Tip id="dashboard-welcome">
        New here? Tap <strong>Scan</strong> to photograph receipts and supplier invoices (several in a row is fine), or
        create an invoice. Clients, suppliers and expenses fill in as you go.
      </Tip>

      {showOverdueBanner && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            You have {overdueInvoices.length} overdue {overdueInvoices.length === 1 ? "invoice" : "invoices"} — worth checking if they&apos;ve been paid.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/invoices" className="font-medium underline">Review</Link>
            <button onClick={() => setBannerDismissed(true)} className="text-amber-600" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      {dueRecurringCount > 0 && !recurringBannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            {dueRecurringCount} recurring {dueRecurringCount === 1 ? "expense is" : "expenses are"} due — log {dueRecurringCount === 1 ? "it" : "them"} so they&apos;re not forgotten.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/recurring" className="font-medium underline">Review</Link>
            <button onClick={() => setRecurringBannerDismissed(true)} className="text-amber-600" aria-label="Dismiss">✕</button>
          </div>
        </div>
      )}

      {billsDueSoon > 0 && !billsBannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            {billsDueSoon} {billsDueSoon === 1 ? "bill needs" : "bills need"} paying soon — see <a href="#bills-to-pay" className="font-medium underline">Bills to pay</a>
          </span>
          <button onClick={() => setBillsBannerDismissed(true)} className="text-amber-600" aria-label="Dismiss">✕</button>
        </div>
      )}

      {needsReviewCount > 0 && (
        <div className="flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
          <span>
            {needsReviewCount} emailed {needsReviewCount === 1 ? "receipt is" : "receipts are"} waiting on review before {needsReviewCount === 1 ? "it counts" : "they count"} toward your totals.
          </span>
          <Link href="/receipts/review" className="font-medium underline">Review</Link>
        </div>
      )}

      <div className="flex gap-3">
        {isIOS && readScannerMode() === "native" ? (
          <label
            aria-label="Scan a document"
            aria-disabled={scanHandoffBusy}
            className="flex aspect-square w-24 flex-shrink-0 cursor-pointer flex-col items-center justify-center gap-1 rounded-xl bg-neutral-900 text-white shadow-sm transition hover:bg-neutral-800 sm:w-28"
          >
            <ScanIcon />
            <span className="text-xs font-medium">{scanHandoffBusy ? "Preparing…" : "Scan"}</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={onIOSScanCapture}
              disabled={scanHandoffBusy}
              className="hidden"
            />
          </label>
        ) : (
          <Link
            href="/scan"
            aria-label="Scan a document"
            className="flex aspect-square w-24 flex-shrink-0 flex-col items-center justify-center gap-1 rounded-xl bg-neutral-900 text-white shadow-sm transition hover:bg-neutral-800 sm:w-28"
          >
            <ScanIcon />
            <span className="text-xs font-medium">Scan</span>
          </Link>
        )}
        <div className="grid flex-1 grid-cols-1 gap-2">
          <Link href="/receipts/new" className="rounded-lg border bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
            + Add a receipt manually
          </Link>
          <Link href="/invoices/new" className="rounded-lg border bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
            + Create an invoice
          </Link>
          <Link href="/clients" className="rounded-lg border bg-white px-4 py-2.5 text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md">
            + Add a client or company
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/invoices" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm transition hover:shadow-md">
          <div className="text-3xl font-bold">£{owedToMe.toFixed(2)}</div>
          <div className="mt-1 text-sm text-neutral-600">Owed to you</div>
        </Link>
        <Link href="/invoices" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm transition hover:shadow-md">
          <div className={`text-3xl font-bold ${overdueAmount > 0 ? "text-red-700" : ""}`}>£{overdueAmount.toFixed(2)}</div>
          <div className="mt-1 text-sm text-neutral-600">Overdue</div>
        </Link>
        <Link href="/expenses" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm transition hover:shadow-md">
          <div className="text-3xl font-bold">£{(monthTotal + monthVat).toFixed(2)}</div>
          <div className="mt-1 text-sm text-neutral-600">Spent this month</div>
        </Link>
      </div>

      <div className="flex flex-wrap gap-4">
        <Link href="/files" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
          <FolderIcon /> Browse your file library &rarr;
        </Link>
        <Link href="/recurring" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
          <RepeatIcon /> Recurring expenses &rarr;
        </Link>
        <Link href="/recurring/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-blue-600">
          <RepeatIcon /> Recurring invoices &rarr;
        </Link>
      </div>

      {bills.length > 0 && (
        <div id="bills-to-pay" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="font-semibold">Bills to pay</h2>
          {billsError && <p className="mt-2 text-sm text-red-600">{billsError}</p>}
          <div className="mt-3 space-y-2">
            {sortedBills.map((b) => {
              const due = billDueLabel(b.dueDate, today);
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span>
                    {supplierNames.get(b.clientId) || b.vendor || "Unknown supplier"}
                    {b.invoiceNumber && <span className="text-neutral-500"> · {b.invoiceNumber}</span>}
                    <span className={due.className}> · {due.text}</span>
                  </span>
                  <span className="flex items-center gap-3 whitespace-nowrap">
                    <span className="font-medium">£{(b.amount + b.vatAmount + (billCredits.get(b.id) ?? 0)).toFixed(2)}</span>
                    <button onClick={() => markBillPaid(b)} className="font-medium text-blue-600">Mark as paid</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">Awaiting payment</h2>
        {awaitingPayment.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing outstanding right now.</p>
        ) : (
          <div className="mt-3 space-y-2">
            {awaitingPayment.map((o) => {
              const overdue = isOverdue(o.invoice.status, o.invoice.dueDate, today);
              return (
                <Link
                  key={o.invoice.id}
                  href={`/invoices/${o.invoice.id}`}
                  className="flex items-center justify-between border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  <span>
                    #{o.invoice.number} · {o.clientName}
                    {o.invoice.dueDate && <span className={overdue ? "text-red-700" : "text-neutral-500"}> · due {o.invoice.dueDate}</span>}
                  </span>
                  <span className="font-medium">£{o.amountDue.toFixed(2)}</span>
                </Link>
              );
            })}
          </div>
        )}
        {outstandingInvoices.length > awaitingPayment.length && (
          <Link href="/invoices" className="mt-3 inline-block text-sm font-medium text-blue-600">
            View all {outstandingInvoices.length} outstanding &rarr;
          </Link>
        )}
      </div>

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">Aged receivables</h2>
        <div className="mt-3 space-y-2">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">{b.label}</span>
              <span className="font-medium">£{b.total.toFixed(2)}</span>
            </div>
          ))}
        </div>
      </div>

      {tax && <TaxSoFar estimate={tax} />}

      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">This month so far</h2>
        <div className="mt-3 grid grid-cols-3 gap-4">
          <div>
            <div className="text-2xl font-bold">£{monthTotal.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Spent excl. VAT</div>
          </div>
          <div>
            <div className="text-2xl font-bold">£{monthVat.toFixed(2)}</div>
            <div className="text-sm text-neutral-600">VAT on those costs</div>
          </div>
          <div>
            <div className="text-2xl font-bold">£{(monthTotal + monthVat).toFixed(2)}</div>
            <div className="text-sm text-neutral-600">Spent incl. VAT</div>
          </div>
        </div>
        <Link href="/expenses" className="mt-4 inline-block text-sm font-medium text-blue-600">
          View full expense summary &rarr;
        </Link>
      </div>
    </div>
  );
}
