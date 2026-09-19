"use client";

/**
 * Add/remove control for the watchlist (Phase 11).
 *
 * Lives in localStorage for now. When accounts arrive, this is the one
 * component that needs to change — the rest of the UI just calls the hook.
 */

import { useWatchlist } from "@/hooks/useWatchlist";

export default function WatchlistToggle({ ticker }: { ticker: string }) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();
  const active = isInWatchlist(ticker);

  return (
    <button
      type="button"
      className={`live-toggle ${active ? "watch-star active" : ""}`}
      onClick={() => toggleWatchlist(ticker)}
      aria-pressed={active}
      title={active ? "Remove from watchlist" : "Add to watchlist"}
    >
      <span aria-hidden="true">{active ? "★" : "☆"}</span>
      {active ? "IN WATCHLIST" : "ADD TO WATCHLIST"}
    </button>
  );
}
