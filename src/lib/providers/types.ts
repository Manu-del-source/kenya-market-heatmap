/**
 * Market-data provider contract (Phase 3).
 *
 * The application never talks to a vendor SDK or a scraper directly. Every
 * market read goes through this interface, which means:
 *
 *   - the demo provider can be swapped for a licensed NSE feed with one env var
 *   - every provider must declare its own data mode and limitations, so the UI
 *     can label the data honestly without special-casing a vendor
 *   - missing data is expressed as `null`, and providers must return `null`
 *     rather than substitute a plausible value
 */

import type {
  BarInterval,
  Company,
  DataMode,
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
} from "@/lib/types/market";

export type HistoricalPriceQuery = {
  ticker: string;
  from: string;
  to: string;
  interval: BarInterval;
};

export type ProviderCapabilities = {
  /** Provider can serve sub-daily bars (needed for a true 1D chart). */
  intraday: boolean;
  /** Years of history the provider can serve. */
  historyYears: number;
  indices: boolean;
  /** Provider supplies turnover as well as volume. */
  turnover: boolean;
  /** Provider supplies reference data (sector, industry, shares in issue). */
  referenceData: boolean;
};

export interface MarketDataProvider {
  /** Stable identifier used in cache keys and API metadata, e.g. `demo`. */
  readonly id: string;
  /** Display name, e.g. `NSE licensed market data feed`. */
  readonly name: string;
  /** Attribution string that must be rendered next to any derived figure. */
  readonly attribution: string;
  /** Public documentation / licence URL, when one exists. */
  readonly sourceUrl?: string;
  /** Freshness + trustworthiness of what this provider returns. */
  readonly dataMode: DataMode;
  /** Caveats surfaced in `MarketDataMeta.limitations`. */
  readonly limitations: string[];
  readonly capabilities: ProviderCapabilities;

  /** Every listed company known to the provider. */
  getCompanies(): Promise<Company[]>;

  /** Single company by NSE ticker; `null` when unknown. */
  getCompany(ticker: string): Promise<Company | null>;

  /** Latest quotes. Omit `tickers` for the whole universe. */
  getQuotes(tickers?: string[]): Promise<Quote[]>;

  /** OHLCV bars in ascending date order. Empty when the source has none. */
  getHistoricalPrices(query: HistoricalPriceQuery): Promise<PriceBar[]>;

  /** Index levels. Empty array when the provider does not support indices. */
  getIndices(): Promise<IndexQuote[]>;

  /** Whole-market snapshot, or `null` when the provider cannot summarise. */
  getMarketSummary(): Promise<MarketSummary | null>;
}

export type { Company, IndexQuote, MarketSummary, PriceBar, Quote };
