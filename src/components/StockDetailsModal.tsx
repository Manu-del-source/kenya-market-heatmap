"use client";

import { useEffect, useRef, useState } from "react";
import { LiveStock } from "@/hooks/useLiveStocks";
import { Timeframe } from "@/data/stocks";
import StockChart from "./StockChart";

type StockDetailsModalProps = {
  stock: LiveStock;
  onClose: () => void;
  inWatchlist: boolean;
  onToggleWatchlist: (symbol: string) => void;
};

function formatPrice(price: number) {
  return price.toLocaleString("en-KE", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatCompact(value: number) {
  if (value >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString("en-KE");
}

export default function StockDetailsModal({
  stock,
  onClose,
  inWatchlist,
  onToggleWatchlist,
}: StockDetailsModalProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");
  const closeRef = useRef<HTMLButtonElement>(null);

  // Escape closes the modal; focus moves to the close button when it opens.
  useEffect(() => {
    closeRef.current?.focus();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  // Lock background scrolling while the modal is open.
  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  const positive = stock.change > 0;
  const negative = stock.change < 0;
  const changeClass = positive ? "green" : negative ? "red" : "";

  const rows: Array<{ label: string; value: string; mock?: boolean }> = [
    { label: "PREV CLOSE", value: `KSh ${formatPrice(stock.previousClose)}` },
    { label: "DAY HIGH", value: `KSh ${formatPrice(stock.dayHigh)}` },
    { label: "DAY LOW", value: `KSh ${formatPrice(stock.dayLow)}` },
    { label: "VOLUME", value: formatCompact(stock.volume), mock: true },
    { label: "52W HIGH", value: `KSh ${formatPrice(stock.week52High)}`, mock: true },
    { label: "52W LOW", value: `KSh ${formatPrice(stock.week52Low)}`, mock: true },
    { label: "MARKET CAP", value: `KSh ${formatCompact(stock.marketCap)}`, mock: true },
  ];

  return (
    <div
      className="modal-backdrop"
      onClick={onClose}
      role="presentation"
    >
      <section
        className="modal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="stock-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-header">
          <div>
            <span className="modal-eyebrow">STOCK DETAILS — SIMULATED DATA</span>

            <h3 id="stock-modal-title">
              {stock.symbol}
              <span className="modal-company">{stock.name}</span>
            </h3>

            <span className="modal-sector">{stock.sector}</span>
          </div>

          <div className="modal-header-actions">
            <button
              type="button"
              className={`watch-star ${inWatchlist ? "active" : ""}`}
              onClick={() => onToggleWatchlist(stock.symbol)}
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

            <button
              type="button"
              ref={closeRef}
              className="modal-close"
              onClick={onClose}
              aria-label="Close stock details"
            >
              ✕
            </button>
          </div>
        </header>

        <div className="modal-price-row">
          <strong className="modal-price">
            KSh {formatPrice(stock.price)}
          </strong>

          <span className={`modal-change ${changeClass}`}>
            {positive ? "▲" : negative ? "▼" : "—"} {Math.abs(stock.change).toFixed(2)}%
          </span>
        </div>

        <StockChart
          series={stock.historicalPrices[timeframe]}
          timeframe={timeframe}
          onTimeframeChange={setTimeframe}
        />

        <div className="modal-grid">
          {rows.map((row) => (
            <div className="modal-field" key={row.label}>
              <span>{row.label}</span>
              <strong>
                {row.value}
                {row.mock && <em className="mock-tag" title="Prototype value, not live">MOCK</em>}
              </strong>
            </div>
          ))}
        </div>

        <footer className="modal-footnote">
          Prototype — all values are simulated and must not be treated as live NSE data.
        </footer>
      </section>
    </div>
  );
}
