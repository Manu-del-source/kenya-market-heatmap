/**
 * Portfolio domain types (Phase 12 — tracking only).
 *
 * Scope, stated up front so the boundary never blurs:
 *
 *  - This is a **tracking tool**. There is no order entry, no brokerage link,
 *    no execution, no "buy" or "sell" action anywhere in the model.
 *  - Holdings live in the visitor's browser today (no accounts yet). The types
 *    are shaped so a server-backed store can replace localStorage without the
 *    UI changing.
 *  - Every derived figure is `number | null`. A portfolio with no price for a
 *    position reports `null`, never a zero that would understate the portfolio.
 *
 * Nothing here is investment advice, a recommendation, or a performance
 * projection. The model describes *what the user says they hold* valued at the
 * latest price the platform can verify.
 */

/** One instrument the visitor says they hold. */
export type PortfolioHolding = {
  ticker: string;
  /** Shares held. Must be > 0. */
  quantity: number;
  /** Average cost per share in KES. `null` when the visitor does not track it. */
  averageCost: number | null;
  /** ISO timestamp of when the holding was entered. */
  addedAt: string;
};

/** Hard caps that keep a client-submitted payload bounded. */
export const MAX_PORTFOLIO_HOLDINGS = 60;
export const MAX_PORTFOLIO_QUANTITY = 1e12;
export const MAX_PORTFOLIO_PRICE = 1e9;

/** A holding valued against the latest verified quote. */
export type PortfolioPosition = {
  ticker: string;
  name: string;
  sector: string;
  sectorSlug: string;
  href: string;
  quantity: number;
  averageCost: number | null;
  /** Last price in KES; `null` when the platform has no price for it. */
  price: number | null;
  /** ISO timestamp of the price used. */
  priceAsOf: string | null;
  /** quantity × price; `null` when unpriced. */
  marketValue: number | null;
  /** quantity × averageCost; `null` when no cost basis was entered. */
  costValue: number | null;
  /** marketValue − costValue; `null` unless both are known. */
  unrealised: number | null;
  /** unrealised / costValue, in percentage points. `null` when cost is 0/unknown. */
  unrealisedPercent: number | null;
  /** Day move in KES for the position; `null` when the source has no change. */
  dayChangeValue: number | null;
  /** Day move in percentage points (per share, not portfolio-weighted). */
  dayChangePercent: number | null;
  /** Share of total portfolio market value, 0–1. `null` when unpriced. */
  weight: number | null;
  /** False when no price could be verified for this instrument. */
  priced: boolean;
  /** Set when the ticker is not in the tracked universe. */
  unknown: boolean;
};

export type PortfolioAllocationSlice = {
  key: string;
  label: string;
  href: string | null;
  /** Aggregate market value in KES. */
  value: number;
  /** Share of total portfolio market value, 0–1. */
  weight: number;
  /** Number of holdings behind the slice. */
  holdings: number;
};

/**
 * Descriptive concentration figures.
 *
 * Reported neutrally: the platform states what the allocation *is*, and never
 * tells the visitor what it should be.
 */
export type PortfolioConcentration = {
  /** Weight of the single largest position, 0–1. */
  largestPositionWeight: number | null;
  /** Largest position ticker, for reference. */
  largestPositionTicker: string | null;
  /** Herfindahl–Hirschman index of position weights (0–1, 1 = one holding). */
  hhi: number | null;
  /** Number of positions needed to reach 50% of portfolio value. */
  positionsToHalf: number | null;
};

export type PortfolioValuation = {
  /** Number of distinct holdings submitted. */
  holdings: number;
  /** Number of holdings that could be priced. */
  pricedHoldings: number;
  /** Tickers with no verifiable price — surfaced, never silently dropped. */
  unpricedTickers: string[];
  /** Total market value in KES; `null` when nothing could be priced. */
  marketValue: number | null;
  /**
   * Cost basis in KES, summed **only over positions that have one**.
   * `costCoverage` states how much of the portfolio that subset represents.
   */
  costValue: number | null;
  /** Share of portfolio market value that has a cost basis, 0–1. */
  costCoverage: number | null;
  /** Unrealised P/L in KES over the cost-covered subset. */
  unrealised: number | null;
  /** Unrealised P/L as a percentage of the cost-covered basis. */
  unrealisedPercent: number | null;
  /** Portfolio day move in KES across priced positions. */
  dayChangeValue: number | null;
  /** Portfolio day move as a percentage of the previous day's value. */
  dayChangePercent: number | null;
  positions: PortfolioPosition[];
  /** Sector allocation across priced positions. */
  bySector: PortfolioAllocationSlice[];
  /** Largest positions by weight. */
  largestPositions: PortfolioAllocationSlice[];
  concentration: PortfolioConcentration;
  asOf: string | null;
  /** Human-readable caveats rendered with the portfolio. */
  notes: string[];
};
