"use client";

import { useId, useMemo } from "react";
import { TIMEFRAMES, Timeframe } from "@/data/stocks";

type StockChartProps = {
  /** Series of mock closes for the selected timeframe. */
  series: number[];
  timeframe: Timeframe;
  onTimeframeChange: (timeframe: Timeframe) => void;
};

const WIDTH = 600;
const HEIGHT = 220;
const PADDING = { top: 14, right: 12, bottom: 22, left: 12 };

function formatPrice(price: number) {
  return price.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function StockChart({
  series,
  timeframe,
  onTimeframeChange,
}: StockChartProps) {
  const gradientId = useId();

  const { linePath, areaPath, first, last, min, max } = useMemo(() => {
    if (series.length === 0) {
      return { linePath: "", areaPath: "", first: 0, last: 0, min: 0, max: 0 };
    }

    const min = Math.min(...series);
    const max = Math.max(...series);
    const span = max - min || 1;

    const innerW = WIDTH - PADDING.left - PADDING.right;
    const innerH = HEIGHT - PADDING.top - PADDING.bottom;

    const points = series.map((price, index) => {
      const x =
        PADDING.left + (index / (series.length - 1)) * innerW;
      const y = PADDING.top + (1 - (price - min) / span) * innerH;
      return { x, y };
    });

    const linePath = points
      .map((point, index) => `${index === 0 ? "M" : "L"}${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");

    const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(2)},${
      HEIGHT - PADDING.bottom
    } L${points[0].x.toFixed(2)},${HEIGHT - PADDING.bottom} Z`;

    return {
      linePath,
      areaPath,
      first: series[0],
      last: series[series.length - 1],
      min,
      max,
    };
  }, [series]);

  const rising = last >= first;

  return (
    <div className="chart-block">
      <div className="chart-toolbar">
        <span className="chart-caption">
          MOCK HISTORICAL PRICES — {timeframe}
        </span>

        <div className="timeframe-controls" role="group" aria-label="Chart timeframe">
          {TIMEFRAMES.map((option) => (
            <button
              key={option}
              type="button"
              className={option === timeframe ? "active" : ""}
              onClick={() => onTimeframeChange(option)}
              aria-pressed={option === timeframe}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {series.length > 0 ? (
        <svg
          className="chart-svg"
          viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Mock price chart, ${timeframe} timeframe, from ${formatPrice(
            first
          )} to ${formatPrice(last)} KES`}
        >
          <defs>
            <linearGradient
              id={gradientId}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor={rising ? "#22c55e" : "#ef4444"} stopOpacity="0.35" />
              <stop offset="100%" stopColor={rising ? "#22c55e" : "#ef4444"} stopOpacity="0" />
            </linearGradient>
          </defs>

          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={PADDING.top}
            y2={PADDING.top}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />
          <line
            x1={PADDING.left}
            x2={WIDTH - PADDING.right}
            y1={HEIGHT - PADDING.bottom}
            y2={HEIGHT - PADDING.bottom}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth="1"
          />

          <path d={areaPath} fill={`url(#${gradientId})`} />
          <path
            d={linePath}
            fill="none"
            stroke={rising ? "#22c55e" : "#ef4444"}
            strokeWidth="1.6"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
      ) : (
        <div className="chart-empty">No chart data available</div>
      )}

      <div className="chart-axis">
        <span>LOW {formatPrice(min)}</span>
        <span>
          {rising ? "▲" : "▼"} {(((last - first) / (first || 1)) * 100).toFixed(2)}% OVER {timeframe}
        </span>
        <span>HIGH {formatPrice(max)}</span>
      </div>
    </div>
  );
}
