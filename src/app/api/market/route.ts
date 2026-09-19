/**
 * GET /api/market
 *
 * Whole-market dashboard payload: summary, indices, breadth, sector aggregates
 * and top movers. One request feeds the homepage so the page renders with a
 * single round-trip.
 */

import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { buildMeta, getMarketOverview } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const overview = await getMarketOverview();
  return jsonEnvelope(overview, buildMeta(), { sMaxAge: 60 });
});
