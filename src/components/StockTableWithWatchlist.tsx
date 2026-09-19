"use client";

/**
 * Stock table variant with working watchlist toggles.
 *
 * The base table stays a server component; this thin client wrapper only adds
 * the interactive star, so pages that do not need it ship no extra JavaScript.
 */

import StockTable, { type StockRow } from "./StockTable";
import WatchlistStar from "./WatchlistStar";
import { useWatchlist } from "@/hooks/useWatchlist";

export default function StockTableWithWatchlist({
  rows,
  showSector = true,
  caption,
}: {
  rows: StockRow[];
  showSector?: boolean;
  caption?: string;
}) {
  const { isInWatchlist, toggleWatchlist } = useWatchlist();

  return (
    <StockTable
      rows={rows}
      showSector={showSector}
      caption={caption}
      renderStar={(ticker) => (
        <WatchlistStar
          ticker={ticker}
          active={isInWatchlist(ticker)}
          onToggle={toggleWatchlist}
        />
      )}
    />
  );
}
