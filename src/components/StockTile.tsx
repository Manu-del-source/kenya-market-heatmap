/**
 * Heatmap tile.
 *
 * Sizing: the grid stays uniform (a true treemap needs absolute positioning and
 * breaks on small screens), so "size by" scales the typography and the weight
 * of the fill — the same visual ranking cue the original dashboard used, now
 * driven by a real metric instead of a fixed layout.
 *
 * Colour: interpolated between the market-neutral grey and the direction
 * colour, capped at ±5% so a single outlier cannot flatten every other tile.
 */

import Link from "next/link";
import type { ReactNode } from "react";
import type { ColorMetric } from "@/lib/types/market";
import { formatPrice } from "@/lib/format";

export type StockTileProps = {
  ticker: string;
  name: string;
  /** Size tier derived from the selected "size by" metric. */
  tier?: "sm" | "md" | "lg";
  /** Metric driving the fill: percentage points. */
  colorValue: number | null;
  /** 0–1 weight used for typography scaling. */
  weight: number;
  price: number | null;
  /** Which metric produced `colorValue`, for the accessible label. */
  colorMetric: ColorMetric;
  /** Optional watchlist toggle rendered by the (client) parent. */
  star?: ReactNode;
};

const COLOUR_SCALE = 5; // ±5% saturates the fill

export function tileBackground(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "#1f2937";
  const intensity = Math.min(Math.abs(value) / COLOUR_SCALE, 1);
  return value > 0
    ? `color-mix(in srgb, #16a34a ${25 + intensity * 55}%, #052e16)`
    : value < 0
      ? `color-mix(in srgb, #dc2626 ${25 + intensity * 55}%, #450a0a)`
      : "#1f2937";
}

const METRIC_LABEL: Record<ColorMetric, string> = {
  daily: "today",
  weekly: "1 week",
  monthly: "1 month",
};

export default function StockTile({
  ticker,
  name,
  tier = "sm",
  colorValue,
  weight,
  price,
  colorMetric,
  star,
}: StockTileProps) {
  const positive = (colorValue ?? 0) > 0;
  const negative = (colorValue ?? 0) < 0;
  const hasValue = colorValue !== null && Number.isFinite(colorValue);

  const symbolSize = Math.round(13 + weight * 11);
  const changeSize = Math.round(14 + weight * 9);

  const label = hasValue
    ? `${ticker} — ${name}: ${positive ? "up" : negative ? "down" : "unchanged"} ${Math.abs(
        colorValue as number
      ).toFixed(2)}% over ${METRIC_LABEL[colorMetric]}, price ${formatPrice(price)} KES. View company page.`
    : `${ticker} — ${name}: change unavailable. View company page.`;

  return (
    <Link
      className={`stock-tile tile-${tier}`}
      href={`/stocks/${ticker}`}
      style={{ background: tileBackground(colorValue) }}
      aria-label={label}
    >
      {star}

      <div>
        <div className="stock-symbol" style={{ fontSize: `${symbolSize}px` }}>
          {ticker}
        </div>

        <div className="stock-name">{name}</div>
      </div>

      <div>
        <div
          className={`stock-change ${positive ? "positive" : ""} ${negative ? "negative" : ""}`}
          style={{ fontSize: `${changeSize}px` }}
        >
          {!hasValue
            ? "—"
            : `${positive ? "▲" : negative ? "▼" : "—"} ${Math.abs(colorValue as number).toFixed(2)}%`}
        </div>

        <div className="stock-price">KSh {formatPrice(price)}</div>
      </div>
    </Link>
  );
}
