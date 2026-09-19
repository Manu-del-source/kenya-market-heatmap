/**
 * Return / drawdown / moving-average maths shared by the sector, breadth and
 * historical analytics features.
 *
 * All helpers are pure and defensive: missing data yields `null`, never an
 * invented number. That is what allows the UI to print "Data unavailable"
 * instead of a plausible-looking zero.
 */

export type SeriesPoint = {
  date: string;
  close: number | null;
};

/** Percentage change between two levels. Null when either side is unusable. */
export function percentChange(from: number | null, to: number | null): number | null {
  if (from === null || to === null || !Number.isFinite(from) || !Number.isFinite(to)) {
    return null;
  }
  if (from === 0) return null;
  return ((to - from) / Math.abs(from)) * 100;
}

/**
 * Return over a trailing window, measured from the oldest close at or before
 * `sessionDate - days` to the latest close. Returns null when the history is
 * shorter than the window, so callers can mark the figure unavailable rather
 * than reporting a partial period as if it were complete.
 */
export function trailingReturn(
  bars: SeriesPoint[],
  calendarDays: number,
  minBars = 2
): number | null {
  if (bars.length < minBars) return null;

  const sorted = [...bars].sort((a, b) => a.date.localeCompare(b.date));
  const last = sorted[sorted.length - 1];
  if (!last || last.close === null) return null;

  const cutoff = new Date(last.date);
  if (Number.isNaN(cutoff.getTime())) return null;
  cutoff.setUTCDate(cutoff.getUTCDate() - calendarDays);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  // Oldest bar at or after the cutoff — i.e. the first observation in window.
  const anchor = sorted.find((bar) => bar.date >= cutoffIso);
  if (!anchor || anchor.close === null || anchor.date === last.date) return null;

  return percentChange(anchor.close, last.close);
}

/** Largest peak-to-trough decline over the series, as a positive percentage. */
export function maxDrawdown(bars: SeriesPoint[]): number | null {
  const closes = bars
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => bar.close)
    .filter((close): close is number => close !== null && close > 0);
  if (closes.length < 2) return null;

  let peak = closes[0];
  let worst = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    const decline = ((peak - close) / peak) * 100;
    if (decline > worst) worst = decline;
  }
  return worst;
}

/** Annualised volatility of daily log returns, in percent. */
export function annualisedVolatility(bars: SeriesPoint[]): number | null {
  const closes = bars
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((bar) => bar.close)
    .filter((close): close is number => close !== null && close > 0);
  if (closes.length < 3) return null;

  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    returns.push(Math.log(closes[i] / closes[i - 1]));
  }
  const mean = returns.reduce((sum, value) => sum + value, 0) / returns.length;
  const variance =
    returns.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (returns.length - 1);
  return Math.sqrt(variance * 252) * 100;
}

/** Simple moving average aligned to the input order. */
export function movingAverage(values: Array<number | null>, window: number): Array<number | null> {
  const out: Array<number | null> = [];
  let sum = 0;
  const queue: number[] = [];

  for (const value of values) {
    if (value !== null) {
      queue.push(value);
      sum += value;
      if (queue.length > window) {
        const dropped = queue.shift();
        if (dropped !== undefined) sum -= dropped;
      }
    }
    out.push(queue.length === window ? sum / window : null);
  }
  return out;
}

/**
 * Rebase a set of series to 100 at their first common point so several
 * instruments can be compared on one chart (KCB vs EQTY vs COOP).
 */
export function rebaseToHundred(series: number[][]): number[][] {
  return series.map((values) => {
    const base = values.find((value) => value !== null && value > 0);
    if (!base) return values.map(() => Number.NaN);
    return values.map((value) => (value === null ? Number.NaN : (value / base) * 100));
  });
}

/** Weighted mean, e.g. capitalisation-weighted sector return. */
export function weightedMean(
  values: Array<{ value: number | null; weight: number | null }>
): number | null {
  let numerator = 0;
  let denominator = 0;
  for (const { value, weight } of values) {
    if (value === null || !Number.isFinite(value)) continue;
    const w = weight === null || !Number.isFinite(weight) || weight <= 0 ? 0 : weight;
    numerator += value * w;
    denominator += w;
  }
  // Fall back to an unweighted mean when no usable weights exist, but flag it.
  if (denominator === 0) {
    const usable = values
      .map(({ value }) => value)
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (usable.length === 0) return null;
    return usable.reduce((sum, value) => sum + value, 0) / usable.length;
  }
  return numerator / denominator;
}

/** Count of non-null values — used to report coverage alongside aggregates. */
export function coverage(values: Array<number | null>): number {
  return values.filter((value) => value !== null).length;
}
