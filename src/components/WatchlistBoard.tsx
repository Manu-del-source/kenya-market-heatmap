"use client";

/**
 * Watchlist board: reads symbols from localStorage, fetches their quotes, and
 * lets the visitor reorder or remove entries.
 *
 * Quotes are fetched from the public API rather than embedded at build time, so
 * the board reflects the latest snapshot every time it is opened.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useWatchlist } from "@/hooks/useWatchlist";
import { useMarketRefresh } from "@/hooks/useMarketRefresh";
import type { Company, MarketDataMeta, Quote } from "@/lib/types/market";
import {
  changeClass,
  formatCompactKes,
  formatCompactNumber,
  formatPercent,
  formatPrice,
} from "@/lib/format";

type ApiPayload = {
  data: {
    items: Array<{ company: Company; quote: Quote | null }>;
    total: number;
  };
  meta: MarketDataMeta;
};

export default function WatchlistBoard() {
  const { watchlist, removeFromWatchlist, moveInWatchlist, clearWatchlist } = useWatchlist();
  const [rows, setRows] = useState<Array<{ company: Company; quote: Quote | null }>>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<MarketDataMeta["dataMode"] | null>(null);

  const load = useCallback(async () => {
    if (watchlist.length === 0) {
      setRows([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/stocks?symbols=${encodeURIComponent(watchlist.join(","))}&pageSize=100`,
        { cache: "no-store" }
      );
      if (!response.ok) throw new Error(`Quotes unavailable (${response.status})`);
      const payload = (await response.json()) as ApiPayload;
      // Keep the user's ordering rather than the API's.
      const order = new Map(watchlist.map((ticker, index) => [ticker, index]));
      setRows(
        [...payload.data.items].sort(
          (a, b) => (order.get(a.company.ticker) ?? 0) - (order.get(b.company.ticker) ?? 0)
        )
      );
      setMode(payload.meta.dataMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Quotes unavailable");
    } finally {
      setLoading(false);
    }
  }, [watchlist]);

  useEffect(() => {
    // Fetch whenever the stored symbols change. `setState` inside `load` runs
    // after the request resolves, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const { paused, togglePaused, lastUpdate, refreshing } = useMarketRefresh(load, {
    intervalMs: 120_000,
    enabled: watchlist.length > 0 && mode !== "demo",
  });

  const summary = useMemo(() => {
    const priced = rows.filter((row) => row.quote?.price != null);
    const changes = priced
      .map((row) => row.quote?.changePercent)
      .filter((value): value is number => value != null);
    const values = priced
      .map((row) => row.quote?.marketCap)
      .filter((value): value is number => value != null);

    return {
      count: rows.length,
      priced: priced.length,
      averageChange: changes.length ? changes.reduce((a, b) => a + b, 0) / changes.length : null,
      advancing: changes.filter((value) => value > 0).length,
      declining: changes.filter((value) => value < 0).length,
      value: values.length ? values.reduce((a, b) => a + b, 0) : null,
    };
  }, [rows]);

  if (watchlist.length === 0) {
    return (
      <div className="empty-state">
        Your watchlist is empty.
        <br />
        Use the ☆ on any heatmap tile or company page to start tracking NSE
        companies.
        <p style={{ marginTop: 16 }}>
          <Link className="ghost-button" href="/stocks">
            BROWSE LISTED COMPANIES
          </Link>
        </p>
      </div>
    );
  }

  return (
    <>
      <section className="stat-grid" aria-label="Watchlist summary">
        <div className="stat-card">
          <span>TRACKED</span>
          <strong>{summary.count}</strong>
        </div>
        <div className="stat-card">
          <span>AVG CHANGE</span>
          <strong className={changeClass(summary.averageChange)}>
            {formatPercent(summary.averageChange)}
          </strong>
        </div>
        <div className="stat-card">
          <span>ADVANCING</span>
          <strong className="green">{summary.advancing}</strong>
        </div>
        <div className="stat-card">
          <span>DECLINING</span>
          <strong className="red">{summary.declining}</strong>
        </div>
        <div className="stat-card">
          <span>COMBINED CAP</span>
          <strong>{formatCompactKes(summary.value)}</strong>
        </div>
      </section>

      <section className="watchlist-actions">
        <button
          className="ghost-button"
          onClick={() => void load()}
          disabled={loading}
          title="Fetch the latest snapshot"
        >
          {refreshing ? "REFRESHING…" : "REFRESH"}
        </button>

        {mode && mode !== "demo" && (
          <button className="ghost-button" onClick={togglePaused} aria-pressed={paused}>
            {paused ? "RESUME AUTO" : "AUTO: ON"}
          </button>
        )}

        <button className="ghost-button" onClick={clearWatchlist}>
          CLEAR WATCHLIST
        </button>

        {lastUpdate && (
          <span className="section-note">
            Updated {lastUpdate.toLocaleTimeString("en-KE")}
          </span>
        )}
      </section>

      {error && (
        <p className="breadth-caveat" style={{ marginTop: 12 }}>
          {error}
        </p>
      )}

      <div className="data-table-wrap" style={{ marginTop: 14 }}>
        <table className="data-table">
          <caption>
            Reorder with ↑ / ↓, remove with ✕. Order and contents are stored in
            this browser only.
          </caption>

          <thead>
            <tr>
              <th className="text">Order</th>
              <th className="text">Symbol</th>
              <th className="text">Company</th>
              <th className="text">Sector</th>
              <th>Last (KSh)</th>
              <th>Change</th>
              <th>Volume</th>
              <th>Market cap</th>
              <th>Remove</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((row, index) => (
              <tr key={row.company.ticker}>
                <td className="text">
                  <button
                    className="ghost-button"
                    onClick={() => moveInWatchlist(row.company.ticker, -1)}
                    disabled={index === 0}
                    aria-label={`Move ${row.company.ticker} up`}
                  >
                    ↑
                  </button>
                  <button
                    className="ghost-button"
                    onClick={() => moveInWatchlist(row.company.ticker, 1)}
                    disabled={index === rows.length - 1}
                    aria-label={`Move ${row.company.ticker} down`}
                  >
                    ↓
                  </button>
                </td>

                <td className="text">
                  <Link href={`/stocks/${row.company.ticker}`}>{row.company.ticker}</Link>
                </td>

                <td className="text">
                  <Link href={`/stocks/${row.company.ticker}`}>{row.company.name}</Link>
                </td>

                <td className="text">
                  <Link href={`/sectors/${row.company.sectorSlug}`}>{row.company.sector}</Link>
                </td>

                <td>{row.quote?.price == null ? "—" : formatPrice(row.quote.price)}</td>

                <td className={changeClass(row.quote?.changePercent ?? null)}>
                  {formatPercent(row.quote?.changePercent ?? null)}
                </td>

                <td>{formatCompactNumber(row.quote?.volume ?? null)}</td>
                <td>{formatCompactKes(row.quote?.marketCap ?? null)}</td>

                <td>
                  <button
                    className="ghost-button"
                    onClick={() => removeFromWatchlist(row.company.ticker)}
                    aria-label={`Remove ${row.company.ticker} from watchlist`}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}

            {rows.length === 0 && !loading && (
              <tr>
                <td className="text cell-muted" colSpan={9}>
                  No quotes returned for the symbols in your watchlist.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
