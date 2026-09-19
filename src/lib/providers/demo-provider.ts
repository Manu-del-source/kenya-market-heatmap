/**
 * Demo market-data provider.
 *
 * Purpose: give the platform a complete, deterministic dataset during
 * development, testing and demos — WITHOUT ever pretending it is real.
 *
 * Guarantees:
 *   - Fully deterministic. Same ticker + same date ⇒ same series, so charts do
 *     not flicker between renders and tests can assert on values.
 *   - Anchored on `src/data/demo-baseline.json`, which is sample data only.
 *   - Reference metadata (company names, sectors, index definitions) is real
 *     curated data; prices, volumes and capitalisations are synthetic.
 *   - `dataMode` is always `"demo"`, which the UI renders as "Demo data".
 *
 * When a licensed feed is configured this provider is not used.
 */

import companiesJson from "@/data/companies.json";
import sectorsJson from "@/data/sectors.json";
import indicesJson from "@/data/indices.json";
import baselineJson from "@/data/demo-baseline.json";
import type {
  Company,
  IndexQuote,
  MarketSummary,
  PriceBar,
  Quote,
} from "@/lib/types/market";
import { nairobiDate, previousTradingDay, tradingDaysBetween } from "@/lib/market-session";
import { percentChange } from "@/lib/analytics/series";
import type {
  HistoricalPriceQuery,
  MarketDataProvider,
  ProviderCapabilities,
} from "./types";

const HISTORY_YEARS = 5;
const TRADING_DAYS_PER_YEAR = 252;
const PRICE_FLOOR = 0.05;
const PRICE_PRECISION = 100; // NSE quotes to two decimal places

type SectorSeed = { slug: string; name: string; description?: string };
type IndexSeed = { symbol: string; name: string; description?: string; baselineValue: number };
type CompanySeed = {
  ticker: string;
  name: string;
  sector: string;
  industry: string;
  description: string | null;
  country: string;
  crossListing: boolean;
  listingStatus: string;
  currency: string;
  isin: string | null;
};
type Baseline = {
  price: number;
  previousClose: number;
  changePercent: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  marketCap: number;
  week52High: number;
  week52Low: number;
  annualVolatilityPercent: number;
};

const SECTORS = (sectorsJson.sectors as SectorSeed[]).filter(
  (sector): sector is SectorSeed => Boolean(sector?.slug && sector?.name)
);
const SECTOR_NAME = new Map(SECTORS.map((sector) => [sector.slug, sector.name]));
const INDICES = indicesJson.indices as IndexSeed[];
const BASELINES: Record<string, Baseline> = baselineJson.anchors as Record<string, Baseline>;

const COMPANIES: Company[] = (companiesJson.companies as CompanySeed[])
  .filter((seed) => BASELINES[seed.ticker] !== undefined)
  .map((seed): Company => ({
    id: seed.ticker.toLowerCase(),
    ticker: seed.ticker,
    name: seed.name,
    sector: SECTOR_NAME.get(seed.sector) ?? seed.sector,
    sectorSlug: seed.sector,
    industry: seed.industry,
    description: seed.description ?? null,
    logoUrl: null,
    sharesOutstanding: null,
    marketCap: null,
    listingStatus:
      seed.listingStatus === "suspended"
        ? "suspended"
        : seed.listingStatus === "delisted"
          ? "delisted"
          : "listed",
    currency: seed.currency || "KES",
    country: seed.country || "KE",
    crossListing: Boolean(seed.crossListing),
    isin: seed.isin ?? null,
  }))
  .sort((a, b) => a.ticker.localeCompare(b.ticker));

/* ------------------------------------------------------------------ *
 * Deterministic pseudo-randomness
 * ------------------------------------------------------------------ */

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** mulberry32 — small, fast, fully deterministic for a given seed. */
function mulberry32(seed: number) {
  let state = seed >>> 0;
  return function next(): number {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller transform: uniform stream in, standard normal out. */
function gaussian(rand: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rand();
  while (v === 0) v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const round2 = (value: number) => Math.round(value * PRICE_PRECISION) / PRICE_PRECISION;

/* ------------------------------------------------------------------ *
 * Series generation
 * ------------------------------------------------------------------ */

const seriesCache = new Map<string, PriceBar[]>();

function seriesKey(ticker: string, sessions: string[]) {
  return `${ticker}:${sessions.length}:${sessions[0] ?? ""}:${sessions[sessions.length - 1] ?? ""}`;
}

/**
 * Build an OHLCV series that terminates exactly at the anchor price.
 *
 * Shape: a mean-reverting random walk plus a slow deterministic cycle, then an
 * affine transform that pins the first and last log-price. That keeps the
 * wiggles of a real price path while constraining two things a demo dataset
 * must not get wrong: today's close equals the documented anchor, and the
 * five-year path stays inside a plausible band (a synthetic 99% drawdown would
 * be just as misleading as a fabricated price).
 */
function buildSeries(ticker: string, baseline: Baseline, sessions: string[]): PriceBar[] {
  const cached = seriesCache.get(seriesKey(ticker, sessions));
  if (cached) return cached;

  const count = sessions.length;
  const rand = mulberry32(hashString(`${ticker}:series`));
  const dailyVol = baseline.annualVolatilityPercent / 100 / Math.sqrt(TRADING_DAYS_PER_YEAR);

  // Mean reversion: half-life of a few months keeps the walk from wandering
  // arbitrarily far from its level.
  const reversion = 0.005;
  const cycleAmplitude = dailyVol * 0.6;
  const phase = (hashString(`${ticker}:phase`) % 360) * (Math.PI / 180);
  const cycles = 1 + (hashString(`${ticker}:cycles`) % 3);

  // Log-price shape: a mean-reverting level plus a slow deterministic cycle.
  // `ou` is the level itself (not an increment) — integrating it would produce
  // an unrealistically smooth path.
  const shape = new Array<number>(count);
  let ou = 0;
  for (let i = 0; i < count; i++) {
    const cycle = Math.sin((i / count) * Math.PI * 2 * cycles + phase) * cycleAmplitude;
    ou = ou * (1 - reversion) + gaussian(rand) * dailyVol;
    shape[i] = cycle + ou;
  }

  // Total five-year log return drawn deterministically per ticker, roughly
  // -45% … +120% over the window.
  const driftSeed = (hashString(`${ticker}:drift`) % 1000) / 1000;
  const fiveYearLogReturn = -0.6 + driftSeed * 1.4;

  const logAnchor = Math.log(baseline.price);
  const logStart = logAnchor - fiveYearLogReturn;
  const first = shape[0] ?? 0;
  const last = shape[count - 1] ?? 0;

  // Pin both endpoints by removing the shape's own linear trend and adding the
  // intended one. Amplitude is preserved, so volatility stays realistic and the
  // series still ends exactly on the anchor price.
  const path = new Array<number>(count);
  for (let i = 0; i < count; i++) {
    const t = count === 1 ? 0 : i / (count - 1);
    const shapeTrend = first + (last - first) * t;
    const residual = (shape[i] ?? 0) - shapeTrend;
    path[i] = Math.exp(logStart + (logAnchor - logStart) * t + residual);
  }

  const bars: PriceBar[] = [];
  let previousClose: number | null = null;

  for (let i = 0; i < count; i++) {
    const close = Math.max(PRICE_FLOOR, round2(path[i]));

    const gap = previousClose === null ? 0 : gaussian(rand) * dailyVol * 0.35;
    const open =
      previousClose === null
        ? round2(close * (1 - gaussian(rand) * dailyVol * 0.5))
        : round2(previousClose * (1 + gap));

    const range = Math.abs(gaussian(rand)) * dailyVol * 0.9 + dailyVol * 0.25;
    const high = round2(Math.max(open, close) * (1 + range * rand()));
    const low = round2(Math.max(PRICE_FLOOR, Math.min(open, close) * (1 - range * rand())));

    // Volume: lognormal around the baseline, with a mild weekday effect.
    const weekday = new Date(`${sessions[i]}T00:00:00Z`).getUTCDay();
    const weekdayFactor = weekday === 1 ? 1.12 : weekday === 5 ? 0.86 : 1;
    const volume = Math.max(
      0,
      Math.round(baseline.volume * weekdayFactor * Math.exp(gaussian(rand) * 0.5))
    );

    bars.push({
      date: sessions[i],
      open,
      high: Math.max(high, open, close),
      low: Math.min(low, open, close),
      close,
      // No corporate-action adjustments exist in sample data: adjusted = close.
      adjustedClose: close,
      volume,
      turnover: Math.round(volume * close),
    });

    previousClose = close;
  }

  if (seriesCache.size > 400) seriesCache.clear();
  seriesCache.set(seriesKey(ticker, sessions), bars);
  return bars;
}

function sessionsFor(ticker: string, years = HISTORY_YEARS): string[] {
  const today = nairobiDate();
  const from = new Date(`${today}T00:00:00Z`);
  from.setUTCFullYear(from.getUTCFullYear() - years);
  return tradingDaysBetween(from.toISOString().slice(0, 10), today);
}

function barsFor(ticker: string): PriceBar[] {
  const baseline = BASELINES[ticker];
  const company = COMPANIES.find((entry) => entry.ticker === ticker);
  if (!baseline || !company) return [];
  return buildSeries(ticker, baseline, sessionsFor(ticker));
}

/** Latest session timestamp, expressed as market close in Nairobi (UTC+3). */
const CLOSE_SUFFIX = "T15:00:00+03:00";

function quoteFromBars(ticker: string, bars: PriceBar[]): Quote | null {
  if (bars.length === 0) return null;
  const baseline = BASELINES[ticker];
  const last = bars[bars.length - 1];
  const previous = bars.length > 1 ? bars[bars.length - 2] : null;
  const previousClose = previous?.close ?? baseline?.previousClose ?? null;
  const close = last.close;

  return {
    ticker,
    price: close,
    previousClose,
    change:
      close !== null && previousClose !== null ? round2(close - previousClose) : null,
    changePercent: percentChange(previousClose, close),
    dayHigh: last.high,
    dayLow: last.low,
    volume: last.volume,
    turnover: last.turnover,
    marketCap:
      close !== null && baseline?.price
        ? Math.round(baseline.marketCap * (close / baseline.price))
        : null,
    asOf: `${last.date}${CLOSE_SUFFIX}`,
    sessionDate: last.date,
  };
}

/* ------------------------------------------------------------------ *
 * Provider implementation
 * ------------------------------------------------------------------ */

const CAPABILITIES: ProviderCapabilities = {
  intraday: false,
  historyYears: HISTORY_YEARS,
  indices: true,
  turnover: true,
  referenceData: true,
};

export class DemoMarketDataProvider implements MarketDataProvider {
  readonly id = "demo";
  readonly name = "Demo market data (sample)";
  readonly attribution = "Sample data — not NSE market data. Not investment advice.";
  readonly dataMode = "demo" as const;
  readonly limitations = [
    "Prices, volumes and capitalisations are synthetic sample data, not NSE prices.",
    "Only end-of-day granularity is generated; intraday (1D) charts are unavailable.",
    "No fundamentals, dividends or corporate actions are modelled.",
    "Index levels are proxies derived from the sample quotes, not official index values.",
  ];
  readonly capabilities = CAPABILITIES;

  async getCompanies(): Promise<Company[]> {
    return COMPANIES;
  }

  async getCompany(ticker: string): Promise<Company | null> {
    return COMPANIES.find((company) => company.ticker === ticker) ?? null;
  }

  async getQuotes(tickers?: string[]): Promise<Quote[]> {
    const universe = tickers?.length
      ? COMPANIES.filter((company) => tickers.includes(company.ticker))
      : COMPANIES;

    return universe
      .map((company) => quoteFromBars(company.ticker, barsFor(company.ticker)))
      .filter((quote): quote is Quote => quote !== null);
  }

  async getHistoricalPrices(query: HistoricalPriceQuery): Promise<PriceBar[]> {
    if (query.interval !== "1d") return []; // sample provider has no intraday
    const bars = barsFor(query.ticker);
    return bars.filter((bar) => bar.date >= query.from && bar.date <= query.to);
  }

  async getIndices(): Promise<IndexQuote[]> {
    const quotes = await this.getQuotes();
    const asOf = quotes[0]?.asOf ?? `${nairobiDate()}${CLOSE_SUFFIX}`;
    const cap = new Map(quotes.map((quote) => [quote.ticker, quote.marketCap ?? 0]));

    const capWeightedReturn = (subset: Quote[]) => {
      let numerator = 0;
      let denominator = 0;
      for (const quote of subset) {
        const weight = cap.get(quote.ticker) ?? 0;
        const change = quote.changePercent;
        if (change === null || weight <= 0) continue;
        numerator += change * weight;
        denominator += weight;
      }
      return denominator > 0 ? numerator / denominator : null;
    };

    const byCap = [...quotes].sort((a, b) => (b.marketCap ?? 0) - (a.marketCap ?? 0));
    const banking = quotes.filter((quote) => {
      const company = COMPANIES.find((entry) => entry.ticker === quote.ticker);
      return company?.sectorSlug === "banking";
    });

    const constituents: Record<string, Quote[]> = {
      NASI: quotes,
      NSE20: byCap.slice(0, 20),
      NSE25: byCap.slice(0, 25),
      NSE10: byCap.slice(0, 10),
      BSI: banking,
    };

    return INDICES.map((index) => {
      const changePercent = capWeightedReturn(constituents[index.symbol] ?? quotes);
      return {
        symbol: index.symbol,
        name: index.name,
        description: index.description ?? null,
        value:
          changePercent === null
            ? index.baselineValue
            : Math.round(index.baselineValue * (1 + changePercent / 100) * 100) / 100,
        change:
          changePercent === null
            ? null
            : Math.round(index.baselineValue * (changePercent / 100) * 100) / 100,
        changePercent,
        asOf,
      };
    });
  }

  async getMarketSummary(): Promise<MarketSummary | null> {
    const quotes = await this.getQuotes();
    if (quotes.length === 0) return null;

    let advancing = 0;
    let declining = 0;
    let unchanged = 0;
    let volume = 0;
    let turnover = 0;
    let marketCap = 0;
    let returnNumerator = 0;
    let returnDenominator = 0;
    let priced = 0;

    for (const quote of quotes) {
      const price = quote.price;
      if (price === null) continue;
      priced += 1;
      volume += quote.volume ?? 0;
      turnover += quote.turnover ?? 0;
      const cap = quote.marketCap ?? 0;
      marketCap += cap;

      const change = quote.changePercent;
      if (change === null) continue;
      if (change > 0) advancing += 1;
      else if (change < 0) declining += 1;
      else unchanged += 1;

      if (cap > 0) {
        returnNumerator += change * cap;
        returnDenominator += cap;
      }
    }

    const sessionDate = quotes[0]?.sessionDate ?? nairobiDate();

    return {
      sessionDate,
      asOf: quotes[0]?.asOf ?? `${sessionDate}${CLOSE_SUFFIX}`,
      advancing,
      declining,
      unchanged,
      totalCompanies: quotes.length,
      totalVolume: priced > 0 ? volume : null,
      totalTurnover: priced > 0 ? turnover : null,
      totalMarketCap: priced > 0 ? marketCap : null,
      marketReturn: returnDenominator > 0 ? returnNumerator / returnDenominator : null,
      pricedCompanies: priced,
    };
  }
}

/** Exposed for tests: clears memoised series so a new date can be simulated. */
export function __resetDemoProviderCache() {
  seriesCache.clear();
}

/** Last session the provider has data for, used for "as of" labels. */
export function demoLatestSession(): string {
  return previousTradingDay(nairobiDate());
}

export { BASELINES as DEMO_BASELINES, COMPANIES as DEMO_COMPANIES };
