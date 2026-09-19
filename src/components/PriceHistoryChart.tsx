"use client";

/**
 * Historical price chart.
 *
 * Fetches `/api/stocks/[ticker]/history?range=` client-side so switching range
 * never re-renders the whole page. Renders as inline SVG — no charting library,
 * no extra bundle weight, works on low-bandwidth connections.
 *
 * When the source has no intraday data the 1D button is annotated and the chart
 * states that it is showing end-of-day closes.
 */

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { HISTORY_RANGES, type HistoryRange, type PriceBar } from "@/lib/types/market";
import { formatCompactNumber, formatPercent, formatPrice } from "@/lib/format";

type ChartResponse = {
  data: {
    bars: PriceBar[];
    range: HistoryRange;
    interval: "1d" | "1h" | "5m";
    intradayAvailable: boolean;
    coverage: number;
    stats: {
      maxDrawdownPercent: number | null;
      annualisedVolatilityPercent: number | null;
      firstClose: number | null;
      lastClose: number | null;
    };
  };
};

const WIDTH = 720;
const PRICE_HEIGHT = 220;
const VOLUME_HEIGHT = 46;
const PADDING = { top: 14, right: 14, bottom: 20, left: 14 };

export default function PriceHistoryChart({
  ticker,
  initialRange = "3M",
}: {
  ticker: string;
  initialRange?: HistoryRange;
}) {
  const [range, setRange] = useState<HistoryRange>(initialRange);
  const [bars, setBars] = useState<PriceBar[] | null>(null);
  const [stats, setStats] = useState<ChartResponse["data"]["stats"] | null>(null);
  const [intradayAvailable, setIntradayAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const gradientId = useId();

  const load = useCallback(
    async (next: HistoryRange) => {
      setLoading(true);
      setError(null);
      try {
        const response = await fetch(
          `/api/stocks/${encodeURIComponent(ticker)}/history?range=${next}`,
          { cache: "no-store" }
        );
        if (!response.ok) throw new Error(`History unavailable (${response.status})`);
        const payload = (await response.json()) as ChartResponse;
        setBars(payload.data.bars);
        setStats(payload.data.stats);
        setIntradayAvailable(payload.data.intradayAvailable);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "History unavailable");
        setBars([]);
      } finally {
        setLoading(false);
      }
    },
    [ticker]
  );

  useEffect(() => {
    // Data fetching is a legitimate use of an effect: this keeps the chart in
    // sync with the selected range. The `setState` calls inside `load` run after
    // the network round-trip resolves, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(range);
  }, [load, range]);

  const geometry = useMemo(() => {
    if (!bars || bars.length === 0) return null;

    const closes = bars.map((bar) => bar.close ?? bar.adjustedClose).filter((v): v is number => v !== null);
    if (closes.length === 0) return null;

    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const span = max - min || 1;
    const innerW = WIDTH - PADDING.left - PADDING.right;
    const priceInnerH = PRICE_HEIGHT - PADDING.top - PADDING.bottom;

    const points = bars
      .map((bar, index) => {
        const value = bar.close ?? bar.adjustedClose;
        if (value === null) return null;
        return {
          x: PADDING.left + (bars.length === 1 ? innerW / 2 : (index / (bars.length - 1)) * innerW),
          y: PADDING.top + (1 - (value - min) / span) * priceInnerH,
        };
      })
      .filter((point): point is { x: number; y: number } => point !== null);

    if (points.length === 0) return null;

    const line = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

    const area = `${line} L${points[points.length - 1].x.toFixed(2)},${
      PRICE_HEIGHT - PADDING.bottom
    } L${points[0].x.toFixed(2)},${PRICE_HEIGHT - PADDING.bottom} Z`;

    const maxVolume = Math.max(
      ...bars.map((bar) => bar.volume ?? 0),
      1
    );

    const volumeBars = bars.map((bar, index) => {
      const value = bar.volume ?? 0;
      const height = (value / maxVolume) * VOLUME_HEIGHT;
      return {
        x: PADDING.left + (bars.length === 1 ? innerW / 2 : (index / (bars.length - 1)) * innerW),
        height,
      };
    });

    return { min, max, line, area, points, volumeBars, first: closes[0], last: closes[closes.length - 1] };
  }, [bars]);

  const rising = geometry ? geometry.last >= geometry.first : true;
  const changePercent =
    geometry && geometry.first ? ((geometry.last - geometry.first) / geometry.first) * 100 : null;

  return (
    <div className="chart-block">
      <div className="chart-toolbar">
        <span className="chart-caption">
          {range === "1D" && !intradayAvailable
            ? "END-OF-DAY CLOSES — INTRADAY UNAVAILABLE"
            : `PRICE HISTORY — ${range}`}
        </span>

        <div className="timeframe-controls" role="group" aria-label="Chart timeframe">
          {HISTORY_RANGES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === range ? "active" : ""}
              onClick={() => setRange(option)}
              aria-pressed={option === range}
              title={
                option === "1D" && !intradayAvailable
                  ? "Intraday data unavailable — showing recent sessions"
                  : undefined
              }
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="chart-unavailable">{error}</div>}

      {!error && loading && !geometry && (
        <div className="chart-unavailable">Loading price history…</div>
      )}

      {!error && !loading && (!geometry || bars?.length === 0) && (
        <div className="chart-unavailable">
          Data unavailable — no price history for this range from the current source.
        </div>
      )}

      {geometry && (
        <>
          <svg
            className="chart-svg"
            viewBox={`0 0 ${WIDTH} ${PRICE_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Price history for ${ticker} over ${range}: from ${formatPrice(
              geometry.first
            )} to ${formatPrice(geometry.last)} KES`}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={rising ? "#22c55e" : "#ef4444"} stopOpacity="0.32" />
                <stop offset="100%" stopColor={rising ? "#22c55e" : "#ef4444"} stopOpacity="0" />
              </linearGradient>
            </defs>

            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PADDING.top}
              y2={PADDING.top}
              stroke="rgba(255,255,255,0.06)"
            />
            <line
              x1={PADDING.left}
              x2={WIDTH - PADDING.right}
              y1={PRICE_HEIGHT - PADDING.bottom}
              y2={PRICE_HEIGHT - PADDING.bottom}
              stroke="rgba(255,255,255,0.06)"
            />

            <path d={geometry.area} fill={`url(#${gradientId})`} />
            <path
              d={geometry.line}
              fill="none"
              stroke={rising ? "#22c55e" : "#ef4444"}
              strokeWidth="1.6"
              vectorEffect="non-scaling-stroke"
            />
          </svg>

          <svg
            className="chart-volume"
            viewBox={`0 0 ${WIDTH} ${VOLUME_HEIGHT}`}
            preserveAspectRatio="none"
            role="img"
            aria-label="Traded volume per session"
          >
            {geometry.volumeBars.map((bar, index) => (
              <rect
                key={index}
                x={Math.max(0, bar.x - 1.5)}
                y={VOLUME_HEIGHT - bar.height}
                width={Math.max(1, (WIDTH - PADDING.left - PADDING.right) / Math.max(geometry.volumeBars.length, 1) - 1)}
                height={Math.max(0, bar.height)}
                fill="rgba(148, 163, 184, 0.35)"
              />
            ))}
          </svg>

          <div className="chart-axis">
            <span>LOW {formatPrice(geometry.min)}</span>
            <span>
              {changePercent === null
                ? "—"
                : `${rising ? "▲" : "▼"} ${formatPercent(changePercent)} over ${range}`}
            </span>
            <span>HIGH {formatPrice(geometry.max)}</span>
          </div>

          <div className="chart-legend">
            <span>{bars?.length ?? 0} sessions</span>
            <span>
              Max drawdown:{" "}
              {stats?.maxDrawdownPercent === null || stats?.maxDrawdownPercent === undefined
                ? "—"
                : `${stats.maxDrawdownPercent.toFixed(2)}%`}
            </span>
            <span>
              Volatility (ann.):{" "}
              {stats?.annualisedVolatilityPercent === null ||
              stats?.annualisedVolatilityPercent === undefined
                ? "—"
                : `${stats.annualisedVolatilityPercent.toFixed(1)}%`}
            </span>
            <span>
              Avg volume:{" "}
              {bars && bars.length > 0
                ? formatCompactNumber(
                    bars.reduce((total, bar) => total + (bar.volume ?? 0), 0) / bars.length
                  )
                : "—"}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
