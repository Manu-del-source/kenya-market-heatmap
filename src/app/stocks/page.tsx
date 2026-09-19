/**
 * /stocks — the full NSE company list.
 *
 * Server-rendered with pagination, sector filtering, search and sorting, all
 * driven by validated query parameters. Unknown enum values return 400 rather
 * than silently falling back, so a bad link cannot produce a confusing page.
 */

import Link from "next/link";
import StockTable, { SORT_IDS, type SortId } from "@/components/StockTable";
import SortBar, { buildSortHref } from "@/components/SortBar";
import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import { buildMetadata } from "@/lib/seo";
import { parseBoundedInt, parseEnum, parseSearch, parseSlug } from "@/lib/validation";
import { buildMeta, getQuotes, listCompanies, listSectors } from "@/lib/services/market-service";
import type { Company, Quote } from "@/lib/types/market";

export const revalidate = 60;

export const metadata = buildMetadata({
  title: "NSE listed companies",
  description:
    "Every company tracked on the Nairobi Securities Exchange with last price, daily change, volume, turnover and market capitalisation.",
  path: "/stocks",
});

const PAGE_SIZE = 25;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function StocksPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const rawSector = first(params.sector);
  const rawSort = first(params.sort);
  const rawPage = first(params.page);
  const rawQuery = first(params.q);

  const sector = rawSector ? parseSlug(rawSector, "sector") : undefined;
  const query = parseSearch(rawQuery);
  const sort = parseEnum<SortId>(rawSort, SORT_IDS, "sort", "marketCap-desc");
  const page = parseBoundedInt(rawPage, { min: 1, max: 500, fallback: 1, field: "page" });

  const [companies, quotes, sectors] = await Promise.all([
    listCompanies(),
    getQuotes(),
    listSectors(),
  ]);

  const quoteByTicker = new Map<string, Quote>(quotes.map((quote) => [quote.ticker, quote]));

  const matches = (company: Company) => {
    if (sector && company.sectorSlug !== sector) return false;
    if (!query) return true;
    const needle = query.toLowerCase();
    return (
      company.ticker.toLowerCase().includes(needle) ||
      company.name.toLowerCase().includes(needle) ||
      company.industry.toLowerCase().includes(needle)
    );
  };

  const filtered = companies.filter(matches);

  const sorted = [...filtered].sort((a, b) => {
    const qa = quoteByTicker.get(a.ticker) ?? null;
    const qb = quoteByTicker.get(b.ticker) ?? null;
    switch (sort) {
      case "change-desc":
        return (qb?.changePercent ?? -Infinity) - (qa?.changePercent ?? -Infinity);
      case "change-asc":
        return (qa?.changePercent ?? Infinity) - (qb?.changePercent ?? Infinity);
      case "turnover-desc":
        return (qb?.turnover ?? -Infinity) - (qa?.turnover ?? -Infinity);
      case "price-desc":
        return (qb?.price ?? -Infinity) - (qa?.price ?? -Infinity);
      case "volume-desc":
        return (qb?.volume ?? -Infinity) - (qa?.volume ?? Infinity);
      case "ticker":
        return a.ticker.localeCompare(b.ticker);
      case "marketCap-desc":
      default:
        return (qb?.marketCap ?? -Infinity) - (qa?.marketCap ?? -Infinity);
    }
  });

  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const slice = sorted.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const rows = slice.map((company) => ({
    company,
    quote: quoteByTicker.get(company.ticker) ?? null,
  }));

  const meta = buildMeta();
  const baseParams = {
    sector,
    q: query ?? undefined,
  };

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
          <span>LISTED COMPANIES</span>
          <strong>{total} TRACKED</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">NSE EQUITIES</span>
          <h2>Listed companies</h2>
          <p>
            Companies tracked by the platform. Sector classification follows the
            NSE market segments.
          </p>
        </div>
      </section>

      <section className="controls" aria-label="Search and filter">
        <form className="view-tabs" role="search" action="/stocks" style={{ display: "flex" }}>
          <input
            className="search-input"
            type="search"
            name="q"
            defaultValue={query ?? ""}
            placeholder="Search symbol or company…"
            aria-label="Search companies"
          />
          {sector && <input type="hidden" name="sector" value={sector} />}
          <button type="submit" className="ghost-button">
            SEARCH
          </button>
        </form>

        <div className="filters" aria-label="Sector filter" style={{ marginBottom: 0 }}>
          <Link
            href={buildSortHref("/stocks", { q: query ?? undefined }, sort)}
            className={!sector ? "active" : ""}
          >
            All sectors
          </Link>

          {sectors.map((entry) => (
            <Link
              key={entry.slug}
              href={buildSortHref("/stocks", { q: query ?? undefined, sector: entry.slug }, sort)}
              className={sector === entry.slug ? "active" : ""}
            >
              {entry.name}
            </Link>
          ))}
        </div>
      </section>

      <SortBar basePath="/stocks" params={baseParams} activeSort={sort} />

      <StockTable
        rows={rows}
        caption={
          sector
            ? `Showing ${rows.length} of ${total} companies in ${
                sectors.find((entry) => entry.slug === sector)?.name ?? sector
              }`
            : `Showing ${rows.length} of ${total} tracked companies`
        }
      />

      {totalPages > 1 && (
        <nav className="pagination" aria-label="Pagination">
          <span className="section-note">
            Page {safePage} of {totalPages}
          </span>

          <div className="pagination-links">
            <Link
              href={buildSortHref("/stocks", { ...baseParams, page: String(safePage - 1) }, sort)}
              className={safePage <= 1 ? "disabled" : ""}
              aria-disabled={safePage <= 1}
            >
              PREV
            </Link>

            {Array.from({ length: Math.min(totalPages, 7) }, (_, index) => {
              const target =
                safePage <= 4
                  ? index + 1
                  : Math.min(totalPages - 6, Math.max(1, safePage - 3)) + index;
              if (target < 1 || target > totalPages) return null;
              return (
                <Link
                  key={target}
                  href={buildSortHref("/stocks", { ...baseParams, page: String(target) }, sort)}
                  className={target === safePage ? "current" : ""}
                >
                  {target}
                </Link>
              );
            })}

            <Link
              href={buildSortHref("/stocks", { ...baseParams, page: String(safePage + 1) }, sort)}
              className={safePage >= totalPages ? "disabled" : ""}
              aria-disabled={safePage >= totalPages}
            >
              NEXT
            </Link>
          </div>
        </nav>
      )}

      <SiteFooter meta={meta} />
    </main>
  );
}
