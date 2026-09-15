import type { Metadata, Viewport } from "next";
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

// viewportFit: "cover" lets fixed full-screen content (the document
// scanner) extend under the notch/status bar instead of leaving an
// unexplained blank gap there -- without it, that content has no way to
// reason about the safe area at all. Everything that actually sits near
// an edge (AppShell's header, the scanner's back button and controls)
// adds its own env(safe-area-inset-*) padding to compensate; this alone
// only grants the ability to.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
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
