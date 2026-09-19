/**
 * Ingestion service — moves data from a provider into the repository.
 *
 * Everything here is idempotent: re-running overwrites the same keys rather
 * than duplicating rows. That is what makes scheduled ingestion (Vercel Cron →
 * /api/cron/ingest) and one-off backfills safe to run repeatedly.
 *
 * Runs are recorded in `ingestion_runs` so an operator can answer "when did we
 * last load data, from where, and did it work?" without reading logs.
 */

import { getRepository } from "@/lib/db";
import type { MarketRepository } from "@/lib/db/repository";
import { getMarketDataProvider } from "@/lib/providers";
import type { MarketSummary } from "@/lib/types/market";
import { invalidate } from "@/lib/cache";

export type IngestionResult = {
  provider: string;
  kind: string;
  status: "success" | "partial" | "failed";
  rowsWritten: number;
  message: string | null;
  durationMs: number;
};

async function record(
  repository: MarketRepository,
  result: Omit<IngestionResult, "durationMs">,
  startedAt: Date
) {
  try {
    await repository.recordIngestionRun({
      provider: result.provider,
      kind: result.kind,
      status: result.status,
      rowsWritten: result.rowsWritten,
      message: result.message,
      startedAt,
      finishedAt: new Date(),
    });
  } catch {
    // Recording an audit row must never fail the ingestion itself.
  }
}

/**
 * Load company reference data, the latest quotes, index levels and a whole-
 * market snapshot for the current session.
 */
export async function ingestMarketSnapshot(): Promise<IngestionResult> {
  const startedAt = new Date();
  const repository = await getRepository();
  const provider = getMarketDataProvider();
  let rows = 0;
  const problems: string[] = [];

  try {
    const companies = await provider.getCompanies();
    rows += await repository.upsertCompanies(companies);
    if (companies.length === 0) problems.push("provider returned no companies");

    const sectors = new Map<string, { slug: string; name: string; description: string | null }>();
    for (const company of companies) {
      sectors.set(company.sectorSlug, {
        slug: company.sectorSlug,
        name: company.sector,
        description: null,
      });
    }
    await repository.upsertSectors([...sectors.values()]);

    const quotes = await provider.getQuotes();
    rows += await repository.upsertQuotes(quotes);
    if (quotes.length === 0) problems.push("provider returned no quotes");

    const indices = await provider.getIndices();
    rows += await repository.upsertIndices(indices);

    const summary = await provider.getMarketSummary();
    if (summary) {
      await repository.upsertMarketSnapshot(summary);
      rows += 1;
    } else {
      problems.push("provider returned no market summary");
    }

    // Sector aggregates are computed by the service and stored for history.
    const { getSectorStats } = await import("./market-service");
    const stats = await getSectorStats(quotes);
    rows += await repository.upsertSectorSnapshots(summary?.sessionDate ?? "", stats);

    invalidate("quotes:");
    invalidate("overview:");
    invalidate("sectors:");
    invalidate("breadth:");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const result = {
      provider: provider.id,
      kind: "market-snapshot",
      status: "failed" as const,
      rowsWritten: rows,
      message,
    };
    await record(repository, result, startedAt);
    return { ...result, durationMs: Date.now() - startedAt.getTime() };
  }

  const result = {
    provider: provider.id,
    kind: "market-snapshot",
    status: problems.length > 0 ? ("partial" as const) : ("success" as const),
    rowsWritten: rows,
    message: problems.length > 0 ? problems.join("; ") : null,
  };
  await record(repository, result, startedAt);
  return { ...result, durationMs: Date.now() - startedAt.getTime() };
}

/**
 * Backfill daily price history for one instrument (or the whole universe).
 *
 * `years` is clamped to what the provider can serve; a licensed feed is asked
 * for the full archive, the demo provider generates its sample window.
 */
export async function ingestPriceHistory(options: {
  tickers?: string[];
  years?: number;
} = {}): Promise<IngestionResult> {
  const startedAt = new Date();
  const repository = await getRepository();
  const provider = getMarketDataProvider();
  const years = Math.min(Math.max(options.years ?? 5, 1), provider.capabilities.historyYears);

  const companies = await provider.getCompanies();
  const wanted = options.tickers?.length
    ? companies.filter((company) =>
        options.tickers!.includes(company.ticker)
      )
    : companies;

  const to = new Date();
  const from = new Date();
  from.setUTCFullYear(from.getUTCFullYear() - years);
  const fromIso = from.toISOString().slice(0, 10);
  const toIso = to.toISOString().slice(0, 10);

  let rows = 0;
  const failures: string[] = [];

  for (const company of wanted) {
    try {
      const latest = await repository.latestBarDate(company.ticker);
      const bars = await provider.getHistoricalPrices({
        ticker: company.ticker,
        from: fromIso,
        to: toIso,
        interval: "1d",
      });
      const fresh = latest ? bars.filter((bar) => bar.date > latest) : bars;
      rows += await repository.upsertPriceBars(company.ticker, fresh.length > 0 ? fresh : bars);
    } catch (error) {
      failures.push(`${company.ticker}: ${error instanceof Error ? error.message : "error"}`);
    }
  }

  invalidate("history:");
  invalidate("closes:");

  const result = {
    provider: provider.id,
    kind: "price-history",
    status:
      failures.length === 0
        ? ("success" as const)
        : failures.length === wanted.length
          ? ("failed" as const)
          : ("partial" as const),
    rowsWritten: rows,
    message: failures.length > 0 ? failures.slice(0, 5).join("; ") : null,
  };
  await record(repository, result, startedAt);
  return { ...result, durationMs: Date.now() - startedAt.getTime() };
}

/** Convenience wrapper used by the seed script and the cron route. */
export async function ingestAll(options: { years?: number } = {}): Promise<IngestionResult[]> {
  const snapshot = await ingestMarketSnapshot();
  const history = await ingestPriceHistory({ years: options.years });
  return [snapshot, history];
}

export type { MarketSummary };
