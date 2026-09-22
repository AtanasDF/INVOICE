"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { safeNext } from "@/lib/safeNext";
import { signOut } from "@/lib/signOut";
import { useWakeLock } from "@/lib/wakeLock";
import PaidCelebration from "@/components/PaidCelebration";

const MORE: [string, string][] = [
  ["/receipts/review", "Needs review"],
  ["/mileage", "Mileage"],
  ["/vat", "VAT"],
  ["/recurring", "Recurring expenses"],
  ["/recurring/invoices", "Recurring invoices"],
  ["/files", "Files"],
  ["/feedback", "Feedback"],
  ["/free-invoice", "Free invoice"],
  ["/check-company", "Check a company"],
];

// The page you are on is marked, darker and announced as current.
function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const path = usePathname();
  const current = href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`${className} ${current ? "font-semibold text-neutral-900" : ""}`.trim()}>
      {children}
    </Link>
  );
}

// The pages that had no way in from the header, and the two for strangers.
// Not "More": the Free page has its own More on a phone, and two of them
// on one screen is one too many. Open only on the page it was opened on,
// so any move closes it without an effect; Escape or a tap elsewhere too.
function MorePages() {
  const path = usePathname();
  const [openOn, setOpenOn] = useState<string | null>(null);
  const open = openOn === path;
  const box = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const listId = useId();
  const here = MORE.some(([href]) => path === href || path.startsWith(href + "/"));
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpenOn(null);
      button.current?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpenOn(null);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);
  return (
    <div ref={box} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        onClick={() => setOpenOn(open ? null : path)}
        className={here ? "font-semibold text-neutral-900" : ""}
      >
        More pages
      </button>
      {open && (
        <div id={listId} onClick={() => setOpenOn(null)} className="absolute right-0 z-30 mt-2 w-56 overflow-hidden rounded-xl border bg-white py-1 text-neutral-800 shadow-lg">
          {MORE.map(([href, label]) => (
            <NavLink key={href} href={href} className="block px-4 py-2.5">
              {label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

function Header() {
  const { user } = useAuth();
  // A customer opening an invoice link sees the invoice, not the app.
  const path = usePathname();
  if (path.startsWith("/i/") || path.startsWith("/q/") || path.startsWith("/r/")) return null;
  return (
    <header className="border-b bg-white text-neutral-900 print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Invoicer
        </Link>
        {user ? (
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-neutral-600">
            <NavLink href="/">Home</NavLink>
            <NavLink href="/clients">Clients & suppliers</NavLink>
            <NavLink href="/receipts">Receipts &amp; bills</NavLink>
            <NavLink href="/invoices">Invoices</NavLink>
            <NavLink href="/quotes">Quotes</NavLink>
            <NavLink href="/expenses">Expenses</NavLink>
            <NavLink href="/settings">Settings</NavLink>
            <MorePages />
            <button
              onClick={() => void signOut()}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Sign out
            </button>
          </nav>
        ) : (
          <nav className="flex items-center gap-x-4 text-sm font-medium text-neutral-600">
            <Link href="/free-invoice">Free invoice</Link>
            <Link href="/check-company">Check a company</Link>
            <Link href="/login">Sign in</Link>
          </nav>
        )}
      </div>
    </header>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  // A password-reset email link logs the visitor in via a recovery
  // session, so this page must stay reachable both signed out (still
  // establishing that session) and signed in (about to set a new
  // password) -- unlike /login, being authenticated here must NOT
  // bounce them away before they finish.
  const isResetPasswordPage = pathname === "/reset-password";
  const isPublicPage = isLoginPage || isResetPasswordPage || pathname === "/" || pathname === "/free-invoice" || pathname === "/check-company" || pathname.startsWith("/i/") || pathname.startsWith("/q/") || pathname.startsWith("/r/");

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPage) router.replace("/login");
    if (user && isLoginPage) router.replace(safeNext(new URLSearchParams(window.location.search).get("next")));
  }, [loading, user, isLoginPage, isPublicPage, router]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if ((!user && !isPublicPage) || (user && isLoginPage)) {
    return null;
  }

  return <>{children}</>;
}

function FeedbackButton() {
  const { user } = useAuth();
  const pathname = usePathname();
  if (!user || pathname === "/feedback" || pathname.startsWith("/i/") || pathname.startsWith("/q/") || pathname.startsWith("/r/")) return null;
  // The Free invoice page is the one screen with its own bottom bar on a
  // phone (sm:hidden), and the pill sat on top of it at the same z-10, later
  // in the DOM -- so a tap on "More", whose centre was inside the pill,
  // opened Feedback instead. That hid Print, Next invoice and Save to your
  // account behind a button that couldn't be pressed. The pill steps aside
  // exactly where the bar is; it is on every other page, for a signed-in
  // user, at every width.
  const overBottomBar = pathname === "/free-invoice";
  return (
    <Link
      href="/feedback"
      className={`fixed right-5 z-10 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 print:hidden${overBottomBar ? " max-sm:hidden" : ""}`}
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
    >
      Feedback
    </Link>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useWakeLock();
  return (
    <AuthProvider>
      <Header />
      {/* Room at the foot on a phone, so the Feedback pill never sits on a last card's buttons. */}
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6 max-sm:pb-24 print:max-w-none print:px-0 print:py-0">
        <Gate>{children}</Gate>
      </main>
      <FeedbackButton />
      <PaidCelebration />
    </AuthProvider>
  );
}
