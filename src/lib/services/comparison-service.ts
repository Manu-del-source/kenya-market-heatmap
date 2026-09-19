/**
 * Historical comparison service (Phase 9).
 *
 * Answers questions of the form "how did KCB, Equity and the Banking sector
 * behave over the last three years?" using only data the platform already
 * holds. It never ranks, recommends or scores anything — the output is a
 * normalised chart plus measured metrics, with every gap stated.
 *
 * Design rules:
 *
 *  - **One batch read.** All instruments for a comparison are fetched with a
 *    single `getPriceBarsForTickers` call (one SQL `IN (...)` query), not once
 *    per ticker. Sector comparison adds no extra query: constituents of every
 *    selected sector are unioned into that same batch read.
 *  - **Cached** at `config.cache.historyTtlSeconds`, keyed by the normalised
 *    selection and period.
 *  - **Nothing estimated.** Missing sessions are skipped; a return that cannot
 *    be measured is `null` and the UI shows `—`.
 *  - **Sector levels are a transparent proxy.** With no licensed sector index
 *    feed, a sector line is an equal-weighted index of the constituents that
 *    actually traded each day, rebased to 100. It is labelled as such.
 */

import { config } from "@/lib/config";
import { cached } from "@/lib/cache";
import { getRepository } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/providers";
import { nairobiDate } from "@/lib/market-session";
import {
  alignObservations,
  buildEqualWeightIndex,
  normaliseToBase,
  seriesMetrics,
  type Observation,
} from "@/lib/analytics/comparison";
import {
  COMPARE_PERIOD_DAYS,
  COMPARISON_COLORS,
  MAX_COMPARE_SECTORS,
  MAX_COMPARE_TICKERS,
  type ComparePeriod,
  type ComparisonAlignment,
  type ComparisonPayload,
  type ComparisonSeries,
  type ComparisonSummaryRow,
  type ComparisonUnit,
  type MarketDataMeta,
  type PriceBar,
} from "@/lib/types/market";
import { buildMeta, listCompanies, listSectors } from "./market-service";

/* ------------------------------------------------------------------ *
 * Window helpers
 * ------------------------------------------------------------------ */

/** Calendar start of a comparison period, as an ISO date. */
export function periodStart(period: ComparePeriod, to = nairobiDate()): string {
  const date = new Date(`${to}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - COMPARE_PERIOD_DAYS[period]);
  return date.toISOString().slice(0, 10);
}

/** Keep uppercase, unique, bounded tickers. */
export function normaliseTickers(tickers: string[], limit = MAX_COMPARE_TICKERS): string[] {
  const seen: string[] = [];
  for (const raw of tickers) {
    const ticker = String(raw ?? "").trim().toUpperCase();
    if (!ticker || seen.includes(ticker)) continue;
    seen.push(ticker);
    if (seen.length >= limit) break;
  }
  return seen;
}

/** Keep lowercase-ish, unique, bounded sector slugs. */
export function normaliseSlugs(slugs: string[], limit = MAX_COMPARE_SECTORS): string[] {
  const seen: string[] = [];
  for (const raw of slugs) {
    const slug = String(raw ?? "").trim().toLowerCase();
    if (!slug || seen.includes(slug)) continue;
    seen.push(slug);
    if (seen.length >= limit) break;
  }
  return seen;
}

/* ------------------------------------------------------------------ *
 * Data access
 * ------------------------------------------------------------------ */

/**
 * Bars for several tickers in one round-trip.
 *
 * The durable store wins when it holds data (it is the ingested archive). With
 * no database configured we fall back to the provider — which is per-ticker by
 * design, so the calls are issued concurrently rather than sequentially.
 */
async function barsForTickers(
  tickers: string[],
  from: string,
  to: string
): Promise<Record<string, PriceBar[]>> {
  if (tickers.length === 0) return {};

  const repository = await getRepository();
  if (repository.isPersistent) {
    const grouped = await repository.getPriceBarsForTickers(tickers, from, to);
    const pruned: Record<string, PriceBar[]> = {};
    for (const [ticker, bars] of Object.entries(grouped)) {
      if (bars.length > 0) pruned[ticker] = bars;
    }
    if (Object.keys(pruned).length > 0) return pruned;
  }

  const provider = getMarketDataProvider();
  const results = await Promise.all(
    tickers.map(async (ticker) => {
      try {
        const bars = await provider.getHistoricalPrices({ ticker, from, to, interval: "1d" });
        return [ticker, bars] as const;
      } catch {
        // A single failing instrument must not sink the whole comparison.
        return [ticker, [] as PriceBar[]] as const;
      }
    })
  );

  const grouped: Record<string, PriceBar[]> = {};
  for (const [ticker, bars] of results) {
    if (bars.length > 0) grouped[ticker] = bars;
  }
  return grouped;
}

/** Bars → comparison observations. Adjusted close is used when available. */
function toObservations(bars: PriceBar[]): Observation[] {
  return bars.map((bar) => ({
    date: bar.date,
    close: bar.adjustedClose ?? bar.close,
    high: bar.high ?? null,
    low: bar.low ?? null,
  }));
}

/* ------------------------------------------------------------------ *
 * Payload assembly
 * ------------------------------------------------------------------ */

type BuildContext = {
  period: ComparePeriod;
  from: string;
  to: string;
  unit: ComparisonUnit;
  /**
   * key → { label, sublabel, href, name, sector, sectorSlug, constituents,
   * meta } plus extra fields needed to fill a summary row.
   */
  descriptors: Array<{
    key: string;
    label: string;
    sublabel: string | null;
    href: string;
    row: Omit<
      ComparisonSummaryRow,
      | "start"
      | "end"
      | "normalisedStart"
      | "normalisedEnd"
      | "returnPercent"
      | "high"
      | "low"
      | "firstDate"
      | "lastDate"
      | "observations"
      | "expectedObservations"
      | "coverageRatio"
      | "available"
      | "reason"
    >;
    observations: Observation[];
  }>;
  /** Extra notes appended after the alignment notes. */
  notes?: string[];
};

function buildPayload(context: BuildContext): { payload: ComparisonPayload; limitations: string[] } {
  const { period, from, to, unit, descriptors } = context;

  const alignmentInput: Record<string, Observation[]> = {};
  for (const descriptor of descriptors) {
    alignmentInput[descriptor.key] = descriptor.observations;
  }
  const alignment = alignObservations(alignmentInput);

  const totalSessions = alignment.unionDates.length;

  const series: ComparisonSeries[] = [];
  const summary: ComparisonSummaryRow[] = [];

  descriptors.forEach((descriptor, index) => {
    const windowed = alignment.clipped[descriptor.key] ?? [];
    const metrics = seriesMetrics(windowed);
    const points = normaliseToBase(windowed, 100);
    const available = points.length > 0;
    const reason = available
      ? null
      : windowed.length === 0
        ? "No observations in the selected period."
        : "Observations in the period have no usable close price.";

    series.push({
      key: descriptor.key,
      label: descriptor.label,
      sublabel: descriptor.sublabel,
      color: COMPARISON_COLORS[index % COMPARISON_COLORS.length],
      href: descriptor.href,
      available,
      reason,
      anchorDate: metrics.firstDate,
      observations: metrics.observations,
      points,
    });

    summary.push({
      ...descriptor.row,
      start: metrics.start,
      end: metrics.end,
      normalisedStart: available ? 100 : null,
      normalisedEnd: metrics.normalisedEnd,
      returnPercent: metrics.returnPercent,
      high: metrics.high,
      low: metrics.low,
      firstDate: metrics.firstDate,
      lastDate: metrics.lastDate,
      observations: metrics.observations,
      expectedObservations: totalSessions > 0 ? totalSessions : null,
      coverageRatio:
        totalSessions > 0 && metrics.observations > 0
          ? Math.round((metrics.observations / totalSessions) * 1000) / 1000
          : null,
      available,
      reason,
    });
  });

  const incomplete = summary.filter(
    (row) => row.available && row.coverageRatio !== null && row.coverageRatio < 0.9
  );
  const notes = [...alignment.notes];
  if (incomplete.length > 0) {
    notes.push(
      `Partial coverage: ${incomplete
        .map((row) => `${row.label} (${row.observations} of ${totalSessions} sessions)`)
        .join(", ")}. Missing sessions are skipped, not estimated.`
    );
  }
  notes.push(
    "Each series is rebased to 100 at its own first observation in the aligned window, so the lines compare relative performance rather than price levels."
  );
  if (context.notes) notes.push(...context.notes);

  const alignmentInfo: ComparisonAlignment = {
    strategy: "common-window-independent-base",
    requestedStart: from,
    requestedEnd: to,
    windowStart: alignment.windowStart,
    windowEnd: alignment.windowEnd,
    overlapping: alignment.overlapping,
    sharedSessions: alignment.sharedDates.length,
    totalSessions,
    coverageRatio:
      totalSessions > 0 ? Math.round((alignment.sharedDates.length / totalSessions) * 1000) / 1000 : null,
    anchorSpreadSessions: alignment.anchorSpreadSessions,
    notes,
  };

  const payload: ComparisonPayload = {
    period,
    from,
    to,
    unit,
    series,
    summary,
    alignment: alignmentInfo,
    availableCount: series.filter((entry) => entry.available).length,
    requestedCount: series.length,
  };

  const limitations = [...notes];
  if (payload.availableCount === 0) {
    limitations.push("None of the selected items had usable data for this period.");
  }

  return { payload, limitations };
}

/* ------------------------------------------------------------------ *
 * Public API
 * ------------------------------------------------------------------ */

/**
 * Compare up to five listed companies over a shared window.
 *
 * Tickers that do not resolve to a known company are still reported (so the
 * caller can say "unknown ticker") but contribute no data.
 */
export async function compareStocks(options: {
  tickers: string[];
  period: ComparePeriod;
}): Promise<{ meta: MarketDataMeta; data: ComparisonPayload }> {
  const tickers = normaliseTickers(options.tickers);
  const period = options.period;

  const result = await cached(
    `compare:stocks:${tickers.join(",")}:${period}`,
    config.cache.historyTtlSeconds,
    async () => {
      const to = nairobiDate();
      const from = periodStart(period, to);
      const companies = await listCompanies();
      const byTicker = new Map(companies.map((company) => [company.ticker, company]));
      const barsByTicker = await barsForTickers(tickers, from, to);

      const descriptors = tickers.map((ticker) => {
        const company = byTicker.get(ticker);
        return {
          key: ticker,
          label: ticker,
          sublabel: company?.name ?? null,
          href: `/stocks/${ticker}`,
          row: {
            key: ticker,
            label: ticker,
            name: company?.name ?? ticker,
            sector: company?.sector ?? null,
            sectorSlug: company?.sectorSlug ?? null,
            constituents: null,
            constituentsWithData: null,
            unit: "KES" as ComparisonUnit,
            href: `/stocks/${ticker}`,
          },
          observations: toObservations(barsByTicker[ticker] ?? []),
        };
      });

      return buildPayload({
        period,
        from,
        to,
        unit: "KES",
        descriptors,
        notes: [
          "Prices are in KES. Corporate actions are only reflected when the configured data provider supplies adjusted closes.",
        ],
      });
    }
  );

  return { meta: buildMeta(result.limitations), data: result.payload };
}

/**
 * Compare sectors over a shared window.
 *
 * Each sector line is an **equal-weighted index of its constituents**, rebased
 * to 100 at the first in-window session. This is a transparent in-app proxy: it
 * is not an official NSE sector index, and constituent counts are published
 * alongside every row so partial coverage is visible.
 */
export async function compareSectors(options: {
  slugs: string[];
  period: ComparePeriod;
}): Promise<{ meta: MarketDataMeta; data: ComparisonPayload }> {
  const requested = normaliseSlugs(options.slugs);
  const validSlugs = new Set((await listSectors()).map((sector) => sector.slug));
  const slugs = requested.filter((slug) => validSlugs.has(slug));
  const period = options.period;

  const result = await cached(
    `compare:sectors:${slugs.join(",")}:${period}`,
    config.cache.historyTtlSeconds,
    async () => {
      const to = nairobiDate();
      const from = periodStart(period, to);

      const [sectors, companies] = await Promise.all([listSectors(), listCompanies()]);
      const sectorById = new Map(sectors.map((sector) => [sector.slug, sector]));

      const constituentsBySlug = new Map<string, string[]>();
      const allTickers: string[] = [];
      for (const slug of slugs) {
        const members = companies
          .filter((company) => company.sectorSlug === slug)
          .map((company) => company.ticker);
        constituentsBySlug.set(slug, members);
        for (const ticker of members) {
          if (!allTickers.includes(ticker)) allTickers.push(ticker);
        }
      }

      // One batch read for every constituent of every selected sector.
      const barsByTicker = await barsForTickers(allTickers, from, to);

      const descriptors = slugs.map((slug) => {
        const members = constituentsBySlug.get(slug) ?? [];
        const memberObservations = members
          .map((ticker) => toObservations(barsByTicker[ticker] ?? []))
          .filter((observations) => observations.length > 0);

        const index = buildEqualWeightIndex(memberObservations);
        const sector = sectorById.get(slug);

        return {
          key: slug,
          label: sector?.name ?? slug,
          sublabel:
            members.length > 0
              ? `${memberObservations.length} of ${members.length} constituents priced`
              : null,
          href: `/sectors/${slug}`,
          row: {
            key: slug,
            label: sector?.name ?? slug,
            name: sector?.name ?? slug,
            sector: null,
            sectorSlug: slug,
            constituents: members.length,
            constituentsWithData: memberObservations.length,
            unit: "index" as ComparisonUnit,
            href: `/sectors/${slug}`,
          },
          observations: index.map((point) => ({
            date: point.date,
            close: point.value,
            high: null,
            low: null,
          })),
        };
      });

      return buildPayload({
        period,
        from,
        to,
        unit: "index",
        descriptors,
        notes: [
          "Sector lines are an equal-weighted index of the constituents that traded each session, rebased to 100. This is an in-app analytical proxy, not an official NSE sector index.",
        ],
      });
    }
  );

  return { meta: buildMeta(result.limitations), data: result.payload };
}
