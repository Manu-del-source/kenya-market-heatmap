/**
 * /stocks/[ticker] — company detail page (Phase 5).
 *
 * Shows price, session statistics, a historical chart and sector peers.
 * Financial ratios (P/E, dividend yield, EPS) are intentionally absent: the
 * platform only displays figures its data source actually supplies, and a
 * fabricated multiple is worse than an empty cell.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import PriceHistoryChart from "@/components/PriceHistoryChart";
import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import WatchlistToggle from "@/components/WatchlistToggle";
import StockTable from "@/components/StockTable";
import { buildMetadata, companyJsonLd } from "@/lib/seo";
import { parseTicker } from "@/lib/validation";
import { buildMeta, getStockDetail } from "@/lib/services/market-service";
import {
  changeClass,
  formatCompactKes,
  formatCompactNumber,
  formatDate,
  formatNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";

export const revalidate = 60;

type PageParams = Promise<{ ticker: string }>;

/** Per-ticker metadata is generated from the company register, not from prices. */
export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { ticker: raw } = await params;
  const ticker = parseTicker(raw);
  const detail = await getStockDetail(ticker);

  if (!detail) {
    return buildMetadata({
      title: `${ticker} — not tracked`,
      description: `${ticker} is not part of the NSE universe tracked by Kenya Market Intelligence.`,
      path: `/stocks/${ticker}`,
      noindex: true,
    });
  }

  return buildMetadata({
    title: `${detail.company.name} (${detail.company.ticker})`,
    description: `${detail.company.name} (${detail.company.ticker}) — ${detail.company.sector} company listed on the Nairobi Securities Exchange. Price history, sector peers and market statistics.`,
    path: `/stocks/${detail.company.ticker}`,
  });
}

export default async function StockPage({ params }: { params: PageParams }) {
  const { ticker: raw } = await params;
  const ticker = parseTicker(raw);
  const detail = await getStockDetail(ticker);

  if (!detail) notFound();

  const { company, quote, returns, high52w, low52w, averageVolume1y, peers, sectorRank } = detail;
  const meta = buildMeta();

  const stats = [
    { label: "PREV CLOSE", value: quote?.previousClose == null ? "—" : `KSh ${formatPrice(quote.previousClose)}` },
    { label: "DAY RANGE", value: quote?.dayLow == null || quote?.dayHigh == null ? "—" : `${formatPrice(quote.dayLow)} – ${formatPrice(quote.dayHigh)}` },
    { label: "52W RANGE", value: low52w == null || high52w == null ? "—" : `${formatPrice(low52w)} – ${formatPrice(high52w)}` },
    { label: "VOLUME", value: formatCompactNumber(quote?.volume ?? null) },
    { label: "TURNOVER", value: formatCompactKes(quote?.turnover ?? null) },
    { label: "MARKET CAP", value: formatCompactKes(quote?.marketCap ?? null) },
    { label: "AVG VOLUME (1Y)", value: formatCompactNumber(averageVolume1y) },
    { label: "SESSION", value: quote ? formatDate(quote.sessionDate) : "—" },
    { label: "SECTOR RANK (1D)", value: sectorRank ? `${sectorRank.rank} of ${sectorRank.of}` : "—" },
    { label: "LISTING", value: company.crossListing ? "Cross-listing" : "Primary (KE)" },
  ];

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
          <span>COMPANY PROFILE</span>
          <strong>{company.ticker}</strong>
          <WatchlistToggle ticker={company.ticker} />
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="detail-header">
        <div>
          <span className="detail-eyebrow">
            {company.sector.toUpperCase()} · {company.industry.toUpperCase()}
          </span>

          <h2 className="detail-title">
            {company.ticker}
            <small>{company.name}</small>
          </h2>

          <div className="detail-tags">
            <Link className="badge" href={`/sectors/${company.sectorSlug}`}>
              {company.sector}
            </Link>
            <span className="badge">{company.currency}</span>
            {company.crossListing && <span className="badge">Cross-listing · {company.country}</span>}
            {company.listingStatus !== "listed" && (
              <span className="badge unavailable">{company.listingStatus.toUpperCase()}</span>
            )}
          </div>

          {company.description && (
            <p style={{ maxWidth: 640, marginTop: 12, color: "var(--muted)", fontSize: 12, lineHeight: 1.6 }}>
              {company.description}
            </p>
          )}

          <div className="detail-price">
            <strong>{quote?.price == null ? "—" : `KSh ${formatPrice(quote.price)}`}</strong>

            <span className={changeClass(quote?.changePercent ?? null)}>
              {quote?.changePercent == null
                ? "—"
                : `${quote.changePercent > 0 ? "▲" : quote.changePercent < 0 ? "▼" : "—"} ${formatPercent(quote.changePercent)}`}
            </span>

            {quote?.change != null && (
              <span className="cell-muted">
                {quote.change > 0 ? "+" : ""}
                {formatNumber(quote.change)} KSh today
              </span>
            )}
          </div>
        </div>
      </section>

      <section className="stat-grid" aria-label="Session statistics">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <span>{stat.label}</span>
            <strong>{stat.value}</strong>
          </div>
        ))}
      </section>

      <section aria-label="Trailing returns" style={{ marginTop: 22 }}>
        <div className="section-head">
          <div className="section-title">TRAILING RETURNS</div>
          <span className="section-note">
            Computed from stored closes. A blank period means the history is too
            short to measure it honestly.
          </span>
        </div>

        <div className="range-returns">
          {returns.map((entry) => (
            <div className="range-card" key={entry.range}>
              <span>{entry.range}</span>
              <strong className={changeClass(entry.changePercent)}>
                {entry.changePercent == null ? "—" : formatPercent(entry.changePercent)}
              </strong>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="Price history" style={{ marginTop: 22 }}>
        <PriceHistoryChart ticker={company.ticker} initialRange="3M" />
      </section>

      <section aria-label="Sector peers" style={{ marginTop: 26 }}>
        <div className="section-head">
          <div className="section-title">SECTOR PEERS — {company.sector.toUpperCase()}</div>
          <Link className="ghost-button" href={`/sectors/${company.sectorSlug}`}>
            VIEW SECTOR
          </Link>
        </div>

        <StockTable
          rows={peers.slice(0, 10).map((peer) => ({ company: peer.company, quote: peer.quote }))}
          showSector={false}
          caption={
            peers.length > 0
              ? `${peers.length} other ${company.sector} companies tracked`
              : "No other companies tracked in this sector"
          }
        />
      </section>

      <SiteFooter meta={meta} />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            companyJsonLd({
              ticker: company.ticker,
              name: company.name,
              path: `/stocks/${company.ticker}`,
            })
          ),
        }}
      />
    </main>
  );
}
