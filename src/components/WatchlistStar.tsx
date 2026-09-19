"use client";

/**
 * Watchlist toggle for use inside a link-wrapped tile.
 *
 * Stops propagation so toggling the star never navigates away, and announces
 * its state for screen readers.
 */

type WatchlistStarProps = {
  ticker: string;
  active: boolean;
  onToggle: (ticker: string) => void;
};

export default function WatchlistStar({ ticker, active, onToggle }: WatchlistStarProps) {
  return (
    <button
      type="button"
      className={`tile-star ${active ? "active" : ""}`}
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onToggle(ticker);
      }}
      aria-pressed={active}
      aria-label={
        active ? `Remove ${ticker} from watchlist` : `Add ${ticker} to watchlist`
      }
      title={active ? "Remove from watchlist" : "Add to watchlist"}
    >
      {active ? "★" : "☆"}
    </button>
  );
}
