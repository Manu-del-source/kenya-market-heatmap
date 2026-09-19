/**
 * Sitemap — only public, indexable routes.
 *
 * Stock and sector pages are generated from the company register so new
 * listings become discoverable without a manual edit.
 */

import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/seo";
import { listCompanies } from "@/lib/services/market-service";

export const revalidate = 3600;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const companies = await listCompanies();
  const sectorSlugs = [...new Set(companies.map((company) => company.sectorSlug))];
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: absoluteUrl("/"), lastModified, changeFrequency: "hourly", priority: 1 },
    { url: absoluteUrl("/stocks"), lastModified, changeFrequency: "hourly", priority: 0.9 },
    { url: absoluteUrl("/sectors"), lastModified, changeFrequency: "hourly", priority: 0.8 },
    { url: absoluteUrl("/compare"), lastModified, changeFrequency: "daily", priority: 0.7 },
    { url: absoluteUrl("/economy"), lastModified, changeFrequency: "weekly", priority: 0.6 },
  ];

  return [
    ...staticRoutes,
    ...sectorSlugs.map((slug) => ({
      url: absoluteUrl(`/sectors/${slug}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
    ...companies.map((company) => ({
      url: absoluteUrl(`/stocks/${company.ticker}`),
      lastModified,
      changeFrequency: "daily" as const,
      priority: 0.7,
    })),
  ];
}
