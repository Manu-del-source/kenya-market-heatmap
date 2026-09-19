/**
 * /economy — Kenya economic intelligence (Phase 10 foundation).
 *
 * The catalogue of series is always shown so the page describes what the
 * platform covers. Observations appear only after an operator ingests them
 * from the publisher; until then each series says "Data unavailable" and links
 * to the documented ingestion path. No value is ever estimated.
 */

import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { buildMetadata } from "@/lib/seo";
import { buildMeta } from "@/lib/services/market-service";
import { getEconomyOverview } from "@/lib/services/economy-service";
import { formatDate, formatNumber } from "@/lib/format";

export const revalidate = 600;

export const metadata = buildMetadata({
  title: "Kenya economic indicators",
  description:
    "Kenyan economic indicators — inflation, Central Bank Rate, Treasury bill yields, exchange rates and growth — with explicit sourcing from KNBS and the Central Bank of Kenya.",
  path: "/economy",
});

export default async function EconomyPage() {
  const categories = await getEconomyOverview();
  const meta = buildMeta();

  const available = categories.flatMap((group) =>
    group.series.filter((series) => series.status === "available")
  ).length;
  const total = categories.reduce((count, group) => count + group.series.length, 0);

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
          <span>ECONOMIC INTELLIGENCE</span>
          <strong>
            {available} OF {total} SERIES LOADED
          </strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">KENYA ECONOMY</span>
          <h2>Economic indicators</h2>
          <p>
            Published by the Kenya National Bureau of Statistics and the Central
            Bank of Kenya. Economic data is stored separately from market data
            and is only displayed once ingested from the publisher.
          </p>
        </div>
      </section>

      <section className="data-banner" aria-label="Data availability">
        <strong>HOW THIS SECTION IS POPULATED</strong>
        <div>
          <p>
            These publishers do not offer an open API, and their content is
            subject to their own terms. Values are therefore imported from files
            you obtain directly from them:
          </p>
          <p>
            <code>npm run ingest:economy</code> — reads{" "}
            <code>data/ingest/economy/&lt;seriesId&gt;.csv</code> (date,value) and
            stores observations with the publisher attribution. Nothing is
            scraped and nothing is estimated: a series with no file shows
            &ldquo;Data unavailable&rdquo;.
          </p>
        </div>
      </section>

      {categories.map((group) => (
        <section key={group.category} aria-label={group.category} style={{ marginTop: 24 }}>
          <div className="section-head">
            <div className="section-title">{group.category.toUpperCase()}</div>
            <span className="section-note">
              {group.series.filter((series) => series.status === "available").length} of{" "}
              {group.series.length} series loaded
            </span>
          </div>

          <div className="economy-grid">
            {group.series.map((series) => (
              <article className="economy-card" key={series.seriesId}>
                <h3>{series.name}</h3>

                <div className="value">
                  {series.latestValue === null ? (
                    <span className="cell-muted">Data unavailable</span>
                  ) : (
                    <>
                      {formatNumber(series.latestValue)}
                      <span style={{ fontSize: 12, color: "var(--muted)" }}> {series.unit}</span>
                    </>
                  )}
                </div>

                <div className="meta">
                  {series.latestDate
                    ? `As of ${formatDate(series.latestDate)} · `
                    : "Awaiting ingest · "}
                  {series.frequency} · {series.observations} observations
                  <br />
                  Source: {series.source}
                  {series.sourceUrl && (
                    <>
                      {" · "}
                      <a href={series.sourceUrl} rel="nofollow noopener" target="_blank">
                        publisher
                      </a>
                    </>
                  )}
                  <br />
                  <code>{series.seriesId}</code>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}

      <SiteFooter meta={meta} />
    </main>
  );
}
