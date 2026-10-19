"use client";

import PublicLinkError from "@/components/PublicLinkError";

export default function InvoiceLinkError({ error }: { error: Error & { digest?: string } }) {
  return <PublicLinkError error={error} what="invoice" />;
}
