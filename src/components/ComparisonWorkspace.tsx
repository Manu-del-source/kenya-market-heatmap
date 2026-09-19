"use client";

/**
 * Interactive comparison workspace.
 *
 * The page renders the first comparison on the server, so the view is useful
 * without JavaScript and on a slow connection. This component then takes over:
 * changing the period, the mode or the selection re-reads the comparison API
 * and swaps in the result, keeping the previous chart visible while loading.
 *
 * The URL is kept in sync with `history.replaceState` — shallow, so it stays
 * shareable without triggering a full server round-trip for every toggle.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ComparisonChart, { ComparisonLegend } from "@/components/ComparisonChart";
import { NOT_AVAILABLE, formatDate, formatPercent, formatPrice } from "@/lib/format";
import type { CompanyOption, SectorOption } from "@/lib/compare-options";
import {
  COMPARE_PERIOD_LABEL,
  COMPARE_PERIODS,
  MAX_COMPARE_SECTORS,
  MAX_COMPARE_TICKERS,
  type ComparePeriod,
  type ComparisonPayload,
} from "@/lib/types/market";

type Envelope = {
  meta: { dataMode: string; asOf: string; limitations: string[] };
  data: ComparisonPayload;
};

export default function ComparisonWorkspace({
  initialMode,
  initialPeriod,
  initialTickers,
  initialSlugs,
  initialData,
  companies,
  sectors,
}: {
  initialMode: "stocks" | "sectors";
  initialPeriod: ComparePeriod;
  initialTickers: string[];
  initialSlugs: string[];
  initialData: ComparisonPayload;
  companies: CompanyOption[];
  sectors: SectorOption[];
}) {
  const [mode, setMode] = useState<"stocks" | "sectors">(initialMode);
  const [period, setPeriod] = useState<ComparePeriod>(initialPeriod);
  const [tickers, setTickers] = useState<string[]>(initialTickers);
  const [slugs, setSlugs] = useState<string[]>(initialSlugs);
  const [data, setData] = useState<ComparisonPayload>(initialData);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [pickerError, setPickerError] = useState<string | null>(null);
  const requestId = useRef(0);

  const selection = mode === "stocks" ? tickers : slugs;

  const requestKey = useMemo(
    () => `${mode}:${selection.join(",")}:${period}`,
    [mode, selection, period]
  );
  // The key the server already rendered: while it matches, no fetch is needed.
  const serverKey = `${initialMode}:${(initialMode === "stocks" ? initialTickers : initialSlugs).join(",")}:${initialPeriod}`;
  const loadedKey = useRef(serverKey);

  const load = useCallback(
    async (key: string) => {
      const id = ++requestId.current;
      setLoading(true);
      setError(null);
      try {
        const query = new URLSearchParams({ period });
        if (mode === "stocks") query.set("tickers", tickers.join(","));
        else query.set("sectors", slugs.join(","));

        const response = await fetch(`/api/compare/${mode}?${query.toString()}`, {
          cache: "no-store",
        });
        if (!response.ok) {
          const body = (await response.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(body?.error?.message ?? `Comparison unavailable (${response.status})`);
        }
        const payload = (await response.json()) as Envelope;
        if (id !== requestId.current) return; // a newer request already won
        setData(payload.data);
        loadedKey.current = key;
      } catch (cause) {
        if (id !== requestId.current) return;
        setError(cause instanceof Error ? cause.message : "Comparison unavailable");
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [mode, period, slugs, tickers]
  );

  useEffect(() => {
    if (requestKey === loadedKey.current) return;
    if (selection.length === 0) return;
    // Network reads belong in an effect; the state updates happen once the
    // request settles, not during render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load(requestKey);
  }, [load, requestKey, selection.length]);

  useEffect(() => {
    if (selection.length === 0) return;
    const params = new URLSearchParams({ mode, period });
    if (mode === "stocks") params.set("tickers", tickers.join(","));
    else params.set("sectors", slugs.join(","));
    window.history.replaceState(null, "", `/compare?${params.toString()}`);
  }, [mode, period, selection.length, slugs, tickers]);

  const addTicker = (raw: string) => {
    const ticker = raw.trim().toUpperCase();
    if (!ticker) return;
    if (!companies.some((company) => company.ticker === ticker)) {
      setPickerError(`${ticker} is not in the tracked universe.`);
      return;
    }
    setPickerError(null);
    setTickers((current) =>
      current.includes(ticker) || current.length >= MAX_COMPARE_TICKERS ? current : [...current, ticker]
    );
    setDraft("");
  };

  const toggleSlug = (slug: string) => {
    setSlugs((current) => {
      if (current.includes(slug)) return current.filter((entry) => entry !== slug);
      if (current.length >= MAX_COMPARE_SECTORS) return current;
      return [...current, slug];
    });
  };

  const coverage = (ratio: number | null) =>
    ratio === null ? NOT_AVAILABLE : `${Math.round(ratio * 100)}%`;

  return (
    <div className="compare-workspace">
      <div className="heatmap-controls" role="group" aria-label="Comparison controls">
        <div className="view-tabs">
          <button
            type="button"
            className={mode === "stocks" ? "active" : ""}
            onClick={() => setMode("stocks")}
            aria-pressed={mode === "stocks"}
          >
            STOCKS
          </button>
          <button
            type="button"
            className={mode === "sectors" ? "active" : ""}
            onClick={() => setMode("sectors")}
            aria-pressed={mode === "sectors"}
          >
            SECTORS
          </button>
        </div>

        <div className="timeframe-controls" role="group" aria-label="Comparison period">
          {COMPARE_PERIODS.map((option) => (
            <button
              key={option}
              type="button"
              className={option === period ? "active" : ""}
              onClick={() => setPeriod(option)}
              aria-pressed={option === period}
              title={COMPARE_PERIOD_LABEL[option]}
            >
              {option}
            </button>
          ))}
        </div>
      </div>

      {mode === "stocks" ? (
        <div className="compare-picker">
          <label className="control-group">
            <span>ADD TICKER</span>
            <input
              className="search-input"
              list="compare-ticker-options"
              value={draft}
              placeholder={tickers.length >= MAX_COMPARE_TICKERS ? "Selection full" : "e.g. KCB"}
              disabled={tickers.length >= MAX_COMPARE_TICKERS}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                addTicker(draft);
              }}
            />
          </label>
          <datalist id="compare-ticker-options">
            {companies.map((company) => (
              <option key={company.ticker} value={company.ticker}>
                {company.name}
              </option>
            ))}
          </datalist>

          <ul className="compare-chips">
            {tickers.map((ticker) => (
              <li key={ticker}>
                <button
                  type="button"
                  onClick={() => setTickers((current) => current.filter((entry) => entry !== ticker))}
                  disabled={tickers.length <= 1}
                  title={
                    tickers.length <= 1
                      ? "At least one item is required"
                      : `Remove ${ticker}`
                  }
                >
                  {ticker} <span aria-hidden="true">×</span>
                </button>
              </li>
            ))}
          </ul>
          <span className="section-note">
            {pickerError ?? `${tickers.length}/${MAX_COMPARE_TICKERS} selected`}
          </span>
        </div>
      ) : (
        <div className="compare-picker">
          <ul className="compare-chips">
            {sectors.map((sector) => {
              const active = slugs.includes(sector.slug);
              return (
                <li key={sector.slug}>
                  <button
                    type="button"
                    className={active ? "active" : ""}
                    onClick={() => toggleSlug(sector.slug)}
                    disabled={!active && slugs.length >= MAX_COMPARE_SECTORS}
                    aria-pressed={active}
                  >
                    {sector.name}
                  </button>
                </li>
              );
            })}
          </ul>
          <span className="section-note">
            {slugs.length}/{MAX_COMPARE_SECTORS} selected
          </span>
        </div>
      )}

      <section className="compare-panel">
        <div className="section-head">
          <h2>
            {mode === "stocks" ? "Normalised price comparison" : "Sector performance comparison"}
          </h2>
          <span className="section-note">
            {COMPARE_PERIOD_LABEL[period]} ·{" "}
            {data.alignment.windowStart && data.alignment.windowEnd
              ? `${formatDate(data.alignment.windowStart)} → ${formatDate(data.alignment.windowEnd)}`
              : "no common window"}
            {loading ? " · updating…" : ""}
          </span>
        </div>

        {error && <div className="chart-unavailable">{error}</div>}

        {!error && (
          <div className={loading ? "compare-loading" : undefined} aria-busy={loading}>
            <ComparisonChart series={data.series} unitLabel={data.unit} />
            <ComparisonLegend series={data.series} />
          </div>
        )}

        <p className="compare-disclaimer">
          Analytical comparison of historical data only. It is not investment advice, a
          recommendation, or a forecast.
        </p>
      </section>

      <section className="compare-alignment">
        <h3>How this comparison is aligned</h3>
        <ul>
          <li>
            <strong>Window.</strong>{" "}
            {data.alignment.overlapping
              ? `Common window ${formatDate(data.alignment.windowStart)} → ${formatDate(
                  data.alignment.windowEnd
                )}, so every series has at least one session inside it.`
              : "The selected series do not overlap in this period. Each is measured over its own available range and the chart should not be read as like-for-like."}
          </li>
          <li>
            <strong>Sessions.</strong> {data.alignment.sharedSessions} shared of{" "}
            {data.alignment.totalSessions} total in the window (
            {coverage(data.alignment.coverageRatio)} aligned).
          </li>
          <li>
            <strong>Base.</strong> Each series is rebased to 100 at its own first observation
            in the window
            {data.alignment.anchorSpreadSessions > 0
              ? `; anchoring dates differ by ${data.alignment.anchorSpreadSessions} sessions across series.`
              : "."}
          </li>
          {data.alignment.notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      </section>

      <section className="compare-table">
        <div className="section-head">
          <h2>Measured metrics</h2>
          <span className="section-note">
            {data.availableCount} of {data.requestedCount} items had usable data
          </span>
        </div>

        <div className="data-table-wrap">
          <table className="data-table">
            <caption>
              {mode === "stocks"
                ? "Share prices in KES. Normalised columns are rebased to 100."
                : "Index levels are an equal-weighted in-app proxy rebased to 100."}
            </caption>
            <thead>
              <tr>
                <th scope="col">Item</th>
                <th scope="col">First</th>
                <th scope="col">Last</th>
                <th scope="col">Base</th>
                <th scope="col">Now</th>
                <th scope="col">Return</th>
                <th scope="col">High</th>
                <th scope="col">Low</th>
                <th scope="col">Sessions</th>
                <th scope="col">Coverage</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((row) => (
                <tr key={row.key}>
                  <td className="text">
                    <Link href={row.href}>{row.label}</Link>
                    {row.sector ? <span className="cell-muted"> · {row.sector}</span> : null}
                    {row.constituents !== null && row.constituentsWithData !== null ? (
                      <span className="cell-muted">
                        {" "}
                        · {row.constituentsWithData}/{row.constituents} constituents
                      </span>
                    ) : null}
                    {!row.available && row.reason ? (
                      <span className="cell-muted"> · {row.reason}</span>
                    ) : null}
                  </td>
                  <td>{row.start === null ? NOT_AVAILABLE : formatPrice(row.start)}</td>
                  <td>{row.end === null ? NOT_AVAILABLE : formatPrice(row.end)}</td>
                  <td>{row.normalisedStart === null ? NOT_AVAILABLE : row.normalisedStart.toFixed(0)}</td>
                  <td>
                    {row.normalisedEnd === null ? NOT_AVAILABLE : row.normalisedEnd.toFixed(1)}
                  </td>
                  <td className={row.returnPercent === null ? "cell-muted" : row.returnPercent >= 0 ? "green" : "red"}>
                    {row.returnPercent === null ? NOT_AVAILABLE : formatPercent(row.returnPercent)}
                  </td>
                  <td>{row.high === null ? NOT_AVAILABLE : formatPrice(row.high)}</td>
                  <td>{row.low === null ? NOT_AVAILABLE : formatPrice(row.low)}</td>
                  <td>{row.observations === 0 ? NOT_AVAILABLE : row.observations}</td>
                  <td className={row.coverageRatio !== null && row.coverageRatio < 0.9 ? "cell-muted" : ""}>
                    {coverage(row.coverageRatio)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
