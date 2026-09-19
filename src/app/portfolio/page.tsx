/**
 * /portfolio — personal holding tracker (Phase 12).
 *
 * No authentication yet: holdings are kept in the browser by `usePortfolio` and
 * only ever sent to the server to be *valued*. The page is marked noindex
 * because its contents are per-visitor.
 *
 * This is a tracking tool. There is no order entry, no brokerage integration and
 * no advice; when accounts arrive, `usePortfolio` and the valuation endpoint are
 * the two places that change.
 */

import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import PortfolioBoard from "@/components/PortfolioBoard";
import { buildMetadata } from "@/lib/seo";
import { buildMeta, listCompanies } from "@/lib/services/market-service";

export const revalidate = 0;

export const metadata = buildMetadata({
  title: "Portfolio tracker",
  description:
    "Track the NSE shares you already hold: valuation, sector allocation, concentration and day movement, computed from verified market prices. Tracking only — no trading, no advice.",
  path: "/portfolio",
  noindex: true,
});

export default async function PortfolioPage() {
  const companies = await listCompanies();
  const meta = buildMeta();

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
          <span>PORTFOLIO TRACKER</span>
          <strong>SAVED IN BROWSER</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">PHASE 12 · PORTFOLIO ARCHITECTURE</span>
          <h2>Portfolio</h2>
          <p>
            Enter the shares you already own and this page values them at the
            latest price the platform can verify, then breaks the result down by
            sector and concentration. Holdings stay in this browser — no account,
            no server-side profile, no trading.
          </p>
        </div>
      </section>

      <PortfolioBoard
        companies={companies.map((company) => ({
          ticker: company.ticker,
          name: company.name,
          sector: company.sector,
        }))}
      />

      <SiteFooter meta={meta} />
    </main>
  );
}
