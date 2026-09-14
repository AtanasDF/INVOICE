"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { AuthProvider, useAuth } from "@/lib/authContext";
import { supabase } from "@/lib/supabaseClient";

function Header() {
  const { user } = useAuth();
  return (
    <header className="border-b bg-white text-neutral-900">
      <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
        <Link href="/" className="text-lg font-semibold">
          Invoicer
        </Link>
        {user && (
          <nav className="flex items-center gap-4 text-sm font-medium text-neutral-600">
            <Link href="/">Home</Link>
            <Link href="/clients">Clients</Link>
            <Link href="/receipts">Receipts</Link>
            <Link href="/invoices">Invoices</Link>
            <Link href="/expenses">Expenses</Link>
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

  useEffect(() => {
    if (loading) return;
    if (!user && !isLoginPage) router.replace("/login");
    if (user && isLoginPage) router.replace("/");
  }, [loading, user, isLoginPage, router]);

  if (loading) {
    return <p className="text-sm text-neutral-500">Loading…</p>;
  }
  if ((!user && !isLoginPage) || (user && isLoginPage)) {
    return null;
  }

  return <>{children}</>;
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Header />
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <Gate>{children}</Gate>
      </main>
    </AuthProvider>
  );
}
