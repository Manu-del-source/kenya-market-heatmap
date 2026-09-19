/**
 * GET /api/compare/stocks?tickers=KCB,EQTY,SCOM&period=3Y
 *
 * Normalised historical comparison for up to five listed companies. Returns
 * base-100 series for the chart, measured metrics for the summary table, and an
 * explicit alignment record explaining the window actually used.
 *
 * The response is an envelope: `meta` carries provider, data mode, as-of time
 * and limitations; `data` carries the comparison. Unmeasurable values are
 * `null`, never 0.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { parseComparePeriod, parseCompareTickers } from "@/lib/validation";
import { compareStocks } from "@/lib/services/comparison-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;
  const tickers = parseCompareTickers(params.get("tickers"));
  const period = parseComparePeriod(params.get("period"));

  const { meta, data } = await compareStocks({ tickers, period });
  return jsonEnvelope(data, meta, { sMaxAge: 300 });
});
