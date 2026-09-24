"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import {
  BusinessProfile,
  Client,
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
import { isOverdue } from "@/lib/invoiceStatus";
import SwipePanels from "@/components/SwipePanels";
import UploadPanel from "@/components/UploadPanel";
import FileStrip from "@/components/FileStrip";
import GettingStarted from "@/components/GettingStarted";
import { generateInboxToken, inboxAddress } from "@/lib/inboxToken";
import { CopyIcon, DocumentIcon, FolderIcon, RepeatIcon, SearchIcon, TagIcon } from "@/components/icons";
import { readScannerMode, useIsIOS } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { stashScanCapture } from "@/lib/scanHandoff";
import { loadOpenCV } from "@/lib/opencv";
import { useAuth } from "@/lib/authContext";
import Welcome from "@/components/Welcome";
import Tip from "@/components/Tip";
import People from "@/components/dashboard/People";
import GetTheApp from "@/components/GetTheApp";
import TaxSoFar from "@/components/TaxSoFar";
import { TaxEstimate, estimateTax } from "@/lib/taxEstimate";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import { creditOffDue, invoiceCharge } from "@/lib/cis";
import { showOnAppIcon } from "@/lib/appBadge";
import { loadFailed, saveFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";

// The dashboard is a scanner (Atanas, 2026-09-23: "the scanner is going to
// play the role of the first page"). One big button for the commonest thing
// there is -- photographing a receipt or a bill -- and three smaller ones
// under it for the other three ways paper gets into the app. Everything else
// on the page comes after that, because everything else is looking rather
// than doing.
const TILE = "flex min-h-20 flex-col items-center justify-center gap-1.5 rounded-xl border bg-white p-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md";
const BIG_SCAN = "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-900 p-6 text-center text-lg font-bold text-white shadow-sm transition hover:bg-neutral-800";
// min-w-0 for the same reason as the upload tile: "Invoices sent" is
// wider than a third of a phone once the text is turned up.
const TAB = "min-w-0 flex-1 rounded-lg px-3 py-2.5 text-center text-sm font-medium";

function ScanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <circle cx="12" cy="12" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Three panels on one page (Atanas: "three rectangles... when you click the
// first one"). The choice is kept on the device: someone whose day is receipts
// should not have to find that panel again every morning.
type DashTab = "work" | "bills" | "sent";
// Money out first: scanning receipts is what a driver does all day, and what
// they open the app for (Atanas, 2026-09-24).
const TABS: { id: DashTab; label: string }[] = [
  { id: "bills", label: "Receipts & bills" },
  { id: "work", label: "Invoices & customers" },
  { id: "sent", label: "Invoices sent" },
];
const TAB_KEY = "dashboard-tab";
const isTab = (v: unknown): v is DashTab => TABS.some((t) => t.id === v);
// localStorage is outside React, so it is subscribed to rather than copied
// into state in an effect -- which would both trip the lint rule and, worse,
// render the wrong panel for one frame after every load.
const tabListeners = new Set<() => void>();
const subscribeTab = (fn: () => void) => {
  tabListeners.add(fn);
  return () => tabListeners.delete(fn);
};
function storedTab(): DashTab {
  try {
    const v = localStorage.getItem(TAB_KEY);
    return isTab(v) ? v : TABS[0].id;
  } catch {
    return TABS[0].id;
  }
}
function rememberTab(id: DashTab) {
  try {
    localStorage.setItem(TAB_KEY, id);
  } catch {
    // A locked-down browser just starts on the first panel each time.
  }
  for (const fn of tabListeners) fn();
}

// Newest first, and only what is worth showing on a dashboard: the rest is
// one tap away on the page that is built for it.
const recent = <T extends { date: string }>(rows: T[], n = 8) => [...rows].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, n);

function daysBetween(from: string, to: string): number {
  return Math.round((new Date(to).getTime() - new Date(from).getTime()) / 86400000);
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

function Dashboard() {
  const router = useRouter();
  const isIOS = useIsIOS();
  const { user } = useAuth();
  const [scanHandoffBusy, setScanHandoffBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [outstandingInvoices, setOutstandingInvoices] = useState<{ invoice: Invoice; amountDue: number; clientName: string }[]>([]);
  const [monthTotal, setMonthTotal] = useState(0);
  const [tax, setTax] = useState<TaxEstimate | null>(null);
  const [inbox, setInbox] = useState<string | null>(null);
  const [monthVat, setMonthVat] = useState(0);
  const [showOverdueBanner, setShowOverdueBanner] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);
  const [dueRecurringCount, setDueRecurringCount] = useState(0);
  const [recurringBannerDismissed, setRecurringBannerDismissed] = useState(false);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [bills, setBills] = useState<Receipt[]>([]);
  const [billCredits, setBillCredits] = useState<Map<string, number>>(new Map());
  const [supplierNames, setSupplierNames] = useState<Map<string, string>>(new Map());
  const [contacts, setContacts] = useState<Client[]>([]);
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allReceipts, setAllReceipts] = useState<Receipt[]>([]);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  // Worked out where the VAT setting is to hand, not in the render: an issued
  // invoice is totalled under the setting it was issued under, never the
  // account's current one.
  const [invoiceTotals, setInvoiceTotals] = useState<Map<string, number>>(new Map());
  const [invoiceCounts, setInvoiceCounts] = useState<Map<string, number>>(new Map());
  // Which of the three panels is showing. Remembered, because someone who
  // lives in their receipts should not have to find that panel every morning.
  const tab = useSyncExternalStore(subscribeTab, storedTab, () => TABS[0].id);
  const [billsBannerDismissed, setBillsBannerDismissed] = useState(false);
  const [billsError, setBillsError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Nothing in the account at all: the page says what to do instead of
  // showing nine £0.00s (the sweep, 2026-09-22).
  const [hasAnything, setHasAnything] = useState(true);

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
    // Not on a slow connection or with data saving on: the script is 13MB,
    // and nobody asked for it yet (Atanas, 2026-09-22: the app felt slow).
    const link = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection;
    if (link?.saveData || /2g$/.test(link?.effectiveType ?? "")) return;
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
      try {
        await loadInto();
      } catch (err) {
        if (!cancelled) setLoadError(loadFailed(err, "your dashboard"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    async function loadInto() {
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
      setHasAnything(invoices.length > 0 || receipts.length > 0);
      const today = todayISO();
      // Compare "YYYY-MM" string prefixes rather than Date object fields --
      // constructing a Date from a bare date string and reading local
      // month/year back out is a real source of off-by-one-day bugs
      // whenever the viewer's timezone offset isn't exactly zero.
      const thisMonth = today.slice(0, 7);
      // Excludes anything still needing review -- an emailed-in receipt
      // nobody's confirmed yet shouldn't silently skew these totals
      // before it's actually been checked.
      const monthReceipts = receipts.filter((r) => r.date.slice(0, 7) === thisMonth && !r.needsReview);
      setInbox(profile.inboxToken ? inboxAddress(profile.inboxToken) : null);
      setProfile(profile);
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
          const charge = invoiceCharge(inv, invoiceVat(inv, profile.vatRegistered));
          const amountDue = invoiceBalance({ total: charge.due, credited: creditOffDue(charge, creditByInvoice.get(inv.id) ?? 0), paid: paidByInvoice.get(inv.id) ?? 0, status: inv.status });
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
      setContacts(clients);
      setAllInvoices(invoices);
      setAllReceipts(receipts);
      setInvoiceTotals(new Map(invoices.map((inv) => [inv.id, invoiceCharge(inv, invoiceVat(inv, profile.vatRegistered)).total])));
      const counts = new Map<string, number>();
      for (const inv of invoices) {
        if (!inv.clientId || inv.status === "draft") continue;
        counts.set(inv.clientId, (counts.get(inv.clientId) ?? 0) + 1);
      }
      setInvoiceCounts(counts);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const today = todayISO();
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

  // A failed load leaves every figure at its initial zero, and 0 clears the
  // badge -- so "we couldn't reach your records" would take the number off
  // the home-screen icon and read as "nothing is due", on the morning a
  // bill falls due. The page already draws that distinction; the icon must.
  useEffect(() => {
    if (!loading && !loadError) showOnAppIcon(overdueInvoices.length + dueRecurringCount + billsDueSoon);
  }, [loading, loadError, overdueInvoices.length, dueRecurringCount, billsDueSoon]);

  // Several invoices settled by one transfer, recorded together. Each is a
  // payment of whatever is still owed on it -- the same thing "Mark as paid"
  // does on the invoice itself -- so the invoice works out its own status from
  // its payments, exactly as it does everywhere else. Nothing is marked until
  // the button is pressed, and a failure says which one and leaves the rest.
  const [picking, setPicking] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const payingRef = useRef(false);

  async function markPickedPaid() {
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);
    setPayError(null);
    const chosen = awaitingPayment.filter((o) => picked.has(o.invoice.id));
    const failed: string[] = [];
    for (const o of chosen) {
      try {
        await paymentsStore.add({ invoiceId: o.invoice.id, date: today, amount: o.amountDue, method: null, note: "Marked as paid" });
        await invoicesStore.update(o.invoice.id, { status: "paid" });
      } catch {
        failed.push(`#${o.invoice.number}`);
      }
    }
    payingRef.current = false;
    setPaying(false);
    // What went through leaves the list; anything that did not stays, with its
    // number named, so nobody has to work out which of five it was.
    const done = new Set(chosen.filter((o) => !failed.includes(`#${o.invoice.number}`)).map((o) => o.invoice.id));
    setOutstandingInvoices((prev) => prev.filter((o) => !done.has(o.invoice.id)));
    setAllInvoices((prev) => prev.map((i) => (done.has(i.id) ? { ...i, status: "paid" as const } : i)));
    if (failed.length) {
      setPayError(`Could not record ${failed.join(", ")}. The others went through.`);
      setPicked((prev) => new Set([...prev].filter((id) => !done.has(id))));
    } else {
      setPicking(false);
      setPicked(new Set());
    }
  }

  async function markBillPaid(bill: Receipt) {
    setBillsError(null);
    setBills((prev) => prev.filter((b) => b.id !== bill.id));
    try {
      await receiptsStore.update(bill.id, { paid: true });
    } catch (err) {
      setBills((prev) => [...prev, bill]);
      setBillsError(saveFailed(err, "Could not mark this bill as paid."));
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
  // Zeroes across the dashboard would read as "nothing is owed to you",
  // which is a very different thing from "we couldn't reach your records".
  if (loadError) {
    return <p role="alert" className="text-sm text-red-600">{loadError}</p>;
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-neutral-600">Photograph the paper, and the rest fills itself in.</p>
      </div>

      <Tip id="dashboard-welcome">
        Point the camera at a receipt, a bill or an old invoice. Anything you photograph is read for you &mdash;
        customers, suppliers and expenses appear as you go.
      </Tip>

      {showOverdueBanner && !bannerDismissed && (
        <div className="flex items-center justify-between rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <span>
            You have {overdueInvoices.length} overdue {overdueInvoices.length === 1 ? "invoice" : "invoices"} — worth checking if they&apos;ve been paid.
          </span>
          <div className="flex items-center gap-3">
            <Link href="/invoices?status=overdue" className="font-medium underline">Review</Link>
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
        <div className="flex items-center justify-between rounded-xl border bg-neutral-50 p-4 text-sm text-neutral-800">
          <span>
            {needsReviewCount} emailed {needsReviewCount === 1 ? "receipt is" : "receipts are"} waiting on review before {needsReviewCount === 1 ? "it counts" : "they count"} toward your totals.
          </span>
          <Link href="/receipts/review" className="font-medium underline">Review</Link>
        </div>
      )}

      {/* The scanner, which is what this page is for. One big button for the
          commonest thing anyone does, and three under it for the other ways
          paper gets in. On the iPhone's own-camera path the big button has to
          be the file input itself, or it takes two taps to open the camera. */}
      <section aria-label="Scan something" className="space-y-3">
        {isIOS && readScannerMode() === "native" ? (
          <label aria-disabled={scanHandoffBusy} className={`${BIG_SCAN} cursor-pointer`}>
            <ScanIcon />
            <span>{scanHandoffBusy ? "Preparing…" : "Scan a receipt or bill"}</span>
            <span className="text-sm font-normal text-neutral-300">Several in a row is fine</span>
            <input type="file" accept="image/*" capture="environment" onChange={onIOSScanCapture} disabled={scanHandoffBusy} className="hidden" />
          </label>
        ) : (
          <Link href="/scan" className={BIG_SCAN}>
            <ScanIcon />
            <span>Scan a receipt or bill</span>
            <span className="text-sm font-normal text-neutral-300">Several in a row is fine</span>
          </Link>
        )}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
          <Link href="/free-invoice?start=photo" className={TILE}>
            <DocumentIcon className="h-6 w-6" />
            <span>Create an invoice</span>
          </Link>
          <Link href="/quotes/new" className={TILE}>
            <TagIcon className="h-6 w-6" />
            <span>Write a quote</span>
          </Link>
          {/* Next to the quote on purpose (Atanas, 2026-09-23: "so people can
              check companies before they send the quotation"). The moment to
              find out who you are dealing with is before you price the job,
              not after they have your prices. It was down in "Other tools",
              which is nowhere near that moment. */}
          <Link href="/check-company" className={TILE}>
            <SearchIcon className="h-6 w-6" />
            <span>Check a company</span>
          </Link>
          <Link href="/copy" className={TILE}>
            <CopyIcon className="h-6 w-6" />
            <span>Copy a document</span>
          </Link>
        </div>
        {/* Beside the tile it explains, which is where the brief put it
            ("a line beside Create an invoice offers to write one by hand
            instead"). It had drifted below the upload panel and the file
            library: on a phone you tapped Create an invoice, got a camera,
            and never saw that there was another way. */}
        <p className="text-sm text-neutral-600">
          &ldquo;Create an invoice&rdquo; photographs an old one and fills the next in for you, or{" "}
          <Link href="/invoices/new" className="font-medium text-neutral-800 underline">write one by hand</Link>.
        </p>
        <UploadPanel
          href="/scan"
          inboxAddress={inbox}
          onMakeAddress={async () => {
            const current = await businessProfileStore.get();
            const token = current.inboxToken ?? generateInboxToken();
            if (!current.inboxToken) {
              const saved = await businessProfileStore.save({ ...current, inboxToken: token });
              if (!saved) return null;
            }
            const made = inboxAddress(token);
            setInbox(made);
            return made;
          }}
        />

        {/* Straight under the upload tile, as he asked: upload a document,
            then see the documents you have. */}
        <FileStrip receipts={allReceipts} invoices={allInvoices} />

        {!hasAnything && (
          <p className="rounded-lg border bg-neutral-50 p-3 text-sm text-neutral-700">
            Just starting? Scan a few invoices you have already sent and the numbering carries on from yours. A handful
            is plenty &mdash; you do not need to go back through the year.
          </p>
        )}

        <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <Link href="/receipts/new" className="font-medium text-neutral-700 underline">Add a receipt by hand</Link>
          <Link href="/quotes/new" className="inline-block py-1 font-medium text-neutral-700 underline">Make a quote</Link>
        </div>
      </section>

      {/* What the app still needs before an invoice is right: shown only
          while something is missing, and put away for good by anyone who
          would rather get on with it. */}
      {profile && (
        <GettingStarted
          profile={profile}
          customers={contacts.filter((c) => c.kind === "client" && !c.archived).length}
          documents={allReceipts.length + allInvoices.length}
        />
      )}

      {/* Three panels, one page. */}
      <div role="tablist" aria-label="What to look at" className="flex gap-1 rounded-xl border bg-white p-1 shadow-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            id={`dashtab-${t.id}`}
            aria-controls={`panel-${t.id}`}
            aria-selected={tab === t.id}
            onClick={() => rememberTab(t.id)}
            className={`${TAB} ${tab === t.id ? "bg-neutral-900 text-white" : "text-neutral-700 hover:bg-neutral-50"}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {!hasAnything && (
        <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="font-semibold">Nothing here yet</h2>
          <p className="mt-1 text-neutral-600">
            Scan a receipt or write an invoice and this page fills in: what you&apos;re owed, what&apos;s overdue, and what
            you&apos;ve spent this month.
          </p>
        </div>
      )}

      {/* One track, three panels: sliding between them with a finger is how a
          phone moves, and only this strip moves -- the header, the scanner and
          the tabs above stay exactly where they are. */}
      <SwipePanels
        index={TABS.findIndex((t) => t.id === tab)}
        onIndex={(i) => rememberTab(TABS[i].id)}
        labelledBy="dashtab"
        panels={[
          { id: "bills", node: (<>
      {/* Money out, so it belongs with the receipts and bills rather than
          with the invoices. It had been in the other panel since the
          panels landed. */}
      {bills.length > 0 && (
        <div id="bills-to-pay" className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <h2 className="font-semibold">Bills to pay</h2>
          {billsError && <p role="alert" className="mt-2 text-sm text-red-600">{billsError}</p>}
          <div className="mt-3 space-y-2">
            {sortedBills.map((b) => {
              const due = billDueLabel(b.dueDate, today);
              return (
                <div key={b.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <span className="min-w-0 wrap-anywhere">
                    {supplierNames.get(b.clientId) || b.vendor || "Unknown supplier"}
                    {b.invoiceNumber && <span className="text-neutral-500"> · {b.invoiceNumber}</span>}
                    <span className={due.className}> · {due.text}</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3 whitespace-nowrap">
                    <span className="font-medium">{money((b.amount + b.vatAmount + (billCredits.get(b.id) ?? 0)))}</span>
                    <button onClick={() => markBillPaid(b)} className="font-medium text-neutral-700 underline">Mark as paid</button>
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
        <section aria-label="Receipts and bills" className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Receipts and bills you have scanned</h2>
            <Link href="/receipts" className="inline-block py-1 text-sm font-medium text-neutral-700 underline">See all</Link>
          </div>
          {allReceipts.length === 0 ? (
            <p className="text-sm text-neutral-600">Nothing scanned yet. The big button at the top is the way in.</p>
          ) : (
            <ul className="space-y-2">
              {recent(allReceipts).map((r) => (
                <li key={r.id}>
                  {/* There is no page for a single receipt: /receipts/<id>
                      was a 404 waiting for anyone who tapped one here. The list
                      takes ?open=<id> and brings that row to you instead. */}
                  <Link href={`/receipts?open=${r.id}`} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                    <span className="min-w-0 wrap-anywhere">
                      {supplierNames.get(r.clientId) || r.vendor || "Unknown supplier"}
                      <span className="block text-xs text-neutral-500">
                        {shortDate(r.date)}
                        {r.documentType === "invoice" && (r.paid ? " · bill, paid" : " · bill, to pay")}
                        {r.documentType === "credit_note" && " · credit note"}
                        {r.needsReview && " · waiting on review"}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{money(r.amount + r.vatAmount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
          </>) },
          { id: "work", node: (<>
      <>
      <People contacts={contacts} invoiceCounts={invoiceCounts} />

      {/* Three squares on one line, never stacked (Atanas, 2026-09-24). Three
          numbers are a glance, not three paragraphs, and stacking them made the
          panel far taller than the two beside it for no extra information. The
          figure shrinks on a narrow phone so three still fit across. */}
      {hasAnything && (
      <div className="grid grid-cols-3 gap-2">
        <Link href="/invoices" className="rounded-xl border bg-white p-3 text-center text-neutral-900 shadow-sm">
          <div className="wrap-anywhere text-base font-bold sm:text-2xl">{money(owedToMe)}</div>
          <div className="mt-0.5 text-xs text-neutral-600">Owed to you</div>
        </Link>
        <Link href="/invoices?status=overdue" className="rounded-xl border bg-white p-3 text-center text-neutral-900 shadow-sm">
          <div className={`wrap-anywhere text-base font-bold sm:text-2xl ${overdueAmount > 0 ? "text-red-700" : ""}`}>{money(overdueAmount)}</div>
          <div className="mt-0.5 text-xs text-neutral-600">Overdue</div>
        </Link>
        <Link href="/expenses" className="rounded-xl border bg-white p-3 text-center text-neutral-900 shadow-sm">
          <div className="wrap-anywhere text-base font-bold sm:text-2xl">{money((monthTotal + monthVat))}</div>
          <div className="mt-0.5 text-xs text-neutral-600">Spent this month</div>
        </Link>
      </div>
      )}


      {/* Marking several at once (Atanas, 2026-09-24: "it should let you mark a
          few of them... pay this company only, pay that company only"). Money
          usually arrives in a lump: one customer settles three invoices with a
          single transfer, and ticking them one at a time on three separate
          pages is the wrong shape for that. Nothing is marked until the button
          is pressed, and the button says how many and how much. */}
      {hasAnything && (
      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Awaiting payment</h2>
          {awaitingPayment.length > 1 && (
            <button
              type="button"
              onClick={() => { setPicking((v) => !v); setPicked(new Set()); setPayError(null); }}
              className="inline-block py-1 text-sm font-medium text-neutral-700 underline"
            >
              {picking ? "Done" : "Mark several paid"}
            </button>
          )}
        </div>
        {payError && <p role="alert" className="mt-2 text-sm text-red-600">{payError}</p>}
        {awaitingPayment.length === 0 ? (
          <p className="mt-2 text-sm text-neutral-500">Nothing outstanding right now.</p>
        ) : (
          <div className="mt-3 max-h-72 space-y-2 overflow-y-auto">
            {picking && (
              <div className="flex flex-wrap gap-2 pb-1">
                <button type="button" onClick={() => setPicked(new Set(awaitingPayment.map((o) => o.invoice.id)))} className="rounded-lg border px-2 py-1 text-xs font-medium text-neutral-700">
                  All of them
                </button>
                {[...new Set(awaitingPayment.map((o) => o.clientName))].slice(0, 4).map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => setPicked(new Set(awaitingPayment.filter((o) => o.clientName === name).map((o) => o.invoice.id)))}
                    className="rounded-lg border px-2 py-1 text-xs font-medium text-neutral-700"
                  >
                    All from {name}
                  </button>
                ))}
              </div>
            )}
            {awaitingPayment.map((o) => {
              const overdue = isOverdue(o.invoice.status, o.invoice.dueDate, today);
              const row = (
                <>
                  <span className="min-w-0 wrap-anywhere">
                    #{o.invoice.number} · {o.clientName}
                    {o.invoice.dueDate && <span className={overdue ? "text-red-700" : "text-neutral-500"}> · due {shortDate(o.invoice.dueDate)}</span>}
                  </span>
                  <span className="shrink-0 font-medium">{money(o.amountDue)}</span>
                </>
              );
              return picking ? (
                <label key={o.invoice.id} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                  <input
                    type="checkbox"
                    className="size-5 shrink-0"
                    checked={picked.has(o.invoice.id)}
                    onChange={(e) => setPicked((prev) => {
                      const next = new Set(prev);
                      if (e.target.checked) next.add(o.invoice.id); else next.delete(o.invoice.id);
                      return next;
                    })}
                  />
                  {row}
                </label>
              ) : (
                <Link
                  key={o.invoice.id}
                  href={`/invoices/${o.invoice.id}`}
                  className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0"
                >
                  {row}
                </Link>
              );
            })}
          </div>
        )}
        {picking && picked.size > 0 && (
          <button
            type="button"
            disabled={paying}
            onClick={markPickedPaid}
            className="mt-3 w-full rounded-lg bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {paying
              ? "Recording…"
              : `Mark ${picked.size} paid · ${money(awaitingPayment.filter((o) => picked.has(o.invoice.id)).reduce((t, o) => t + o.amountDue, 0))}`}
          </button>
        )}
        {outstandingInvoices.length > awaitingPayment.length && (
          <Link href="/invoices?status=to_receive" className="mt-3 inline-block text-sm font-medium text-neutral-700 underline">
            View all {outstandingInvoices.length} outstanding
          </Link>
        )}
      </div>
      )}

      {hasAnything && outstandingInvoices.length > 0 && (
      <div className="rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
        <h2 className="font-semibold">How late is what you&apos;re owed</h2>
        <div className="mt-3 space-y-2">
          {buckets.map((b) => (
            <div key={b.label} className="flex items-center justify-between text-sm">
              <span className="text-neutral-600">{b.label}</span>
              <span className="font-medium">{money(b.total)}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      {tax && hasAnything && <TaxSoFar estimate={tax} />}

      {/* One line, not a card with a heading and two columns (Atanas,
          2026-09-24: "it should be in a smaller rectangular, one line"). Two
          numbers do not need a title to explain them when the words are right
          beside them. */}
      {hasAnything && (
      <Link href="/expenses" className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl border bg-white px-4 py-3 text-neutral-900 shadow-sm">
        <span className="text-sm text-neutral-600">This month</span>
        <span className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <span className="wrap-anywhere"><span className="font-bold">{money(monthTotal)}</span> <span className="text-sm text-neutral-600">spent excl. VAT</span></span>
          <span className="wrap-anywhere"><span className="font-bold">{money(monthVat)}</span> <span className="text-sm text-neutral-600">VAT</span></span>
        </span>
      </Link>
      )}
      </>
          </>) },
          { id: "sent", node: (<>
        <section aria-label="Invoices sent" className="space-y-3 rounded-xl border bg-white p-5 text-neutral-900 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold">Invoices you have sent</h2>
            <Link href="/invoices" className="inline-block py-1 text-sm font-medium text-neutral-700 underline">See all</Link>
          </div>
          {allInvoices.length === 0 ? (
            <p className="text-sm text-neutral-600">None yet. Photograph an old invoice, or write one by hand.</p>
          ) : (
            <ul className="space-y-2">
              {recent(allInvoices).map((inv) => (
                <li key={inv.id}>
                  <Link href={`/invoices/${inv.id}`} className="flex items-center justify-between gap-3 border-b pb-2 text-sm last:border-b-0 last:pb-0">
                    <span className="min-w-0 wrap-anywhere">
                      {supplierNames.get(inv.clientId ?? "") || "No customer"}
                      <span className="block text-xs text-neutral-500">
                        {inv.number ? `#${inv.number}` : "Draft"} · {shortDate(inv.date)} · {inv.status}
                      </span>
                    </span>
                    <span className="shrink-0 font-medium">{money(invoiceTotals.get(inv.id) ?? 0)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
          </>) },
        ]}
      />

      {/* Shows itself only to someone who has not installed it yet. */}
      <GetTheApp />

      {/* Lower and smaller, as he asked: useful, but not what the page is for. */}
      <section aria-label="Other tools" className="border-t pt-5">
        <div className="flex flex-wrap gap-x-5 gap-y-2">
          <Link href="/files" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 underline">
            <FolderIcon /> Your file library &rarr;
          </Link>
          <Link href="/recurring" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 underline">
            <RepeatIcon /> Recurring expenses &rarr;
          </Link>
          <Link href="/recurring/invoices" className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-700 underline">
            <RepeatIcon /> Recurring invoices &rarr;
          </Link>
        </div>
      </section>
    </div>
  );
}

// A stranger at the front door gets the welcome page, not a bounce to the
// sign-in form (notes/first-page-research.md); someone signed in gets
// their dashboard, as before.
export default function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <Dashboard /> : <Welcome />;
}
