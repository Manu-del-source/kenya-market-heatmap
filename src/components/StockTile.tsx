import { LiveStock } from "@/hooks/useLiveStocks";

type StockTileProps = {
  stock: LiveStock;
  onSelect: (symbol: string) => void;
  inWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
};

export default function StockTile({
  stock,
  onSelect,
  inWatchlist,
  onToggleWatchlist,
}: StockTileProps) {
  const positive = stock.change > 0;
  const negative = stock.change < 0;

  const intensity = Math.min(Math.abs(stock.change) / 5, 1);

  const background = positive
    ? `color-mix(in srgb, #16a34a ${25 + intensity * 55}%, #052e16)`
    : negative
      ? `color-mix(in srgb, #dc2626 ${25 + intensity * 55}%, #450a0a)`
      : "#1f2937";

  const directionClass =
    stock.direction === "up"
      ? "tick-up"
      : stock.direction === "down"
        ? "tick-down"
        : "";

  return (
    <div
      className={`stock-tile ${directionClass}`}
      style={{ background }}
      role="button"
      tabIndex={0}
      onClick={() => onSelect(stock.symbol)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onSelect(stock.symbol);
        }
      }}
      aria-label={`View ${stock.symbol} — ${stock.name} details`}
    >
      <button
        type="button"
        className={`tile-star ${inWatchlist ? "active" : ""}`}
        onClick={(event) => {
          event.stopPropagation();
          onToggleWatchlist(stock.symbol);
        }}
        aria-pressed={inWatchlist}
        aria-label={
          inWatchlist
            ? `Remove ${stock.symbol} from watchlist`
            : `Add ${stock.symbol} to watchlist`
        }
        title={inWatchlist ? "Remove from watchlist" : "Add to watchlist"}
      >
        {inWatchlist ? "★" : "☆"}
      </button>

      <div className="stock-symbol">{stock.symbol}</div>

      <div className="stock-name">{stock.name}</div>

      <div
        className={`stock-change ${positive ? "positive" : ""} ${
          negative ? "negative" : ""
        }`}
      >
        {positive ? "▲" : negative ? "▼" : "—"} {Math.abs(stock.change).toFixed(2)}%
      </div>

      <div className="stock-price">
        KSh{" "}
        {stock.price.toLocaleString("en-KE", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </div>
    </div>
  );
}
