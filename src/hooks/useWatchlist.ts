"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Watchlist persisted in localStorage (Phase 11).
 *
 * No authentication is required: symbols are stored as plain strings and shared
 * across tabs via the `storage` event. When the platform later gains accounts,
 * this hook is the single place to swap localStorage for a server-backed list.
 */

const STORAGE_KEY = "kmi-watchlist";
const CHANGE_EVENT = "kmi-watchlist-change";

const EMPTY: string[] = [];

let cache: { raw: string | null; value: string[] } = { raw: null, value: EMPTY };

function parse(raw: string | null): string[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;
    // Deduplicate and keep only plausible tickers.
    const symbols = parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim().toUpperCase())
      .filter((entry) => /^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(entry));
    return [...new Set(symbols)];
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

function write(next: string[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); the list still works in-memory.
  }
  cache = { raw: null, value: next };
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useWatchlist() {
  const symbols = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const toggleWatchlist = useCallback((symbol: string) => {
    const current = getSnapshot();
    const ticker = symbol.trim().toUpperCase();
    const next = current.includes(ticker)
      ? current.filter((entry) => entry !== ticker)
      : [...current, ticker];
    write(next);
  }, []);

  const removeFromWatchlist = useCallback((symbol: string) => {
    write(getSnapshot().filter((entry) => entry !== symbol.trim().toUpperCase()));
  }, []);

  /** Move a symbol one position up or down (used by the watchlist page). */
  const moveInWatchlist = useCallback((symbol: string, direction: -1 | 1) => {
    const current = [...getSnapshot()];
    const index = current.indexOf(symbol.trim().toUpperCase());
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    write(current);
  }, []);

  const clearWatchlist = useCallback(() => write([]), []);

  const isInWatchlist = useCallback(
    (symbol: string) => symbols.includes(symbol.trim().toUpperCase()),
    [symbols]
  );

  return {
    watchlist: symbols,
    toggleWatchlist,
    removeFromWatchlist,
    moveInWatchlist,
    clearWatchlist,
    isInWatchlist,
  };
}
