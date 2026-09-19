/**
 * Top gainers and losers.
 *
 * Rows link to the company page. Instruments with no usable change are left out
 * rather than shown as 0.00%.
 */

import Link from "next/link";
import type { Quote } from "@/lib/types/market";
import { formatPercent, formatPrice } from "@/lib/format";

type TopMoversProps = {
  gainers: Quote[];
  losers: Quote[];
  nameByTicker: Record<string, string>;
};

function MoverRow({
  quote,
  rank,
  name,
}: {
  quote: Quote;
  rank: number;
  name: string;
}) {
  const up = (quote.changePercent ?? 0) >= 0;
  return (
    <Link
      className="mover-row"
      href={`/stocks/${quote.ticker}`}
      aria-label={`View ${quote.ticker} — ${name} details`}
    >
      <span className="mover-rank">{rank + 1}</span>

      <span className="mover-info">
        <strong>{quote.ticker}</strong>
        <span>{name}</span>
      </span>

      <span className="mover-value">
        <strong className={up ? "green" : "red"}>
          {up ? "▲" : "▼"} {formatPercent(quote.changePercent)}
        </strong>
        <span>KSh {formatPrice(quote.price)}</span>
      </span>
    </Link>
  );
}

export default function TopMovers({ gainers, losers, nameByTicker }: TopMoversProps) {
  return (
    <section className="movers-section" aria-label="Top movers">
      <div className="section-head">
        <div className="section-title">TOP MOVERS</div>
        <span className="section-note">By percentage change in the current snapshot</span>
      </div>

      <div className="movers">
        <div className="movers-column">
          <div className="movers-header green">TOP GAINERS</div>

          {gainers.length > 0 ? (
            gainers.map((quote, rank) => (
              <MoverRow
                key={quote.ticker}
                quote={quote}
                rank={rank}
                name={nameByTicker[quote.ticker] ?? quote.ticker}
              />
            ))
          ) : (
            <div className="mover-empty">No gainers in this snapshot</div>
          )}
        </div>

        <div className="movers-column">
          <div className="movers-header red">TOP LOSERS</div>

          {losers.length > 0 ? (
            losers.map((quote, rank) => (
              <MoverRow
                key={quote.ticker}
                quote={quote}
                rank={rank}
                name={nameByTicker[quote.ticker] ?? quote.ticker}
              />
            ))
          ) : (
            <div className="mover-empty">No losers in this snapshot</div>
          )}
        </div>
      </div>
    </section>
  );
}
