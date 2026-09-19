/**
 * GET /api/compare/sectors?sectors=banking,energy&period=1Y
 *
 * Normalised historical comparison of sector performance. Each sector line is an
 * equal-weighted index of its constituents, rebased to 100 — a transparent
 * in-app proxy, not an official NSE sector index. Constituent coverage is
 * returned with every row so partial data is visible.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { ValidationError, parseComparePeriod, parseCompareSlugs } from "@/lib/validation";
import { compareSectors } from "@/lib/services/comparison-service";
import { listSectors } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;
  const requested = parseCompareSlugs(params.get("sectors"));
  const period = parseComparePeriod(params.get("period"));

  const known = new Set((await listSectors()).map((sector) => sector.slug));
  const unknown = requested.filter((slug) => !known.has(slug));
  if (unknown.length > 0) {
    throw new ValidationError(`Unknown sector slug${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}.`);
  }

  const { meta, data } = await compareSectors({ slugs: requested, period });
  return jsonEnvelope(data, meta, { sMaxAge: 300 });
});
