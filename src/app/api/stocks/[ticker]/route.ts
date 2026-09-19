/**
 * GET /api/stocks/[ticker]
 *
 * Company profile, latest quote, trailing returns and sector peers.
 * 404 for an unknown ticker; fields the source does not supply are null.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { parseTicker } from "@/lib/validation";
import { UnknownInstrumentError } from "@/lib/providers/errors";
import { buildMeta, getStockDetail } from "@/lib/services/market-service";
import { getMarketDataProvider } from "@/lib/providers";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (request: NextRequest, context: { params: Promise<{ ticker: string }> }) => {
    const { ticker: raw } = await context.params;
    const ticker = parseTicker(raw);

    const detail = await getStockDetail(ticker);
    if (!detail) {
      throw new UnknownInstrumentError(getMarketDataProvider().id, ticker);
    }

    return jsonEnvelope(detail, buildMeta(), { sMaxAge: 60 });
  }
);
