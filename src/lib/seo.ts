/**
 * SEO helpers.
 *
 * Structured metadata is only emitted where it is accurate: a stock page
 * describes a company and its listed status, never a price we cannot vouch for.
 * Pages whose content depends on client state (watchlist) are marked noindex.
 */

import type { Metadata } from "next";
import { config } from "@/lib/config";

export const SITE_NAME = "Kenya Market Intelligence";

export function absoluteUrl(path = "/"): string {
  const origin = config.site.url.replace(/\/$/, "");
  return `${origin}${path.startsWith("/") ? path : `/${path}`}`;
}

type PageMeta = {
  title: string;
  description: string;
  path?: string;
  noindex?: boolean;
};

export function buildMetadata({ title, description, path = "/", noindex }: PageMeta): Metadata {
  return {
    title,
    description,
    alternates: { canonical: absoluteUrl(path) },
    robots: noindex ? { index: false, follow: true } : undefined,
    openGraph: {
      title: `${title} | ${SITE_NAME}`,
      description,
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      locale: "en_KE",
      type: "website",
    },
    twitter: {
      card: "summary_large_image",
      title: `${title} | ${SITE_NAME}`,
      description,
    },
  };
}

/**
 * Minimal, accurate JSON-LD for a listed company.
 *
 * Deliberately excludes price data: structured data is consumed by crawlers that
 * may present it as fact, and a delayed or sample price must never be framed
 * as a definitive quote.
 */
export function companyJsonLd(input: { ticker: string; name: string; path: string }) {
  return {
    "@context": "https://schema.org",
    "@type": "Corporation",
    name: input.name,
    tickerSymbol: input.ticker,
    url: absoluteUrl(input.path),
  };
}
