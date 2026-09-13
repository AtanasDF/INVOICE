import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./AppShell";

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
          <AppShell>{children}</AppShell>
        </div>
      </body>
    </html>
  );
}
