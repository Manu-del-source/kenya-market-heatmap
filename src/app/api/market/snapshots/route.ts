/**
 * GET /api/market/snapshots?limit=90
 *
 * Historical daily market snapshots. Returns an empty list until ingestion has
 * run (`npm run ingest:market` or the scheduled cron), which the UI reports as
 * "Data unavailable" rather than filling the gap with estimates.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { parseBoundedInt } from "@/lib/validation";
import { buildMeta, getSnapshotHistory } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;
  const limit = parseBoundedInt(params.get("limit"), {
    min: 1,
    max: 365,
    fallback: 90,
    field: "limit",
  });

  const snapshots = await getSnapshotHistory(limit);
  return jsonEnvelope(
    { snapshots, count: snapshots.length },
    buildMeta(
      snapshots.length === 0
        ? ["No market snapshots have been ingested yet. Run `npm run ingest:market` to populate history."]
        : []
    ),
    { sMaxAge: 300 }
  );
});
