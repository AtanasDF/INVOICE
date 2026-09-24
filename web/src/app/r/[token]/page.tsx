import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicRequestView from "@/components/quoteRequest/PublicRequestView";
import { loadPublicQuoteRequest } from "@/lib/publicQuoteRequest";

export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicQuoteRequest(token);
  if (!data) return { title: { absolute: "Quote request" } };
  return { title: { absolute: `Quote request${data.from ? ` from ${data.from}` : ""}` } };
}

export default async function PublicRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicQuoteRequest(token);
  if (!data) notFound();
  return <PublicRequestView data={data} token={token} />;
}
