/**
 * Canonical domain types for the Kenya Market Intelligence platform.
 *
 * These types are the contract between:
 *   - market-data providers (`src/lib/providers/*`)
 *   - the persistence layer (`src/lib/db/*`)
 *   - the service layer (`src/lib/services/*`)
 *   - the API layer (`src/app/api/*`)
 *   - the UI (`src/components/*`, `src/app/*`)
 *
 * Rules that keep the data honest:
 *  1. Every money/quantity field is `number | null`. `null` means
 *     "not reported by the source", never zero.
 *  2. Every payload carries `MarketDataMeta` describing the provider, the data
 *     mode and any known limitations, so the UI can label data correctly.
 *  3. Percentages are stored as percentage points (2.41 means +2.41%).
 */

/** How trustworthy / fresh a dataset is. Drives every label in the UI. */
export type DataMode =
  /** Real-time streaming feed under licence. */
  | "live"
  /** Real feed, delayed (typically 15 minutes) under licence. */
  | "delayed"
  /** Real end-of-day official statistics. */
  | "end-of-day"
  /** Synthetically generated sample data. Never to be presented as real. */
  | "demo"
  /** Requested, but the source could not supply it. */
  | "unavailable";

export const DATA_MODE_LABEL: Record<DataMode, string> = {
  live: "Live",
  delayed: "Delayed",
  "end-of-day": "End of day",
  demo: "Demo data",
  unavailable: "Data unavailable",
};

export type MarketDataMeta = {
  /** Provider identifier, e.g. `demo` or `nse`. */
  provider: string;
  /** Human-readable provider name used for attribution. */
  providerName: string;
  dataMode: DataMode;
  /** ISO timestamp describing when the underlying data was captured. */
  asOf: string;
  /** Attribution string that must be rendered wherever the data is shown. */
  attribution: string;
  /** Source URL, when the source is public/ licensed for display. */
  sourceUrl?: string;
  /** Human-readable caveats, e.g. "Intraday granularity not available". */
  limitations: string[];
};

export type MarketDataEnvelope<T> = {
  meta: MarketDataMeta;
  data: T;
};

export type ListingStatus = "listed" | "suspended" | "delisted";

/** Static reference data for an NSE-listed company. */
export type Company = {
  /** Internal stable id (database primary key, or a slug when unpersisted). */
  id: string;
  /** NSE ticker, e.g. `SCOM`. */
  ticker: string;
  name: string;
  /** NSE market segment, e.g. `Banking`. */
  sector: string;
  /** URL-safe sector identifier. */
  sectorSlug: string;
  /** Finer-grained classification, e.g. `Commercial banks`. */
  industry: string;
  description: string | null;
  logoUrl: string | null;
  /** Shares in issue, when reported. Used to derive market cap. */
  sharesOutstanding: number | null;
  /** Market capitalisation in KES, as reported by the source. */
  marketCap: number | null;
  listingStatus: ListingStatus;
  currency: string;
  /** ISO 3166-1 alpha-2 country of primary listing, e.g. `KE`. */
  country: string;
  /** True for cross-listings whose primary market is not Kenya. */
  crossListing: boolean;
  /** ISIN, when known. */
  isin: string | null;
};

/** Latest tradable quote for a company. */
export type Quote = {
  ticker: string;
  /** Last traded price in KES. */
  price: number | null;
  previousClose: number | null;
  /** Absolute change vs. previous close, in KES. */
  change: number | null;
  /** Percentage change vs. previous close, in percentage points. */
  changePercent: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  /** Shares traded. */
  volume: number | null;
  /** Value traded in KES. */
  turnover: number | null;
  marketCap: number | null;
  /** ISO timestamp of the quote. */
  asOf: string;
  /** Session date the quote belongs to (YYYY-MM-DD). */
  sessionDate: string;
};

/** OHLCV bar. Always a single, explicitly-stated granularity. */
export type PriceBar = {
  /** ISO date (YYYY-MM-DD) or full ISO timestamp for intraday bars. */
  date: string;
  open: number | null;
  high: number | null;
  low: number | null;
  close: number | null;
  /** Adjusted close for corporate actions, when the source provides it. */
  adjustedClose: number | null;
  volume: number | null;
  /** Value traded in KES, when the source provides it. */
  turnover: number | null;
};

export type BarInterval = "1d" | "1h" | "5m";

export type PriceHistory = {
  ticker: string;
  interval: BarInterval;
  /** Requested range label, e.g. `1Y`. */
  range: string;
  bars: PriceBar[];
  /** True when the source cannot supply intraday data for the 1D range. */
  intradayAvailable: boolean;
  /** Number of bars the source actually returned. */
  coverage: number;
};

export type IndexQuote = {
  /** Index code, e.g. `NASI`. */
  symbol: string;
  name: string;
  description: string | null;
  value: number | null;
  change: number | null;
  changePercent: number | null;
  asOf: string;
};

export type BreadthStats = {
  advancing: number;
  declining: number;
  unchanged: number;
  /** Number of companies with no usable quote in the current snapshot. */
  unpriced: number;
  /** Advancing / declining. `null` when declining is 0. */
  advanceDeclineRatio: number | null;
  /** Companies trading at (or above) their 52-week high. */
  newHighs: number | null;
  /** Companies trading at (or below) their 52-week low. */
  newLows: number | null;
  /** Companies where a 52-week window could be evaluated. */
  highLowCoverage: number;
  /** Total companies considered. */
  total: number;
};

export type SectorStat = {
  sector: string;
  sectorSlug: string;
  companies: number;
  /** Capitalisation-weighted daily return, in percentage points. */
  dailyReturn: number | null;
  weeklyReturn: number | null;
  monthlyReturn: number | null;
  marketValue: number | null;
  turnover: number | null;
  advancing: number;
  declining: number;
  unchanged: number;
  /** Companies in the sector with a usable quote. */
  pricedCompanies: number;
  /** Set when the sector has too little data for a reliable aggregate. */
  incomplete: boolean;
};

export type MarketSummary = {
  /** Snapshot date (YYYY-MM-DD). */
  sessionDate: string;
  asOf: string;
  advancing: number;
  declining: number;
  unchanged: number;
  totalCompanies: number;
  totalVolume: number | null;
  totalTurnover: number | null;
  totalMarketCap: number | null;
  /** Capitalisation-weighted market return for the session. */
  marketReturn: number | null;
  /** Companies with a usable quote in this snapshot. */
  pricedCompanies: number;
};

export type MarketOverview = {
  summary: MarketSummary;
  indices: IndexQuote[];
  breadth: BreadthStats;
  sectors: SectorStat[];
  /** Top gainers / losers by percentage change. */
  topGainers: Quote[];
  topLosers: Quote[];
};

/** Sortable / filterable list result. */
export type Paginated<T> = {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

/** Chart ranges supported by the platform. */
export const HISTORY_RANGES = ["1D", "1W", "1M", "3M", "6M", "1Y", "5Y"] as const;
export type HistoryRange = (typeof HISTORY_RANGES)[number];

/** Heatmap configuration (Phase 6). */
export const SIZE_METRICS = ["marketCap", "volume", "turnover"] as const;
export type SizeMetric = (typeof SIZE_METRICS)[number];

export const COLOR_METRICS = ["daily", "weekly", "monthly"] as const;
export type ColorMetric = (typeof COLOR_METRICS)[number];

/* ------------------------------------------------------------------ *
 * Historical comparison (Phase 9)
 * ------------------------------------------------------------------ */

/**
 * Comparison windows supported by the comparison engine.
 *
 * This is a deliberately closed set: an arbitrary period would let a caller
 * request unbounded history and turn an interactive tool into an expensive
 * full-table scan. `1D`/`1W` are excluded because a comparison of daily closes
 * over a handful of sessions is not meaningful.
 */
export const COMPARE_PERIODS = ["1M", "3M", "6M", "1Y", "3Y", "5Y"] as const;
export type ComparePeriod = (typeof COMPARE_PERIODS)[number];

/** Calendar days covered by each comparison period. */
export const COMPARE_PERIOD_DAYS: Record<ComparePeriod, number> = {
  "1M": 30,
  "3M": 91,
  "6M": 182,
  "1Y": 365,
  "3Y": 1095,
  "5Y": 1825,
};

export const COMPARE_PERIOD_LABEL: Record<ComparePeriod, string> = {
  "1M": "1 month",
  "3M": "3 months",
  "6M": "6 months",
  "1Y": "1 year",
  "3Y": "3 years",
  "5Y": "5 years",
};

/** Hard caps that keep the comparison engine bounded. */
export const MAX_COMPARE_TICKERS = 5;
export const MAX_COMPARE_SECTORS = 10;

/**
 * Colour palette for comparison lines. Assigned server-side so the SSR markup
 * and the client render agree, and chosen for contrast on the dark theme.
 */
export const COMPARISON_COLORS = [
  "#eab308",
  "#22c55e",
  "#38bdf8",
  "#f472b6",
  "#a78bfa",
  "#fb923c",
  "#2dd4bf",
  "#f87171",
  "#c084fc",
  "#94a3b8",
] as const;

/** Whether the compared numbers are share prices or a derived index level. */
export type ComparisonUnit = "KES" | "index";

/** One normalised series for the comparison chart (base 100). */
export type ComparisonSeries = {
  /** Ticker (stocks) or sector slug (sectors). */
  key: string;
  /** Display label, e.g. `KCB` or `Banking`. */
  label: string;
  /** Secondary label, e.g. company name or constituent count. */
  sublabel: string | null;
  /** Hex colour used by the chart and legend. */
  color: string;
  /** Link to the company or sector page. */
  href: string;
  /** False when the period contains no usable observations. */
  available: boolean;
  /** Why the series is unavailable, when it is. */
  reason: string | null;
  /** Date whose observation is the 100 base. */
  anchorDate: string | null;
  /** Number of observations inside the aligned window. */
  observations: number;
  /** Normalised points, ascending by date. */
  points: Array<{ date: string; value: number }>;
};

/** One row of the comparison summary table. */
export type ComparisonSummaryRow = {
  key: string;
  label: string;
  /** Company name (stocks) or sector name (sectors). */
  name: string;
  /** Sector name for stocks; null for sector rows. */
  sector: string | null;
  sectorSlug: string | null;
  /** Number of constituents aggregated — sectors only. */
  constituents: number | null;
  /** Number of constituents that actually had observations — sectors only. */
  constituentsWithData: number | null;
  unit: ComparisonUnit;
  /** First observation in the aligned window (price, or index level). */
  start: number | null;
  /** Last observation in the aligned window. */
  end: number | null;
  /** Always 100 when the series is available — the normalisation base. */
  normalisedStart: number | null;
  /** Normalised end value, e.g. 108.4. */
  normalisedEnd: number | null;
  /** Percentage return across the window; null when it cannot be measured. */
  returnPercent: number | null;
  /** Highest traded price in the window (falls back to close). */
  high: number | null;
  /** Lowest traded price in the window (falls back to close). */
  low: number | null;
  firstDate: string | null;
  lastDate: string | null;
  observations: number;
  /** Sessions available across every compared series in the window. */
  expectedObservations: number | null;
  /** observations / expectedObservations; 1 means full coverage. */
  coverageRatio: number | null;
  available: boolean;
  reason: string | null;
  href: string;
};

/** How the series were aligned — surfaced so the UI can explain the chart. */
export type ComparisonAlignment = {
  /** Identifier for the documented strategy used. */
  strategy: "common-window-independent-base";
  /** Requested period window (before alignment). */
  requestedStart: string;
  requestedEnd: string;
  /** Window actually used, after aligning the series. */
  windowStart: string | null;
  windowEnd: string | null;
  /** True when every series has at least one session inside the same window. */
  overlapping: boolean;
  /** Sessions present in every available series. */
  sharedSessions: number;
  /** Sessions present in at least one series, inside the window. */
  totalSessions: number;
  /** sharedSessions / totalSessions — 1 means perfectly aligned calendars. */
  coverageRatio: number | null;
  /** Sessions between the earliest and latest normalisation anchor. */
  anchorSpreadSessions: number;
  /** Human-readable notes rendered in the data-information panel. */
  notes: string[];
};

export type ComparisonPayload = {
  period: ComparePeriod;
  /** Requested window start (ISO date). */
  from: string;
  /** Requested window end (ISO date). */
  to: string;
  unit: ComparisonUnit;
  /** Series for the normalised chart. */
  series: ComparisonSeries[];
  /** Metrics for the summary table. */
  summary: ComparisonSummaryRow[];
  alignment: ComparisonAlignment;
  /** Number of series that had usable data. */
  availableCount: number;
  /** Number of series requested. */
  requestedCount: number;
};
