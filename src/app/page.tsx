/**
 * Homepage — the market heatmap report.
 *
 * Server-rendered with the first snapshot (fast first paint, indexable HTML),
 * then handed to <MarketDashboard> for filtering and refresh.
 */

import MarketDashboard from "@/components/MarketDashboard";
import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import {
  buildMeta,
  getHeatmapMetrics,
  getMarketOverview,
  listCompanies,
} from "@/lib/services/market-service";
import { MARKET_STATUS_LABEL, marketStatus } from "@/lib/market-session";
import { formatReportDate } from "@/lib/format";
import { DATA_MODE_LABEL } from "@/lib/types/market";
import { getMarketDataProvider } from "@/lib/providers";

/** Revalidate at most once a minute; the service layer caches within that. */
export const revalidate = 60;

export default async function Home() {
  const [overview, companies, metrics] = await Promise.all([
    getMarketOverview(),
    listCompanies(),
    getHeatmapMetrics(),
  ]);

  const meta = buildMeta();
  const provider = getMarketDataProvider();
  const status = marketStatus();

  // Auto-refresh only makes sense for a feed that actually changes.
  const refreshEnabled = provider.dataMode !== "demo";
  const refreshIntervalMs = status === "open" ? 60_000 : 300_000;

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
          <span>MARKET HEATMAP REPORT</span>
          <strong>{formatReportDate(overview.summary.asOf)}</strong>
          <span className="last-update">
            {MARKET_STATUS_LABEL[status].toUpperCase()} • EAT (UTC+3)
          </span>
        </div>
      </header>

      <SiteNav />

      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">
            NSE — {DATA_MODE_LABEL[meta.dataMode].toUpperCase()}
          </span>

          <h2>Market Heatmap</h2>

          <p>
            {companies.length} listed companies · session{" "}
            {formatReportDate(overview.summary.sessionDate)}
          </p>
        </div>

        <div className="market-stats">
          <div className="stat">
            <span>GAINERS</span>
            <strong className="green">{overview.summary.advancing}</strong>
          </div>

          <div className="stat">
            <span>LOSERS</span>
            <strong className="red">{overview.summary.declining}</strong>
          </div>

          <div className="stat">
            <span>UNCHANGED</span>
            <strong>{overview.summary.unchanged}</strong>
          </div>
        </div>
      </section>

      <MarketDashboard
        initialOverview={overview}
        companies={companies.map((company) => ({
          ticker: company.ticker,
          name: company.name,
          sector: company.sector,
          sectorSlug: company.sectorSlug,
        }))}
        metrics={metrics}
        meta={meta}
        refreshEnabled={refreshEnabled}
        refreshIntervalMs={refreshIntervalMs}
      />

      <SiteFooter meta={meta} />
    </main>
  );
}
