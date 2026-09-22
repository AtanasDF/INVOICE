"use client";

import dynamic from "next/dynamic";

// The builder seeds its state from localStorage, which only exists in the
// browser; skipping SSR keeps the first render and hydration identical.
const FreeInvoiceBuilder = dynamic(() => import("@/components/free-invoice/FreeInvoiceBuilder"), {
  ssr: false,
  loading: () => (
    <div>
      <h1 className="text-2xl font-bold">Free invoice</h1>
      <p className="mt-1 text-neutral-600">Build an invoice and print it or save it as a PDF, no sign-in needed. Scanning one in takes a free sign-in first.</p>
    </div>
  ),
});

export default function FreeInvoicePage() {
  return <FreeInvoiceBuilder />;
}
