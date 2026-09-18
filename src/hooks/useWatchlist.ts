"use client";

import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "kmi-watchlist";
const CHANGE_EVENT = "kmi-watchlist-change";

const EMPTY: string[] = [];

let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    const symbols = parsed.filter((entry): entry is string => typeof entry === "string");
    return symbols;
  } catch {
    return EMPTY;
  }
}

/** Cached read so the snapshot stays referentially stable between writes. */
function getSnapshot(): string[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.value;
  cache = { raw, value: parse(raw) };
  return cache.value;
}

function getServerSnapshot(): string[] {
  return EMPTY;
}

function subscribe(onStoreChange: () => void) {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(CHANGE_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(CHANGE_EVENT, onStoreChange);
  };
}

/**
 * Watchlist persisted in localStorage. No authentication required — symbols
 * are stored as plain strings and shared across tabs via the storage event.
 */
export function useWatchlist() {
  const symbols = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleWatchlist = useCallback((symbol: string) => {
    const current = getSnapshot();
    const next = current.includes(symbol)
      ? current.filter((entry) => entry !== symbol)
      : [...current, symbol];

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Storage may be unavailable (private mode); watchlist just won't persist.
    }

    cache = { raw: null, value: next };
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);

  const isInWatchlist = useCallback(
    (symbol: string) => symbols.includes(symbol),
    [symbols]
  );

  return { watchlist: symbols, toggleWatchlist, isInWatchlist };
}
