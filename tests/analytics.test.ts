import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  annualisedVolatility,
  maxDrawdown,
  movingAverage,
  percentChange,
  rebaseToHundred,
  trailingReturn,
  weightedMean,
} from "../src/lib/analytics/series";
import { breadthCaveat, computeBreadth, computeSectorBreadth } from "../src/lib/analytics/breadth";

const series = (values: Array<[string, number | null]>) =>
  values.map(([date, close]) => ({ date, close }));

describe("percentChange", () => {
  it("computes signed percentage change", () => {
    assert.ok(Math.abs((percentChange(100, 102.41) ?? 0) - 2.41) < 1e-9);
    assert.equal(percentChange(100, 95), -5);
  });

  it("returns null rather than inventing a value", () => {
    assert.equal(percentChange(null, 10), null);
    assert.equal(percentChange(10, null), null);
    assert.equal(percentChange(0, 10), null);
  });
});

describe("trailingReturn", () => {
  it("measures the return across the window", () => {
    const bars = series([
      ["2026-01-01", 100],
      ["2026-01-02", 105],
      ["2026-01-05", 110],
    ]);
    assert.equal(trailingReturn(bars, 7), 10);
  });

  it("returns null when history is too short", () => {
    assert.equal(trailingReturn(series([["2026-01-01", 100]]), 7), null);
    assert.equal(trailingReturn([], 7), null);
  });

  it("returns null when the latest close is missing", () => {
    const bars = series([
      ["2026-01-01", 100],
      ["2026-01-05", null],
    ]);
    assert.equal(trailingReturn(bars, 7), null);
  });
});

describe("maxDrawdown", () => {
  it("reports the worst peak-to-trough decline as a positive percentage", () => {
    const bars = series([
      ["2026-01-01", 100],
      ["2026-01-02", 120],
      ["2026-01-03", 90],
      ["2026-01-04", 130],
    ]);
    assert.equal(maxDrawdown(bars), 25);
  });

  it("returns null with fewer than two points", () => {
    assert.equal(maxDrawdown(series([["2026-01-01", 100]])), null);
  });
});

describe("annualisedVolatility", () => {
  it("returns a positive percentage for a moving series", () => {
    const bars = Array.from({ length: 60 }, (_, index) => [
      `2026-01-${String((index % 28) + 1).padStart(2, "0")}`,
      100 + (index % 5) - 2,
    ] as [string, number]);
    const value = annualisedVolatility(series(bars));
    assert.ok(value !== null && value > 0);
  });

  it("returns null for very short series", () => {
    assert.equal(annualisedVolatility(series([["2026-01-01", 100]])), null);
  });
});

describe("movingAverage", () => {
  it("emits null until the window is full", () => {
    const result = movingAverage([1, 2, 3, 4], 3);
    assert.deepEqual(result, [null, null, 2, 3]);
  });
});

describe("rebaseToHundred", () => {
  it("rebases each series to its own first point", () => {
    const [a, b] = rebaseToHundred([
      [50, 100],
      [200, 100],
    ]);
    assert.equal(a[0], 100);
    assert.equal(a[1], 200);
    assert.equal(b[0], 100);
    assert.equal(b[1], 50);
  });
});

describe("weightedMean", () => {
  it("weights by capitalisation when weights exist", () => {
    const value = weightedMean([
      { value: 10, weight: 900 },
      { value: 0, weight: 100 },
    ]);
    assert.equal(value, 9);
  });

  it("falls back to an unweighted mean when all weights are missing", () => {
    const value = weightedMean([
      { value: 10, weight: null },
      { value: 20, weight: 0 },
    ]);
    assert.equal(value, 15);
  });

  it("returns null when there is nothing to average", () => {
    assert.equal(weightedMean([]), null);
  });
});

describe("computeBreadth", () => {
  it("counts advancing, declining and unchanged", () => {
    const stats = computeBreadth([
      { ticker: "A", changePercent: 1, price: 10, high52w: 12, low52w: 8 },
      { ticker: "B", changePercent: -2, price: 10, high52w: 12, low52w: 8 },
      { ticker: "C", changePercent: 0, price: 10, high52w: 12, low52w: 8 },
    ]);
    assert.equal(stats.advancing, 1);
    assert.equal(stats.declining, 1);
    assert.equal(stats.unchanged, 1);
    assert.equal(stats.advanceDeclineRatio, 1);
  });

  it("counts instruments with no usable quote as unpriced", () => {
    const stats = computeBreadth([
      { ticker: "A", changePercent: null, price: null, high52w: null, low52w: null },
    ]);
    assert.equal(stats.unpriced, 1);
    assert.equal(stats.total, 1);
  });

  it("reports new highs/lows as null — not zero — without a 52-week reference", () => {
    const stats = computeBreadth([
      { ticker: "A", changePercent: 1, price: 10, high52w: null, low52w: null },
    ]);
    assert.equal(stats.newHighs, null);
    assert.equal(stats.newLows, null);
    assert.equal(stats.highLowCoverage, 0);
    assert.match(breadthCaveat(stats, "companies") ?? "", /unavailable/);
  });

  it("returns a null advance/decline ratio when nothing declined", () => {
    const stats = computeBreadth([
      { ticker: "A", changePercent: 1, price: 10, high52w: null, low52w: null },
    ]);
    assert.equal(stats.advanceDeclineRatio, null);
  });

  it("counts 52-week highs and lows when a reference exists", () => {
    const stats = computeBreadth([
      { ticker: "A", changePercent: 1, price: 12, high52w: 12, low52w: 8 },
      { ticker: "B", changePercent: -1, price: 8, high52w: 12, low52w: 8 },
    ]);
    assert.equal(stats.newHighs, 1);
    assert.equal(stats.newLows, 1);
  });
});

describe("computeSectorBreadth", () => {
  it("groups breadth by sector", () => {
    const groups = computeSectorBreadth([
      { ticker: "A", changePercent: 1, price: 1, high52w: null, low52w: null, sector: "Banking" },
      { ticker: "B", changePercent: -1, price: 1, high52w: null, low52w: null, sector: "Banking" },
      { ticker: "C", changePercent: 2, price: 1, high52w: null, low52w: null, sector: "Insurance" },
    ]);
    const banking = groups.find((group) => group.sector === "Banking");
    assert.equal(banking?.advancing, 1);
    assert.equal(banking?.declining, 1);
    assert.equal(groups.length, 2);
  });
});
