import { LiveStock } from "@/hooks/useLiveStocks";

type TopMoversProps = {
  stocks: LiveStock[];
  onSelect: (symbol: string) => void;
};

function formatPrice(price: number) {
  return price.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function TopMovers({ stocks, onSelect }: TopMoversProps) {
  const gainers = [...stocks]
    .filter((stock) => stock.change > 0)
    .sort((a, b) => b.change - a.change)
    .slice(0, 5);

  const losers = [...stocks]
    .filter((stock) => stock.change < 0)
    .sort((a, b) => a.change - b.change)
    .slice(0, 5);

  return (
    <section className="movers-section">
      <div className="section-title">TOP MOVERS</div>

      <div className="movers">
        <div className="movers-column">
          <div className="movers-header green">TOP GAINERS</div>

          {gainers.length > 0 ? (
            gainers.map((stock, rank) => (
              <button
                type="button"
                className="mover-row"
                key={stock.symbol}
                onClick={() => onSelect(stock.symbol)}
                aria-label={`View ${stock.symbol} — ${stock.name} details`}
              >
                <span className="mover-rank">{rank + 1}</span>

                <div className="mover-info">
                  <strong>{stock.symbol}</strong>

                  <span>{stock.name}</span>
                </div>

                <div className="mover-value">
                  <strong className="green">▲ {stock.change.toFixed(2)}%</strong>

                  <span>KSh {formatPrice(stock.price)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="mover-empty">No gainers right now</div>
          )}
        </div>

        <div className="movers-column">
          <div className="movers-header red">TOP LOSERS</div>

          {losers.length > 0 ? (
            losers.map((stock, rank) => (
              <button
                type="button"
                className="mover-row"
                key={stock.symbol}
                onClick={() => onSelect(stock.symbol)}
                aria-label={`View ${stock.symbol} — ${stock.name} details`}
              >
                <span className="mover-rank">{rank + 1}</span>

                <div className="mover-info">
                  <strong>{stock.symbol}</strong>

                  <span>{stock.name}</span>
                </div>

                <div className="mover-value">
                  <strong className="red">▼ {stock.change.toFixed(2)}%</strong>

                  <span>KSh {formatPrice(stock.price)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="mover-empty">No losers right now</div>
          )}
        </div>
      </div>
    </section>
  );
}
