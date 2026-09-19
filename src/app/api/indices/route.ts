/**
 * GET /api/indices
 *
 * NSE index levels. Values come from the licensed feed when configured;
 * otherwise they are demo provider proxies and are labelled as such by the
 * envelope meta.
 */

import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { buildMeta, getIndices } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async () => {
  const indices = await getIndices();
  return jsonEnvelope({ indices, count: indices.length }, buildMeta(), { sMaxAge: 60 });
});
