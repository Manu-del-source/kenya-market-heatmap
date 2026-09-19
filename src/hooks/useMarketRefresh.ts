"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Refresh timer for market data.
 *
 * Replaces the old random-walk "live tick": instead of inventing price moves
 * between renders, this polls the server and pauses when:
 *   - the user pauses it,
 *   - the tab is hidden,
 *   - the market is closed and the data source is end-of-day,
 *   - the active provider is the demo provider (nothing would change).
 *
 * `intervalMs` is supplied by the caller so pages can choose their own cadence.
 */

type Options = {
  intervalMs: number;
  /** When false the timer never starts (e.g. demo provider). */
  enabled: boolean;
};

export function useMarketRefresh(
  refresh: () => Promise<void>,
  { intervalMs, enabled }: Options
) {
  const [paused, setPaused] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
      setLastUpdate(new Date());
      setError(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  useEffect(() => {
    if (!enabled || paused) return;

    const id = setInterval(() => {
      if (typeof document !== "undefined" && document.hidden) return;
      void run();
    }, intervalMs);

    return () => clearInterval(id);
  }, [enabled, paused, intervalMs, run]);

  return {
    paused,
    togglePaused: () => setPaused((value) => !value),
    refreshing,
    lastUpdate,
    error,
    refreshNow: run,
  };
}
