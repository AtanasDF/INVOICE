import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Only the front door and the two legal pages are public; everything else
// needs an account, and the customer links (/i/, /q/, /r/) are private by
// design -- they already carry noindex headers of their own, but saying so
// here as well costs nothing and stops a crawler wasting its time.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: ["/", "/privacy", "/terms"],
        disallow: ["/i/", "/q/", "/r/", "/api/", "/login", "/reset-password", "/settings", "/invoices", "/receipts", "/clients", "/quotes", "/expenses", "/vat", "/files", "/scan", "/copy", "/convert", "/mileage", "/recurring", "/check-company", "/free-invoice", "/feedback"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
