/**
 * POST /api/portfolio/valuation
 *
 * Stateless portfolio calculator (Phase 12). The caller submits the holdings it
 * keeps in its own browser; the server values them against the latest quotes it
 * can verify and returns the valuation, allocation and caveats.
 *
 * Nothing is stored server-side — there are no accounts yet, so a portfolio
 * cannot be tied to a person. That also means:
 *
 *   - no personal data is accepted or retained;
 *   - the payload is validated and size-capped like any untrusted input;
 *   - the endpoint is rate-limited more tightly than a plain market read.
 *
 * Body:  { "holdings": [ { "ticker": "KCB", "quantity": 1000, "averageCost": 41.2 } ] }
 * Reply: { meta, data: PortfolioValuation }
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { ValidationError, parsePortfolioHoldings } from "@/lib/validation";
import { computePortfolioValuation } from "@/lib/analytics/portfolio";
import { buildMeta, getQuotes, listCompanies } from "@/lib/services/market-service";
import type { Company, Quote } from "@/lib/types/market";

export const dynamic = "force-dynamic";

/** Reject oversized bodies before parsing them. */
const MAX_BODY_BYTES = 32 * 1024;

export const POST = withApi(
  async (request: NextRequest) => {
    const declared = Number(request.headers.get("content-length") ?? "0");
    if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
      throw new ValidationError("Payload too large.");
    }

    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      throw new ValidationError("Payload too large.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new ValidationError("Expected a JSON body.");
    }

    const holdings = parsePortfolioHoldings(parsed);

    if (holdings.length === 0) {
      const empty = computePortfolioValuation({ holdings: [], quotes: {}, companies: {} });
      return jsonEnvelope(empty, buildMeta(), { sMaxAge: 0 });
    }

    const tickers = [...new Set(holdings.map((holding) => holding.ticker))];
    const [companies, quotes] = await Promise.all([listCompanies(), getQuotes(tickers)]);

    const quoteMap: Record<string, Quote | undefined> = {};
    for (const quote of quotes) quoteMap[quote.ticker] = quote;

    const companyMap: Record<string, Company | undefined> = {};
    for (const company of companies) companyMap[company.ticker] = company;

    const valuation = computePortfolioValuation({
      holdings,
      quotes: quoteMap,
      companies: companyMap,
    });

    return jsonEnvelope(valuation, buildMeta(valuation.notes), { sMaxAge: 0 });
  },
  // Lower than a market read: this endpoint fans out to quotes per request.
  { limit: 30 }
);
