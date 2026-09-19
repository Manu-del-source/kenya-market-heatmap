/**
 * Repository contract — the only way application code touches storage.
 *
 * Two implementations exist:
 *   - `MemoryRepository` (default): process-local, zero configuration. Used for
 *     local development, tests and read-only demo deployments. Data written to
 *     it disappears when the process restarts (except what ingestion reloads).
 *   - `PostgresRepository`: durable, used when `DATABASE_URL` is set.
 *
 * Both implement exactly this interface, so the service layer is storage
 * agnostic and the Postgres path can be tested independently.
 */

import type {
  Company,
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
  SectorStat,
} from "@/lib/types/market";

export type SectorRecord = {
  slug: string;
  name: string;
  description: string | null;
};

export type CompanyRecord = Company;

export type EconomicIndicatorRecord = {
  seriesId: string;
  name: string;
  category: string;
  unit: string;
  frequency: string;
  description: string | null;
  source: string;
  sourceUrl: string | null;
  license: string | null;
  firstObservation: string | null;
  lastObservation: string | null;
};

export type EconomicObservationRecord = {
  date: string;
  value: number | null;
  asOf: string | null;
};

export type IngestionRunRecord = {
  provider: string;
  kind: string;
  status: "running" | "success" | "failed" | "partial";
  rowsWritten: number;
  message: string | null;
  startedAt: Date;
  finishedAt: Date | null;
};

export interface MarketRepository {
  /** `memory` or `postgres`. Surfaces in /api/health for operability. */
  readonly kind: "memory" | "postgres";
  /** False for the in-memory store: callers must not assume durability. */
  readonly isPersistent: boolean;

  /* --------------------------- reference data --------------------------- */

  upsertSectors(sectors: SectorRecord[]): Promise<number>;
  listSectors(): Promise<SectorRecord[]>;

  upsertCompanies(companies: CompanyRecord[]): Promise<number>;
  listCompanies(): Promise<CompanyRecord[]>;
  getCompany(ticker: string): Promise<CompanyRecord | null>;

  /* ---------------------------- market data ---------------------------- */

  /** Upsert the latest quote per company. Returns rows written. */
  upsertQuotes(quotes: Quote[]): Promise<number>;
  getStoredQuotes(tickers?: string[]): Promise<Quote[]>;
  /** Most recent session date present in the store, if any. */
  latestQuoteSession(): Promise<string | null>;

  /** Upsert OHLCV bars. Returns rows written. */
  upsertPriceBars(ticker: string, bars: PriceBar[]): Promise<number>;
  getPriceBars(ticker: string, from: string, to: string, interval?: string): Promise<PriceBar[]>;

  /**
   * Batched history read for several tickers at once.
   *
   * The comparison engine needs up to five instruments — or every constituent
   * of a sector — for the same window. Implementations must serve this with a
   * single round-trip (one SQL query with `IN (...)`) rather than N sequential
   * reads, so adding a fifth series does not add a fifth query.
   *
   * Returns a map keyed by the requested ticker (upper case). Tickers with no
   * stored data are simply absent from the map.
   */
  getPriceBarsForTickers(
    tickers: string[],
    from: string,
    to: string,
    interval?: string
  ): Promise<Record<string, PriceBar[]>>;

  /** Latest bar date stored for a ticker, used for incremental backfill. */
  latestBarDate(ticker: string): Promise<string | null>;

  upsertIndices(indices: IndexQuote[]): Promise<number>;
  getStoredIndices(): Promise<IndexQuote[]>;

  upsertMarketSnapshot(snapshot: MarketSummary): Promise<void>;
  getMarketSnapshot(tradeDate: string): Promise<MarketSummary | null>;
  listMarketSnapshots(limit: number): Promise<MarketSummary[]>;

  /**
   * Persist sector aggregates for one session. Written by ingestion; the read
   * path for sector history is planned alongside the sector analytics view.
   */
  upsertSectorSnapshots(tradeDate: string, sectors: SectorStat[]): Promise<number>;

  /* ---------------------------- economy -------------------------------- */

  upsertEconomicIndicators(indicators: EconomicIndicatorRecord[]): Promise<number>;
  listEconomicIndicators(): Promise<EconomicIndicatorRecord[]>;
  upsertEconomicObservations(
    seriesId: string,
    observations: EconomicObservationRecord[]
  ): Promise<number>;
  getEconomicObservations(
    seriesId: string,
    from?: string,
    to?: string
  ): Promise<EconomicObservationRecord[]>;

  /* ---------------------------- operations ------------------------------ */

  recordIngestionRun(run: IngestionRunRecord): Promise<void>;
}

/** Guard: repositories must never invent data — empty means empty. */
export const EMPTY_RESULT = 0;
