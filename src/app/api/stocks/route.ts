/**
 * GET /api/stocks?sector=<slug>&q=<search>&sort=<id>&page=1&pageSize=25&symbols=KCB,SCOM
 *
 * Paginated company list joined with the latest quote. Filters and sorting are
 * validated server-side: unknown enum values are rejected rather than silently
 * ignored, and `pageSize` is capped so a caller cannot ask for the world.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import {
  parseBoundedInt,
  parseEnum,
  parseSearch,
  parseSlug,
  parseTickerList,
} from "@/lib/validation";
import { buildMeta, getQuotes, listCompanies } from "@/lib/services/market-service";
import type { Company, Paginated, Quote } from "@/lib/types/market";

export const dynamic = "force-dynamic";

const SORTS = [
  "ticker",
  "name",
  "price-desc",
  "price-asc",
  "change-desc",
  "change-asc",
  "marketCap-desc",
  "turnover-desc",
  "volume-desc",
] as const;
type SortId = (typeof SORTS)[number];

export type StockListItem = {
  company: Company;
  quote: Quote | null;
};

function sortRows(rows: StockListItem[], sort: SortId): StockListItem[] {
  const value = (row: StockListItem): number | null => {
    switch (sort) {
      case "price-desc":
      case "price-asc":
        return row.quote?.price ?? null;
      case "change-desc":
      case "change-asc":
        return row.quote?.changePercent ?? null;
      case "marketCap-desc":
        return row.quote?.marketCap ?? null;
      case "turnover-desc":
        return row.quote?.turnover ?? null;
      case "volume-desc":
        return row.quote?.volume ?? null;
      default:
        return null;
    }
  };

  const sorted = [...rows];
  switch (sort) {
    case "ticker":
      return sorted.sort((a, b) => a.company.ticker.localeCompare(b.company.ticker));
    case "name":
      return sorted.sort((a, b) => a.company.name.localeCompare(b.company.name));
    case "price-desc":
    case "change-desc":
    case "marketCap-desc":
    case "turnover-desc":
    case "volume-desc":
      return sorted.sort((a, b) => (value(b) ?? -Infinity) - (value(a) ?? -Infinity));
    case "price-asc":
    case "change-asc":
      return sorted.sort((a, b) => (value(a) ?? Infinity) - (value(b) ?? Infinity));
    default:
      return sorted;
  }
}

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;

  const sector = params.get("sector") ? parseSlug(params.get("sector"), "sector") : null;
  const query = parseSearch(params.get("q"));
  const sort = parseEnum(params.get("sort"), SORTS, "sort", "marketCap-desc");
  const page = parseBoundedInt(params.get("page"), {
    min: 1,
    max: 10_000,
    fallback: 1,
    field: "page",
  });
  const pageSize = parseBoundedInt(params.get("pageSize"), {
    min: 1,
    max: 100,
    fallback: 25,
    field: "pageSize",
  });
  const symbols = parseTickerList(params.get("symbols"));

  const companies = await listCompanies();
  const quotes = await getQuotes();
  const quoteByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));

  let rows: StockListItem[] = companies.map((company) => ({
    company,
    quote: quoteByTicker.get(company.ticker) ?? null,
  }));

  if (symbols.length > 0) {
    const wanted = new Set(symbols);
    rows = rows.filter((row) => wanted.has(row.company.ticker));
  }

  if (sector) rows = rows.filter((row) => row.company.sectorSlug === sector);

  if (query) {
    const needle = query.toLowerCase();
    rows = rows.filter(
      (row) =>
        row.company.ticker.toLowerCase().includes(needle) ||
        row.company.name.toLowerCase().includes(needle) ||
        row.company.industry.toLowerCase().includes(needle)
    );
  }

  rows = sortRows(rows, sort);

  const total = rows.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const items = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const payload: Paginated<StockListItem> = {
    items,
    page: safePage,
    pageSize,
    total,
    totalPages,
  };

  return jsonEnvelope(payload, buildMeta(), { sMaxAge: 60 });
});
