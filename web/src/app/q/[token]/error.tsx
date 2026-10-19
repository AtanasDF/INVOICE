"use client";

import PublicLinkError from "@/components/PublicLinkError";

export default function QuoteLinkError({ error }: { error: Error & { digest?: string } }) {
  return <PublicLinkError error={error} what="quote" />;
}
