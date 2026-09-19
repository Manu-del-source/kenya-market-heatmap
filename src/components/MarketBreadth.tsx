/**
 * Market breadth panel (Phase 7).
 *
 * Shows advancing / declining / unchanged, the advance–decline ratio and
 * 52-week high/low counts. When the platform has no 52-week reference the
 * high/low cards say so explicitly instead of showing a misleading zero.
 */

import type { BreadthStats } from "@/lib/types/market";
import { breadthCaveat } from "@/lib/analytics/breadth";
import { formatNumber } from "@/lib/format";

export default function MarketBreadth({
  breadth,
  sectorLabel = "companies",
}: {
  breadth: BreadthStats;
  sectorLabel?: string;
}) {
  const total = Math.max(1, breadth.advancing + breadth.declining + breadth.unchanged);
  const pct = (value: number) => `${((value / total) * 100).toFixed(1)}%`;
  const caveat = breadthCaveat(breadth, sectorLabel);

  const cards = [
    { label: "ADVANCING", value: breadth.advancing, className: "green" },
    { label: "DECLINING", value: breadth.declining, className: "red" },
    { label: "UNCHANGED", value: breadth.unchanged, className: "" },
    {
      label: "ADV / DEC RATIO",
      value: breadth.advanceDeclineRatio === null ? "—" : formatNumber(breadth.advanceDeclineRatio, { maximumFractionDigits: 2 }),
      className: (breadth.advanceDeclineRatio ?? 0) >= 1 ? "green" : "red",
    },
    {
      label: "52W HIGHS",
      value: breadth.newHighs === null ? "—" : breadth.newHighs,
      className: "green",
    },
    {
      label: "52W LOWS",
      value: breadth.newLows === null ? "—" : breadth.newLows,
      className: "red",
    },
  ];

  return (
    <section className="breadth-section" aria-label="Market breadth">
      <div className="section-head">
        <div className="section-title">MARKET BREADTH</div>
        <span className="section-note">
          {breadth.advancing + breadth.declining + breadth.unchanged} of {breadth.total}{" "}
          {sectorLabel} priced in this snapshot
        </span>
      </div>

      <div className="breadth-grid">
        {cards.map((card) => (
          <div className="breadth-card" key={card.label}>
            <span>{card.label}</span>
            <strong className={card.className}>{card.value}</strong>
          </div>
        ))}
      </div>

      <div className="breadth-bar" role="img" aria-label="Advance decline distribution">
        <i className="up" style={{ width: pct(breadth.advancing) }} />
        <i className="flat" style={{ width: pct(breadth.unchanged) }} />
        <i className="down" style={{ width: pct(breadth.declining) }} />
      </div>

      {caveat && <p className="breadth-caveat">{caveat}</p>}
    </section>
  );
}
