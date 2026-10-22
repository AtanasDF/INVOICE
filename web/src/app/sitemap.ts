import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Only what is public. A sitemap listing
// pages that bounce a stranger to the sign-in would only teach a crawler that
// the site is mostly walls.
export default function sitemap(): MetadataRoute.Sitemap {
  const changed = new Date("2026-09-23");
  const site = new Date("2026-10-22");
  // Absolute, not relative: a crawler reads the sitemap on its own and has
  // nothing to resolve a bare "/" against.
  return [
    { url: `${SITE_URL}/`, lastModified: changed, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/features`, lastModified: site, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/drivers`, lastModified: site, changeFrequency: "monthly", priority: 0.9 },
    { url: `${SITE_URL}/pricing`, lastModified: site, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/faq`, lastModified: site, changeFrequency: "monthly", priority: 0.7 },
    { url: `${SITE_URL}/help/home-screen`, lastModified: site, changeFrequency: "monthly", priority: 0.5 },
    { url: `${SITE_URL}/how-to-invoice`, lastModified: changed, changeFrequency: "monthly", priority: 0.8 },
    { url: `${SITE_URL}/privacy`, lastModified: changed, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: changed, changeFrequency: "yearly", priority: 0.3 },
  ];
}
