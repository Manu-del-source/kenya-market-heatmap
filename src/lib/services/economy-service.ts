/**
 * Economic data service (Phase 10 foundation).
 *
 * Economic data is deliberately kept in a separate tree from market data:
 * different publishers (KNBS, CBK, National Treasury), different licences,
 * different release calendars, different semantics (a monthly CPI print is not
 * a daily close). It therefore has its own provider boundary, its own tables
 * (`economic_indicators`, `economic_observations`) and its own ingest path.
 *
 * No scraping and no estimation: observations enter the platform only through
 * `npm run ingest:economy`, which reads operator-supplied CSV files exported
 * from the publisher. Until then every series reports "Data unavailable".
 */

import { cached } from "@/lib/cache";
import { getRepository } from "@/lib/db";
import catalogue from "@/data/economic-series.json";
import type { EconomicIndicatorRecord } from "@/lib/db/repository";

export type EconomicSeriesStatus = "available" | "awaiting-ingest";

export type EconomicSeries = EconomicIndicatorRecord & {
  /** Latest ingested observation, or null when nothing has been ingested. */
  latestValue: number | null;
  latestDate: string | null;
  /** Number of observations currently stored. */
  observations: number;
  status: EconomicSeriesStatus;
  ingestion: "csv" | "manual" | "api";
};

type CatalogueEntry = EconomicIndicatorRecord & { ingestion: "csv" | "manual" | "api" };

const SERIES: CatalogueEntry[] = (catalogue.series as CatalogueEntry[]).map((entry) => ({
  ...entry,
  firstObservation: entry.firstObservation ?? null,
  lastObservation: entry.lastObservation ?? null,
}));

/** Series definitions, merged with whatever has been ingested so far. */
export async function listEconomicSeries(): Promise<EconomicSeries[]> {
  return cached("economy:series", 300, async () => {
    const repository = await getRepository();

    const merged: EconomicSeries[] = [];
    for (const entry of SERIES) {
      const observations = await repository.getEconomicObservations(entry.seriesId);
      const latest = observations.at(-1) ?? null;
      merged.push({
        ...entry,
        latestValue: latest?.value ?? null,
        latestDate: latest?.date ?? null,
        observations: observations.length,
        status: observations.length > 0 ? "available" : "awaiting-ingest",
      });
    }
    return merged;
  });
}

export async function getEconomicSeries(seriesId: string): Promise<EconomicSeries | null> {
  const all = await listEconomicSeries();
  return all.find((series) => series.seriesId === seriesId) ?? null;
}

export async function getEconomicObservations(seriesId: string, from?: string, to?: string) {
  const repository = await getRepository();
  return repository.getEconomicObservations(seriesId, from, to);
}

/** Series grouped by category for the Economy page. */
export async function getEconomyOverview(): Promise<
  Array<{ category: string; series: EconomicSeries[] }>
> {
  const series = await listEconomicSeries();
  const grouped = new Map<string, EconomicSeries[]>();
  for (const entry of series) {
    const list = grouped.get(entry.category) ?? [];
    list.push(entry);
    grouped.set(entry.category, list);
  }
  return [...grouped.entries()]
    .map(([category, list]) => ({ category, series: list }))
    .sort((a, b) => a.category.localeCompare(b.category));
}

/** Series definitions as they should appear in the database catalogue. */
export function catalogueRecords(): EconomicIndicatorRecord[] {
  return SERIES.map((entry) => ({
    seriesId: entry.seriesId,
    name: entry.name,
    category: entry.category,
    unit: entry.unit,
    frequency: entry.frequency,
    description: entry.description,
    source: entry.source,
    sourceUrl: entry.sourceUrl,
    license: entry.license,
    firstObservation: entry.firstObservation,
    lastObservation: entry.lastObservation,
  }));
}
