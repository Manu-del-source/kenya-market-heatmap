/**
 * GET /api/stocks/[ticker]/history?range=1M
 *
 * Price history for the chart ranges the UI exposes (1D…5Y).
 *
 * Two honesty guarantees:
 *  - `intradayAvailable=false` when the source only has end-of-day data. The
 *    1D range then returns the last few sessions and must be labelled as such.
 *  - `bars` is empty when there genuinely is no data — it is never padded with
 *    synthetic points.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { UnknownInstrumentError } from "@/lib/providers/errors";
import { parseEnum, parseTicker } from "@/lib/validation";
import { HISTORY_RANGES, type HistoryRange } from "@/lib/types/market";
import { buildMeta, getCompany, getPriceHistory } from "@/lib/services/market-service";
import { getMarketDataProvider } from "@/lib/providers";
import { maxDrawdown, annualisedVolatility } from "@/lib/analytics/series";

export const dynamic = "force-dynamic";

export const GET = withApi(
  async (request: NextRequest, context: { params: Promise<{ ticker: string }> }) => {
    const { ticker: raw } = await context.params;
    const ticker = parseTicker(raw);
    const params = new URL(request.url).searchParams;
    const range = parseEnum<HistoryRange>(params.get("range"), HISTORY_RANGES, "range", "1M");

    const company = await getCompany(ticker);
    if (!company) throw new UnknownInstrumentError(getMarketDataProvider().id, ticker);

    const history = await getPriceHistory(ticker, range);
    const points = history.bars.map((bar) => ({
      date: bar.date,
      close: bar.close ?? bar.adjustedClose,
    }));

    return jsonEnvelope(
      {
        ...history,
        company,
        stats: {
          maxDrawdownPercent: maxDrawdown(points),
          annualisedVolatilityPercent: annualisedVolatility(points),
          firstClose: points[0]?.close ?? null,
          lastClose: points.at(-1)?.close ?? null,
        },
      },
      buildMeta(
        history.intradayAvailable
          ? []
          : ["End-of-day granularity only — the 1D range shows recent sessions, not intraday ticks."]
      ),
      { sMaxAge: 300 }
    );
  }
);
