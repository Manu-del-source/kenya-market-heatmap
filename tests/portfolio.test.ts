/**
 * Phase 12 — portfolio valuation.
 *
 * The rules under test are the ones that keep a tracking tool honest: no
 * invented price, no zero that stands in for "unknown", apples-to-apples cost
 * basis, and allocation that is described rather than prescribed.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  computePortfolioValuation,
  consolidateHoldings,
} from "../src/lib/analytics/portfolio";
import { parsePortfolioHoldings, ValidationError } from "../src/lib/validation";
import type { Company, Quote } from "../src/lib/types/market";
import type { PortfolioHolding } from "../src/lib/types/portfolio";

const company = (ticker: string, sector = "Banking", sectorSlug = "banking"): Company => ({
  id: ticker,
  ticker,
  name: `${ticker} Name`,
  sector,
  sectorSlug,
  industry: sector,
  description: null,
  logoUrl: null,
  sharesOutstanding: null,
  marketCap: null,
  listingStatus: "listed",
  currency: "KES",
  country: "KE",
  crossListing: false,
  isin: null,
});

const quote = (
  ticker: string,
  price: number | null,
  change: number | null = null,
  previousClose: number | null = null
): Quote => ({
  ticker,
  price,
  previousClose,
  change,
  changePercent:
    change !== null && previousClose !== null && previousClose !== 0
      ? (change / previousClose) * 100
      : null,
  dayHigh: null,
  dayLow: null,
  volume: 1000,
  turnover: null,
  marketCap: null,
  asOf: "2026-09-19T15:00:00+03:00",
  sessionDate: "2026-09-19",
});

const holding = (
  ticker: string,
  quantity: number,
  averageCost: number | null = null
): PortfolioHolding => ({
  ticker,
  quantity,
  averageCost,
  addedAt: "2026-01-01T00:00:00.000Z",
});

const value = (
  holdings: PortfolioHolding[],
  quotes: Quote[],
  companies: Company[] = quotes.map((entry) => company(entry.ticker))
) =>
  computePortfolioValuation({
    holdings,
    quotes: Object.fromEntries(quotes.map((entry) => [entry.ticker, entry])),
    companies: Object.fromEntries(companies.map((entry) => [entry.ticker, entry])),
  });

/* ------------------------------------------------------------------ *
 * Consolidation
 * ------------------------------------------------------------------ */

test("duplicate tickers merge, with a quantity-weighted average cost", () => {
  const merged = consolidateHoldings([
    holding("KCB", 100, 40),
    holding("KCB", 300, 50),
  ]);

  assert.equal(merged.length, 1);
  assert.equal(merged[0].quantity, 400);
  assert.equal(merged[0].averageCost, 47.5, "(100×40 + 300×50) / 400");
});

test("merging a lot without a cost yields no average cost — it does not invent one", () => {
  // 100 shares at 40 plus 100 shares at an unknown price: the average cost of
  // the merged 200 is genuinely unknown, so it must not become 20.
  const merged = consolidateHoldings([holding("KCB", 100, 40), holding("KCB", 100, null)]);
  assert.equal(merged[0].quantity, 200);
  assert.equal(merged[0].averageCost, null);

  const noBasis = consolidateHoldings([holding("SCOM", 100, null), holding("SCOM", 100, null)]);
  assert.equal(noBasis[0].averageCost, null);
});

/* ------------------------------------------------------------------ *
 * Valuation
 * ------------------------------------------------------------------ */

test("market value, weights and sector allocation add up", () => {
  const result = value(
    [holding("KCB", 1000), holding("EQTY", 500), holding("SCOM", 2000)],
    [quote("KCB", 40), quote("EQTY", 60), quote("SCOM", 25)]
  );

  assert.equal(result.marketValue, 40_000 + 30_000 + 50_000);
  assert.equal(result.pricedHoldings, 3);
  assert.deepEqual(result.unpricedTickers, []);

  const weights: number[] = result.positions
    .map((position) => position.weight)
    .filter((weight): weight is number => weight !== null);
  assert.equal(weights.length, 3);
  assert.ok(Math.abs(weights.reduce((total, weight) => total + weight, 0) - 1) < 1e-6);

  const bySector = result.bySector;
  assert.equal(bySector.length, 1);
  assert.equal(bySector[0].holdings, 3);
  assert.ok(Math.abs(bySector[0].weight - 1) < 1e-9);
});

test("an unpriced holding is excluded from totals and named, never valued at zero", () => {
  const result = value(
    [holding("KCB", 1000), holding("UNPRICED", 500)],
    [quote("KCB", 40)]
  );

  assert.equal(result.marketValue, 40_000, "only the priced position counts");
  assert.equal(result.pricedHoldings, 1);
  assert.deepEqual(result.unpricedTickers, ["UNPRICED"]);

  const unpriced = result.positions.find((position) => position.ticker === "UNPRICED");
  assert.ok(unpriced);
  assert.equal(unpriced.marketValue, null);
  assert.equal(unpriced.weight, null);
  assert.equal(unpriced.priced, false);
  assert.ok(
    result.notes.some((note) => note.includes("could not be priced")),
    "the exclusion must be stated, not implied"
  );
});

test("a null quote price is treated as unpriced, not as zero", () => {
  const result = value([holding("KCB", 100)], [quote("KCB", null)]);
  assert.equal(result.marketValue, null);
  assert.equal(result.pricedHoldings, 0);
  assert.deepEqual(result.unpricedTickers, ["KCB"]);
});

test("no cost basis means no unrealised figure — never 0", () => {
  const result = value([holding("KCB", 1000, null)], [quote("KCB", 40, 2, 38)]);

  assert.equal(result.costValue, null);
  assert.equal(result.unrealised, null);
  assert.equal(result.unrealisedPercent, null);
  assert.ok(result.notes.some((note) => note.includes("No cost basis available")));

  const position = result.positions[0];
  assert.equal(position.costValue, null);
  assert.equal(position.unrealised, null);
});

test("unrealised P/L is measured on the cost-covered subset and coverage is stated", () => {
  // KCB has a basis; SCOM does not. Only KCB feeds the P/L figures.
  const result = value(
    [holding("KCB", 1000, 30), holding("SCOM", 1000, null)],
    [quote("KCB", 40), quote("SCOM", 25)]
  );

  assert.equal(result.marketValue, 65_000);
  assert.equal(result.costValue, 30_000, "basis only where it was entered");
  assert.equal(result.unrealised, 10_000);
  assert.ok(result.unrealisedPercent !== null);
  assert.ok(Math.abs(result.unrealisedPercent - 33.33) < 0.01);
  assert.ok(result.costCoverage !== null && result.costCoverage < 1);
  assert.ok(
    result.notes.some((note) => note.includes("Cost basis entered for")),
    "partial cost coverage must be disclosed"
  );
});

test("a losing position reports a negative unrealised figure", () => {
  const result = value([holding("KCB", 100, 50)], [quote("KCB", 42)]);
  assert.equal(result.unrealised, -800);
  assert.ok((result.unrealisedPercent ?? 0) < 0);
});

test("day change uses the quote's absolute change and the previous-close base", () => {
  const result = value(
    [holding("KCB", 100, 40), holding("EQTY", 100, 40)],
    [quote("KCB", 42, 2, 40), quote("EQTY", 38, -2, 40)]
  );

  assert.equal(result.dayChangeValue, 0, "gains and losses offset");
  assert.ok(result.dayChangePercent !== null);
  assert.ok(Math.abs(result.dayChangePercent) < 1e-9);
});

test("day change is unmeasurable when the source reports no change", () => {
  const result = value([holding("KCB", 100)], [quote("KCB", 40, null, null)]);
  assert.equal(result.dayChangeValue, null);
  assert.equal(result.dayChangePercent, null);
});

test("an unknown ticker is flagged rather than dropped", () => {
  const result = value([holding("NOPE", 10)], []);
  const position = result.positions[0];
  assert.equal(position.unknown, true);
  assert.equal(position.sector, "Unclassified");
  assert.equal(position.priced, false);
});

test("an empty portfolio is reported, not guessed", () => {
  const result = value([], []);
  assert.equal(result.holdings, 0);
  assert.equal(result.marketValue, null);
  assert.equal(result.costValue, null);
  assert.equal(result.positions.length, 0);
  assert.ok(result.notes.some((note) => note.includes("No holdings submitted")));
});

/* ------------------------------------------------------------------ *
 * Concentration (descriptive only)
 * ------------------------------------------------------------------ */

test("concentration facts describe the allocation", () => {
  const result = value(
    [holding("KCB", 900), holding("EQTY", 100)],
    [quote("KCB", 100), quote("EQTY", 100)]
  );

  const { largestPositionWeight, largestPositionTicker, hhi, positionsToHalf } =
    result.concentration;

  assert.equal(largestPositionTicker, "KCB");
  assert.ok(largestPositionWeight !== null && Math.abs(largestPositionWeight - 0.9) < 1e-4);
  assert.ok(hhi !== null && hhi > 0.8, "HHI approaches 1 for a concentrated book");
  assert.equal(positionsToHalf, 1, "one position already exceeds half the value");
});

test("an even book reports a low concentration index", () => {
  const result = value(
    [holding("KCB", 100), holding("EQTY", 100), holding("SCOM", 100), holding("COOP", 100)],
    [quote("KCB", 50), quote("EQTY", 50), quote("SCOM", 50), quote("COOP", 50)]
  );

  assert.ok(result.concentration.hhi !== null && Math.abs(result.concentration.hhi - 0.25) < 1e-4);
  assert.equal(result.concentration.positionsToHalf, 2);
});

/* ------------------------------------------------------------------ *
 * Input validation
 * ------------------------------------------------------------------ */

test("valid holdings are accepted and normalised", () => {
  const parsed = parsePortfolioHoldings({
    holdings: [{ ticker: "kcb", quantity: 100, averageCost: "41.25" }],
  });

  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].ticker, "KCB");
  assert.equal(parsed[0].quantity, 100);
  assert.equal(parsed[0].averageCost, 41.25);
  assert.ok(parsed[0].addedAt.length > 0);
});

test("a blank average cost becomes null, not zero", () => {
  const parsed = parsePortfolioHoldings({
    holdings: [{ ticker: "KCB", quantity: 10, averageCost: "" }],
  });
  assert.equal(parsed[0].averageCost, null);
});

test("invalid submissions are rejected with a specific message", () => {
  assert.throws(() => parsePortfolioHoldings(null), ValidationError);
  assert.throws(() => parsePortfolioHoldings({}), ValidationError);
  assert.throws(
    () => parsePortfolioHoldings({ holdings: [{ ticker: "KCB", quantity: 0 }] }),
    /quantity must be a positive number/
  );
  assert.throws(
    () => parsePortfolioHoldings({ holdings: [{ ticker: "KCB", quantity: -5 }] }),
    ValidationError
  );
  assert.throws(
    () => parsePortfolioHoldings({ holdings: [{ ticker: "BAD!", quantity: 5 }] }),
    /invalid ticker/
  );
  assert.throws(
    () => parsePortfolioHoldings({ holdings: [{ ticker: "KCB", quantity: 5, averageCost: -1 }] }),
    /average cost must be zero or more/
  );
  assert.throws(
    () =>
      parsePortfolioHoldings({
        holdings: Array.from({ length: 61 }, () => ({ ticker: "KCB", quantity: 1 })),
      }),
    /Maximum is 60/
  );
});
