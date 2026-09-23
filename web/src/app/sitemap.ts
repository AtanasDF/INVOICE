import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/siteUrl";

// Three pages, because three pages is all that is public. A sitemap listing
// pages that bounce a stranger to the sign-in would only teach a crawler that
// the site is mostly walls.
export default function sitemap(): MetadataRoute.Sitemap {
  const changed = new Date("2026-09-23");
  // Absolute, not relative: a crawler reads the sitemap on its own and has
  // nothing to resolve a bare "/" against.
  return [
    { url: `${SITE_URL}/`, lastModified: changed, changeFrequency: "weekly", priority: 1 },
    { url: `${SITE_URL}/privacy`, lastModified: changed, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, lastModified: changed, changeFrequency: "yearly", priority: 0.3 },
  ];
}
