"use client";

import Link from "next/link";
import { AFTER_TOOLS, NAV_HREFS, SECTIONS, TOOLS, TOOLS_LABEL, sectionOf, type Section } from "@/lib/navGroups";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { safeNext } from "@/lib/safeNext";
import { signOut } from "@/lib/signOut";
import { useWakeLock } from "@/lib/wakeLock";
import PaidCelebration from "@/components/PaidCelebration";
import { SITE_NAME } from "@/lib/siteName";
import { rememberSource } from "@/lib/source";
import { rememberInvite } from "@/lib/invites";
import { receiptsStore } from "@/lib/storage";

const HREFS = NAV_HREFS;

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
      // Only its own Escape: every menu listens on the document, and focusing
      // a closed one's summary pulled the caret out of a search box or a sheet.
      if (e.key !== "Escape" || !box.current?.open) return;
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
      <div className={`absolute right-0 z-30 mt-2 ${width} max-h-[80dvh] overflow-y-auto overscroll-contain rounded-xl border bg-white py-1 text-neutral-800 shadow-lg`}>{children}</div>
    </details>
  );
}

// A section is marked as where you are from any of its tabs, so Quotes lights
// up Invoices.
function SectionLink({ section, className = "", children }: { section: Section; className?: string; children?: React.ReactNode }) {
  const here = sectionOf(useCurrentHref()) === section;
  return (
    <Link href={section.href} aria-current={here ? "page" : undefined} className={`${className} ${here ? "font-semibold text-neutral-900" : ""}`.trim()}>
      {children ?? section.label}
    </Link>
  );
}

// The number of emailed receipts waiting to be checked, beside Receipts in
// the menu, so nobody has to open a page to learn there is something to do.
// Read again on every page change, since checking one is a page change.
// The menu and the tabs both show it: one read per page, not one each.
let lastReview: { key: string; count: Promise<number> } | null = null;
function reviewCount(key: string): Promise<number> {
  if (lastReview?.key !== key) lastReview = { key, count: receiptsStore.needsReviewCount() };
  return lastReview.count;
}
function useNeedsReview(): number {
  const { user } = useAuth();
  const path = usePathname();
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!user) return;
    let gone = false;
    reviewCount(`${user.id}:${path}`).then((n) => !gone && setCount(n), () => {});
    return () => {
      gone = true;
    };
  }, [user, path]);
  return user ? count : 0;
}

function ReviewBadge({ count }: { count: number }) {
  if (!count) return null;
  return (
    <span className="ml-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800">
      {count}
      <span className="sr-only"> to check</span>
    </span>
  );
}

function ToolsMenu() {
  const current = useCurrentHref();
  return (
    <Menu label={TOOLS_LABEL} here={[...TOOLS, ...AFTER_TOOLS].some(([href]) => href === current)} width="w-56">
      {[...TOOLS, ...AFTER_TOOLS].map(([href, label]) => (
        <NavLink key={href} href={href} className="block px-4 py-2.5">
          {label}
        </NavLink>
      ))}
    </Menu>
  );
}

function PhoneMenu() {
  const current = useCurrentHref();
  const review = useNeedsReview();
  return (
    <Menu label="Menu" here={!!current && current !== "/"} width="w-[min(18rem,calc(100vw-2rem))]">
      <NavLink href="/" className="block px-4 py-3 text-base">
        Home
      </NavLink>
      {SECTIONS.map((s) => (
        <SectionLink key={s.href} section={s} className="block px-4 py-2.5 text-base">
          <span className="flex items-center">
            {s.label}
            {s.href === "/receipts" && <ReviewBadge count={review} />}
          </span>
          {s.tabs.length > 0 && <span className="block text-xs font-normal text-neutral-500">{s.tabs.map(([, l]) => l).join(" · ")}</span>}
        </SectionLink>
      ))}
      <div className="border-t pb-1">
        <p className="px-4 pb-1 pt-2 text-xs text-neutral-500">{TOOLS_LABEL}</p>
        {TOOLS.map(([href, label]) => (
          <NavLink key={href} href={href} className="block px-4 py-2">
            {label}
          </NavLink>
        ))}
      </div>
      <div className="border-t py-1">
        {[...AFTER_TOOLS, ["/settings", "Settings"] as [string, string]].map(([href, label]) => (
          <NavLink key={href} href={href} className="block px-4 py-2">
            {label}
          </NavLink>
        ))}
      </div>
    </Menu>
  );
}

// The tabs of the section you are in, above the page itself. Only on a tab's
// own address: a new invoice or one receipt is a step inside the section, not
// a place to switch away from.
function SectionTabs() {
  const path = usePathname();
  const section = SECTIONS.find((s) => s.tabs.some(([t]) => t === path));
  const review = useNeedsReview();
  if (!section) return null;
  return (
    <nav aria-label={section.label} className="-mx-4 mb-5 overflow-x-auto px-4 print:hidden">
      <div className="flex w-max gap-1 rounded-xl bg-neutral-100 p-1 text-sm font-medium">
        {section.tabs.map(([href, label]) => (
          <Link
            key={href}
            href={href}
            aria-current={path === href ? "page" : undefined}
            className={`flex items-center whitespace-nowrap rounded-lg px-3 py-2 ${path === href ? "bg-white text-neutral-900 shadow-sm" : "text-neutral-600"}`}
          >
            {label}
            {href === "/receipts/review" && <ReviewBadge count={review} />}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function Header() {
  const { user } = useAuth();
  // A customer opening an invoice link sees the invoice, not the app.
  const path = usePathname();
  if (path.startsWith("/i/") || path.startsWith("/q/") || path.startsWith("/r/")) return null;
  return (
    <header className="border-b bg-white text-neutral-900 print:hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      {/* The whole row wraps, not just the nav inside it. At 320px with the
          text at twice the size the name and the menu together are wider
          than the screen, and because neither would shrink the row simply
          ran off the side -- taking the menu's own panel with it, since that
          is positioned against the row's right edge. */}
      <div className="safe-x mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-x-4 gap-y-1 px-4 py-3">
        <Link href="/" className="min-w-0 wrap-anywhere text-lg font-semibold">
          {SITE_NAME}
        </Link>
        {/* The signed-in header wraps: at twice the text size somebody has
            chosen on their phone, "Menu" and "Sign out" together are wider
            than a 390px screen, and a header that runs off the side takes
            the way out of the app with it. */}
        {user ? (
          <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-sm font-medium text-neutral-600">
            <div className="hidden items-center gap-x-4 md:flex">
              <NavLink href="/">Home</NavLink>
              {SECTIONS.map((sec) => (
                <SectionLink key={sec.href} section={sec} />
              ))}
              <ToolsMenu />
              <NavLink href="/settings">Settings</NavLink>
            </div>
            <div className="md:hidden">
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
          // A stranger's way round the website (notes/website-plan.md). The
          // brand goes back to the front door.
          <nav aria-label="Website" className="flex items-center gap-x-3 text-sm font-medium text-neutral-600 sm:gap-x-5">
            <Link href="/features" className="whitespace-nowrap">What it does</Link>
            <Link href="/pricing">Free</Link>
            <Link href="/drivers" className="whitespace-nowrap">Drivers</Link>
            <Link href="/login" className="whitespace-nowrap text-neutral-900">Sign in</Link>
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

  // The service worker, for everybody -- not only for whoever turned on
  // notifications. It was registered by enablePush() and nowhere else, so
  // the offline page, which is a built feature, reached only the handful of
  // people who had been into Settings and switched push on. Everyone else
  // got the browser's own "no internet" page in a van with no signal.
  //
  // It caches nothing but the app's own content-hashed files and the
  // offline page; every screen is fetched fresh, because what a screen
  // shows is somebody's money. Failing is fine and silent: it is an
  // improvement on top of a working app, not a part of it.
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
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
    // Whoever finds a security problem in this app almost certainly does not
    // have an account, and telling them to make one first is how a report
    // turns into a tweet.
    pathname === "/security" ||
    // A statement about whether somebody can use the app is no use behind a
    // sign-in they may not be able to get through.
    pathname === "/accessibility" ||
    pathname === "/how-to-invoice" ||
    // The website: what a stranger off a flyer or a search reads before
    // deciding to make an account.
    pathname === "/features" ||
    pathname === "/pricing" ||
    pathname === "/drivers" ||
    pathname === "/faq" ||
    // Somebody off a flyer may want the icon before they have an account.
    pathname === "/help/home-screen" ||
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
  // Not on a phone. There it sat over whatever was at the bottom right of
  // the screen -- a receipt's Remove, the amounts on the dashboard, the
  // Settings Save bar, the Free page's own bottom bar (Atanas's walk-through,
  // 2026-10-28). On a phone Feedback is in the menu and in the footer.
  return (
    <Link
      href="/feedback"
      className="hide-while-typing fixed z-10 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 max-sm:hidden print:hidden"
      style={{ bottom: "calc(1.25rem + env(safe-area-inset-bottom))", right: "calc(1.25rem + env(safe-area-inset-right))" }}
    >
      Feedback
    </Link>
  );
}

// Signed in only, like the page it opens: a customer reading an invoice at
// /i/ has no account to send feedback from.
function FeedbackLink() {
  const { user } = useAuth();
  return user ? <Link href="/feedback" className="underline">Feedback</Link> : null;
}

// /help is behind the sign-in, so for a stranger on the front door the link
// only sent them back to /login.
function HelpLink() {
  const { user } = useAuth();
  return user ? <Link href="/help" className="underline">How it works</Link> : null;
}

// Where the keyboard goes when the page changes. Next announces the new
// title, but focus stays on the link that was just followed -- which is now
// in the header of a different page, so the next Tab carries on from the
// old place and a screen reader starts reading nowhere near the new
// content. WCAG 2.4.3.
//
// Focus is moved to <main>, not to its first heading: the heading belongs to
// the page and comes and goes, and main is always there. tabIndex={-1} makes
// it focusable without putting it in the tab order, and the outline is taken
// off because nobody clicked it -- the focus RING is for people driving by
// keyboard, and this is where they already are.
//
// Not on the first load: on arrival the browser's own focus is right, and
// stealing it would skip the header for somebody who has just pressed Tab.
function FocusOnNavigate({ target }: { target: React.RefObject<HTMLElement | null> }) {
  const pathname = usePathname();
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    target.current?.focus();
  }, [pathname, target]);
  return null;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useWakeLock();
  const main = useRef<HTMLElement>(null);
  return (
    <AuthProvider>
      {/* WCAG 2.4.1: past the header and its five menus in one key. Hidden until a keyboard lands on it; its padding only then, or sr-only keeps a 64x32 box of it over the header. */}
      <a href="#main" className="sr-only rounded-lg bg-neutral-900 text-sm font-medium text-white focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:px-4 focus:py-2">
        Skip to the page
      </a>
      <Header />
      <FocusOnNavigate target={main} />
      <main id="main" ref={main} tabIndex={-1} className="safe-x mx-auto w-full max-w-4xl flex-1 px-4 py-6 outline-none print:max-w-none print:px-0 print:py-0">
        <Gate>
          <SectionTabs />
          {children}
        </Gate>
      </main>
      {/* Small, quiet, and on every page: an advertiser, an app store and a
          cautious tradesman all want to find these before handing over an
          email address. Never printed -- a customer's invoice is not the
          place for them. */}
      <footer className="safe-x mx-auto w-full max-w-4xl px-4 pb-24 pt-2 text-xs text-neutral-500 sm:pb-8 print:hidden">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t pt-4">
          <span>{SITE_NAME}</span>
          <HelpLink />
          <Link href="/how-to-invoice" className="underline">How to invoice</Link>
          <Link href="/privacy" className="underline">Your information</Link>
          <Link href="/terms" className="underline">Terms</Link>
          <Link href="/accessibility" className="underline">Accessibility</Link>
          <Link href="/security" className="underline">Security</Link>
          <FeedbackLink />
        </div>
      </footer>
      <FeedbackButton />
      <PaidCelebration />
    </AuthProvider>
  );
}
