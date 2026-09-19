/**
 * GET /api/market/breadth?sector=<slug>
 *
 * Advance/decline counts, the advance/decline ratio, and counts of instruments
 * at 52-week highs and lows. `newHighs`/`newLows` are null when the platform
 * has no 52-week reference — never zero.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { ValidationError, parseSlug } from "@/lib/validation";
import { breadthCaveat, computeSectorBreadth } from "@/lib/analytics/breadth";
import { buildMeta, getMarketBreadth, getQuotes } from "@/lib/services/market-service";
import { listCompanies } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;
  const sectorParam = params.get("sector");
  const sector = sectorParam ? parseSlug(sectorParam, "sector") : null;

  const quotes = await getQuotes();
  const companies = await listCompanies();
  const sectorByTicker = new Map(companies.map((company) => [company.ticker, company.sectorSlug]));

  let rows = quotes;
  if (sector) {
    rows = quotes.filter((quote) => sectorByTicker.get(quote.ticker) === sector);
    if (rows.length === 0) {
      throw new ValidationError(`No listed companies found for sector "${sector}".`);
    }
  }

  const breadth = await getMarketBreadth(rows);
  const bySector = computeSectorBreadth(
    quotes.map((quote) => ({
      ticker: quote.ticker,
      changePercent: quote.changePercent,
      price: quote.price,
      high52w: null,
      low52w: null,
      sector: sectorByTicker.get(quote.ticker) ?? "unclassified",
    }))
  );

  return jsonEnvelope(
    { breadth, bySector, caveat: breadthCaveat(breadth, "companies") },
    buildMeta(),
    { sMaxAge: 60 }
  );
});
