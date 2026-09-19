"use client";

/**
 * The interactive market dashboard: heatmap + controls + movers + breadth +
 * sectors + indices.
 *
 * The server renders this component with the first snapshot (so the page is
 * complete without JavaScript and is indexable), after which it can refresh
 * itself from /api/market. Switching metric, sector or sort happens locally —
 * no network round-trip, no layout thrash.
 */

import { useCallback, useMemo, useState } from "react";
import StockTile from "./StockTile";
import WatchlistStar from "./WatchlistStar";
import TopMovers from "./TopMovers";
import MarketOverview from "./MarketOverview";
import MarketBreadth from "./MarketBreadth";
import SectorPerformance from "./SectorPerformance";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketRefresh } from "@/hooks/useMarketRefresh";
import {
  COLOR_METRICS,
  SIZE_METRICS,
  type ColorMetric,
  type IndexQuote,
  type MarketDataMeta,
  type MarketOverview as MarketOverviewType,
  type SizeMetric,
} from "@/lib/types/market";
import { changeClass, formatNumber, formatPercent } from "@/lib/format";

export type DashboardCompany = {
  ticker: string;
  name: string;
  sector: string;
  sectorSlug: string;
};

export type HeatmapMetrics = {
  daily: number | null;
  weekly: number | null;
  monthly: number | null;
  marketCap: number | null;
  volume: number | null;
  turnover: number | null;
  price: number | null;
};

const SORTS = [
  { id: "default", label: "Default" },
  { id: "gainers", label: "Biggest Gainers" },
  { id: "losers", label: "Biggest Losers" },
  { id: "high", label: "Highest Price" },
  { id: "low", label: "Lowest Price" },
  { id: "cap", label: "Largest Cap" },
  { id: "turnover", label: "Most Traded" },
] as const;

type SortId = (typeof SORTS)[number]["id"];

const SIZE_LABEL: Record<SizeMetric, string> = {
  marketCap: "Market cap",
  volume: "Volume",
  turnover: "Turnover",
};

const COLOUR_LABEL: Record<ColorMetric, string> = {
  daily: "Daily return",
  weekly: "Weekly return",
  monthly: "Monthly return",
};

type MarketDashboardProps = {
  initialOverview: MarketOverviewType;
  companies: DashboardCompany[];
  metrics: Record<string, HeatmapMetrics>;
  meta: MarketDataMeta;
  /** Polling is pointless for the demo provider: the values never change. */
  refreshEnabled: boolean;
  refreshIntervalMs: number;
};

export default function MarketDashboard({
  initialOverview,
  companies,
  metrics,
  meta,
  refreshEnabled,
  refreshIntervalMs,
}: MarketDashboardProps) {
  // Null until an automatic refresh succeeds; the server payload is the source
  // of truth until then (and after navigation brings a new one).
  const [refreshed, setRefreshed] = useState<MarketOverviewType | null>(null);
  const [view, setView] = useState<"all" | "watchlist">("all");
  const [sector, setSector] = useState("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortId>("default");
  const [sizeBy, setSizeBy] = useState<SizeMetric>("marketCap");
  const [colorBy, setColorBy] = useState<ColorMetric>("daily");

  const { watchlist, toggleWatchlist, isInWatchlist } = useWatchlist();

  const refresh = useCallback(async () => {
    const response = await fetch("/api/market", { cache: "no-store" });
    if (!response.ok) throw new Error(`Market refresh failed (${response.status})`);
    const payload = (await response.json()) as { data: MarketOverviewType };
    setRefreshed(payload.data);
  }, []);

  const { paused, togglePaused, lastUpdate, refreshing, error } = useMarketRefresh(refresh, {
    intervalMs: refreshIntervalMs,
    enabled: refreshEnabled,
  });

  const overview = refreshed ?? initialOverview;

  const nameByTicker = useMemo(() => {
    const map: Record<string, string> = {};
    for (const company of companies) map[company.ticker] = company.name;
    return map;
  }, [companies]);

  const sectors = useMemo(() => {
    const present = new Set(companies.map((company) => company.sectorSlug));
    const counts = new Map<string, number>();
    for (const company of companies) {
      counts.set(company.sectorSlug, (counts.get(company.sectorSlug) ?? 0) + 1);
    }
    return [...present]
      .map((slug) => ({
        slug,
        name: companies.find((company) => company.sectorSlug === slug)?.sector ?? slug,
        count: counts.get(slug) ?? 0,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [companies]);

  /** All quotes for the universe, merged from metrics (price) + overview. */
  const rows = useMemo(() => {
    return companies.map((company) => {
      const metric = metrics[company.ticker] ?? null;
      return {
        company,
        metric,
        price: metric?.price ?? null,
      };
    });
  }, [companies, metrics]);

  const filtered = useMemo(() => {
    let result = rows;

    if (view === "watchlist") {
      result = result.filter((row) => watchlist.includes(row.company.ticker));
    }

    if (sector !== "all") {
      result = result.filter((row) => row.company.sectorSlug === sector);
    }

    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(
        (row) =>
          row.company.ticker.toLowerCase().includes(query) ||
          row.company.name.toLowerCase().includes(query)
      );
    }

    const metricFor = (ticker: string) => metrics[ticker] ?? null;

    switch (sort) {
      case "gainers":
        result = [...result].sort(
          (a, b) => (metricFor(b.company.ticker)?.daily ?? -Infinity) - (metricFor(a.company.ticker)?.daily ?? -Infinity)
        );
        break;
      case "losers":
        result = [...result].sort(
          (a, b) => (metricFor(a.company.ticker)?.daily ?? Infinity) - (metricFor(b.company.ticker)?.daily ?? Infinity)
        );
        break;
      case "high":
        result = [...result].sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
        break;
      case "low":
        result = [...result].sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
        break;
      case "cap":
        result = [...result].sort(
          (a, b) => (metricFor(b.company.ticker)?.marketCap ?? -Infinity) - (metricFor(a.company.ticker)?.marketCap ?? -Infinity)
        );
        break;
      case "turnover":
        result = [...result].sort(
          (a, b) => (metricFor(b.company.ticker)?.turnover ?? -Infinity) - (metricFor(a.company.ticker)?.turnover ?? -Infinity)
        );
        break;
      default:
        break;
    }

    return result;
  }, [rows, view, watchlist, sector, search, sort, metrics]);

  /** Size weight 0–1, computed from the selected metric across visible tiles. */
  const weights = useMemo(() => {
    const values = filtered
      .map((row) => {
        const metric = metrics[row.company.ticker];
        if (!metric) return null;
        const value =
          sizeBy === "marketCap"
            ? metric.marketCap
            : sizeBy === "volume"
              ? metric.volume
              : metric.turnover;
        return value === null ? null : Math.log10(Math.max(value, 1) + 1);
      })
      .filter((value): value is number => value !== null);

    const min = values.length > 0 ? Math.min(...values) : 0;
    const max = values.length > 0 ? Math.max(...values) : 1;
    const span = max - min || 1;

    const map: Record<string, number> = {};
    for (const row of filtered) {
      const metric = metrics[row.company.ticker];
      const raw =
        sizeBy === "marketCap"
          ? metric?.marketCap
          : sizeBy === "volume"
            ? metric?.volume
            : metric?.turnover;
      if (raw === null || raw === undefined) {
        map[row.company.ticker] = 0;
        continue;
      }
      const scaled = Math.log10(Math.max(raw, 1) + 1);
      map[row.company.ticker] = Math.min(1, Math.max(0, (scaled - min) / span));
    }
    return map;
  }, [filtered, metrics, sizeBy]);

  return (
    <>
      <MarketOverview summary={overview.summary} mode={meta.dataMode} />

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

      <section className="heatmap-controls" aria-label="Heatmap options">
        <div className="control-group">
          <span>SIZE BY</span>
          <select
            value={sizeBy}
            onChange={(event) => setSizeBy(event.target.value as SizeMetric)}
            aria-label="Heatmap tile size metric"
          >
            {SIZE_METRICS.map((option) => (
              <option key={option} value={option}>
                {SIZE_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <span>COLOUR BY</span>
          <select
            value={colorBy}
            onChange={(event) => setColorBy(event.target.value as ColorMetric)}
            aria-label="Heatmap colour metric"
          >
            {COLOR_METRICS.map((option) => (
              <option key={option} value={option}>
                {COLOUR_LABEL[option]}
              </option>
            ))}
          </select>
        </div>

        <div className="control-group">
          <span>UPDATED</span>
          <span aria-live="polite">
            {refreshing
              ? "refreshing…"
              : lastUpdate
                ? lastUpdate.toLocaleTimeString("en-KE")
                : "on load"}
          </span>

          {refreshEnabled && (
            <button
              className="live-toggle"
              onClick={togglePaused}
              aria-pressed={paused}
              title="Pause or resume automatic refresh"
            >
              <span className={paused ? "live-dot paused" : "live-dot"} />
              {paused ? "RESUME" : "AUTO"}
            </button>
          )}
        </div>

        {error && <span className="section-note">{error}</span>}
      </section>

      <section className="filters" aria-label="Sector filter">
        <button
          className={sector === "all" ? "active" : ""}
          onClick={() => setSector("all")}
          aria-pressed={sector === "all"}
        >
          All
        </button>

        {sectors.map((entry) => (
          <button
            key={entry.slug}
            className={sector === entry.slug ? "active" : ""}
            onClick={() => setSector(entry.slug)}
            aria-pressed={sector === entry.slug}
          >
            {entry.name} ({entry.count})
          </button>
        ))}
      </section>

      <section className="heatmap" aria-label="Stock heatmap">
        {filtered.length > 0 ? (
          filtered.map((row) => {
            const metric = metrics[row.company.ticker] ?? null;
            const colorValue =
              colorBy === "daily"
                ? metric?.daily ?? null
                : colorBy === "weekly"
                  ? metric?.weekly ?? null
                  : metric?.monthly ?? null;

            return (
              <StockTile
                key={row.company.ticker}
                ticker={row.company.ticker}
                name={row.company.name}
                tier={tierFor(weights[row.company.ticker] ?? 0)}
                colorValue={colorValue}
                weight={weights[row.company.ticker] ?? 0}
                price={row.price}
                colorMetric={colorBy}
                star={
                  <WatchlistStar
                    ticker={row.company.ticker}
                    active={isInWatchlist(row.company.ticker)}
                    onToggle={toggleWatchlist}
                  />
                }
              />
            );
          })
        ) : (
          <div className="heatmap-empty">
            {view === "watchlist" && watchlist.length === 0
              ? "Your watchlist is empty — tap the ☆ on any stock tile to track it."
              : "No stocks match your search or filters."}
          </div>
        )}
      </section>

      <TopMovers
        gainers={overview.topGainers}
        losers={overview.topLosers}
        nameByTicker={nameByTicker}
      />

      <MarketBreadth breadth={overview.breadth} sectorLabel="companies" />

      <SectorPerformance sectors={overview.sectors} />

      <section className="indices-section" aria-label="NSE share indices">
        <div className="section-head">
          <div className="section-title">NSE SHARE INDICES</div>
          <span className="section-note">
            {meta.dataMode === "demo"
              ? "Proxy levels derived from the sample quotes — not official index values"
              : meta.attribution}
          </span>
        </div>

        <div className="indices">
          {overview.indices.map((index) => (
            <IndexCard key={index.symbol} index={index} />
          ))}
        </div>
      </section>

      <p className="breadth-caveat">
        Showing {filtered.length} of {rows.length} listed companies
        {sector !== "all" ? ` in ${sectors.find((entry) => entry.slug === sector)?.name ?? sector}` : ""}
        . Figures are {meta.dataMode === "demo" ? "sample data" : meta.dataMode} as
        of the latest snapshot.
      </p>
    </>
  );
}

/** Map a 0–1 size weight onto one of three grid tiers. */
function tierFor(weight: number): "sm" | "md" | "lg" {
  if (weight >= 0.72) return "lg";
  if (weight >= 0.42) return "md";
  return "sm";
}

function IndexCard({ index }: { index: IndexQuote }) {
  return (
    <div className="index-card">
      <div>
        <strong>{index.symbol}</strong>
        <span>{index.description ?? index.name}</span>
      </div>

      <div className="index-value">
        <span className={`index-change ${(index.changePercent ?? 0) < 0 ? "negative" : ""}`}>
          {index.changePercent === null
            ? "—"
            : `${index.changePercent > 0 ? "▲" : index.changePercent < 0 ? "▼" : "—"} ${formatPercent(index.changePercent)}`}
        </span>
        <strong className={changeClass(index.changePercent)}>
          {index.value === null ? "—" : formatNumber(index.value)}
        </strong>
      </div>
    </div>
  );
}
