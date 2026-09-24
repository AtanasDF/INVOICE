"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { safeNext } from "@/lib/safeNext";
import { signOut } from "@/lib/signOut";
import { useWakeLock } from "@/lib/wakeLock";
import PaidCelebration from "@/components/PaidCelebration";
import { SITE_NAME } from "@/lib/siteName";
import { rememberSource } from "@/lib/source";
import { rememberInvite } from "@/lib/invites";

type Group = { label: string; links: [string, string][] };

// The whole app in three groups (Atanas, 2026-09-22: "make it as one whole
// app not two different apps"): money coming in, money going out, and the
// tools, the free ones among them. Every page has a place here, so there
// is no "More pages" drawer any more, and a phone shows one Menu button
// instead of nine links wrapping to three rows.
const GROUPS: Group[] = [
  {
    label: "Money in",
    links: [
      ["/invoices", "Invoices"],
      ["/quotes", "Quotes"],
      ["/money", "Money"],
      ["/clients", "Customers & suppliers"],
      ["/recurring/invoices", "Recurring invoices"],
    ],
  },
  {
    label: "Money out",
    links: [
      ["/receipts", "Receipts & bills"],
      ["/receipts/review", "Needs review"],
      ["/expenses", "Expenses"],
      ["/mileage", "Mileage"],
      ["/recurring", "Recurring expenses"],
    ],
  },
  {
    label: "Tools",
    links: [
      ["/scan", "Scan"],
      ["/copy", "Copy a document"],
      ["/convert", "Change a file"],
      ["/check-company", "Check a company"],
      ["/vat", "VAT"],
      ["/files", "Files"],
      ["/feedback", "Feedback"],
    ],
  },
];
const HREFS = ["/", "/settings", ...GROUPS.flatMap((g) => g.links.map(([href]) => href))];

// The page you are on is the longest address that matches it, so
// /receipts/review marks Needs review rather than Receipts & bills.
function useCurrentHref(): string | null {
  const path = usePathname();
  return (
    HREFS.filter((href) => (href === "/" ? path === "/" : path === href || path.startsWith(href + "/")))
      .sort((a, b) => b.length - a.length)[0] ?? null
  );
}

// The page you are on is marked, darker and announced as current.
function NavLink({ href, children, className = "" }: { href: string; children: React.ReactNode; className?: string }) {
  const current = useCurrentHref() === href;
  return (
    <Link href={href} aria-current={current ? "page" : undefined} className={`${className} ${current ? "font-semibold text-neutral-900" : ""}`.trim()}>
      {children}
    </Link>
  );
}

// A plain <details>, so the menu opens on the first tap even before the
// page's own code has started (Atanas, 2026-09-22: "whenever I click, it
// takes ages and three, four clicks for it to send me there" — a button
// does nothing until then, and the links inside are real links either
// way). Script only closes it: when the page changes, on Escape, or on a
// tap elsewhere.
function Menu({ label, here, width, children }: { label: string; here: boolean; width: string; children: React.ReactNode }) {
  const path = usePathname();
  const box = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (box.current) box.current.open = false;
  }, [path]);
  useEffect(() => {
    const shut = () => {
      if (box.current?.open) box.current.open = false;
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      shut();
      box.current?.querySelector("summary")?.focus();
    };
    const onPointer = (e: PointerEvent) => {
      if (!box.current?.contains(e.target as Node)) shut();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, []);
  return (
    <details ref={box} className="relative">
      <summary className={`flex cursor-pointer list-none items-center gap-1 [&::-webkit-details-marker]:hidden ${here ? "font-semibold text-neutral-900" : ""}`.trim()}>
        {label}
        <svg viewBox="0 0 20 20" aria-hidden="true" className="h-3.5 w-3.5">
          <path d="M5 7.5 10 12.5 15 7.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </summary>
      <div className={`absolute right-0 z-30 mt-2 ${width} max-h-[80vh] overflow-y-auto overscroll-contain rounded-xl border bg-white py-1 text-neutral-800 shadow-lg`}>{children}</div>
    </details>
  );
}

function GroupMenu({ group }: { group: Group }) {
  const current = useCurrentHref();
  return (
    <Menu label={group.label} here={group.links.some(([href]) => href === current)} width="w-56">
      {group.links.map(([href, label]) => (
        <NavLink key={href} href={href} className="block px-4 py-2.5">
          {label}
        </NavLink>
      ))}
    </Menu>
  );
}

function PhoneMenu() {
  const current = useCurrentHref();
  return (
    <Menu label="Menu" here={!!current && current !== "/"} width="w-[min(18rem,calc(100vw-2rem))]">
      <NavLink href="/" className="block px-4 py-2.5">
        Home
      </NavLink>
      {GROUPS.map((g) => (
        <div key={g.label} className="border-t pb-1">
          <p className="px-4 pb-1 pt-2 text-xs text-neutral-500">{g.label}</p>
          {g.links.map(([href, label]) => (
            <NavLink key={href} href={href} className="block px-4 py-2.5">
              {label}
            </NavLink>
          ))}
        </div>
      ))}
      <div className="border-t pt-1">
        <NavLink href="/settings" className="block px-4 py-2.5">
          Settings
        </NavLink>
      </div>
    </Menu>
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
          {SITE_NAME}
        </Link>
        {user ? (
          <nav className="flex items-center gap-x-4 text-sm font-medium text-neutral-600">
            <div className="hidden items-center gap-x-4 sm:flex">
              <NavLink href="/">Home</NavLink>
              {GROUPS.map((g) => (
                <GroupMenu key={g.label} group={g} />
              ))}
              <NavLink href="/settings">Settings</NavLink>
            </div>
            <div className="sm:hidden">
              <PhoneMenu />
            </div>
            <button
              onClick={() => void signOut()}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Sign out
            </button>
          </nav>
        ) : (
          // A stranger's way around is the free page itself (the brand goes
          // back to it), so the header holds one thing.
          <nav className="flex items-center gap-x-4 text-sm font-medium text-neutral-600">
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
  // Which flyer brought them, kept the moment they arrive: by the time they
  // make an account the query string is long gone.
  useEffect(() => {
    rememberSource(window.location.search);
    rememberInvite(window.location.search);
  }, [pathname]);
  const router = useRouter();
  const isLoginPage = pathname === "/login";
  // A password-reset email link logs the visitor in via a recovery
  // session, so this page must stay reachable both signed out (still
  // establishing that session) and signed in (about to set a new
  // password) -- unlike /login, being authenticated here must NOT
  // bounce them away before they finish.
  const isResetPasswordPage = pathname === "/reset-password";
  // Nothing works before an account (Atanas, 2026-09-22), except the front
  // door itself and the links a customer is sent.
  // Privacy and terms are public on purpose: they have to be readable before
  // anyone hands over an email address, and an advertiser or app store will
  // ask for a link that works signed out.
  const isPublicPage =
    isLoginPage ||
    isResetPasswordPage ||
    pathname === "/" ||
    pathname === "/privacy" ||
    pathname === "/terms" ||
    pathname === "/how-to-invoice" ||
    // Shown by the service worker when there is no signal, which is exactly
    // when the sign-in check cannot be made.
    pathname === "/offline" ||
    pathname.startsWith("/i/") ||
    pathname.startsWith("/q/") ||
    pathname.startsWith("/r/");

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
      {/* Small, quiet, and on every page: an advertiser, an app store and a
          cautious tradesman all want to find these before handing over an
          email address. Never printed -- a customer's invoice is not the
          place for them. */}
      <footer className="mx-auto w-full max-w-4xl px-4 pb-24 pt-2 text-xs text-neutral-500 sm:pb-8 print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4">
          <span>{SITE_NAME}</span>
          <Link href="/how-to-invoice" className="underline">How to invoice</Link>
          <Link href="/privacy" className="underline">Your information</Link>
          <Link href="/terms" className="underline">Terms</Link>
          <Link href="/feedback" className="underline">Tell us something</Link>
        </div>
      </footer>
      <FeedbackButton />
      <PaidCelebration />
    </AuthProvider>
  );
}
