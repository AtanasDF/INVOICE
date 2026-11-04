"use client";

import { useEffect, useRef, useState } from "react";
import {
  businessProfileStore,
  clientsStore,
  creditNotesStore,
  feedbackStore,
  invoicesStore,
  pushSubscriptionsStore,
  quotesStore,
  paymentsStore,
  receiptPagesStore,
  receiptsStore,
  recurringExpensesStore,
  recurringInvoicesStore,
  remindersSentStore,
} from "@/lib/storage";
import { quoteRequestsStore } from "@/lib/quoteRequests";
import { downloadJson } from "@/lib/exportJson";
import { disablePush, enablePush, getExistingSubscription, isIosNotStandalone, pushSupported, subscriptionToRecord } from "@/lib/push";
import { signOut } from "@/lib/signOut";
import { inlineImage } from "@/lib/receiptImages";
import ThemePicker from "@/components/ThemePicker";
import GetTheApp from "@/components/GetTheApp";
import { PlanCard } from "@/components/ScansLeft";
import InviteCard from "@/components/InviteCard";
import { useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";
import { saveFailed, authFailed } from "@/lib/errorText";
import { todayISO } from "@/lib/today";
import { CARD, SMALL_BUTTON, SettingsHeader } from "@/components/settings/ProfileForm";

// Nothing here waits for a Save: every control does its thing when pressed,
// so this page has no Save bar.
export default function AccountSettingsPage() {
  const { user } = useAuth();
  const [signInBusy, setSignInBusy] = useState(false);
  const signInBusyNow = useRef(false);
  const [signInNote, setSignInNote] = useState<string | null>(null);
  // Kept apart from the note. Both used to be the same string in the same grey
  // styling, so Supabase's own words ("For security purposes, you can only
  // request this after 51 seconds", or worse) were shown to somebody as though
  // the email had been sent.
  const [signInError, setSignInError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const [pushError, setPushError] = useState<string | null>(null);

  useEffect(() => {
    getExistingSubscription().then((sub) => setPushEnabled(sub !== null), (err) => console.error("push state", err));
  }, []);

  async function togglePush() {
    setPushError(null);
    setPushBusy(true);
    try {
      if (pushEnabled) {
        const endpoint = await disablePush();
        if (endpoint) await pushSubscriptionsStore.unsubscribe(endpoint);
        setPushEnabled(false);
      } else {
        const sub = await enablePush();
        await pushSubscriptionsStore.subscribe(subscriptionToRecord(sub));
        setPushEnabled(true);
      }
    } catch (err) {
      setPushError(saveFailed(err, "Couldn't update notification settings."));
    } finally {
      setPushBusy(false);
    }
  }

  // The same email Supabase sends for "forgot my password": opening it
  // signs this browser in and lands on /reset-password, so it works both
  // as a way back in and as a way to change the password.
  async function emailSignInLink() {
    if (!user?.email || signInBusyNow.current) return;
    signInBusyNow.current = true;
    setSignInNote(null);
    setSignInError(null);
    setSignInBusy(true);
    // try/finally: the library re-throws anything that isn't its own error,
    // and "Sending…" then stayed up for good.
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(user.email, { redirectTo: `${window.location.origin}/reset-password` });
      if (error) setSignInError(authFailed(error, "Couldn't send the email just now. Try again in a minute."));
      else setSignInNote(`Sent to ${user.email}. The link signs you in and lets you set a new password.`);
    } catch (err) {
      setSignInError(authFailed(err, "Couldn't send the email just now. Try again in a minute."));
    } finally {
      signInBusyNow.current = false;
      setSignInBusy(false);
    }
  }

  async function exportData() {
    setExportError(null);
    setExporting(true);
    try {
      const [clients, receipts, receiptPages, invoices, creditNotes, quotes, payments, feedback, recurringExpenses, profile, recurringInvoices, quoteRequests, remindersSent] = await Promise.all([
        clientsStore.all(),
        receiptsStore.all(),
        receiptPagesStore.all(),
        invoicesStore.all(),
        creditNotesStore.all(),
        quotesStore.all(),
        paymentsStore.all(),
        feedbackStore.all(),
        recurringExpensesStore.all(),
        businessProfileStore.get(),
        recurringInvoicesStore.all(),
        quoteRequestsStore.all(),
        remindersSentStore.all(),
      ]);
      // Stored photos are fetched and inlined, so the export holds the
      // images themselves rather than links that expire.
      const receiptsWithImages = await Promise.all(receipts.map(async (r) => ({ ...r, imageDataUrl: await inlineImage(r.imageDataUrl) })));
      const pagesWithImages = await Promise.all(receiptPages.map(async (p) => ({ ...p, imageDataUrl: (await inlineImage(p.imageDataUrl)) ?? "" })));
      downloadJson(`my-data-export-${todayISO()}.json`, {
        exportedAt: new Date().toISOString(),
        businessProfile: profile,
        clients,
        receipts: receiptsWithImages,
        receiptPages: pagesWithImages,
        invoices,
        creditNotes,
        quotes,
        payments,
        recurringExpenses,
        recurringInvoices,
        quoteRequests,
        remindersSent,
        feedback,
      });
    } catch (err) {
      setExportError(saveFailed(err, "Couldn't export your data."));
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="space-y-6">
      <SettingsHeader title="Account">
        <p className="mt-1 text-neutral-600">Signing in, how the app looks, notifications and your data.</p>
      </SettingsHeader>

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Your account</h2>
          <p className="mt-1 text-sm text-neutral-600">
            You&apos;re signed in as <span className="wrap-anywhere font-medium text-neutral-900">{user?.email ?? "—"}</span>. That address
            is the one reminders and invoice emails come back to when a customer replies.
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Getting back in</p>
          <p className="mt-1 text-sm text-neutral-600">
            Signed out, or forgotten the password? Ask for a link by email — it opens the app already signed in and lets
            you set a new password. From the sign-in screen it&apos;s the same thing: <strong>Forgotten your password?</strong>
          </p>
          <button type="button" onClick={emailSignInLink} disabled={signInBusy || !user?.email} className={`mt-2 ${SMALL_BUTTON}`}>
            {signInBusy ? "Sending…" : "Email me a sign-in link"}
          </button>
          <p role="status" className={signInNote ? "mt-2 text-sm text-neutral-600" : "sr-only"}>{signInNote ?? ""}</p>
          {signInError && <p role="alert" className="mt-2 text-sm text-red-600">{signInError}</p>}
        </div>

        <button type="button" onClick={() => void signOut()} className={SMALL_BUTTON}>
          Sign out
        </button>
      </div>

      <PlanCard />

      <InviteCard />

      <ThemePicker />

      <GetTheApp />

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Notifications</h2>
          <p className="mt-1 text-sm text-neutral-600">
            A push notification, even when the app isn&apos;t open, when an invoice is overdue, a bill or recurring expense
            is due, a customer opens or answers a quote or opens an invoice, or a supplier sends prices.
          </p>
        </div>
        {isIosNotStandalone() ? (
          <p className="text-sm text-neutral-500">
            On iPhone, first add this app to your Home Screen (Share → Add to Home Screen), then open it from
            there and come back to this page to turn notifications on — Safari only delivers push notifications to
            an installed app, not a browser tab.
          </p>
        ) : !pushSupported() ? (
          <p className="text-sm text-neutral-500">This browser doesn&apos;t support push notifications.</p>
        ) : (
          <>
            {pushError && <p role="alert" className="text-sm text-red-600">{pushError}</p>}
            <button type="button" onClick={togglePush} disabled={pushBusy} className={SMALL_BUTTON}>
              {pushBusy ? "Working…" : pushEnabled ? "Turn off notifications" : "Turn on notifications"}
            </button>
          </>
        )}
      </div>

      <div className={CARD}>
        <div>
          <h2 className="font-semibold">Your data</h2>
        </div>

        <div>
          <p className="text-xs text-neutral-500">Where your data lives</p>
          <p className="mt-1 text-sm text-neutral-600">
            Kept in the EU (Ireland), and only you can read it. Photos of receipts are shown through links that
            expire after seven days. An invoice or quote link you send is the one exception: whoever has it sees that
            one document, until you stop the link from its page.
          </p>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Take it all with you</p>
          <p className="mt-1 text-sm text-neutral-600">
            Download everything you&apos;ve stored — customers, receipts, invoices, payments, credit notes, quotes, price
            requests to suppliers, recurring expenses and invoices, the reminders sent and feedback — as one file, with
            the photos and documents inside it. For a spreadsheet or an accountant, the invoices, receipts and customers pages
            each have &quot;Download for a spreadsheet&quot;.
          </p>
          {exportError && <p role="alert" className="mt-2 text-sm text-red-600">{exportError}</p>}
          <button type="button" onClick={exportData} disabled={exporting} className={`mt-2 ${SMALL_BUTTON}`}>
            {exporting ? "Preparing your download…" : "Download all my data"}
          </button>
        </div>

        <div className="border-t pt-3">
          <p className="text-xs text-neutral-500">Closing the account</p>
          <p className="mt-1 text-sm text-neutral-600">
            There&apos;s no delete button anywhere in this app, on purpose: an accounting record you&apos;ve thrown away by
            accident can&apos;t be got back, and HMRC expects you to keep it for six years. To have the account and
            everything in it removed, ask through <a href="/feedback" className="underline">Feedback</a> and it&apos;s done
            by hand, once, after you&apos;ve exported what you want to keep.
          </p>
        </div>
      </div>
    </div>
  );
}
