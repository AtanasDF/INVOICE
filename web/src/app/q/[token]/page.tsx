import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicQuoteView from "@/components/quote/PublicQuoteView";
import { loadPublicQuote } from "@/lib/publicQuote";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicQuote(token);
  if (!data) notFound();
  return { title: `Quote ${data.quote.number}${data.profile.businessName ? ` from ${data.profile.businessName}` : ""}` };
}

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicQuote(token);
  if (!data) notFound();
  return <PublicQuoteView data={data} token={token} />;
}
