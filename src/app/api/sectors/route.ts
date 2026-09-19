/**
 * GET /api/sectors
 *
 * Sector aggregates: daily / weekly / monthly returns, capitalisation,
 * turnover and breadth. `incomplete` marks sectors whose aggregate rests on
 * very few priced companies, so the UI can qualify it.
 */

import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { buildMeta, getSectorStats } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const sectors = await getSectorStats();
  return jsonEnvelope({ sectors, count: sectors.length }, buildMeta(), { sMaxAge: 60 });
});
