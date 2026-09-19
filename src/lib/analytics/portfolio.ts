/**
 * Portfolio valuation maths (Phase 12).
 *
 * Pure functions: no I/O, no React, no persistence. The rules:
 *
 *  1. **No invented prices.** A holding without a verifiable quote is reported
 *     as unpriced and excluded from every total; the ticker is listed in
 *     `unpricedTickers`.
 *  2. **No silent zero for an unknown cost basis.** Without an entered average
 *     cost, unrealised P/L is `null` (rendered `—`), not `0.00`.
 *  3. **Apples to apples.** Cost basis and unrealised P/L are summed only over
 *     positions that have a cost, and `costCoverage` says what share of the
 *     portfolio that subset represents.
 *  4. **Descriptive, never prescriptive.** Concentration is reported as a fact
 *     about the allocation; the platform never suggests a target.
 *
 * This is tracking, not trading: there is no order, fill, fee or cash leg in
 * the model, so no figure here is a statement of account.
 */

import type { Company, Quote } from "@/lib/types/market";
import type {
  PortfolioAllocationSlice,
  PortfolioConcentration,
  PortfolioHolding,
  PortfolioPosition,
  PortfolioValuation,
} from "@/lib/types/portfolio";

/** Money is rounded to cents — enough precision, no float noise in JSON. */
function money(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 100) / 100;
}

/** Ratios are rounded to 4 decimal places (0.1234 = 12.34%). */
function ratio(value: number | null): number | null {
  if (value === null || !Number.isFinite(value)) return null;
  return Math.round(value * 10_000) / 10_000;
}

/**
 * Merge duplicate tickers: quantities add, and the average cost becomes the
 * quantity-weighted mean of the lots that **have** a cost.
 *
 * If any lot is missing a cost, the merged holding has no average cost at all —
 * dividing the known cost by the total share count would silently price the
 * unknown lot at zero, which is exactly the kind of invented figure this
 * platform refuses to print.
 */
export function consolidateHoldings(holdings: PortfolioHolding[]): PortfolioHolding[] {
  const merged = new Map<
    string,
    { quantity: number; costNotional: number | null; missingCost: boolean; addedAt: string }
  >();

  for (const holding of holdings) {
    const ticker = holding.ticker.trim().toUpperCase();
    if (!ticker) continue;

    const entry = merged.get(ticker) ?? {
      quantity: 0,
      costNotional: null as number | null,
      missingCost: false,
      addedAt: holding.addedAt,
    };
    entry.quantity += holding.quantity;

    if (holding.averageCost !== null && Number.isFinite(holding.averageCost)) {
      entry.costNotional = (entry.costNotional ?? 0) + holding.quantity * holding.averageCost;
    } else {
      entry.missingCost = true;
    }
    if (holding.addedAt < entry.addedAt) entry.addedAt = holding.addedAt;
    merged.set(ticker, entry);
  }

  return [...merged.entries()].map(([ticker, entry]) => ({
    ticker,
    quantity: entry.quantity,
    averageCost:
      entry.costNotional !== null && !entry.missingCost && entry.quantity > 0
        ? Math.round((entry.costNotional / entry.quantity) * 10_000) / 10_000
        : null,
    addedAt: entry.addedAt,
  }));
}

/** Sector used when a ticker is not in the tracked universe. */
const UNCLASSIFIED = "Unclassified";

export type ValuationInput = {
  holdings: PortfolioHolding[];
  /** Latest quotes keyed by upper-case ticker. */
  quotes: Record<string, Quote | undefined>;
  /** Reference data keyed by upper-case ticker. */
  companies: Record<string, Company | undefined>;
};

export function computePortfolioValuation(input: ValuationInput): PortfolioValuation {
  const consolidated = consolidateHoldings(input.holdings);

  const priced: Array<{ position: PortfolioPosition; previousValue: number | null }> = [];
  const unpriced: string[] = [];
  let asOf: string | null = null;

  for (const holding of consolidated) {
    const quote = input.quotes[holding.ticker];
    const company = input.companies[holding.ticker];
    const price = quote?.price ?? null;
    const isPriced = price !== null && Number.isFinite(price) && price > 0;

    if (quote?.asOf && (asOf === null || quote.asOf > asOf)) asOf = quote.asOf;

    // Per-share day move: the source's absolute change, or price − previousClose.
    const perShareChange =
      quote?.change ??
      (price !== null && quote?.previousClose != null ? price - quote.previousClose : null);

    const marketValue = isPriced ? holding.quantity * (price as number) : null;
    const costValue =
      holding.averageCost !== null ? holding.quantity * holding.averageCost : null;
    const unrealised =
      marketValue !== null && costValue !== null ? marketValue - costValue : null;

    const position: PortfolioPosition = {
      ticker: holding.ticker,
      name: company?.name ?? holding.ticker,
      sector: company?.sector ?? UNCLASSIFIED,
      sectorSlug: company?.sectorSlug ?? "unclassified",
      href: company ? `/stocks/${holding.ticker}` : "#",
      quantity: Math.round(holding.quantity * 10_000) / 10_000,
      averageCost: money(holding.averageCost),
      price: isPriced ? money(price) : null,
      priceAsOf: quote?.asOf ?? null,
      marketValue: money(marketValue),
      costValue: money(costValue),
      unrealised: money(unrealised),
      unrealisedPercent:
        unrealised !== null && costValue !== null && costValue > 0
          ? Math.round((unrealised / costValue) * 10_000) / 100
          : null,
      dayChangeValue:
        isPriced && perShareChange !== null ? money(holding.quantity * perShareChange) : null,
      dayChangePercent: quote?.changePercent ?? null,
      weight: null, // filled in once the portfolio total is known
      priced: isPriced,
      unknown: company === undefined,
    };

    if (!isPriced) unpriced.push(holding.ticker);

    if (marketValue !== null) {
      const previousClose = quote?.previousClose ?? null;
      priced.push({
        position,
        previousValue:
          previousClose !== null && previousClose > 0 ? holding.quantity * previousClose : null,
      });
    }
  }

  const totalMarketValue = priced.reduce((total, entry) => total + (entry.position.marketValue ?? 0), 0);
  const hasMarketValue = priced.length > 0 && totalMarketValue > 0;

  // Weights need the total, so they are assigned in a second pass.
  for (const entry of priced) {
    entry.position.weight = hasMarketValue
      ? ratio((entry.position.marketValue ?? 0) / totalMarketValue)
      : null;
  }

  // Cost basis is only meaningful where it was actually entered.
  const covered = priced.filter(
    (entry) => entry.position.costValue !== null && entry.position.marketValue !== null
  );
  const costValue = covered.reduce((total, entry) => total + (entry.position.costValue ?? 0), 0);
  const coveredMarketValue = covered.reduce(
    (total, entry) => total + (entry.position.marketValue ?? 0),
    0
  );
  const unrealised = covered.reduce((total, entry) => total + (entry.position.unrealised ?? 0), 0);

  const dayChangeEntries = priced.filter((entry) => entry.position.dayChangeValue !== null);
  const dayChangeValue = dayChangeEntries.reduce(
    (total, entry) => total + (entry.position.dayChangeValue ?? 0),
    0
  );
  const dayBase = dayChangeEntries.reduce(
    (total, entry) => total + (entry.previousValue ?? 0),
    0
  );

  const notes: string[] = [];
  if (unpriced.length > 0) {
    notes.push(
      `${unpriced.length} of ${consolidated.length} holdings (${unpriced.join(", ")}) could not be priced from the current source and are excluded from every total.`
    );
  }
  if (consolidated.length === 0) {
    notes.push("No holdings submitted.");
  } else if (covered.length === 0) {
    notes.push(
      "No cost basis available for the priced holdings, so unrealised profit and loss is not shown. Add an average cost per holding to see it."
    );
  } else if (hasMarketValue && coveredMarketValue < totalMarketValue - 0.005) {
    const share = Math.round((coveredMarketValue / totalMarketValue) * 100);
    notes.push(
      `Cost basis entered for ${share}% of portfolio value; unrealised figures cover that subset only.`
    );
  }
  if (dayChangeEntries.length > 0 && dayChangeEntries.length < priced.length) {
    notes.push(
      `Day change covers ${dayChangeEntries.length} of ${priced.length} priced holdings — the source reported no previous close for the rest.`
    );
  }
  notes.push(
    "Tracking tool: valuations use the latest price the platform can verify. There is no order entry, brokerage link or cash balance in this model."
  );

  const positions = [
    ...priced.map((entry) => entry.position),
    ...consolidated
      .filter((holding) => !priced.some((entry) => entry.position.ticker === holding.ticker))
      .map((holding) => unpricedPosition(holding, input.companies[holding.ticker])),
  ].sort((a, b) => (b.marketValue ?? -1) - (a.marketValue ?? -1));

  return {
    holdings: consolidated.length,
    pricedHoldings: priced.length,
    unpricedTickers: unpriced,
    marketValue: hasMarketValue ? money(totalMarketValue) : null,
    costValue: covered.length > 0 ? money(costValue) : null,
    costCoverage:
      hasMarketValue && covered.length > 0 ? ratio(coveredMarketValue / totalMarketValue) : null,
    unrealised: covered.length > 0 ? money(unrealised) : null,
    unrealisedPercent:
      covered.length > 0 && costValue > 0
        ? Math.round((unrealised / costValue) * 10_000) / 100
        : null,
    dayChangeValue: dayChangeEntries.length > 0 ? money(dayChangeValue) : null,
    dayChangePercent:
      dayChangeEntries.length > 0 && dayBase > 0
        ? Math.round((dayChangeValue / dayBase) * 10_000) / 100
        : null,
    positions,
    bySector: allocationBy(priced.map((entry) => entry.position), "sector"),
    largestPositions: topPositions(priced.map((entry) => entry.position), 5),
    concentration: concentration(priced.map((entry) => entry.position)),
    asOf,
    notes,
  };
}

/** A position that exists in the holdings list but has no verifiable price. */
function unpricedPosition(holding: PortfolioHolding, company: Company | undefined): PortfolioPosition {
  return {
    ticker: holding.ticker,
    name: company?.name ?? holding.ticker,
    sector: company?.sector ?? UNCLASSIFIED,
    sectorSlug: company?.sectorSlug ?? "unclassified",
    href: company ? `/stocks/${holding.ticker}` : "#",
    quantity: Math.round(holding.quantity * 10_000) / 10_000,
    averageCost: money(holding.averageCost),
    price: null,
    priceAsOf: null,
    marketValue: null,
    costValue: money(holding.averageCost !== null ? holding.quantity * holding.averageCost : null),
    unrealised: null,
    unrealisedPercent: null,
    dayChangeValue: null,
    dayChangePercent: null,
    weight: null,
    priced: false,
    unknown: company === undefined,
  };
}

function allocationBy(
  positions: PortfolioPosition[],
  dimension: "sector"
): PortfolioAllocationSlice[] {
  const buckets = new Map<string, PortfolioAllocationSlice>();
  const total = positions.reduce((sum, position) => sum + (position.marketValue ?? 0), 0);
  if (total <= 0) return [];

  for (const position of positions) {
    const value = position.marketValue ?? 0;
    const key = dimension === "sector" ? position.sectorSlug : position.ticker;
    const label = dimension === "sector" ? position.sector : position.ticker;
    const bucket = buckets.get(key) ?? {
      key,
      label,
      href: dimension === "sector" && position.sectorSlug !== "unclassified" ? `/sectors/${key}` : null,
      value: 0,
      weight: 0,
      holdings: 0,
    };
    bucket.value += value;
    bucket.holdings += 1;
    buckets.set(key, bucket);
  }

  return [...buckets.values()]
    .map((bucket) => ({
      ...bucket,
      value: money(bucket.value) ?? 0,
      weight: ratio(bucket.value / total) ?? 0,
    }))
    .sort((a, b) => b.value - a.value);
}

function topPositions(positions: PortfolioPosition[], limit: number): PortfolioAllocationSlice[] {
  return [...positions]
    .filter((position) => (position.marketValue ?? 0) > 0)
    .sort((a, b) => (b.marketValue ?? 0) - (a.marketValue ?? 0))
    .slice(0, limit)
    .map((position) => ({
      key: position.ticker,
      label: position.ticker,
      href: `/stocks/${position.ticker}`,
      value: money(position.marketValue) ?? 0,
      weight: position.weight ?? 0,
      holdings: 1,
    }));
}

/**
 * Concentration facts: largest weight, Herfindahl–Hirschman index, and how many
 * positions make up half the portfolio. Reported as description only.
 */
function concentration(positions: PortfolioPosition[]): PortfolioConcentration {
  const weights = positions
    .map((position) => position.weight)
    .filter((weight): weight is number => weight !== null);

  if (weights.length === 0) {
    return {
      largestPositionWeight: null,
      largestPositionTicker: null,
      hhi: null,
      positionsToHalf: null,
    };
  }

  const largest = positions
    .filter((position) => position.weight !== null)
    .reduce((best, position) => ((position.weight ?? 0) > (best.weight ?? 0) ? position : best));

  const sorted = [...weights].sort((a, b) => b - a);
  let cumulative = 0;
  let positionsToHalf = 0;
  for (const weight of sorted) {
    cumulative += weight;
    positionsToHalf += 1;
    if (cumulative >= 0.5) break;
  }

  return {
    largestPositionWeight: largest.weight,
    largestPositionTicker: largest.ticker,
    hhi: ratio(weights.reduce((sum, weight) => sum + weight * weight, 0)),
    positionsToHalf,
  };
}
