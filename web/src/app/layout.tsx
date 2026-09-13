import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Invoice & Expenses",
  description: "Invoices, receipts and expense tracking for the self-employed",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-neutral-50 text-neutral-900">
        <div className="flex min-h-screen flex-col">
          <header className="border-b bg-white">
            <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-3">
              <Link href="/" className="text-lg font-semibold">
                Invoicer
              </Link>
              <nav className="flex gap-4 text-sm font-medium text-neutral-600">
                <Link href="/clients">Clients</Link>
                <Link href="/receipts">Receipts</Link>
                <Link href="/invoices">Invoices</Link>
                <Link href="/expenses">Expenses</Link>
              </nav>
            </div>
          </header>
          <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
