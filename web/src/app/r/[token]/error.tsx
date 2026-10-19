"use client";

import PublicLinkError from "@/components/PublicLinkError";

export default function RequestLinkError({ error }: { error: Error & { digest?: string } }) {
  return <PublicLinkError error={error} what="request" />;
}
