"use client";

import { useMemo, useState } from "react";
import StockTile from "@/components/StockTile";
import TopMovers from "@/components/TopMovers";
import StockDetailsModal from "@/components/StockDetailsModal";
import MarketOverview from "@/components/MarketOverview";
import SectorPerformance from "@/components/SectorPerformance";
import { useLiveStocks } from "@/hooks/useLiveStocks";
import { useWatchlist } from "@/hooks/useWatchlist";

const indices = [
  {
    name: "NASI",
    description: "NSE All Share Index",
    value: "237.59",
    change: 1.24,
  },
  {
    name: "NSE 20",
    description: "NSE 20 Share Index",
    value: "4,197.46",
    change: 0.87,
  },
  {
    name: "NSE 25",
    description: "NSE 25 Share Index",
    value: "6,670.88",
    change: 1.13,
  },
  {
    name: "NSE 10",
    description: "NSE 10 Share Index",
    value: "2,588.24",
    change: 1.02,
  },
  {
    name: "NSE BSI",
    description: "Banking Share Index",
    value: "273.95",
    change: 0.52,
  },
  {
    name: "M.CAP",
    description: "Market Capitalisation",
    value: "3,987.24",
    change: 1.41,
  },
];

const SECTORS = [
  "All",
  "Banking",
  "Insurance",
  "Energy",
  "Manufacturing",
  "Telecommunications",
  "Investment",
  "Agriculture",
  "Construction",
  "Media",
  "Transport",
];

const SORTS = [
  { id: "default", label: "Default" },
  { id: "gainers", label: "Biggest Gainers" },
  { id: "losers", label: "Biggest Losers" },
  { id: "high", label: "Highest Price" },
  { id: "low", label: "Lowest Price" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

export default function Home() {
  const [activeSector, setActiveSector] = useState("All");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("default");
  const [view, setView] = useState<"all" | "watchlist">("all");
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const { stocks, paused, togglePaused, lastUpdate } = useLiveStocks();
  const { watchlist, toggleWatchlist, isInWatchlist } = useWatchlist();

  const sectors = useMemo(() => {
    const present = new Set(stocks.map((stock) => stock.sector));
    // Keep the canonical order from SECTORS, then append anything new.
    const ordered = SECTORS.filter((sector) => sector === "All" || present.has(sector));
    for (const sector of present) {
      if (!ordered.includes(sector)) ordered.push(sector);
    }
    return ordered;
  }, [stocks]);

  const filteredStocks = useMemo(() => {
    let result = stocks;

    if (view === "watchlist") {
      result = result.filter((stock) => watchlist.includes(stock.symbol));
    }

    if (activeSector !== "All") {
      result = result.filter((stock) => stock.sector === activeSector);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (stock) =>
          stock.symbol.toLowerCase().includes(query) ||
          stock.name.toLowerCase().includes(query)
      );
    }

    switch (sort) {
      case "gainers":
        result = [...result].sort((a, b) => b.change - a.change);
        break;
      case "losers":
        result = [...result].sort((a, b) => a.change - b.change);
        break;
      case "high":
        result = [...result].sort((a, b) => b.price - a.price);
        break;
      case "low":
        result = [...result].sort((a, b) => a.price - b.price);
        break;
      default:
        break;
    }

    return result;
  }, [stocks, view, watchlist, activeSector, search, sort]);

  const selectedStock = selectedSymbol
    ? stocks.find((stock) => stock.symbol === selectedSymbol) ?? null
    : null;

  const gainers = stocks.filter((stock) => stock.change > 0).length;
  const losers = stocks.filter((stock) => stock.change < 0).length;
  const unchanged = stocks.filter((stock) => stock.change === 0).length;

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
          <span>MARKET HEATMAP REPORT</span>
          <strong>17 SEP, 2026</strong>

          <button
            className="live-toggle"
            onClick={togglePaused}
            aria-pressed={paused}
          >
            <span className={paused ? "live-dot paused" : "live-dot"} />

            {paused ? "RESUME" : "LIVE"}
          </button>

          {lastUpdate && (
            <span className="last-update">
              Last tick {lastUpdate.toLocaleTimeString("en-KE")}
            </span>
          )}
        </div>
      </header>

      <section className="market-heading">
        <div>
          <span className="eyebrow">NSE — SIMULATED DATA</span>

          <h2>Market Heatmap</h2>

          <p>Market performance overview</p>
        </div>

        <div className="market-stats">
          <div className="stat">
            <span>GAINERS</span>
            <strong className="green">{gainers}</strong>
          </div>

          <div className="stat">
            <span>LOSERS</span>
            <strong className="red">{losers}</strong>
          </div>

          <div className="stat">
            <span>UNCHANGED</span>
            <strong>{unchanged}</strong>
          </div>
        </div>
      </section>

      <MarketOverview stocks={stocks} />

      <section className="controls" aria-label="Search, filter and sort">
        <div className="view-tabs" role="tablist" aria-label="Stock view">
          <button
            role="tab"
            aria-selected={view === "all"}
            className={view === "all" ? "active" : ""}
            onClick={() => setView("all")}
          >
            ALL STOCKS
          </button>

          <button
            role="tab"
            aria-selected={view === "watchlist"}
            className={view === "watchlist" ? "active" : ""}
            onClick={() => setView("watchlist")}
          >
            ★ WATCHLIST ({watchlist.length})
          </button>
        </div>

        <input
          className="search-input"
          type="search"
          placeholder="Search symbol or company…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          aria-label="Search stocks by symbol or company name"
        />

        <select
          className="sort-select"
          value={sort}
          onChange={(event) => setSort(event.target.value as SortId)}
          aria-label="Sort stocks"
        >
          {SORTS.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </select>
      </section>

      <section className="filters" aria-label="Sector filter">
        {sectors.map((sector) => (
          <button
            key={sector}
            className={sector === activeSector ? "active" : ""}
            onClick={() => setActiveSector(sector)}
            aria-pressed={sector === activeSector}
          >
            {sector}
          </button>
        ))}
      </section>

      <section className="heatmap" aria-label="Stock heatmap">
        {filteredStocks.length > 0 ? (
          filteredStocks.map((stock) => (
            <StockTile
              key={`${stock.symbol}-${stock.name}`}
              stock={stock}
              onSelect={setSelectedSymbol}
              inWatchlist={isInWatchlist(stock.symbol)}
              onToggleWatchlist={toggleWatchlist}
            />
          ))
        ) : (
          <div className="heatmap-empty">
            {view === "watchlist" && watchlist.length === 0
              ? "Your watchlist is empty — tap the ☆ on any stock tile to track it."
              : "No stocks match your search or filters."}
          </div>
        )}
      </section>

      <TopMovers stocks={stocks} onSelect={setSelectedSymbol} />

      <SectorPerformance stocks={stocks} />

      <section className="indices-section">
        <div className="section-title">NSE SHARE INDICES</div>

        <div className="indices">
          {indices.map((index) => (
            <div className="index-card" key={index.name}>
              <div>
                <strong>{index.name}</strong>

                <span>{index.description}</span>
              </div>

              <div className="index-value">
                <span
                  className={`index-change ${
                    index.change < 0 ? "negative" : ""
                  }`}
                >
                  {index.change < 0 ? "▼" : "▲"} {index.change.toFixed(2)}%
                </span>

                <strong>{index.value}</strong>
              </div>
            </div>
          ))}
        </div>
      </section>

      <footer>
        <span>KENYA MARKET INTELLIGENCE</span>

        <span>Market data dashboard • Prototype — simulated data, not live NSE feed</span>
      </footer>

      {selectedStock && (
        <StockDetailsModal
          stock={selectedStock}
          onClose={() => setSelectedSymbol(null)}
          inWatchlist={isInWatchlist(selectedStock.symbol)}
          onToggleWatchlist={toggleWatchlist}
        />
      )}
    </main>
  );
}
