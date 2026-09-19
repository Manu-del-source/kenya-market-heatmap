/**
 * /compare — historical comparison of NSE stocks and sectors (Phase 9).
 *
 * The first comparison is rendered on the server from validated query
 * parameters, so the page is complete without JavaScript and on a slow
 * connection. `ComparisonWorkspace` then handles interactive changes.
 *
 * Everything shown is measured from data the platform holds: series are
 * rebased to 100, gaps are skipped, and unmeasurable values render as "—".
 */

import DataBanner from "@/components/DataBanner";
import SiteNav from "@/components/SiteNav";
import SiteFooter from "@/components/SiteFooter";
import ComparisonWorkspace from "@/components/ComparisonWorkspace";
import {
  defaultSectorSelection,
  defaultStockSelection,
  type CompanyOption,
  type SectorOption,
} from "@/lib/compare-options";
import { buildMetadata } from "@/lib/seo";
import { parseComparePeriod, parseCompareSlugs, parseCompareTickers } from "@/lib/validation";
import { listCompanies, listSectors } from "@/lib/services/market-service";
import { compareSectors, compareStocks } from "@/lib/services/comparison-service";
import { COMPARE_PERIOD_LABEL, type ComparePeriod } from "@/lib/types/market";

export const revalidate = 300;

export const metadata = buildMetadata({
  title: "Compare NSE stocks and sectors",
  description:
    "Compare historical performance of Nairobi Securities Exchange stocks and sectors on a normalised, base-100 basis over 1 month to 5 years. Analytical tool, not investment advice.",
  path: "/compare",
});

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function ComparePage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;

  const [companies, sectors] = await Promise.all([listCompanies(), listSectors()]);
  const companyOptions: CompanyOption[] = companies.map((company) => ({
    ticker: company.ticker,
    name: company.name,
    sector: company.sector,
  }));
  const sectorOptions: SectorOption[] = sectors.map((sector) => ({
    slug: sector.slug,
    name: sector.name,
  }));

  const knownTickers = new Set(companyOptions.map((company) => company.ticker));
  const knownSlugs = new Set(sectorOptions.map((sector) => sector.slug));

  // Query parameters are validated, but they are also *filtered against the
  // live universe*: a stale link naming a de-listed ticker degrades to the
  // default selection instead of rendering an empty chart.
  const modeParam = first(params.mode) === "sectors" ? "sectors" : "stocks";
  const period: ComparePeriod = parseComparePeriod(first(params.period));

  const requestedTickers = (() => {
    try {
      return parseCompareTickers(first(params.tickers));
    } catch {
      return null;
    }
  })();
  const requestedSlugs = (() => {
    try {
      return parseCompareSlugs(first(params.sectors));
    } catch {
      return null;
    }
  })();

  const tickers =
    (requestedTickers?.filter((ticker) => knownTickers.has(ticker)) ?? []).length > 0
      ? (requestedTickers as string[]).filter((ticker) => knownTickers.has(ticker))
      : defaultStockSelection(companyOptions);

  const slugs =
    (requestedSlugs?.filter((slug) => knownSlugs.has(slug)) ?? []).length > 0
      ? (requestedSlugs as string[]).filter((slug) => knownSlugs.has(slug))
      : defaultSectorSelection(sectorOptions);

  const initialMode = modeParam;

  const result =
    initialMode === "sectors"
      ? await compareSectors({ slugs, period })
      : await compareStocks({ tickers, period });

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
          <span>HISTORICAL COMPARISON</span>
          <strong>{COMPARE_PERIOD_LABEL[period].toUpperCase()}</strong>
        </div>
      </header>

      <SiteNav />
      <DataBanner meta={result.meta} />

      <section className="market-heading">
        <div>
          <span className="eyebrow">PHASE 9 · HISTORICAL ANALYTICS</span>
          <h2>Compare stocks and sectors</h2>
          <p>
            Normalised, base-100 comparison of up to five companies or ten market segments.
            Series are aligned on a common window and every series is rebased at its own first
            session, so lines show relative performance rather than price levels.
          </p>
        </div>
      </section>

      <ComparisonWorkspace
        initialMode={initialMode}
        initialPeriod={period}
        initialTickers={tickers}
        initialSlugs={slugs}
        initialData={result.data}
        companies={companyOptions}
        sectors={sectorOptions}
      />

      <SiteFooter meta={result.meta} />
    </main>
  );
}
