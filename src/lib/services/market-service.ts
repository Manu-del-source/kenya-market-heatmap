/**
 * Market service — the only module the API and UI use to read market data.
 *
 * Read policy (documented so it stays predictable):
 *
 *  1. **Quotes, indices and the market summary** come from the provider. A
 *     licensed feed is authoritative and freshest; the demo provider supplies
 *     labelled sample data. When no licensed feed is configured AND the store
 *     already holds a snapshot (i.e. real data was ingested), the store wins —
 *     ingested data is always preferred over sample data.
 *  2. **Price history** prefers the durable store, because ingestion builds a
 *     real archive there. With no database, history comes from the provider.
 *  3. **Nothing is invented.** Aggregate figures report how many instruments
 *     they could evaluate; partial coverage is surfaced, not hidden.
 *
 * Every read is TTL-cached (see src/lib/cache.ts) so a page render costs at
 * most one provider round-trip per window.
 */

import { config } from "@/lib/config";
import { cached } from "@/lib/cache";
import { getRepository } from "@/lib/db";
import { getMarketDataProvider } from "@/lib/providers";
import type {
  BreadthStats,
  Company,
  HistoryRange,
  IndexQuote,
  MarketDataMeta,
  MarketOverview,
  MarketSummary,
  PriceBar,
  PriceHistory,
  Quote,
  SectorStat,
} from "@/lib/types/market";
import { computeBreadth } from "@/lib/analytics/breadth";
import { percentChange, trailingReturn, weightedMean } from "@/lib/analytics/series";
import { nairobiDate } from "@/lib/market-session";

/** Calendar days covered by each chart range. */
const RANGE_DAYS: Record<HistoryRange, number> = {
  "1D": 1,
  "1W": 7,
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "5Y": 1825,
};

/** Bars retained when a range is requested but intraday data is unavailable. */
const INTRADAY_FALLBACK_BARS = 5;

function isoDaysAgo(days: number): string {
  const date = new Date(`${nairobiDate()}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function rangeStart(range: HistoryRange): string {
  return isoDaysAgo(RANGE_DAYS[range]);
}

export function buildMeta(limitations: string[] = []): MarketDataMeta {
  const provider = getMarketDataProvider();
  return {
    provider: provider.id,
    providerName: provider.name,
    dataMode: provider.dataMode,
    asOf: new Date().toISOString(),
    attribution: provider.attribution,
    sourceUrl: provider.sourceUrl,
    limitations: [...provider.limitations, ...limitations],
  };
}

/* ------------------------------------------------------------------ *
 * Companies
 * ------------------------------------------------------------------ */

export async function listCompanies(): Promise<Company[]> {
  return cached("companies:all", config.cache.historyTtlSeconds, async () => {
    const repository = await getRepository();
    const stored = await repository.listCompanies();
    if (stored.length > 0) return stored;
    return getMarketDataProvider().getCompanies();
  });
}

export async function listSectors(): Promise<
  Array<{ slug: string; name: string; description: string | null }>
> {
  return cached("sectors:all", config.cache.historyTtlSeconds, async () => {
    const repository = await getRepository();
    const stored = await repository.listSectors();
    if (stored.length > 0) {
      return stored.map((sector) => ({
        slug: sector.slug,
        name: sector.name,
        description: sector.description,
      }));
    }
    const companies = await getMarketDataProvider().getCompanies();
    const seen = new Map<string, string>();
    for (const company of companies) seen.set(company.sectorSlug, company.sector);
    return [...seen.entries()]
      .map(([slug, name]) => ({ slug, name, description: null }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });
}

export async function getCompany(ticker: string): Promise<Company | null> {
  const companies = await listCompanies();
  return companies.find((company) => company.ticker === ticker) ?? null;
}

/* ------------------------------------------------------------------ *
 * Quotes
 * ------------------------------------------------------------------ */

/**
 * Latest quotes for the whole universe (or a subset).
 *
 * Ingested data wins over sample data; a licensed feed wins over both.
 */
export async function getQuotes(tickers?: string[]): Promise<Quote[]> {
  const key = `quotes:${tickers ? [...tickers].sort().join(",") : "all"}`;
  return cached(key, config.cache.marketTtlSeconds, async () => {
    const provider = getMarketDataProvider();
    if (provider.dataMode !== "demo") {
      return provider.getQuotes(tickers);
    }

    const repository = await getRepository();
    const stored = await repository.getStoredQuotes(tickers);
    return stored.length > 0 ? stored : provider.getQuotes(tickers);
  });
}

export async function getQuote(ticker: string): Promise<Quote | null> {
  const quotes = await getQuotes([ticker]);
  return quotes.find((quote) => quote.ticker === ticker) ?? null;
}

/* ------------------------------------------------------------------ *
 * History
 * ------------------------------------------------------------------ */

async function historyFromStore(
  ticker: string,
  from: string,
  to: string
): Promise<PriceBar[] | null> {
  const repository = await getRepository();
  if (!repository.isPersistent) return null;
  const bars = await repository.getPriceBars(ticker, from, to);
  return bars.length > 0 ? bars : null;
}

export async function getPriceHistory(
  ticker: string,
  range: HistoryRange
): Promise<PriceHistory> {
  const cacheKey = `history:${ticker}:${range}`;
  return cached(cacheKey, config.cache.historyTtlSeconds, async () => {
    const provider = getMarketDataProvider();
    const to = nairobiDate();
    const from = rangeStart(range);
    const wantsIntraday = range === "1D";

    let bars: PriceBar[] = [];
    let source: "store" | "provider" = "provider";

    if (wantsIntraday && provider.capabilities.intraday) {
      bars = await provider.getHistoricalPrices({ ticker, from, to, interval: "5m" });
    } else {
      const stored = await historyFromStore(ticker, rangeStart("5Y"), to);
      if (stored) {
        source = "store";
        bars = stored.filter((bar) => bar.date >= from);
      } else {
        // Ask for a slightly wider window so weekly/monthly returns that reach
        // just past the boundary still have an anchor observation.
        const paddedFrom = isoDaysAgo(RANGE_DAYS[range] + 10);
        bars = await provider.getHistoricalPrices({
          ticker,
          from: paddedFrom,
          to,
          interval: "1d",
        });
        bars = bars.filter((bar) => bar.date >= from);
      }
    }

    // Daily-granularity fallback for the 1D range: show the last few sessions
    // and flag that true intraday data is unavailable.
    if (wantsIntraday && !provider.capabilities.intraday) {
      const stored = await historyFromStore(ticker, isoDaysAgo(30), to);
      const daily = stored ?? (await provider.getHistoricalPrices({
        ticker,
        from: isoDaysAgo(30),
        to,
        interval: "1d",
      }));
      bars = daily.slice(-INTRADAY_FALLBACK_BARS);
    }

    void source; // provenance lives on the envelope meta, not per-series
    return {
      ticker,
      interval: wantsIntraday && provider.capabilities.intraday ? "5m" : "1d",
      range,
      bars,
      intradayAvailable: provider.capabilities.intraday,
      coverage: bars.length,
    } satisfies PriceHistory;
  });
}

/** Daily closes for a trailing window, used for aggregate analytics. */
export async function getDailyCloses(ticker: string, days: number): Promise<PriceBar[]> {
  return cached(`closes:${ticker}:${days}`, config.cache.historyTtlSeconds, async () => {
    const to = nairobiDate();
    const from = isoDaysAgo(days);
    const stored = await historyFromStore(ticker, from, to);
    if (stored) return stored;
    return getMarketDataProvider().getHistoricalPrices({ ticker, from, to, interval: "1d" });
  });
}

/* ------------------------------------------------------------------ *
 * Indices and summary
 * ------------------------------------------------------------------ */

export async function getIndices(): Promise<IndexQuote[]> {
  return cached("indices:latest", config.cache.marketTtlSeconds, async () => {
    const provider = getMarketDataProvider();
    if (provider.dataMode !== "demo") return provider.getIndices();

    const repository = await getRepository();
    const stored = await repository.getStoredIndices();
    return stored.length > 0 ? stored : provider.getIndices();
  });
}

export async function getMarketSummary(): Promise<MarketSummary | null> {
  return cached("summary:latest", config.cache.marketTtlSeconds, async () => {
    const provider = getMarketDataProvider();
    if (provider.dataMode !== "demo") return provider.getMarketSummary();

    const repository = await getRepository();
    const storedSession = await repository.latestQuoteSession();
    if (storedSession) {
      const stored = await repository.getMarketSnapshot(storedSession);
      if (stored) return stored;
    }
    return provider.getMarketSummary();
  });
}

/** Historical daily snapshots (requires ingestion — empty until then). */
export async function getSnapshotHistory(limit = 90): Promise<MarketSummary[]> {
  const repository = await getRepository();
  return repository.listMarketSnapshots(Math.min(Math.max(limit, 1), 365));
}

/* ------------------------------------------------------------------ *
 * Breadth
 * ------------------------------------------------------------------ */

export async function getMarketBreadth(quotes?: Quote[]): Promise<BreadthStats> {
  const rows = quotes ?? (await getQuotes());

  return cached("breadth:latest", config.cache.marketTtlSeconds, async () => {
    const inputs = [];
    for (const quote of rows) {
      // 52-week envelope from stored history when available, otherwise unknown.
      const bars = quote.price !== null ? await getDailyCloses(quote.ticker, 370) : [];
      const highs = bars.map((bar) => bar.high ?? bar.close).filter((v): v is number => v !== null);
      const lows = bars.map((bar) => bar.low ?? bar.close).filter((v): v is number => v !== null);
      inputs.push({
        ticker: quote.ticker,
        changePercent: quote.changePercent,
        price: quote.price,
        high52w: highs.length > 0 ? Math.max(...highs) : null,
        low52w: lows.length > 0 ? Math.min(...lows) : null,
      });
    }
    return computeBreadth(inputs);
  });
}

/* ------------------------------------------------------------------ *
 * Sectors
 * ------------------------------------------------------------------ */

export async function getSectorStats(quotes?: Quote[]): Promise<SectorStat[]> {
  const rows = quotes ?? (await getQuotes());
  return cached("sectors:stats", config.cache.marketTtlSeconds, async () => {
    const companies = await listCompanies();
    const companyByTicker = new Map(companies.map((company) => [company.ticker, company]));

    const grouped = new Map<string, Quote[]>();
    for (const quote of rows) {
      const company = companyByTicker.get(quote.ticker);
      if (!company) continue;
      const list = grouped.get(company.sectorSlug) ?? [];
      list.push(quote);
      grouped.set(company.sectorSlug, list);
    }

    const stats: SectorStat[] = [];
    for (const [slug, list] of grouped) {
      const representative = companyByTicker.get(list[0].ticker);
      const sectorName = representative?.sector ?? slug;

      // Trailing returns need history, so fetch 3 months of daily closes per
      // constituent and weight the result by market cap.
      const contributions: Array<{ value: number | null; weight: number | null }> = [];
      const weekly: Array<{ value: number | null; weight: number | null }> = [];
      const monthly: Array<{ value: number | null; weight: number | null }> = [];

      for (const quote of list) {
        const weight = quote.marketCap;
        contributions.push({ value: quote.changePercent, weight });

        const bars = await getDailyCloses(quote.ticker, 100);
        const points = bars.map((bar) => ({ date: bar.date, close: bar.close }));
        weekly.push({ value: trailingReturn(points, 7), weight });
        monthly.push({ value: trailingReturn(points, 30), weight });
      }

      const advancing = list.filter((quote) => (quote.changePercent ?? 0) > 0).length;
      const declining = list.filter((quote) => (quote.changePercent ?? 0) < 0).length;
      const unchanged = list.filter((quote) => quote.changePercent === 0).length;
      const priced = list.filter((quote) => quote.price !== null).length;

      stats.push({
        sector: sectorName,
        sectorSlug: slug,
        companies: list.length,
        dailyReturn: weightedMean(contributions),
        weeklyReturn: weightedMean(weekly),
        monthlyReturn: weightedMean(monthly),
        marketValue: sumOrNull(list.map((quote) => quote.marketCap)),
        turnover: sumOrNull(list.map((quote) => quote.turnover)),
        advancing,
        declining,
        unchanged,
        pricedCompanies: priced,
        // A sector aggregate built from a handful of names is indicative only.
        incomplete: priced === 0 || priced < Math.min(3, list.length),
      });
    }

    return stats.sort((a, b) => (b.dailyReturn ?? -Infinity) - (a.dailyReturn ?? -Infinity));
  });
}

function sumOrNull(values: Array<number | null>): number | null {
  const usable = values.filter((value): value is number => value !== null);
  if (usable.length === 0) return null;
  return usable.reduce((total, value) => total + value, 0);
}

export async function getSectorDetail(slug: string) {
  const companies = await listCompanies();
  const inSector = companies.filter((company) => company.sectorSlug === slug);
  if (inSector.length === 0) return null;

  const quotes = await getQuotes(inSector.map((company) => company.ticker));
  const sectors = await getSectorStats(await getQuotes());
  const stats = sectors.find((sector) => sector.sectorSlug === slug) ?? null;

  const quoteByTicker = new Map(quotes.map((quote) => [quote.ticker, quote]));
  const rows = inSector
    .map((company) => ({
      company,
      quote: quoteByTicker.get(company.ticker) ?? null,
    }))
    .sort(
      (a, b) => (b.quote?.marketCap ?? 0) - (a.quote?.marketCap ?? 0)
    );

  return { sector: stats, companies: rows };
}

/* ------------------------------------------------------------------ *
 * Stock detail
 * ------------------------------------------------------------------ */

export type StockDetail = {
  company: Company;
  quote: Quote | null;
  /** Trailing returns per range; null when the history is too short. */
  returns: Array<{ range: HistoryRange; changePercent: number | null }>;
  high52w: number | null;
  low52w: number | null;
  /** Average daily volume over the trailing year. */
  averageVolume1y: number | null;
  /** Highest/lowest close in the trailing year. */
  yearHigh: number | null;
  yearLow: number | null;
  sectorRank: { rank: number; of: number } | null;
  /** Peers in the same sector, by market cap. */
  peers: Array<{ company: Company; quote: Quote | null }>;
};

export async function getStockDetail(ticker: string): Promise<StockDetail | null> {
  const company = await getCompany(ticker);
  if (!company) return null;

  return cached(`stock:${ticker}`, config.cache.marketTtlSeconds, async () => {
    const quote = (await getQuotes([ticker]))[0] ?? null;

    const bars = await getDailyCloses(ticker, 370);
    const points = bars.map((bar) => ({ date: bar.date, close: bar.close }));
    const highs = bars.map((bar) => bar.high ?? bar.close).filter((v): v is number => v !== null);
    const lows = bars.map((bar) => bar.low ?? bar.close).filter((v): v is number => v !== null);
    const volumes = bars.map((bar) => bar.volume).filter((v): v is number => v !== null);

    const ranges: HistoryRange[] = ["1W", "1M", "3M", "6M", "1Y", "5Y"];
    const returns: StockDetail["returns"] = [];
    for (const range of ranges) {
      const series =
        range === "5Y" ? await getFiveYearPoints(ticker) : points;
      returns.push({
        range,
        changePercent: trailingReturn(series, RANGE_DAYS[range]),
      });
    }

    const companies = await listCompanies();
    const peers = companies.filter(
      (entry) => entry.sectorSlug === company.sectorSlug && entry.ticker !== ticker
    );

    const peerQuotes = await getQuotes(peers.map((peer) => peer.ticker));
    const peerQuoteMap = new Map(peerQuotes.map((entry) => [entry.ticker, entry]));
    const ranked = peers
      .map((peer) => ({ company: peer, quote: peerQuoteMap.get(peer.ticker) ?? null }))
      .sort((a, b) => (b.quote?.marketCap ?? 0) - (a.quote?.marketCap ?? 0));

    let sectorRank: StockDetail["sectorRank"] = null;
    const all = [...ranked, { company, quote }].sort(
      (a, b) => (b.quote?.changePercent ?? -Infinity) - (a.quote?.changePercent ?? -Infinity)
    );
    const position = all.findIndex((entry) => entry.company.ticker === ticker);
    if (position >= 0) sectorRank = { rank: position + 1, of: all.length };

    return {
      company,
      quote,
      returns,
      high52w: highs.length > 0 ? Math.max(...highs) : null,
      low52w: lows.length > 0 ? Math.min(...lows) : null,
      averageVolume1y: volumes.length > 0
        ? volumes.reduce((total, value) => total + value, 0) / volumes.length
        : null,
      yearHigh: highs.length > 0 ? Math.max(...highs) : null,
      yearLow: lows.length > 0 ? Math.min(...lows) : null,
      sectorRank,
      peers: ranked,
    };
  });
}

async function getFiveYearPoints(ticker: string) {
  const to = nairobiDate();
  const from = isoDaysAgo(1830);
  const stored = await historyFromStore(ticker, from, to);
  const bars = stored ?? (await getMarketDataProvider().getHistoricalPrices({
    ticker,
    from,
    to,
    interval: "1d",
  }));
  return bars.map((bar) => ({ date: bar.date, close: bar.close }));
}

/* ------------------------------------------------------------------ *
 * Overview (dashboard payload)
 * ------------------------------------------------------------------ */

export async function getMarketOverview(): Promise<MarketOverview> {
  return cached("overview:latest", config.cache.marketTtlSeconds, async () => {
    const [summary, indices, quotes] = await Promise.all([
      getMarketSummary(),
      getIndices(),
      getQuotes(),
    ]);

    const [breadth, sectors] = await Promise.all([
      getMarketBreadth(quotes),
      getSectorStats(quotes),
    ]);

    const priced = quotes.filter((quote) => quote.changePercent !== null);
    const topGainers = [...priced]
      .sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0))
      .slice(0, 5);
    const topLosers = [...priced]
      .sort((a, b) => (a.changePercent ?? 0) - (b.changePercent ?? 0))
      .slice(0, 5);

    const fallbackSummary: MarketSummary = {
      sessionDate: nairobiDate(),
      asOf: new Date().toISOString(),
      advancing: breadth.advancing,
      declining: breadth.declining,
      unchanged: breadth.unchanged,
      totalCompanies: quotes.length,
      totalVolume: null,
      totalTurnover: null,
      totalMarketCap: null,
      marketReturn: null,
      pricedCompanies: priced.length,
    };

    return {
      summary: summary ?? fallbackSummary,
      indices,
      breadth,
      sectors,
      topGainers,
      topLosers,
    };
  });
}

/** Change of a quote vs. its previous close — recomputed, never trusted blindly. */
export function recomputeChange(quote: Quote): number | null {
  return percentChange(quote.previousClose, quote.price);
}

/* ------------------------------------------------------------------ *
 * Heatmap metrics
 * ------------------------------------------------------------------ */

export type HeatmapMetrics = {
  /** Percentage change over the session. */
  daily: number | null;
  /** Percentage change over the trailing week. */
  weekly: number | null;
  /** Percentage change over the trailing month. */
  monthly: number | null;
  marketCap: number | null;
  volume: number | null;
  turnover: number | null;
  price: number | null;
};

/**
 * Per-ticker metrics for the heatmap (size by cap/volume/turnover, colour by
 * daily/weekly/monthly return). Computed once per TTL window for the whole
 * universe so switching metric is instant in the UI.
 */
export async function getHeatmapMetrics(): Promise<Record<string, HeatmapMetrics>> {
  return cached("heatmap:metrics", config.cache.marketTtlSeconds, async () => {
    const quotes = await getQuotes();
    const result: Record<string, HeatmapMetrics> = {};

    // Sequential on purpose: each call is memoised and the demo provider is
    // CPU-bound, so parallelism would just contend for the same event loop.
    for (const quote of quotes) {
      const bars = await getDailyCloses(quote.ticker, 100);
      const points = bars.map((bar) => ({ date: bar.date, close: bar.close }));
      result[quote.ticker] = {
        daily: quote.changePercent,
        weekly: trailingReturn(points, 7),
        monthly: trailingReturn(points, 30),
        marketCap: quote.marketCap,
        volume: quote.volume,
        turnover: quote.turnover,
        price: quote.price,
      };
    }

    return result;
  });
}
