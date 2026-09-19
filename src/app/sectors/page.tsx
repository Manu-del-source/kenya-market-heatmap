/**
 * /sectors — sector analytics overview (Phase 8).
 */

import Link from "next/link";
import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import SectorPerformance from "@/components/SectorPerformance";
import { buildMetadata } from "@/lib/seo";
import { buildMeta, getSectorStats } from "@/lib/services/market-service";
import { changeClass, formatCompactKes, formatPercent } from "@/lib/format";

export const revalidate = 60;

export const metadata = buildMetadata({
  title: "NSE sector performance",
  description:
    "Sector-level performance for the Nairobi Securities Exchange: daily, weekly and monthly returns, capitalisation, turnover and market breadth per sector.",
  path: "/sectors",
});

export default async function SectorsPage() {
  const sectors = await getSectorStats();
  const meta = buildMeta();
  const totalValue = sectors.reduce((total, sector) => total + (sector.marketValue ?? 0), 0);

  return (
    <main className="dashboard">
      <header className="header">
        <div className="brand">
          <span className="brand-mark">◉</span>
          <div>
            <h1>KENYA MARKET INTELLIGENCE</h1>
            <p>MARKETS • COMPANIES • DATA</p>
          </div>
        </div>

        <div className="report">
          <span>SECTOR ANALYTICS</span>
          <strong>{sectors.length} SEGMENTS</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">NSE MARKET SEGMENTS</span>
          <h2>Sector performance</h2>
          <p>
            Capitalisation-weighted returns across {sectors.length} segments ·
            total tracked value {formatCompactKes(totalValue)}
          </p>
        </div>
      </section>

      <SectorPerformance sectors={sectors} />

      <section aria-label="Sector detail table" style={{ marginTop: 26 }}>
        <div className="section-head">
          <div className="section-title">ALL SECTORS</div>
          <span className="section-note">
            Returns are capitalisation-weighted; — means the period cannot be
            measured from available history
          </span>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th className="text">Sector</th>
                <th>Companies</th>
                <th>1D</th>
                <th>1W</th>
                <th>1M</th>
                <th>Market value</th>
                <th>Turnover</th>
                <th>Adv</th>
                <th>Dec</th>
              </tr>
            </thead>

            <tbody>
              {sectors.map((sector) => (
                <tr key={sector.sectorSlug}>
                  <td className="text">
                    <Link href={`/sectors/${sector.sectorSlug}`}>{sector.sector}</Link>
                  </td>
                  <td>{sector.companies}</td>
                  <td className={changeClass(sector.dailyReturn)}>
                    {formatPercent(sector.dailyReturn)}
                  </td>
                  <td className={changeClass(sector.weeklyReturn)}>
                    {formatPercent(sector.weeklyReturn)}
                  </td>
                  <td className={changeClass(sector.monthlyReturn)}>
                    {formatPercent(sector.monthlyReturn)}
                  </td>
                  <td>{formatCompactKes(sector.marketValue)}</td>
                  <td>{formatCompactKes(sector.turnover)}</td>
                  <td className="green">{sector.advancing}</td>
                  <td className="red">{sector.declining}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <SiteFooter meta={meta} />
    </main>
  );
}
