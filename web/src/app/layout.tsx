import type { Metadata } from "next";
import "./globals.css";
import AppShell from "./AppShell";

export const metadata: Metadata = {
  title: "Invoice & Expenses",
  description: "Invoices, receipts and expense tracking for the self-employed",
  manifest: "/manifest.json",
  // Needed for push notifications to work on iPhone at all -- Safari only
  // supports web push for a site that's been "Added to Home Screen" as a
  // standalone app, not a plain browser tab.
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Invoice" },
  icons: { apple: "/icon-192.png" },
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
