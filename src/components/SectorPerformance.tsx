/**
 * Sector performance cards (Phase 8).
 *
 * Each card links to the sector drill-down. Weekly and monthly returns are
 * null when the underlying history is too short, and sectors whose aggregate
 * rests on very few priced companies are marked as indicative.
 */

import Link from "next/link";
import type { SectorStat } from "@/lib/types/market";
import { changeClass, formatCompactKes, formatPercent } from "@/lib/format";

export default function SectorPerformance({ sectors }: { sectors: SectorStat[] }) {
  if (sectors.length === 0) {
    return (
      <section className="sector-perf-section">
        <div className="section-title">SECTOR PERFORMANCE</div>
        <div className="empty-state">
          No sector aggregates are available from the current data source.
        </div>
      </section>
    );
  }

  return (
    <section className="sector-perf-section" aria-label="Sector performance">
      <div className="section-head">
        <div className="section-title">SECTOR PERFORMANCE</div>
        <span className="section-note">
          Capitalisation-weighted returns · click a sector to drill down
        </span>
      </div>

      <div className="sector-perf-grid">
        {sectors.map((item) => (
          <Link
            className="sector-perf-card"
            key={item.sectorSlug}
            href={`/sectors/${item.sectorSlug}`}
          >
            <div className="sector-perf-head">
              <strong>{item.sector}</strong>
              <span className={changeClass(item.dailyReturn)}>
                {item.dailyReturn === null
                  ? "—"
                  : `${item.dailyReturn > 0 ? "▲" : item.dailyReturn < 0 ? "▼" : "—"} ${Math.abs(
                      item.dailyReturn
                    ).toFixed(2)}%`}
              </span>
            </div>

            <div className="sector-perf-stats">
              <div>
                <span>STOCKS</span>
                <strong>{item.companies}</strong>
              </div>
              <div>
                <span>1W</span>
                <strong className={changeClass(item.weeklyReturn)}>
                  {formatPercent(item.weeklyReturn, 1)}
                </strong>
              </div>
              <div>
                <span>1M</span>
                <strong className={changeClass(item.monthlyReturn)}>
                  {formatPercent(item.monthlyReturn, 1)}
                </strong>
              </div>
            </div>

            <div className="sector-perf-stats">
              <div>
                <span>MKT VALUE</span>
                <strong>{formatCompactKes(item.marketValue)}</strong>
              </div>
              <div>
                <span>ADV</span>
                <strong className="green">{item.advancing}</strong>
              </div>
              <div>
                <span>DEC</span>
                <strong className="red">{item.declining}</strong>
              </div>
            </div>

            {item.incomplete && (
              <p className="breadth-caveat">
                Indicative only: {item.pricedCompanies} of {item.companies} companies priced.
              </p>
            )}
          </Link>
        ))}
      </div>
    </section>
  );
}
