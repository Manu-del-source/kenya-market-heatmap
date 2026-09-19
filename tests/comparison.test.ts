/**
 * Phase 9 — historical comparison.
 *
 * These tests are the guardrails the comparison engine is built around: no
 * imputation, no silent zero, explicit alignment, and a documented fallback
 * when series simply do not overlap.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  alignObservations,
  buildEqualWeightIndex,
  normaliseObservations,
  normaliseToBase,
  seriesMetrics,
  type Observation,
} from "../src/lib/analytics/comparison";
import {
  normaliseSlugs,
  normaliseTickers,
  periodStart,
} from "../src/lib/services/comparison-service";
import {
  parseComparePeriod,
  parseCompareSlugs,
  parseCompareTickers,
  ValidationError,
} from "../src/lib/validation";
import type { ComparePeriod } from "../src/lib/types/market";

const close = (date: string, value: number): Observation => ({ date, close: value });
const bar = (
  date: string,
  value: number,
  high?: number,
  low?: number
): Observation => ({ date, close: value, high: high ?? null, low: low ?? null });

/* ------------------------------------------------------------------ *
 * Cleaning and normalisation
 * ------------------------------------------------------------------ */

test("observations are sorted, de-duplicated and stripped of unusable closes", () => {
  const cleaned = normaliseObservations([
    close("2024-01-03", 30),
    close("2024-01-01", 10),
    { date: "2024-01-02", close: null },
    close("2024-01-03", 31), // duplicate date: last write wins
    { date: "2024-01-04", close: Number.NaN },
    close("2024-01-05", 20),
  ]);

  assert.deepEqual(
    cleaned.map((observation) => [observation.date, observation.close]),
    [
      ["2024-01-01", 10],
      ["2024-01-03", 31],
      ["2024-01-05", 20],
    ]
  );
});

test("normalisation rebases the first observation to 100", () => {
  const points = normaliseToBase([close("2024-01-01", 200), close("2024-01-02", 250)]);
  assert.deepEqual(points, [
    { date: "2024-01-01", value: 100 },
    { date: "2024-01-02", value: 125 },
  ]);
});

test("a non-positive anchor cannot be normalised — it yields no points, not zeros", () => {
  assert.deepEqual(normaliseToBase([close("2024-01-01", 0), close("2024-01-02", 5)]), []);
  assert.deepEqual(normaliseToBase([]), []);
});

/* ------------------------------------------------------------------ *
 * Metrics
 * ------------------------------------------------------------------ */

test("a single observation has no measurable return", () => {
  const metrics = seriesMetrics([close("2024-01-01", 42)]);
  assert.equal(metrics.observations, 1);
  assert.equal(metrics.start, 42);
  assert.equal(metrics.end, 42);
  assert.equal(metrics.returnPercent, null, "one point cannot express a return");
  assert.equal(metrics.normalisedEnd, null);
});

test("identical start and end is a 0% return, not an unmeasurable one", () => {
  const metrics = seriesMetrics([
    close("2024-01-01", 50),
    close("2024-01-02", 61),
    close("2024-01-03", 50),
  ]);
  assert.equal(metrics.returnPercent, 0);
  assert.equal(metrics.normalisedEnd, 100);
});

test("negative returns stay negative", () => {
  const metrics = seriesMetrics([close("2024-01-01", 100), close("2024-02-01", 72.5)]);
  assert.ok(metrics.returnPercent !== null);
  assert.ok(Math.abs(metrics.returnPercent + 27.5) < 1e-9);
  assert.equal(metrics.normalisedEnd, 72.5);
});

test("high and low prefer intraday extremes and never contradict the closes", () => {
  const metrics = seriesMetrics([
    bar("2024-01-01", 100, 102, 98),
    bar("2024-01-02", 110, 108, 96), // malformed: high below its own close
    bar("2024-01-03", 90, 95, 88),
  ]);

  assert.equal(metrics.high, 110, "close wins over a malformed intraday high");
  assert.equal(metrics.low, 88);
});

test("an empty series reports every metric as null", () => {
  const metrics = seriesMetrics([]);
  assert.equal(metrics.start, null);
  assert.equal(metrics.end, null);
  assert.equal(metrics.high, null);
  assert.equal(metrics.low, null);
  assert.equal(metrics.returnPercent, null);
  assert.equal(metrics.firstDate, null);
});

/* ------------------------------------------------------------------ *
 * Alignment
 * ------------------------------------------------------------------ */

test("alignment uses the common window and reports shared sessions", () => {
  const alignment = alignObservations({
    A: [close("2024-01-01", 100), close("2024-01-02", 110), close("2024-01-03", 120)],
    B: [close("2024-01-02", 50), close("2024-01-03", 55)],
  });

  assert.equal(alignment.overlapping, true);
  assert.equal(alignment.windowStart, "2024-01-02", "starts at the later first observation");
  assert.equal(alignment.windowEnd, "2024-01-03");
  assert.deepEqual(alignment.sharedDates, ["2024-01-02", "2024-01-03"]);
  assert.equal(alignment.clipped.A.length, 2);
  assert.equal(alignment.clipped.B.length, 2);
});

test("an interior gap is skipped, not filled", () => {
  const alignment = alignObservations({
    A: [close("2024-01-01", 100), close("2024-01-02", 110), close("2024-01-03", 120)],
    B: [close("2024-01-01", 50), close("2024-01-03", 55)],
  });

  assert.deepEqual(alignment.sharedDates, ["2024-01-01", "2024-01-03"]);
  assert.equal(alignment.unionDates.length, 3);
  assert.ok(
    alignment.notes.some((note) => note.includes("Missing sessions are skipped")),
    "partial coverage must be stated"
  );
});

test("disjoint series fall back to the union window and say so", () => {
  const alignment = alignObservations({
    A: [close("2021-01-01", 100), close("2021-06-01", 110)],
    B: [close("2024-01-01", 50), close("2024-06-01", 55)],
  });

  assert.equal(alignment.overlapping, false);
  assert.equal(alignment.windowStart, "2021-01-01");
  assert.equal(alignment.windowEnd, "2024-06-01");
  assert.ok(alignment.notes.some((note) => note.includes("no overlapping sessions")));
});

test("anchor drift is quantified when normalisation bases differ", () => {
  // B trades every session from 02 Jan; A is missing the start of the common
  // window, so its 100 base lands a week later than B's.
  const bSeries: Observation[] = [];
  for (let day = 2; day <= 20; day += 1) {
    bSeries.push(close(`2024-01-${String(day).padStart(2, "0")}`, 50 + day));
  }

  const alignment = alignObservations({
    A: [close("2024-01-01", 100), close("2024-01-09", 110), close("2024-01-20", 120)],
    B: bSeries,
  });

  assert.equal(alignment.windowStart, "2024-01-02");
  assert.ok(alignment.anchorSpreadSessions > 5);
  assert.ok(alignment.notes.some((note) => note.includes("Normalisation bases differ")));
});

test("alignment of nothing at all is reported, never guessed", () => {
  const alignment = alignObservations({ A: [], B: [{ date: "2024-01-01", close: null }] });
  assert.equal(alignment.windowStart, null);
  assert.equal(alignment.overlapping, false);
  assert.equal(alignment.sharedDates.length, 0);
});

/* ------------------------------------------------------------------ *
 * Equal-weighted sector index
 * ------------------------------------------------------------------ */

test("the sector index averages only the constituents that traded each session", () => {
  // A: 100 → 110 (+10%) → 120 (+20%). B: 200 → 200 (0%), missing 02 Jan.
  const index = buildEqualWeightIndex([
    [close("2024-01-01", 100), close("2024-01-02", 110), close("2024-01-03", 120)],
    [close("2024-01-01", 200), close("2024-01-03", 200)],
  ]);

  assert.deepEqual(index, [
    { date: "2024-01-01", value: 100, constituents: 2 },
    // B did not trade, so the level is A alone — no forward fill of B's price.
    { date: "2024-01-02", value: 110, constituents: 1 },
    { date: "2024-01-03", value: 110, constituents: 2 }, // (120 + 100) / 2
  ]);
});

test("an index with no priced constituents is empty rather than flat", () => {
  assert.deepEqual(buildEqualWeightIndex([]), []);
  assert.deepEqual(buildEqualWeightIndex([[], []]), []);
});

/* ------------------------------------------------------------------ *
 * Selection normalisation and validation
 * ------------------------------------------------------------------ */

test("selections are de-duplicated, upper-cased and capped", () => {
  assert.deepEqual(normaliseTickers(["kcb", "KCB", " scoM "]), ["KCB", "SCOM"]);
  assert.equal(normaliseTickers(["A", "B", "C", "D", "E", "F", "G"]).length, 5);
  assert.deepEqual(normaliseSlugs(["Banking", "banking", "insurance"]), ["banking", "insurance"]);
});

test("comparison input is rejected rather than silently truncated", () => {
  assert.throws(() => parseCompareTickers("KCB,SCOM,SBK,EQTY,ABSA,COOP"), ValidationError);
  assert.throws(() => parseCompareTickers(""), ValidationError);
  assert.throws(() => parseCompareTickers("KCB,BAD!TICKER"), ValidationError);
  assert.throws(() => parseCompareSlugs("banking,Not A Slug"), ValidationError);
  assert.deepEqual(parseCompareTickers("kcb,kcb,scom"), ["KCB", "SCOM"]);
});

test("comparison periods are validated against the closed set", () => {
  assert.equal(parseComparePeriod("3Y"), "3Y");
  assert.equal(parseComparePeriod(null), "1Y", "a sensible default for an omitted period");
  assert.throws(() => parseComparePeriod("10Y"), ValidationError);
});

test("period windows cover the documented number of calendar days", () => {
  const to = "2026-09-19";
  assert.equal(periodStart("1M", to), "2026-08-20");
  assert.equal(periodStart("3Y", to), "2023-09-20");
  const five: ComparePeriod = "5Y";
  assert.equal(periodStart(five, to), "2021-09-20");
});

/* ------------------------------------------------------------------ *
 * Service integration (demo provider, in-memory store)
 * ------------------------------------------------------------------ */

test("compareStocks returns base-100 series, measured rows, and provenance", async () => {
  const { compareStocks } = await import("../src/lib/services/comparison-service");
  const { meta, data } = await compareStocks({
    tickers: ["KCB", "EQTY", "SCOM"],
    period: "1Y",
  });

  assert.equal(data.requestedCount, 3);
  assert.equal(data.unit, "KES");
  assert.ok(data.availableCount >= 1, "at least the sample provider should resolve");
  assert.ok(meta.dataMode.length > 0, "provenance must state the data mode");
  assert.ok(meta.limitations.length > 0);

  for (const series of data.series) {
    if (!series.available) continue;
    assert.equal(
      series.points[0].value,
      100,
      `${series.key} must be rebased to 100 at its own first session`
    );
    assert.ok(series.points.length > 1);
    for (const point of series.points) {
      assert.ok(Number.isFinite(point.value));
    }
  }

  const row = data.summary.find((entry) => entry.available);
  assert.ok(row);
  assert.equal(row.normalisedStart, 100);
  assert.notEqual(row.returnPercent, null);
  assert.ok(row.observations > 1);
  assert.ok(row.coverageRatio !== null && row.coverageRatio > 0);
});

test("an unknown ticker is reported as unavailable, never as zero", async () => {
  const { compareStocks } = await import("../src/lib/services/comparison-service");
  const { data } = await compareStocks({ tickers: ["ZZZZ"], period: "6M" });

  assert.equal(data.availableCount, 0);
  const row = data.summary[0];
  assert.equal(row.available, false);
  assert.equal(row.start, null);
  assert.equal(row.end, null);
  assert.equal(row.returnPercent, null, "no data means no return, not a 0% return");
  assert.equal(row.observations, 0);
  assert.ok(row.reason && row.reason.length > 0);
});

test("compareSectors builds an equal-weighted index with constituent coverage", async () => {
  const { compareSectors } = await import("../src/lib/services/comparison-service");
  const { data } = await compareSectors({
    slugs: ["banking", "insurance"],
    period: "1Y",
  });

  assert.equal(data.unit, "index");
  assert.equal(data.requestedCount, 2);
  assert.ok(data.availableCount >= 1);

  const row = data.summary.find((entry) => entry.available);
  assert.ok(row);
  assert.ok(row.constituents !== null && row.constituents > 0);
  assert.ok(row.constituentsWithData !== null && row.constituentsWithData > 0);
  assert.equal(row.normalisedStart, 100);

  const series = data.series.find((entry) => entry.available);
  assert.ok(series && series.points[0].value === 100);
});

test("a 3Y comparison resolves even though 3Y is not a chart range", async () => {
  const { compareStocks } = await import("../src/lib/services/comparison-service");
  const { data } = await compareStocks({ tickers: ["KCB", "EQTY"], period: "3Y" });

  assert.equal(data.period, "3Y");
  const rows = data.summary.filter((entry) => entry.available);
  assert.ok(rows.length >= 1);
  for (const row of rows) {
    assert.ok(
      (row.observations ?? 0) > 100,
      "a three-year window should contain well over 100 sessions"
    );
  }
});
