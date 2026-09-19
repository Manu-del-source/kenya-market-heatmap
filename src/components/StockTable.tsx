/**
 * Dense company table used by /stocks, /sectors/[slug] and /watchlist.
 *
 * Server-rendered: no client JavaScript and no sorting library. Sorting and
 * filtering are links back to the same route with different query parameters,
 * which keeps views shareable, crawlable and fast on slow connections.
 */

import Link from "next/link";
import type { Company, Quote } from "@/lib/types/market";
import {
  changeClass,
  formatCompactKes,
  formatCompactNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";

export type StockRow = {
  company: Company;
  quote: Quote | null;
};

export const SORT_OPTIONS = [
  { id: "marketCap-desc", label: "Market cap" },
  { id: "change-desc", label: "Top gainers" },
  { id: "change-asc", label: "Top losers" },
  { id: "turnover-desc", label: "Turnover" },
  { id: "price-desc", label: "Price high–low" },
  { id: "volume-desc", label: "Volume" },
  { id: "ticker", label: "Ticker A–Z" },
] as const;

export type SortId = (typeof SORT_OPTIONS)[number]["id"];

export const SORT_IDS = SORT_OPTIONS.map((option) => option.id) as readonly SortId[];

type StockTableProps = {
  rows: StockRow[];
  /** Optional client-side watchlist toggle rendered next to the ticker. */
  renderStar?: (ticker: string) => React.ReactNode;
  showSector?: boolean;
  caption?: string;
};

export default function StockTable({
  rows,
  renderStar,
  showSector = true,
  caption,
}: StockTableProps) {
  if (rows.length === 0) {
    return (
      <div className="empty-state">
        No companies match the current filters. Try clearing the search or
        selecting a different sector.
      </div>
    );
  }

  return (
    <div className="data-table-wrap">
      <table className="data-table">
        {caption && <caption>{caption}</caption>}

        <thead>
          <tr>
            <th className="text">Symbol</th>
            <th className="text">Company</th>
            {showSector && <th className="text">Sector</th>}
            <th>Last (KSh)</th>
            <th>Change</th>
            <th>Prev close</th>
            <th>Day range</th>
            <th>Volume</th>
            <th>Turnover</th>
            <th>Market cap</th>
          </tr>
        </thead>

        <tbody>
          {rows.map(({ company, quote }) => (
            <tr key={company.ticker}>
              <td className="text">
                <Link href={`/stocks/${company.ticker}`}>{company.ticker}</Link>
                {renderStar ? renderStar(company.ticker) : null}
              </td>

              <td className="text">
                <Link href={`/stocks/${company.ticker}`}>{company.name}</Link>
                {company.crossListing ? (
                  <span className="cell-muted"> · cross-listed</span>
                ) : null}
              </td>

              {showSector && (
                <td className="text">
                  <Link href={`/sectors/${company.sectorSlug}`}>{company.sector}</Link>
                </td>
              )}

              <td>{quote?.price == null ? "—" : formatPrice(quote.price)}</td>

              <td className={changeClass(quote?.changePercent ?? null)}>
                {quote?.changePercent == null ? "—" : formatPercent(quote.changePercent)}
              </td>

              <td className="cell-muted">
                {quote?.previousClose == null ? "—" : formatPrice(quote.previousClose)}
              </td>

              <td className="cell-muted">
                {quote?.dayLow != null && quote?.dayHigh != null
                  ? `${formatPrice(quote.dayLow)} – ${formatPrice(quote.dayHigh)}`
                  : "—"}
              </td>

              <td>{formatCompactNumber(quote?.volume ?? null)}</td>
              <td>{formatCompactKes(quote?.turnover ?? null)}</td>
              <td>{formatCompactKes(quote?.marketCap ?? null)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
