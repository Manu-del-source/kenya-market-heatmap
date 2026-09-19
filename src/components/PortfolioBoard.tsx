"use client";

/**
 * Portfolio board (Phase 12).
 *
 * Holdings live in this browser; the server only *values* them. On every change
 * the board POSTs the holdings to `/api/portfolio/valuation` and renders the
 * result, so valuation always uses the same verified quotes the rest of the
 * platform displays.
 *
 * Rules visible in the UI:
 *  - a holding with no verifiable price is listed as unpriced and excluded from
 *    every total (never valued at zero);
 *  - without an entered average cost, unrealised P/L shows `—`, not 0.00%;
 *  - allocation and concentration are described, never recommended;
 *  - there is no buy/sell action anywhere — this is tracking only.
 */

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import DataBadge from "@/components/DataBadge";
import { usePortfolio } from "@/hooks/usePortfolio";
import { useMarketRefresh } from "@/hooks/useMarketRefresh";
import {
  NOT_AVAILABLE,
  changeClass,
  formatCompactKes,
  formatDateTime,
  formatKes,
  formatPercent,
  formatPrice,
} from "@/lib/format";
import type { DataMode } from "@/lib/types/market";
import type { PortfolioValuation } from "@/lib/types/portfolio";

type ApiPayload = {
  data: PortfolioValuation;
  meta: { dataMode: DataMode; asOf: string };
};

export default function PortfolioBoard({
  companies,
}: {
  /** Ticker + name for the picker; the page supplies the real universe. */
  companies: Array<{ ticker: string; name: string; sector: string }>;
}) {
  const { holdings, addHolding, updateHolding, removeHolding, clearPortfolio } = usePortfolio();
  const [valuation, setValuation] = useState<PortfolioValuation | null>(null);
  const [mode, setMode] = useState<DataMode | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [ticker, setTicker] = useState("");
  const [quantity, setQuantity] = useState("");
  const [cost, setCost] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ ticker: string; quantity: string; cost: string } | null>(
    null
  );

  const load = useCallback(async () => {
    if (holdings.length === 0) {
      setValuation(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/portfolio/valuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ holdings }),
        cache: "no-store",
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        throw new Error(body?.error?.message ?? `Valuation unavailable (${response.status})`);
      }
      const payload = (await response.json()) as ApiPayload;
      setValuation(payload.data);
      setMode(payload.meta.dataMode);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Valuation unavailable");
    } finally {
      setLoading(false);
    }
  }, [holdings]);

  useEffect(() => {
    // Valuation follows the stored holdings. `setState` inside `load` runs after
    // the request resolves, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const { paused, togglePaused, lastUpdate, refreshing } = useMarketRefresh(load, {
    intervalMs: 180_000,
    enabled: holdings.length > 0 && mode !== "demo",
  });

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const symbol = ticker.trim().toUpperCase();
    const qty = Number(quantity);

    if (!companies.some((company) => company.ticker === symbol)) {
      setFormError(`${symbol || "That ticker"} is not in the tracked universe.`);
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be a positive number.");
      return;
    }

    const parsedCost = cost.trim() === "" ? null : Number(cost);
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setFormError("Average cost must be zero or more, or left blank.");
      return;
    }

    setFormError(null);
    addHolding(symbol, qty, parsedCost);
    setTicker("");
    setQuantity("");
    setCost("");
  };

  const saveEdit = () => {
    if (!editing) return;
    const qty = Number(editing.quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setFormError("Quantity must be a positive number.");
      return;
    }
    const parsedCost = editing.cost.trim() === "" ? null : Number(editing.cost);
    if (parsedCost !== null && (!Number.isFinite(parsedCost) || parsedCost < 0)) {
      setFormError("Average cost must be zero or more, or left blank.");
      return;
    }
    setFormError(null);
    updateHolding(editing.ticker, qty, parsedCost);
    setEditing(null);
  };

  const concentration = valuation?.concentration;

  return (
    <>
      <form className="portfolio-form" onSubmit={submit}>
        <label className="control-group">
          <span>TICKER</span>
          <input
            className="search-input"
            list="portfolio-ticker-options"
            value={ticker}
            placeholder="e.g. KCB"
            onChange={(event) => setTicker(event.target.value.toUpperCase())}
          />
        </label>
        <datalist id="portfolio-ticker-options">
          {companies.map((company) => (
            <option key={company.ticker} value={company.ticker}>
              {company.name}
            </option>
          ))}
        </datalist>

        <label className="control-group">
          <span>SHARES</span>
          <input
            className="search-input"
            inputMode="decimal"
            value={quantity}
            placeholder="1000"
            onChange={(event) => setQuantity(event.target.value)}
          />
        </label>

        <label className="control-group">
          <span>AVG COST (OPTIONAL)</span>
          <input
            className="search-input"
            inputMode="decimal"
            value={cost}
            placeholder="KSh / share"
            onChange={(event) => setCost(event.target.value)}
          />
        </label>

        <button className="ghost-button" type="submit">
          ADD HOLDING
        </button>
      </form>

      {formError && <p className="breadth-caveat">{formError}</p>}

      {holdings.length === 0 && (
        <div className="empty-state">
          No holdings yet — add the shares you already own above.
          <br />
          This tool tracks them; it does not place orders.
          <p style={{ marginTop: 16 }}>
            <Link className="ghost-button" href="/stocks">
              BROWSE LISTED COMPANIES
            </Link>
          </p>
        </div>
      )}

      <section className="watchlist-actions">
        <button className="ghost-button" onClick={() => void load()} disabled={loading}>
          {refreshing ? "REFRESHING…" : "REFRESH"}
        </button>

        {mode && mode !== "demo" && (
          <button className="ghost-button" onClick={togglePaused} aria-pressed={paused}>
            {paused ? "RESUME AUTO" : "AUTO: ON"}
          </button>
        )}

        <button className="ghost-button" onClick={clearPortfolio}>
          CLEAR PORTFOLIO
        </button>

        {mode && <DataBadge mode={mode} />}

        {lastUpdate && (
          <span className="section-note">
            Updated {lastUpdate.toLocaleTimeString("en-KE")}
          </span>
        )}
      </section>

      {error && <p className="breadth-caveat">{error}</p>}

      {valuation && (
        <>
          <section className="stat-grid" aria-label="Portfolio summary">
            <div className="stat-card">
              <span>MARKET VALUE</span>
              <strong>{formatCompactKes(valuation.marketValue)}</strong>
            </div>
            <div className="stat-card">
              <span>DAY CHANGE</span>
              <strong className={changeClass(valuation.dayChangePercent)}>
                {valuation.dayChangeValue === null
                  ? NOT_AVAILABLE
                  : `${formatCompactKes(valuation.dayChangeValue)} (${formatPercent(
                      valuation.dayChangePercent
                    )})`}
              </strong>
            </div>
            <div className="stat-card">
              <span>COST BASIS</span>
              <strong>
                {valuation.costValue === null ? NOT_AVAILABLE : formatCompactKes(valuation.costValue)}
              </strong>
            </div>
            <div className="stat-card">
              <span>UNREALISED P/L</span>
              <strong className={changeClass(valuation.unrealised)}>
                {valuation.unrealised === null
                  ? NOT_AVAILABLE
                  : `${formatCompactKes(valuation.unrealised)} (${formatPercent(
                      valuation.unrealisedPercent
                    )})`}
              </strong>
            </div>
            <div className="stat-card">
              <span>POSITIONS</span>
              <strong>
                {valuation.pricedHoldings}/{valuation.holdings}
                {valuation.pricedHoldings < valuation.holdings ? " priced" : ""}
              </strong>
            </div>
          </section>

          {valuation.bySector.length > 0 && (
            <section className="allocation-section" aria-label="Sector allocation">
              <div className="section-head">
                <div className="section-title">ALLOCATION BY SECTOR</div>
                <span className="section-note">
                  Largest holding {formatPercent((concentration?.largestPositionWeight ?? 0) * 100, 1)}
                  {concentration?.largestPositionTicker
                    ? ` (${concentration.largestPositionTicker})`
                    : ""}
                  {" · "}
                  {concentration?.positionsToHalf ?? NOT_AVAILABLE} position
                  {concentration?.positionsToHalf === 1 ? "" : "s"} make up half the value
                  {concentration?.hhi !== null ? ` · concentration index ${concentration?.hhi?.toFixed(2)}` : ""}
                </span>
              </div>

              <ul className="allocation-list">
                {valuation.bySector.map((slice) => (
                  <li key={slice.key}>
                    <span className="allocation-label">
                      {slice.href ? <Link href={slice.href}>{slice.label}</Link> : slice.label}
                      <em>{slice.holdings}</em>
                    </span>
                    <span className="allocation-bar" aria-hidden="true">
                      <i style={{ width: `${Math.max(slice.weight * 100, 0.5)}%` }} />
                    </span>
                    <span className="allocation-value">
                      {(slice.weight * 100).toFixed(1)}%
                      <em>{formatCompactKes(slice.value)}</em>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <div className="data-table-wrap" style={{ marginTop: 18 }}>
            <table className="data-table">
              <caption>
                Holdings are stored in this browser only. Values use the latest
                price the platform can verify — {valuation.asOf ? formatDateTime(valuation.asOf) : "no timestamp"}.
              </caption>

              <thead>
                <tr>
                  <th className="text">Symbol</th>
                  <th className="text">Company</th>
                  <th className="text">Sector</th>
                  <th>Shares</th>
                  <th>Avg cost</th>
                  <th>Last</th>
                  <th>Market value</th>
                  <th>Day</th>
                  <th>Unrealised</th>
                  <th>Weight</th>
                  <th>Edit</th>
                </tr>
              </thead>

              <tbody>
                {valuation.positions.map((position) => {
                  const isEditing = editing?.ticker === position.ticker;
                  return (
                    <tr key={position.ticker} className={position.priced ? "" : "row-unpriced"}>
                      <td className="text">
                        {position.unknown ? (
                          position.ticker
                        ) : (
                          <Link href={position.href}>{position.ticker}</Link>
                        )}
                      </td>
                      <td className="text">{position.name}</td>
                      <td className="text cell-muted">{position.sector}</td>

                      <td>
                        {isEditing ? (
                          <input
                            className="cell-input"
                            value={editing.quantity}
                            inputMode="decimal"
                            aria-label={`Shares for ${position.ticker}`}
                            onChange={(event) =>
                              setEditing({ ...editing, quantity: event.target.value })
                            }
                          />
                        ) : (
                          position.quantity.toLocaleString("en-KE")
                        )}
                      </td>

                      <td>
                        {isEditing ? (
                          <input
                            className="cell-input"
                            value={editing.cost}
                            inputMode="decimal"
                            aria-label={`Average cost for ${position.ticker}`}
                            onChange={(event) => setEditing({ ...editing, cost: event.target.value })}
                          />
                        ) : position.averageCost === null ? (
                          NOT_AVAILABLE
                        ) : (
                          formatPrice(position.averageCost)
                        )}
                      </td>

                      <td>{position.price === null ? NOT_AVAILABLE : formatPrice(position.price)}</td>
                      <td>
                        {position.marketValue === null
                          ? NOT_AVAILABLE
                          : formatKes(position.marketValue)}
                      </td>
                      <td className={changeClass(position.dayChangePercent)}>
                        {position.dayChangePercent === null
                          ? NOT_AVAILABLE
                          : formatPercent(position.dayChangePercent)}
                      </td>
                      <td className={changeClass(position.unrealised)}>
                        {position.unrealised === null
                          ? NOT_AVAILABLE
                          : `${formatCompactKes(position.unrealised)} (${formatPercent(
                              position.unrealisedPercent
                            )})`}
                      </td>
                      <td>
                        {position.weight === null
                          ? NOT_AVAILABLE
                          : `${(position.weight * 100).toFixed(1)}%`}
                      </td>

                      <td>
                        {isEditing ? (
                          <>
                            <button
                              className="ghost-button"
                              onClick={saveEdit}
                              aria-label={`Save ${position.ticker}`}
                            >
                              ✓
                            </button>{" "}
                            <button
                              className="ghost-button"
                              onClick={() => setEditing(null)}
                              aria-label={`Cancel editing ${position.ticker}`}
                            >
                              ✕
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              className="ghost-button"
                              onClick={() =>
                                setEditing({
                                  ticker: position.ticker,
                                  quantity: String(position.quantity),
                                  cost: position.averageCost === null ? "" : String(position.averageCost),
                                })
                              }
                              aria-label={`Edit ${position.ticker}`}
                            >
                              ✎
                            </button>{" "}
                            <button
                              className="ghost-button"
                              onClick={() => removeHolding(position.ticker)}
                              aria-label={`Remove ${position.ticker} from portfolio`}
                            >
                              🗑
                            </button>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}

                {valuation.positions.length === 0 && (
                  <tr>
                    <td className="text cell-muted" colSpan={11}>
                      No positions returned.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <ul className="portfolio-notes">
            {valuation.notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
            <li>
              Tracking only: no order entry, brokerage connection, cash balance
              or fee model. Figures are a valuation aid, not a statement of
              account, and not investment advice.
            </li>
          </ul>
        </>
      )}

      {!valuation && loading && <p className="breadth-caveat">Valuing holdings…</p>}
    </>
  );
}
