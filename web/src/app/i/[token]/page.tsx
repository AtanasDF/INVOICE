import type { Metadata } from "next";
import { notFound } from "next/navigation";
import PublicInvoiceView from "@/components/invoice/PublicInvoiceView";
import { loadPublicInvoice } from "@/lib/publicInvoice";

// A private link, not a page to be found: kept out of search engines and
// never cached, so a payment recorded a minute ago shows.
export const dynamic = "force-dynamic";

export async function generateMetadata({ params }: { params: Promise<{ token: string }> }): Promise<Metadata> {
  const { token } = await params;
  const data = await loadPublicInvoice(token);
  const hidden = { robots: { index: false, follow: false }, referrer: "no-referrer" } as const;
  if (!data) return { title: "Invoice", ...hidden };
  const from = data.profile.businessName ? ` from ${data.profile.businessName}` : "";
  return { title: `Invoice ${data.invoice.number}${from}`, ...hidden };
}

export default async function PublicInvoicePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const data = await loadPublicInvoice(token);
  if (!data) notFound();
  return <PublicInvoiceView data={data} token={token} />;
}
