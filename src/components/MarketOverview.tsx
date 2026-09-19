/**
 * Top-of-page market stat strip.
 *
 * Every value is derived from the current snapshot. Aggregates the source does
 * not provide stay null and render as an em dash — they are never estimated.
 */

import type { MarketSummary } from "@/lib/types/market";
import { changeClass, formatCompactKes, formatCompactNumber, formatPercent } from "@/lib/format";
import DataBadge from "./DataBadge";

export default function MarketOverview({
  summary,
  mode,
}: {
  summary: MarketSummary;
  mode: "live" | "delayed" | "end-of-day" | "demo" | "unavailable";
}) {
  const cards = [
    {
      label: "MARKET RETURN",
      value: formatPercent(summary.marketReturn),
      className: changeClass(summary.marketReturn),
    },
    {
      label: "ADVANCING",
      value: String(summary.advancing),
      className: "green",
    },
    {
      label: "DECLINING",
      value: String(summary.declining),
      className: "red",
    },
    {
      label: "UNCHANGED",
      value: String(summary.unchanged),
      className: "",
    },
    {
      label: "TURNOVER",
      value: formatCompactKes(summary.totalTurnover),
      className: "",
    },
    {
      label: "VOLUME",
      value: formatCompactNumber(summary.totalVolume),
      className: "",
    },
  ];

  return (
    <div className="market-overview" aria-label="Market overview">
      {cards.map((card) => (
        <div className="overview-card" key={card.label}>
          <span>
            {card.label}
            {mode === "demo" && <DataBadge mode="demo" label="DEMO" />}
          </span>
          <strong className={card.className}>{card.value}</strong>
        </div>
      ))}
    </div>
  );
}
