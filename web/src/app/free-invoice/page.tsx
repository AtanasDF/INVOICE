"use client";

import dynamic from "next/dynamic";

// The builder seeds its state from localStorage, which only exists in the
// browser; skipping SSR keeps the first render and hydration identical.
const FreeInvoiceBuilder = dynamic(() => import("@/components/free-invoice/FreeInvoiceBuilder"), {
  ssr: false,
  loading: () => (
    <div>
      <h1 className="text-2xl font-bold">Free invoice</h1>
      <p className="mt-1 text-neutral-600">Photograph one you&apos;ve sent before and the next is filled in for you, or build one here. Print it, save it as a file, or keep it in your invoices.</p>
    </div>
  ),
});

export default function FreeInvoicePage() {
  return <FreeInvoiceBuilder />;
}
