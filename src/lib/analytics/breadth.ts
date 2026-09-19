/**
 * Market-breadth maths (Phase 7).
 *
 * Breadth is only meaningful over a complete snapshot. Every function therefore
 * reports how many instruments it could actually evaluate (`coverage`) so the
 * UI can qualify the figure instead of presenting a partial count as the
 * market-wide truth.
 */

import type { BreadthStats } from "@/lib/types/market";

export type BreadthInput = {
  ticker: string;
  changePercent: number | null;
  /** Trailing 52-week high, when the source or history provides it. */
  high52w: number | null;
  low52w: number | null;
  price: number | null;
};

export function computeBreadth(rows: BreadthInput[]): BreadthStats {
  let advancing = 0;
  let declining = 0;
  let unchanged = 0;
  let unpriced = 0;
  let newHighs: number | null = 0;
  let newLows: number | null = 0;
  let highLowCoverage = 0;

  for (const row of rows) {
    const change = row.changePercent;
    if (change === null || !Number.isFinite(change)) {
      unpriced += 1;
      continue;
    }
    if (change > 0) advancing += 1;
    else if (change < 0) declining += 1;
    else unchanged += 1;

    if (
      row.price !== null &&
      row.high52w !== null &&
      row.low52w !== null &&
      Number.isFinite(row.high52w) &&
      Number.isFinite(row.low52w)
    ) {
      highLowCoverage += 1;
      if (row.price >= row.high52w) newHighs += 1;
      if (row.price <= row.low52w) newLows += 1;
    }
  }

  // Without any 52-week reference the new-high/low counts must be reported as
  // unavailable rather than zero — zero would read as "no stock made a high".
  if (highLowCoverage === 0) {
    newHighs = null;
    newLows = null;
  }

  return {
    advancing,
    declining,
    unchanged,
    unpriced,
    advanceDeclineRatio: declining === 0 ? null : advancing / declining,
    newHighs,
    newLows,
    highLowCoverage,
    total: rows.length,
  };
}

/** Sector-level breadth derived from the same inputs, grouped by sector. */
export function computeSectorBreadth(
  rows: Array<BreadthInput & { sector: string }>
): Array<{
  sector: string;
  advancing: number;
  declining: number;
  unchanged: number;
  unpriced: number;
  advanceDeclineRatio: number | null;
}> {
  const groups = new Map<string, BreadthInput[]>();
  for (const row of rows) {
    const list = groups.get(row.sector) ?? [];
    list.push(row);
    groups.set(row.sector, list);
  }

  return [...groups.entries()]
    .map(([sector, list]) => {
      const stats = computeBreadth(list);
      return {
        sector,
        advancing: stats.advancing,
        declining: stats.declining,
        unchanged: stats.unchanged,
        unpriced: stats.unpriced,
        advanceDeclineRatio: stats.advanceDeclineRatio,
      };
    })
    .sort((a, b) => b.advancing - a.advancing || a.sector.localeCompare(b.sector));
}

/** Plain-language qualifier shown next to breadth figures. */
export function breadthCaveat(stats: BreadthStats, labelledUniverse: string): string | null {
  const caveats: string[] = [];
  if (stats.unpriced > 0) {
    caveats.push(
      `${stats.unpriced} of ${stats.total} ${labelledUniverse} had no usable quote in this snapshot.`
    );
  }
  if (stats.newHighs === null) {
    caveats.push("52-week high/low reference unavailable, so new highs and lows are not counted.");
  } else if (stats.highLowCoverage < stats.total) {
    caveats.push(
      `New highs/lows cover ${stats.highLowCoverage} of ${stats.total} ${labelledUniverse}.`
    );
  }
  return caveats.length > 0 ? caveats.join(" ") : null;
}
