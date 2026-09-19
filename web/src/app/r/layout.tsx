import type { Metadata } from "next";

// Every supplier request link, found or not, stays out of search engines and
// sends no referrer (the page's own metadata is skipped when it's not found).
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function RequestLinkLayout({ children }: { children: React.ReactNode }) {
  return children;
}
