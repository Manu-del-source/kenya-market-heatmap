"use client";

/**
 * Multi-series comparison chart.
 *
 * Pure inline SVG — no charting library, so the page ships no extra bundle
 * weight and renders on the server. Series are already normalised to 100 by the
 * comparison service; this component only draws them.
 *
 * Honesty rules baked into the rendering:
 *  - Missing sessions break the line (a gap is drawn as a gap, never filled).
 *  - The 100 baseline is drawn, so "above the line" means "ahead of its own
 *    starting point" rather than anything absolute.
 *  - Series with no usable data are listed in the legend as unavailable.
 */

import { useMemo, useRef, useState } from "react";
import { NOT_AVAILABLE, formatDate, formatPercent } from "@/lib/format";
import type { ComparisonSeries } from "@/lib/types/market";

const WIDTH = 760;
const HEIGHT = 260;
const PADDING = { top: 12, right: 12, bottom: 12, left: 12 };
const BASELINE = 100;

type HoverState = { index: number; x: number } | null;

export default function ComparisonChart({
  series,
  unitLabel,
}: {
  series: ComparisonSeries[];
  /** "KES" or "index" — used in the tooltip and the accessible summary. */
  unitLabel: string;
}) {
  const [hover, setHover] = useState<HoverState>(null);
  const plotRef = useRef<HTMLDivElement>(null);

  const available = useMemo(() => series.filter((entry) => entry.available && entry.points.length > 0), [series]);

  /** Shared date axis: every session any series traded, ascending. */
  const dates = useMemo(() => {
    const set = new Set<string>();
    for (const entry of available) {
      for (const point of entry.points) set.add(point.date);
    }
    return [...set].sort();
  }, [available]);

  const valueByKey = useMemo(() => {
    const map = new Map<string, Map<string, number>>();
    for (const entry of available) {
      map.set(entry.key, new Map(entry.points.map((point) => [point.date, point.value])));
    }
    return map;
  }, [available]);

  const geometry = useMemo(() => {
    if (available.length === 0 || dates.length === 0) return null;

    const allValues = available.flatMap((entry) => entry.points.map((point) => point.value));
    let min = Math.min(...allValues, BASELINE);
    let max = Math.max(...allValues, BASELINE);
    const span = max - min || 1;
    min -= span * 0.06;
    max += span * 0.06;

    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;
    const xForIndex = (index: number) =>
      PADDING.left + (dates.length === 1 ? innerW / 2 : (index / (dates.length - 1)) * innerW);
    const yForValue = (value: number) => PADDING.top + (1 - (value - min) / (max - min)) * innerH;

    const paths = available.map((entry) => {
      const map = valueByKey.get(entry.key);
      // Split into sub-paths so a missing session never becomes a straight
      // line that implies a price we do not have.
      const segments: string[] = [];
      let current: string[] = [];
      let previousIndex = -2;

      dates.forEach((date, index) => {
        const value = map?.get(date);
        if (value === undefined) {
          if (current.length > 1) segments.push(current.join(" "));
          current = [];
          previousIndex = -2;
          return;
        }
        const x = xForIndex(index);
        const y = yForValue(value);
        if (current.length === 0 || index !== previousIndex + 1) {
          if (current.length > 1) segments.push(current.join(" "));
          current = [`M${x.toFixed(2)},${y.toFixed(2)}`];
        } else {
          current.push(`L${x.toFixed(2)},${y.toFixed(2)}`);
        }
        previousIndex = index;
      });
      if (current.length > 1) segments.push(current.join(" "));

      return { key: entry.key, color: entry.color, d: segments.join(" ") };
    });

    return {
      min,
      max,
      paths,
      baselineY: yForValue(BASELINE),
      xForIndex,
      yForValue,
    };
  }, [available, dates, valueByKey]);

  const handleMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const element = plotRef.current;
    if (!element || dates.length === 0) return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = (event.clientX - rect.left) / rect.width;
    const index = Math.round(ratio * (dates.length - 1));
    const clamped = Math.min(Math.max(index, 0), dates.length - 1);
    setHover({ index: clamped, x: ratio });
  };

  if (!geometry) {
    return (
      <div className="chart-unavailable">
        Data unavailable — none of the selected items has usable history for this period.
      </div>
    );
  }

  const hoverDate = hover ? dates[hover.index] : null;
  const tooltipLeft = hover ? Math.min(Math.max(hover.x * 100, 6), 94) : 0;

  const summary = available
    .map((entry) => {
      const first = entry.points[0]?.value ?? null;
      const last = entry.points[entry.points.length - 1]?.value ?? null;
      const change = first && last !== null ? ((last - first) / first) * 100 : null;
      return `${entry.label} ${change === null ? "unmeasurable" : `${change >= 0 ? "up" : "down"} ${Math.abs(change).toFixed(1)} percent`}`;
    })
    .join("; ");

  return (
    <div className="compare-chart">
      <div
        className="compare-plot"
        ref={plotRef}
        onPointerMove={handleMove}
        onPointerLeave={() => setHover(null)}
      >
        <svg
          className="compare-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Normalised comparison, base 100. ${summary}. Horizontal axis runs ${formatDate(
            dates[0]
          )} to ${formatDate(dates[dates.length - 1])}. Values are in ${unitLabel === "index" ? "index points" : "KES"}.`}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
            const value = geometry.max - ratio * (geometry.max - geometry.min);
            const y = geometry.yForValue(value);
            return (
              <line
                key={ratio}
                x1={PADDING.left}
                x2={WIDTH - PADDING.right}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.05)"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={geometry.baselineY}
            y2={geometry.baselineY}
            stroke="rgba(148, 163, 184, 0.55)"
            strokeWidth="1"
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />

          {geometry.paths.map((path) => (
            <path
              key={path.key}
              d={path.d}
              fill="none"
              stroke={path.color}
              strokeWidth="1.8"
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
          ))}

          {hover && (
            <line
              x1={geometry.xForIndex(hover.index)}
              x2={geometry.xForIndex(hover.index)}
              y1={PADDING.top}
              y2={HEIGHT - PADDING.bottom}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          )}
        </svg>

        <div className="compare-y-axis" aria-hidden="true">
          <span>{geometry.max.toFixed(0)}</span>
          <span>{geometry.min.toFixed(0)}</span>
        </div>

        {hoverDate && (
          <div
            className="compare-tooltip"
            style={{ left: `${tooltipLeft}%` }}
            role="status"
            aria-live="polite"
          >
            <strong>{formatDate(hoverDate)}</strong>
            <ul>
              {available.map((entry) => {
                const value = valueByKey.get(entry.key)?.get(hoverDate);
                return (
                  <li key={entry.key}>
                    <i style={{ background: entry.color }} />
                    <span>{entry.label}</span>
                    <b>{value === undefined ? "no session" : value.toFixed(1)}</b>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>

      <div className="compare-x-axis">
        <span>{formatDate(dates[0])}</span>
        <span className="compare-x-note">
          base 100 · {dates.length} sessions · dashed line = 100
        </span>
        <span>{formatDate(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}

/** Compact legend: colour, label, measured return, or an explicit unavailable. */
export function ComparisonLegend({ series }: { series: ComparisonSeries[] }) {
  return (
    <ul className="compare-legend">
      {series.map((entry) => {
        const first = entry.points[0]?.value ?? null;
        const last = entry.points[entry.points.length - 1]?.value ?? null;
        const change = first && last !== null ? ((last - first) / first) * 100 : null;
        return (
          <li key={entry.key} className={entry.available ? "" : "muted"}>
            <i style={{ background: entry.available ? entry.color : "#4b5563" }} />
            <span>{entry.label}</span>
            <b className={change === null ? "cell-muted" : change >= 0 ? "green" : "red"}>
              {change === null ? NOT_AVAILABLE : formatPercent(change)}
            </b>
          </li>
        );
      })}
    </ul>
  );
}
