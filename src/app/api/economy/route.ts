/**
 * GET /api/economy?series=KE.CBK.CBR
 *
 * Kenyan economic indicators. Series definitions are always available;
 * observations are only present once an operator has ingested them from the
 * publisher (KNBS / CBK / National Treasury). Nothing here is estimated or
 * scraped — a series with no observations reports `awaiting-ingest`.
 */

import type { NextRequest } from "next/server";
import { jsonEnvelope, withApi } from "@/lib/api/route-helpers";
import { parseBoundedInt } from "@/lib/validation";
import { getEconomyOverview, getEconomicObservations } from "@/lib/services/economy-service";
import { buildMeta } from "@/lib/services/market-service";

export const dynamic = "force-dynamic";

const SERIES_ID = /^[A-Z]{2}\.[A-Z0-9]+(\.[A-Z0-9_]+)*$/;

export const GET = withApi(async (request: NextRequest) => {
  const params = new URL(request.url).searchParams;
  const series = params.get("series");

  if (series && !SERIES_ID.test(series)) {
    return jsonEnvelope(
      { error: "Invalid series id." },
      buildMeta(),
      { status: 400, sMaxAge: 0 }
    );
  }

  if (series) {
    const observations = await getEconomicObservations(series);
    return jsonEnvelope({ seriesId: series, observations }, buildMeta(), { sMaxAge: 600 });
  }

  const overview = await getEconomyOverview();
  const limit = parseBoundedInt(params.get("limit"), {
    min: 1,
    max: 200,
    fallback: 60,
    field: "limit",
  });

  // Attach a short recent tail per series so the page can sparkline without
  // a second round-trip per card.
  const categories = [];
  for (const category of overview) {
    const seriesList = [];
    for (const entry of category.series) {
      const observations = entry.observations
        ? await getEconomicObservations(entry.seriesId)
        : [];
      seriesList.push({ ...entry, recent: observations.slice(-limit) });
    }
    categories.push({ category: category.category, series: seriesList });
  }

  return jsonEnvelope(
    { categories },
    buildMeta([
      "Economic series display only operator-ingested publisher data. Empty series mean no ingestion has run — not zero.",
    ]),
    { sMaxAge: 600 }
  );
});
