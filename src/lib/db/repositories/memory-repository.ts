/**
 * In-memory repository.
 *
 * Used when no `DATABASE_URL` is configured: local development, unit tests and
 * read-only demo deployments (including Vercel). Writes are process-local and
 * are lost on restart, which is why `isPersistent` is false and callers must
 * treat the store as a cache, not a system of record.
 *
 * It deliberately starts empty. Sample market data comes from the demo
 * *provider*, not from here — keeping "sample data" and "storage" separate is
 * what stops sample values from being mistaken for stored market data.
 */

import type {
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
  SectorStat,
} from "@/lib/types/market";
import type {
  CompanyRecord,
  EconomicIndicatorRecord,
  EconomicObservationRecord,
  IngestionRunRecord,
  MarketRepository,
  SectorRecord,
} from "../repository";

/** Normalise a ticker for map keys. */
const key = (ticker: string) => ticker.trim().toUpperCase();

export class MemoryRepository implements MarketRepository {
  readonly kind = "memory" as const;
  readonly isPersistent = false;

  private sectorStore = new Map<string, SectorRecord>();
  private companyStore = new Map<string, CompanyRecord>();
  private quoteStore = new Map<string, Quote>();
  private barStore = new Map<string, Map<string, PriceBar>>();
  private indexStore = new Map<string, IndexQuote>();
  private snapshotStore = new Map<string, MarketSummary>();
  private sectorSnapshotStore = new Map<string, SectorStat[]>();
  private indicatorStore = new Map<string, EconomicIndicatorRecord>();
  private observationStore = new Map<string, Map<string, number | null>>();
  private ingestionRuns: IngestionRunRecord[] = [];

  async upsertSectors(sectors: SectorRecord[]): Promise<number> {
    for (const sector of sectors) this.sectorStore.set(sector.slug, sector);
    return sectors.length;
  }

  async listSectors(): Promise<SectorRecord[]> {
    return [...this.sectorStore.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async upsertCompanies(companies: CompanyRecord[]): Promise<number> {
    for (const company of companies) this.companyStore.set(key(company.ticker), company);
    return companies.length;
  }

  async listCompanies(): Promise<CompanyRecord[]> {
    return [...this.companyStore.values()].sort((a, b) => a.ticker.localeCompare(b.ticker));
  }

  async getCompany(ticker: string): Promise<CompanyRecord | null> {
    return this.companyStore.get(key(ticker)) ?? null;
  }

  async upsertQuotes(quotes: Quote[]): Promise<number> {
    for (const quote of quotes) this.quoteStore.set(key(quote.ticker), quote);
    return quotes.length;
  }

  async getStoredQuotes(tickers?: string[]): Promise<Quote[]> {
    const all = [...this.quoteStore.values()];
    if (!tickers?.length) return all;
    const wanted = new Set(tickers.map(key));
    return all.filter((quote) => wanted.has(key(quote.ticker)));
  }

  async latestQuoteSession(): Promise<string | null> {
    let latest: string | null = null;
    for (const quote of this.quoteStore.values()) {
      if (quote.price === null) continue;
      if (latest === null || quote.sessionDate > latest) latest = quote.sessionDate;
    }
    return latest;
  }

  async upsertPriceBars(ticker: string, bars: PriceBar[]): Promise<number> {
    const symbol = key(ticker);
    const bucket = this.barStore.get(symbol) ?? new Map<string, PriceBar>();
    for (const bar of bars) bucket.set(bar.date, bar);
    this.barStore.set(symbol, bucket);
    return bars.length;
  }

  async getPriceBars(ticker: string, from: string, to: string): Promise<PriceBar[]> {
    const bucket = this.barStore.get(key(ticker));
    if (!bucket) return [];
    return [...bucket.values()]
      .filter((bar) => bar.date >= from && bar.date <= to)
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async getPriceBarsForTickers(
    tickers: string[],
    from: string,
    to: string
  ): Promise<Record<string, PriceBar[]>> {
    const result: Record<string, PriceBar[]> = {};
    // The in-memory store keeps bars in maps, so the "single query" is a single
    // pass over the requested tickers with no I/O per row.
    for (const ticker of tickers) {
      const bars = await this.getPriceBars(ticker, from, to);
      if (bars.length > 0) result[key(ticker)] = bars;
    }
    return result;
  }

  async latestBarDate(ticker: string): Promise<string | null> {
    const bucket = this.barStore.get(key(ticker));
    if (!bucket || bucket.size === 0) return null;
    return [...bucket.keys()].sort().at(-1) ?? null;
  }

  async upsertIndices(indices: IndexQuote[]): Promise<number> {
    for (const index of indices) this.indexStore.set(index.symbol.toUpperCase(), index);
    return indices.length;
  }

  async getStoredIndices(): Promise<IndexQuote[]> {
    return [...this.indexStore.values()];
  }

  async upsertMarketSnapshot(snapshot: MarketSummary): Promise<void> {
    this.snapshotStore.set(snapshot.sessionDate, snapshot);
  }

  async getMarketSnapshot(tradeDate: string): Promise<MarketSummary | null> {
    return this.snapshotStore.get(tradeDate) ?? null;
  }

  async listMarketSnapshots(limit: number): Promise<MarketSummary[]> {
    return [...this.snapshotStore.values()]
      .sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))
      .slice(0, limit);
  }

  async upsertSectorSnapshots(tradeDate: string, sectors: SectorStat[]): Promise<number> {
    this.sectorSnapshotStore.set(tradeDate, sectors);
    return sectors.length;
  }

  async upsertEconomicIndicators(indicators: EconomicIndicatorRecord[]): Promise<number> {
    for (const indicator of indicators) this.indicatorStore.set(indicator.seriesId, indicator);
    return indicators.length;
  }

  async listEconomicIndicators(): Promise<EconomicIndicatorRecord[]> {
    return [...this.indicatorStore.values()].sort((a, b) => a.seriesId.localeCompare(b.seriesId));
  }

  async upsertEconomicObservations(
    seriesId: string,
    observations: EconomicObservationRecord[]
  ): Promise<number> {
    const bucket = this.observationStore.get(seriesId) ?? new Map<string, number | null>();
    for (const observation of observations) bucket.set(observation.date, observation.value);
    this.observationStore.set(seriesId, bucket);
    return observations.length;
  }

  async getEconomicObservations(
    seriesId: string,
    from?: string,
    to?: string
  ): Promise<EconomicObservationRecord[]> {
    const bucket = this.observationStore.get(seriesId);
    if (!bucket) return [];
    return [...bucket.entries()]
      .map(([date, value]) => ({ date, value, asOf: null }))
      .filter((row) => (!from || row.date >= from) && (!to || row.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  async recordIngestionRun(run: IngestionRunRecord): Promise<void> {
    this.ingestionRuns.push(run);
    if (this.ingestionRuns.length > 100) this.ingestionRuns.shift();
  }
}
