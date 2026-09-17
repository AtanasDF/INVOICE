"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";
import { useWakeLock } from "@/lib/wakeLock";

function Header() {
  const { user } = useAuth();
  return (
    <header className="border-b bg-white text-neutral-900" style={{ paddingTop: "env(safe-area-inset-top)" }}>
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Invoicer
        </Link>
        {user && (
          <nav className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-medium text-neutral-600">
            <Link href="/">Home</Link>
            <Link href="/clients">Clients & suppliers</Link>
            <Link href="/receipts">Receipts</Link>
            <Link href="/invoices">Invoices</Link>
            <Link href="/expenses">Expenses</Link>
            <Link href="/settings">Settings</Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="text-neutral-500 hover:text-neutral-900"
            >
              Sign out
            </button>
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
  const isPublicPage = isLoginPage || isResetPasswordPage;

  useEffect(() => {
    if (loading) return;
    if (!user && !isPublicPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
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
  if (!user || pathname === "/feedback") return null;
  return (
    <Link
      href="/feedback"
      className="fixed right-5 z-10 rounded-full bg-neutral-900 px-4 py-2.5 text-sm font-medium text-white shadow-lg hover:bg-neutral-800 print:hidden"
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
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Gate>{children}</Gate>
      </main>
      <FeedbackButton />
    </AuthProvider>
  );
}
