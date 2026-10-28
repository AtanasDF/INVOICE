"use client";

import Link from "next/link";
import { money } from "@/lib/money";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BusinessProfile,
  Client,
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  paymentsStore,
  invoicesStore,
  receiptsStore,
  recurringExpensesStore,
} from "@/lib/storage";
import { isOverdue } from "@/lib/invoiceStatus";
import UploadFilesButton from "@/components/UploadFilesButton";
import GettingStarted from "@/components/GettingStarted";
import { DocumentIcon } from "@/components/icons";
import { readScannerMode, useIsIOS } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";
import { stashScanCapture } from "@/lib/scanHandoff";
import { warmScannerWhenIdle } from "@/lib/warmScanner";
import { useAuth } from "@/lib/authContext";
import Welcome from "@/components/Welcome";
import { TaxEstimate, estimateTax } from "@/lib/taxEstimate";
import { invoiceBalance, invoiceVat } from "@/lib/invoiceBalance";
import { creditOffDue, invoiceCharge } from "@/lib/cis";
import { showOnAppIcon } from "@/lib/appBadge";
import { loadFailed } from "@/lib/errorText";
import { dueSoon, isBill } from "@/lib/bills";
import { todayISO } from "@/lib/today";
import { shortDate } from "@/lib/dates";
import { FILE_RING } from "@/lib/fileRing";

// The dashboard is a scanner (Atanas, 2026-09-23: "the scanner is going to
// play the role of the first page"), and since 2026-10-28 it is two screens,
// not five (launch plan step G). The first says what needs him today, gives
// the one big button and the two other ways in, and three numbers. The second
// is the last few things saved. Everything that was looking rather than doing
// went to the page built for it: the lists and the late-payment breakdown to
// Money, the library to Files, the people to Customers.
const TILE = "flex min-h-16 items-center justify-center gap-2 rounded-xl border bg-white p-3 text-center text-sm font-medium text-neutral-900 shadow-sm transition hover:shadow-md active:scale-[0.97]";
const BIG_SCAN = "flex min-h-32 w-full flex-col items-center justify-center gap-2 rounded-2xl bg-neutral-900 p-6 text-center text-lg font-bold text-white shadow-sm transition hover:bg-neutral-800 active:scale-[0.98]";
const FIGURE = "rounded-xl bg-neutral-100 p-3 text-neutral-900";

function ScanIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-8 w-8" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 8V6a2 2 0 0 1 2-2h2M4 16v2a2 2 0 0 0 2 2h2M20 8V6a2 2 0 0 0-2-2h-2M20 16v2a2 2 0 0 1-2 2h-2" />
      <circle cx="12" cy="12" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Recent = { id: string; href: string; date: string; who: string; note: string; amount: number };

function Dashboard() {
  const router = useRouter();
  const isIOS = useIsIOS();
  const { user } = useAuth();
  const [scanHandoffBusy, setScanHandoffBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  // Nothing in the account at all: the page says what to do instead of
  // showing a row of £0.00s (the sweep, 2026-09-22).
  const [hasAnything, setHasAnything] = useState(true);
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [contacts, setContacts] = useState<Client[]>([]);
  const [documents, setDocuments] = useState(0);
  const [owedToMe, setOwedToMe] = useState(0);
  const [overdue, setOverdue] = useState({ count: 0, amount: 0 });
  const [youOwe, setYouOwe] = useState(0);
  const [billsDueSoon, setBillsDueSoon] = useState(0);
  const [dueRecurringCount, setDueRecurringCount] = useState(0);
  const [needsReviewCount, setNeedsReviewCount] = useState(0);
  const [tax, setTax] = useState<TaxEstimate | null>(null);
  const [recentDocs, setRecentDocs] = useState<Recent[]>([]);

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

  // Warm-up for the in-app scanner: fetching the page-finder here puts it in
  // the HTTP cache and initialises the runtime before Scan is tapped, so the
  // capture screen then resolves instantly (src/lib/warmScanner.ts).
  useEffect(() => {
    return warmScannerWhenIdle(!!user);
  }, [user]);

  useEffect(() => {
    let cancelled = false;
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
      const today = todayISO();
      setHasAnything(invoices.length > 0 || receipts.length > 0);
      setProfile(profile);
      setContacts(clients);
      setDocuments(receipts.length + invoices.length);
      setTax(estimateTax({ invoices, creditNotes, receipts, vatRegistered: profile.vatRegistered, today }));

      const creditByInvoice = new Map<string, number>();
      for (const c of creditNotes) creditByInvoice.set(c.invoiceId, (creditByInvoice.get(c.invoiceId) ?? 0) + c.amount);
      const paidByInvoice = new Map<string, number>();
      for (const p of payments) paidByInvoice.set(p.invoiceId, (paidByInvoice.get(p.invoiceId) ?? 0) + p.amount);
      const outstanding = invoices
        .filter((inv) => inv.status === "sent" || inv.status === "partial")
        .map((inv) => {
          const charge = invoiceCharge(inv, invoiceVat(inv, profile.vatRegistered));
          return { inv, due: invoiceBalance({ total: charge.due, credited: creditOffDue(charge, creditByInvoice.get(inv.id) ?? 0), paid: paidByInvoice.get(inv.id) ?? 0, status: inv.status }) };
        });
      setOwedToMe(outstanding.reduce((t, o) => t + o.due, 0));
      // Late invoices are on the to-do list only for somebody who asked to be
      // told about them (Settings, "Show overdue reminders").
      const late = profile.showOverdueReminders ? outstanding.filter((o) => isOverdue(o.inv.status, o.inv.dueDate, today)) : [];
      setOverdue({ count: late.length, amount: late.reduce((t, o) => t + o.due, 0) });

      const credits = new Map<string, number>();
      for (const r of receipts) {
        if (r.documentType !== "credit_note" || !r.creditOfReceiptId) continue;
        credits.set(r.creditOfReceiptId, (credits.get(r.creditOfReceiptId) ?? 0) + r.amount + r.vatAmount);
      }
      const bills = receipts.filter(isBill);
      setYouOwe(bills.reduce((t, b) => t + b.amount + b.vatAmount + (credits.get(b.id) ?? 0), 0));
      setBillsDueSoon(bills.filter((b) => dueSoon(b.dueDate, today)).length);
      setDueRecurringCount(recurring.filter((r) => r.active && r.nextDueDate <= today).length);
      setNeedsReviewCount(receipts.filter((r) => r.needsReview).length);

      const names = new Map(clients.map((c) => [c.id, c.name]));
      const docs: Recent[] = [
        ...receipts.map((r) => ({
          id: `r-${r.id}`,
          // There is no page for a single receipt; the list takes ?open=<id>
          // and brings that row to you.
          href: `/receipts?open=${r.id}`,
          date: r.date,
          who: names.get(r.clientId) || r.vendor || "Unknown supplier",
          note: r.needsReview ? "waiting on review" : r.documentType === "invoice" ? (r.paid ? "bill, paid" : "bill, to pay") : r.documentType === "credit_note" ? "credit note" : "receipt",
          amount: r.amount + r.vatAmount,
        })),
        ...invoices.map((inv) => ({
          id: `i-${inv.id}`,
          href: `/invoices/${inv.id}`,
          date: inv.date,
          who: names.get(inv.clientId ?? "") || "No customer",
          note: inv.number ? `invoice #${inv.number}, ${inv.status}` : "invoice, draft",
          amount: invoiceCharge(inv, invoiceVat(inv, profile.vatRegistered)).total,
        })),
      ];
      setRecentDocs(docs.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 5));
    }
    loadInto()
      .catch((err) => !cancelled && setLoadError(loadFailed(err, "your dashboard")))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  // A failed load leaves every figure at its initial zero, and 0 clears the
  // badge -- so "we couldn't reach your records" would take the number off
  // the home-screen icon and read as "nothing is due", on the morning a
  // bill falls due. The page already draws that distinction; the icon must.
  useEffect(() => {
    if (!loading && !loadError) showOnAppIcon(overdue.count + dueRecurringCount + billsDueSoon);
  }, [loading, loadError, overdue.count, dueRecurringCount, billsDueSoon]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  // Zeroes across the dashboard would read as "nothing is owed to you",
  // which is a very different thing from "we couldn't reach your records".
  if (loadError) {
    return <p role="alert" className="text-sm text-red-600">{loadError}</p>;
  }

  // What needs him, and only that: each line goes to the page where it is
  // done. These were four banners, each with its own close button, which
  // closed them only until the next visit.
  const todo: { href: string; text: string; late?: boolean }[] = [
    ...(needsReviewCount ? [{ href: "/receipts/review", text: `${plural(needsReviewCount, "receipt", "receipts")} to check` }] : []),
    ...(overdue.count ? [{ href: "/invoices?status=overdue", text: `${plural(overdue.count, "invoice", "invoices")} late, ${money(overdue.amount)}`, late: true }] : []),
    ...(billsDueSoon ? [{ href: "/money#you-owe", text: `${plural(billsDueSoon, "bill", "bills")} to pay soon` }] : []),
    ...(dueRecurringCount ? [{ href: "/recurring", text: `${plural(dueRecurringCount, "repeating expense", "repeating expenses")} to log` }] : []),
  ];
  const taxKnown = tax && !tax.tooEarly && (tax.invoicesCounted > 0 || tax.receiptsCounted > 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-neutral-600">Photograph the paper, and the rest fills itself in.</p>
      </div>

      {todo.length > 0 && (
        <section aria-labelledby="todo" className="rounded-xl border bg-white px-4 py-2 text-neutral-900 shadow-sm">
          <h2 id="todo" className="pt-1 text-sm font-semibold">To do</h2>
          <ul>
            {todo.map((t) => (
              <li key={t.href}>
                <Link href={t.href} className="flex items-center justify-between gap-3 border-b py-3 text-sm last:border-b-0">
                  <span className={`min-w-0 wrap-anywhere ${t.late ? "text-red-700" : ""}`}>{t.text}</span>
                  <span aria-hidden="true" className="text-neutral-600">&rsaquo;</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The scanner, which is what this page is for. On the iPhone's
          own-camera path the big button has to be the file input itself, or
          it takes two taps to open the camera. */}
      <section aria-label="Scan something" className="space-y-3">
        {isIOS && readScannerMode() === "native" ? (
          <label aria-disabled={scanHandoffBusy} className={`${BIG_SCAN} cursor-pointer ${FILE_RING} rise-in`}>
            <ScanIcon />
            <span>{scanHandoffBusy ? "Preparing…" : "Scan a receipt or bill"}</span>
            <span className="text-sm font-normal text-neutral-300">Several in a row is fine</span>
            <input type="file" accept="image/*" capture="environment" onChange={onIOSScanCapture} disabled={scanHandoffBusy} className="sr-only" />
          </label>
        ) : (
          <Link href="/scan" className={`${BIG_SCAN} rise-in`}>
            <ScanIcon />
            <span>Scan a receipt or bill</span>
            <span className="text-sm font-normal text-neutral-300">Several in a row is fine</span>
          </Link>
        )}

        <div className="rise-in grid grid-cols-2 gap-2 sm:gap-3" style={{ animationDelay: "70ms" }}>
          <UploadFilesButton href="/scan" label="Upload" buttonClassName={`${TILE} w-full`} className="w-full" />
          <Link href="/invoices/new" className={TILE}>
            <DocumentIcon className="h-5 w-5" />
            <span>New invoice</span>
          </Link>
        </div>
        {/* Right under New invoice, where somebody about to write one sees the
            choice. It once drifted a screenful away and nobody learned it
            existed. */}
        <p className="rise-in text-sm text-neutral-600" style={{ animationDelay: "140ms" }}>
          Or <Link href="/free-invoice?start=photo" className="font-medium text-neutral-800 underline">photograph an old invoice</Link> and the next one is filled in for you.
        </p>
      </section>

      {hasAnything && (
        <>
          {/* Three numbers on one line, never stacked (Atanas, 2026-09-24): a
              glance, not three paragraphs. Each opens where the figure is
              explained. */}
          <div className="grid grid-cols-3 gap-2">
            <Link href="/money" className={FIGURE}>
              <div className="text-xs text-neutral-600">Owed to you</div>
              <div className="mt-0.5 wrap-anywhere font-bold sm:text-xl">{money(owedToMe)}</div>
            </Link>
            <Link href="/money#you-owe" className={FIGURE}>
              <div className="text-xs text-neutral-600">You owe</div>
              <div className="mt-0.5 wrap-anywhere font-bold sm:text-xl">{money(youOwe)}</div>
            </Link>
            <Link href="/money#tax" className={FIGURE}>
              <div className="text-xs text-neutral-600">Tax so far</div>
              <div className="mt-0.5 wrap-anywhere font-bold sm:text-xl">{taxKnown ? money(Math.max(0, tax.setAside)) : "Too early"}</div>
            </Link>
          </div>

          <section aria-labelledby="recent" className="rounded-xl border bg-white px-4 py-2 text-neutral-900 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <h2 id="recent" className="text-sm font-semibold">Recent</h2>
              <Link href="/files" className="inline-block py-1 text-sm font-medium text-neutral-700 underline">See everything in Files</Link>
            </div>
            <ul>
              {recentDocs.map((d) => (
                <li key={d.id}>
                  <Link href={d.href} className="flex items-center justify-between gap-3 border-b py-2.5 text-sm last:border-b-0">
                    <span className="min-w-0 wrap-anywhere">
                      {d.who}
                      <span className="block text-xs text-neutral-500">{shortDate(d.date)} · {d.note}</span>
                    </span>
                    <span className="shrink-0 font-medium">{money(d.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {/* What the app still needs before an invoice is right: shown only while
          something is missing, and put away for good by anyone who would rather
          get on with it. On a brand new account it is all there is under the
          scan, so it comes straight after it; once there are documents it goes
          below them, because it is close to a screen tall and the To do list,
          the figures and the recent documents are what he opens Home for. */}
      {profile && (
        <GettingStarted
          profile={profile}
          customers={contacts.filter((c) => c.kind === "client" && !c.archived).length}
          documents={documents}
          contacts={contacts}
          onSetUp={(p, added) => {
            setProfile(p);
            if (added) setContacts((c) => [...c, added]);
          }}
          onContacts={(added) => setContacts((c) => [...c, ...added])}
        />
      )}

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
