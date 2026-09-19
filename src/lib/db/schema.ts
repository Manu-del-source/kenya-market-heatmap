/**
 * Physical data model (Phase 2 / Phase 12).
 *
 * Design rules applied here:
 *  1. **One fact, one column.** Derived values (change %, sector returns,
 *     breadth counts) are computed on read or stored once per snapshot date —
 *     they are never duplicated onto the row they were derived from.
 *  2. **Nullable means "not reported"**, never zero. Nothing in the platform may
 *     render a zero in place of a missing figure.
 *  3. **Market data and economic data are separate trees.** They share no
 *     tables: different sources, licences, frequencies and semantics.
 *  4. **Everything carries provenance** (`source`, `as_of`) so any number on
 *     screen can be traced back to where it came from.
 *
 * See docs/data-model.md for the ERD and rationale.
 */

import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Money / price: 4dp scale is enough for NSE quotes and index levels. */
const price = (name: string) => numeric(name, { precision: 18, scale: 4, mode: "number" });
/** Quantities: shares traded. */
const quantity = (name: string) => bigint(name, { mode: "number" });
/** Large aggregates (turnover, market cap) in KES. */
const money = (name: string) => numeric(name, { precision: 24, scale: 2, mode: "number" });
/** Rates and percentages stored in percentage points (2.41 = +2.41%). */
const rate = (name: string) => doublePrecision(name);

const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp("updated_at", { withTimezone: true }).notNull().defaultNow();

/* ------------------------------------------------------------------ *
 * Reference data
 * ------------------------------------------------------------------ */

export const sectors = pgTable("sectors", {
  id: serial("id").primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: createdAt(),
}, (table) => [uniqueIndex("sectors_slug_key").on(table.slug)]);

export const companies = pgTable(
  "companies",
  {
    id: serial("id").primaryKey(),
    /** NSE ticker, e.g. `SCOM`. */
    ticker: text("ticker").notNull(),
    name: text("name").notNull(),
    sectorId: integer("sector_id").references(() => sectors.id),
    industry: text("industry"),
    description: text("description"),
    logoUrl: text("logo_url"),
    /** Shares in issue, when the source reports it. */
    sharesOutstanding: quantity("shares_outstanding"),
    /** Latest reported market capitalisation in KES. */
    marketCap: money("market_cap"),
    listingStatus: text("listing_status").notNull().default("listed"),
    currency: text("currency").notNull().default("KES"),
    country: text("country").notNull().default("KE"),
    crossListing: boolean("cross_listing").notNull().default(false),
    isin: text("isin"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    uniqueIndex("companies_ticker_key").on(table.ticker),
    index("companies_sector_idx").on(table.sectorId),
  ]
);

/* ------------------------------------------------------------------ *
 * Market data
 * ------------------------------------------------------------------ */

/**
 * End-of-day (or intraday) OHLCV bars.
 *
 * One row per instrument per session per interval. `interval` allows a future
 * intraday feed to coexist with daily history instead of overwriting it.
 */
export const priceBars = pgTable(
  "price_bars",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    companyId: integer("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    tradeDate: date("trade_date").notNull(),
    interval: text("interval").notNull().default("1d"),
    open: price("open"),
    high: price("high"),
    low: price("low"),
    close: price("close"),
    adjustedClose: price("adjusted_close"),
    volume: quantity("volume"),
    turnover: money("turnover"),
    /** Provider that produced this row (`demo`, `nse`, `manual-import`). */
    source: text("source").notNull().default("unknown"),
    createdAt: createdAt(),
  },
  (table) => [
    uniqueIndex("price_bars_company_date_interval_key").on(
      table.companyId,
      table.tradeDate,
      table.interval
    ),
    index("price_bars_date_idx").on(table.tradeDate),
  ]
);

/**
 * Current quote per company — a materialised "latest" view of `price_bars`.
 *
 * Stored as a table (rather than always joining) because the dashboard reads
 * every quote on every page view, and the read must stay a single indexed scan.
 */
export const quotes = pgTable(
  "quotes",
  {
    companyId: integer("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    sessionDate: date("session_date").notNull(),
    price: price("price"),
    previousClose: price("previous_close"),
    changeAbs: price("change_abs"),
    changePercent: rate("change_percent"),
    dayHigh: price("day_high"),
    dayLow: price("day_low"),
    volume: quantity("volume"),
    turnover: money("turnover"),
    marketCap: money("market_cap"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("unknown"),
    updatedAt: updatedAt(),
  },
  (table) => [index("quotes_session_idx").on(table.sessionDate)]
);

export const marketIndices = pgTable(
  "market_indices",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    value: price("value"),
    changeAbs: price("change_abs"),
    changePercent: rate("change_percent"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("unknown"),
  },
  (table) => [uniqueIndex("market_indices_symbol_key").on(table.symbol)]
);

export const indexBars = pgTable(
  "index_bars",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    indexId: integer("index_id")
      .notNull()
      .references(() => marketIndices.id, { onDelete: "cascade" }),
    tradeDate: date("trade_date").notNull(),
    value: price("value"),
    source: text("source").notNull().default("unknown"),
  },
  (table) => [uniqueIndex("index_bars_index_date_key").on(table.indexId, table.tradeDate)]
);

/** Daily whole-market snapshot — the basis for historical market analysis. */
export const marketSnapshots = pgTable(
  "market_snapshots",
  {
    tradeDate: date("trade_date").primaryKey(),
    advancing: integer("advancing").notNull().default(0),
    declining: integer("declining").notNull().default(0),
    unchanged: integer("unchanged").notNull().default(0),
    unpriced: integer("unpriced").notNull().default(0),
    totalVolume: quantity("total_volume"),
    totalTurnover: money("total_turnover"),
    totalMarketCap: money("total_market_cap"),
    marketReturn: rate("market_return"),
    asOf: timestamp("as_of", { withTimezone: true }).notNull(),
    source: text("source").notNull().default("unknown"),
  },
  (table) => [index("market_snapshots_date_idx").on(table.tradeDate)]
);

/** Per-sector daily aggregates, so sector history does not need recomputing. */
export const sectorSnapshots = pgTable(
  "sector_snapshots",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    sectorId: integer("sector_id")
      .notNull()
      .references(() => sectors.id, { onDelete: "cascade" }),
    tradeDate: date("trade_date").notNull(),
    companies: integer("companies").notNull().default(0),
    marketValue: money("market_value"),
    dailyReturn: rate("daily_return"),
    weeklyReturn: rate("weekly_return"),
    monthlyReturn: rate("monthly_return"),
    turnover: money("turnover"),
    advancing: integer("advancing").notNull().default(0),
    declining: integer("declining").notNull().default(0),
    source: text("source").notNull().default("unknown"),
  },
  (table) => [uniqueIndex("sector_snapshots_sector_date_key").on(table.sectorId, table.tradeDate)]
);

/* ------------------------------------------------------------------ *
 * Economic data (kept strictly separate from market data)
 * ------------------------------------------------------------------ */

export const economicIndicators = pgTable(
  "economic_indicators",
  {
    id: serial("id").primaryKey(),
    /** Stable series code owned by this platform, e.g. `KE.CBK.CBR`. */
    seriesId: text("series_id").notNull(),
    name: text("name").notNull(),
    category: text("category").notNull(),
    unit: text("unit").notNull(),
    frequency: text("frequency").notNull(),
    description: text("description"),
    /** Publishing institution, e.g. `Central Bank of Kenya`. */
    source: text("source").notNull(),
    sourceUrl: text("source_url"),
    /** Licence / redistribution terms that apply to the series. */
    license: text("license"),
    /** Earliest observation available in `economic_observations`. */
    firstObservation: date("first_observation"),
    lastObservation: date("last_observation"),
    updatedAt: updatedAt(),
  },
  (table) => [uniqueIndex("economic_indicators_series_key").on(table.seriesId)]
);

export const economicObservations = pgTable(
  "economic_observations",
  {
    id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
    indicatorId: integer("indicator_id")
      .notNull()
      .references(() => economicIndicators.id, { onDelete: "cascade" }),
    observationDate: date("observation_date").notNull(),
    value: doublePrecision("value"),
    asOf: timestamp("as_of", { withTimezone: true }),
    source: text("source").notNull().default("unknown"),
  },
  (table) => [
    uniqueIndex("economic_observations_series_date_key").on(
      table.indicatorId,
      table.observationDate
    ),
  ]
);

/* ------------------------------------------------------------------ *
 * Operational metadata
 * ------------------------------------------------------------------ */

/** Audit trail for every ingestion run — essential for a data platform. */
export const ingestionRuns = pgTable("ingestion_runs", {
  id: serial("id").primaryKey(),
  provider: text("provider").notNull(),
  kind: text("kind").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  status: text("status").notNull().default("running"),
  rowsWritten: integer("rows_written").notNull().default(0),
  message: text("message"),
});

export type SectorRow = typeof sectors.$inferSelect;
export type CompanyRow = typeof companies.$inferSelect;
export type PriceBarRow = typeof priceBars.$inferSelect;
export type QuoteRow = typeof quotes.$inferSelect;
export type MarketIndexRow = typeof marketIndices.$inferSelect;
export type MarketSnapshotRow = typeof marketSnapshots.$inferSelect;
export type SectorSnapshotRow = typeof sectorSnapshots.$inferSelect;
export type EconomicIndicatorRow = typeof economicIndicators.$inferSelect;
export type EconomicObservationRow = typeof economicObservations.$inferSelect;
