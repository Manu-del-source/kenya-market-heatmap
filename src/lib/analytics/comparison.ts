/**
 * Historical comparison maths (Phase 9).
 *
 * Everything here is pure and defensive. The rules that matter for a financial
 * product:
 *
 *  1. **No imputation.** Missing sessions are skipped, never interpolated or
 *     forward-filled. A gap in a line is honest; a fabricated point is not.
 *  2. **No silent zero.** A return that cannot be measured is `null` — the UI
 *     renders `—`. Only a genuinely measured 0.00% is reported as 0.
 *  3. **Normalisation is per series.** Each series is rebased to 100 at its own
 *     first observation inside the aligned window, so a stock that missed the
 *     first session is not silently given that session's move.
 *  4. **Alignment is documented and surfaced.** The window actually used, the
 *     number of shared sessions and any anchor drift are returned to the caller
 *     so they can be shown next to the chart.
 */

import { percentChange } from "./series";

/** One daily observation used by the comparison engine. */
export type Observation = {
  date: string;
  close: number | null;
  /** Intraday extremes, when the source reports them. */
  high?: number | null;
  low?: number | null;
};

export type SeriesMetrics = {
  firstDate: string | null;
  lastDate: string | null;
  observations: number;
  start: number | null;
  end: number | null;
  /** Highest traded price in the window (intraday high, else close). */
  high: number | null;
  /** Lowest traded price in the window (intraday low, else close). */
  low: number | null;
  /** Percentage return start → end. `null` when it cannot be measured. */
  returnPercent: number | null;
  /** Normalised end value when the first observation is the base of 100. */
  normalisedEnd: number | null;
};

const EMPTY_METRICS: SeriesMetrics = {
  firstDate: null,
  lastDate: null,
  observations: 0,
  start: null,
  end: null,
  high: null,
  low: null,
  returnPercent: null,
  normalisedEnd: null,
};

/**
 * Sort ascending, drop observations without a usable close, and remove
 * duplicate dates (last write wins) so a duplicated provider row cannot
 * double-count a session.
 */
export function normaliseObservations(observations: Observation[]): Observation[] {
  const byDate = new Map<string, Observation>();
  for (const observation of observations) {
    if (!observation?.date) continue;
    if (observation.close === null || observation.close === undefined) continue;
    if (!Number.isFinite(observation.close)) continue;
    byDate.set(observation.date, observation);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Rebase a series so its first value equals `base` (100 by convention).
 *
 * Returns all-null when there is no positive anchor — a non-positive price
 * cannot be normalised and pretending otherwise would corrupt the chart.
 */
export function normaliseToBase(
  observations: Observation[],
  base = 100
): Array<{ date: string; value: number }> {
  const cleaned = normaliseObservations(observations);
  if (cleaned.length === 0) return [];

  const anchor = cleaned[0].close;
  if (anchor === null || !Number.isFinite(anchor) || anchor <= 0) return [];

  return cleaned.map((observation) => ({
    date: observation.date,
    value: round2(((observation.close as number) / anchor) * base),
  }));
}

/**
 * Metrics for a single series over an aligned window.
 *
 * - `start` / `end` need one observation.
 * - `returnPercent` needs **two** observations: a single point has no return.
 * - `high` / `low` prefer intraday extremes and are clamped to the closes so a
 *   malformed bar (high below the close) cannot understate the range.
 */
export function seriesMetrics(observations: Observation[]): SeriesMetrics {
  const cleaned = normaliseObservations(observations);
  if (cleaned.length === 0) return { ...EMPTY_METRICS };

  const closes = cleaned.map((observation) => observation.close as number);
  const start = closes[0];
  const end = closes[closes.length - 1];

  const intradayHighs: number[] = [];
  const intradayLows: number[] = [];
  for (const observation of cleaned) {
    if (observation.high !== null && observation.high !== undefined && Number.isFinite(observation.high)) {
      intradayHighs.push(observation.high);
    }
    if (observation.low !== null && observation.low !== undefined && Number.isFinite(observation.low)) {
      intradayLows.push(observation.low);
    }
  }

  const high = Math.max(...closes, ...intradayHighs);
  const low = Math.min(...closes, ...intradayLows);

  return {
    firstDate: cleaned[0].date,
    lastDate: cleaned[cleaned.length - 1].date,
    observations: cleaned.length,
    start,
    end,
    high,
    low,
    returnPercent: cleaned.length < 2 ? null : percentChange(start, end),
    normalisedEnd:
      cleaned.length < 2 || start <= 0 ? null : round2((end / start) * 100),
  };
}

export type AlignmentInput = Record<string, Observation[]>;

export type AlignmentResult = {
  windowStart: string | null;
  windowEnd: string | null;
  /** False when the series have no common window at all. */
  overlapping: boolean;
  /** Dates present in every available series, inside the window. */
  sharedDates: string[];
  /** Dates present in at least one series, inside the window. */
  unionDates: string[];
  /** Each series restricted to the window (may be empty when disjoint). */
  clipped: Record<string, Observation[]>;
  /** Number of sessions between the earliest and latest normalisation base. */
  anchorSpreadSessions: number;
  notes: string[];
};

/**
 * Align several series onto one comparison window.
 *
 * Strategy (documented in docs/comparison.md):
 *
 *  1. Clean and sort every series independently (see `normaliseObservations`).
 *  2. Prefer the **common window**: start at the latest first-observation and
 *     end at the earliest last-observation across the available series. Every
 *     series then has at least one observation inside it, and no series is
 *     credited with a move that happened before it has data.
 *  3. If the common window is empty (the series do not overlap at all), fall
 *     back to the **union window** and flag `overlapping: false`. Series are
 *     still reported individually — they are simply not drawn on a shared axis
 *     in a way that implies comparability.
 *  4. Report the shared/union session counts so incomplete coverage is visible
 *     instead of being hidden behind a smooth chart.
 */
export function alignObservations(input: AlignmentInput): AlignmentResult {
  const entries = Object.entries(input)
    .map(([key, observations]) => ({ key, series: normaliseObservations(observations ?? []) }))
    .filter((entry) => entry.series.length > 0);

  if (entries.length === 0) {
    return {
      windowStart: null,
      windowEnd: null,
      overlapping: false,
      sharedDates: [],
      unionDates: [],
      clipped: {},
      anchorSpreadSessions: 0,
      notes: ["No series had any usable observations in the selected period."],
    };
  }

  const firstDates = entries.map((entry) => entry.series[0].date);
  const lastDates = entries.map((entry) => entry.series[entry.series.length - 1].date);

  const commonStart = firstDates.reduce((max, date) => (date > max ? date : max), firstDates[0]);
  const commonEnd = lastDates.reduce((min, date) => (date < min ? date : min), lastDates[0]);

  const overlapping = commonStart <= commonEnd;
  const windowStart = overlapping
    ? commonStart
    : firstDates.reduce((min, date) => (date < min ? date : min), firstDates[0]);
  const windowEnd = overlapping
    ? commonEnd
    : lastDates.reduce((max, date) => (date > max ? date : max), lastDates[0]);

  const clipped: Record<string, Observation[]> = {};
  const dateSets: Array<Set<string>> = [];
  const union = new Set<string>();

  for (const entry of entries) {
    const inWindow = entry.series.filter(
      (observation) => observation.date >= windowStart && observation.date <= windowEnd
    );
    clipped[entry.key] = inWindow;
    const dates = new Set(inWindow.map((observation) => observation.date));
    dateSets.push(dates);
    for (const date of dates) union.add(date);
  }

  // Sessions present in every series — the strictest reading of "aligned".
  let shared = [...union];
  for (const dates of dateSets) {
    shared = shared.filter((date) => dates.has(date));
  }

  const anchors = Object.values(clipped)
    .map((series) => series[0]?.date)
    .filter((date): date is string => Boolean(date))
    .sort();
  const anchorSpreadSessions =
    anchors.length > 1 ? unionDatesBetween(union, anchors[0], anchors[anchors.length - 1]) : 0;

  const notes: string[] = [];
  if (!overlapping) {
    notes.push(
      "The selected series have no overlapping sessions in this period. Each series is measured on its own available range and the chart should not be read as a like-for-like comparison."
    );
  }
  if (overlapping && shared.length < union.size) {
    notes.push(
      `${union.size - shared.length} of ${union.size} sessions are missing from at least one series. Missing sessions are skipped, not estimated.`
    );
  }
  if (anchorSpreadSessions > 5) {
    notes.push(
      `Normalisation bases differ by ${anchorSpreadSessions} sessions across series, so percentage returns cover slightly different spans.`
    );
  }

  return {
    windowStart,
    windowEnd,
    overlapping,
    sharedDates: shared.sort(),
    unionDates: [...union].sort(),
    clipped,
    anchorSpreadSessions,
    notes,
  };
}

/** Count union dates within [from, to] — used to quantify anchor drift. */
function unionDatesBetween(union: Set<string>, from: string, to: string): number {
  let count = 0;
  for (const date of union) {
    if (date >= from && date <= to) count += 1;
  }
  return count;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build an equal-weighted sector index from constituent series.
 *
 * Each constituent is rebased to 100 at its own first observation inside the
 * window, then the index value on a given date is the mean of the constituents
 * that actually traded that day. No forward fill, no weighting by an
 * unpublished share count — which is exactly why it is labelled a transparent
 * equal-weighted proxy rather than an official NSE sector index.
 */
export function buildEqualWeightIndex(
  constituentSeries: Observation[][]
): Array<{ date: string; value: number; constituents: number }> {
  const cleaned = constituentSeries
    .map((series) => normaliseToBase(series, 100))
    .filter((series) => series.length > 0);

  if (cleaned.length === 0) return [];

  const byDate = new Map<string, { total: number; count: number }>();
  for (const series of cleaned) {
    for (const point of series) {
      const bucket = byDate.get(point.date) ?? { total: 0, count: 0 };
      bucket.total += point.value;
      bucket.count += 1;
      byDate.set(point.date, bucket);
    }
  }

  return [...byDate.entries()]
    .map(([date, bucket]) => ({
      date,
      value: round2(bucket.total / bucket.count),
      constituents: bucket.count,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}
