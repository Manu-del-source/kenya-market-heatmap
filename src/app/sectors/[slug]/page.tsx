/**
 * /sectors/[slug] — sector drill-down: aggregate plus every constituent.
 */

import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import StockTableWithWatchlist from "@/components/StockTableWithWatchlist";
import { buildMetadata } from "@/lib/seo";
import { parseSlug } from "@/lib/validation";
import { buildMeta, getSectorDetail, getSectorStats } from "@/lib/services/market-service";
import { changeClass, formatCompactKes, formatPercent } from "@/lib/format";

export const revalidate = 60;

type PageParams = Promise<{ slug: string }>;

export async function generateMetadata({ params }: { params: PageParams }): Promise<Metadata> {
  const { slug: raw } = await params;
  const slug = parseSlug(raw, "slug");
  const stats = (await getSectorStats()).find((sector) => sector.sectorSlug === slug);

  return buildMetadata({
    title: stats ? `${stats.sector} sector — NSE` : "Sector — NSE",
    description: stats
      ? `${stats.sector} sector on the Nairobi Securities Exchange: ${stats.companies} tracked companies, capitalisation ${formatCompactKes(stats.marketValue)}, daily return ${formatPercent(stats.dailyReturn)}.`
      : "Sector performance for companies listed on the Nairobi Securities Exchange.",
    path: `/sectors/${slug}`,
    noindex: !stats,
  });
}

export default async function SectorPage({ params }: { params: PageParams }) {
  const { slug: raw } = await params;
  const slug = parseSlug(raw, "slug");
  const detail = await getSectorDetail(slug);

  if (!detail) notFound();

  const meta = buildMeta();
  const { sector, companies } = detail;

  const cards = [
    { label: "COMPANIES", value: String(sector?.companies ?? companies.length), className: "" },
    {
      label: "DAILY RETURN",
      value: formatPercent(sector?.dailyReturn ?? null),
      className: changeClass(sector?.dailyReturn ?? null),
    },
    {
      label: "WEEKLY RETURN",
      value: formatPercent(sector?.weeklyReturn ?? null),
      className: changeClass(sector?.weeklyReturn ?? null),
    },
    {
      label: "MONTHLY RETURN",
      value: formatPercent(sector?.monthlyReturn ?? null),
      className: changeClass(sector?.monthlyReturn ?? null),
    },
    { label: "MARKET VALUE", value: formatCompactKes(sector?.marketValue ?? null), className: "" },
    { label: "TURNOVER", value: formatCompactKes(sector?.turnover ?? null), className: "" },
    { label: "ADVANCING", value: String(sector?.advancing ?? 0), className: "green" },
    { label: "DECLINING", value: String(sector?.declining ?? 0), className: "red" },
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
          <span>SECTOR</span>
          <strong>{companies[0]?.company.sector.toUpperCase() ?? slug.toUpperCase()}</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">NSE MARKET SEGMENT</span>
          <h2>{companies[0]?.company.sector ?? slug}</h2>
          <p>
            {companies.length} tracked companies · drill down into any company
            from the table below
          </p>
        </div>

        <div className="market-stats">
          <div className="stat">
            <span>ADV</span>
            <strong className="green">{sector?.advancing ?? 0}</strong>
          </div>
          <div className="stat">
            <span>DEC</span>
            <strong className="red">{sector?.declining ?? 0}</strong>
          </div>
          <div className="stat">
            <span>UNCH</span>
            <strong>{sector?.unchanged ?? 0}</strong>
          </div>
        </div>
      </section>

      <section className="stat-grid" aria-label="Sector statistics">
        {cards.map((card) => (
          <div className="stat-card" key={card.label}>
            <span>{card.label}</span>
            <strong className={card.className}>{card.value}</strong>
          </div>
        ))}
      </section>

      <section aria-label="Companies in this sector" style={{ marginTop: 24 }}>
        <div className="section-head">
          <div className="section-title">COMPANIES</div>
          <Link className="ghost-button" href="/sectors">
            ALL SECTORS
          </Link>
        </div>

        <StockTableWithWatchlist
          rows={companies.map((row) => ({ company: row.company, quote: row.quote }))}
          showSector={false}
          caption={`${companies.length} companies in ${companies[0]?.company.sector ?? slug}`}
        />
      </section>

      <SiteFooter meta={meta} />
    </main>
  );
}
