"use client";

import { useCallback, useSyncExternalStore } from "react";

/**
 * Portfolio holdings persisted in localStorage (Phase 12).
 *
 * No authentication and no server profile: holdings stay in this browser, like
 * the watchlist. When the platform gains accounts, this hook is the single
 * place to swap localStorage for a server-backed portfolio — the shape
 * (`PortfolioHolding[]`) is already the API contract.
 *
 * Deliberately absent: cash balances, fees, trade dates and any notion of an
 * order. Those belong to a brokerage integration, which this platform does not
 * have and will not fake.
 */

import type { PortfolioHolding } from "@/lib/types/portfolio";

const STORAGE_KEY = "kmi-portfolio";
const CHANGE_EVENT = "kmi-portfolio-change";

const EMPTY: PortfolioHolding[] = [];

let cache: { raw: string | null; value: PortfolioHolding[] } = { raw: null, value: EMPTY };

/** Defensive parse: localStorage is user-editable and may hold anything. */
function parse(raw: string | null): PortfolioHolding[] {
  if (!raw) return EMPTY;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return EMPTY;

    const holdings: PortfolioHolding[] = [];
    const seen = new Set<string>();

    for (const entry of parsed) {
      if (typeof entry !== "object" || entry === null) continue;
      const item = entry as Record<string, unknown>;

      const ticker = String(item.ticker ?? "").trim().toUpperCase();
      if (!/^[A-Z0-9][A-Z0-9.-]{0,14}$/.test(ticker)) continue;

      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) continue;

      const cost = item.averageCost === null || item.averageCost === undefined || item.averageCost === ""
        ? null
        : Number(item.averageCost);
      if (cost !== null && (!Number.isFinite(cost) || cost < 0)) continue;

      if (seen.has(ticker)) continue; // duplicates are rejected on read
      seen.add(ticker);

      holdings.push({
        ticker,
        quantity,
        averageCost: cost,
        addedAt:
          typeof item.addedAt === "string" && !Number.isNaN(Date.parse(item.addedAt))
            ? item.addedAt
            : new Date().toISOString(),
      });
    }
    return holdings;
  } catch {
    return EMPTY;
  }
}

function getSnapshot(): PortfolioHolding[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (cache.raw === raw) return cache.value;
  cache = { raw, value: parse(raw) };
  return cache.value;
}

function getServerSnapshot(): PortfolioHolding[] {
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

function write(next: PortfolioHolding[]) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage may be unavailable (private mode); the list still works in-memory.
  }
  cache = { raw: null, value: next };
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function usePortfolio() {
  const holdings = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  /** Add a holding, or merge the quantity into an existing one. */
  const addHolding = useCallback(
    (ticker: string, quantity: number, averageCost: number | null) => {
      const symbol = ticker.trim().toUpperCase();
      if (!symbol || !Number.isFinite(quantity) || quantity <= 0) return;

      const current = getSnapshot();
      const existing = current.find((holding) => holding.ticker === symbol);

      if (!existing) {
        write([
          ...current,
          { ticker: symbol, quantity, averageCost, addedAt: new Date().toISOString() },
        ]);
        return;
      }

      // Merge: shares add up and the average cost becomes the quantity-weighted
      // mean — but if either lot has no cost, the merged holding has none.
      // Pricing the unknown lot at zero would invent a basis.
      const totalQuantity = existing.quantity + quantity;
      const existingCost = existing.averageCost !== null ? existing.averageCost * existing.quantity : null;
      const addedCost = averageCost !== null ? averageCost * quantity : null;
      const combined =
        existingCost !== null && addedCost !== null ? existingCost + addedCost : null;

      write(
        current.map((holding) =>
          holding.ticker === symbol
            ? {
                ...holding,
                quantity: totalQuantity,
                averageCost:
                  combined !== null ? Math.round((combined / totalQuantity) * 10_000) / 10_000 : null,
              }
            : holding
        )
      );
    },
    []
  );

  const updateHolding = useCallback(
    (ticker: string, quantity: number, averageCost: number | null) => {
      const symbol = ticker.trim().toUpperCase();
      if (!Number.isFinite(quantity) || quantity <= 0) return;
      write(
        getSnapshot().map((holding) =>
          holding.ticker === symbol ? { ...holding, quantity, averageCost } : holding
        )
      );
    },
    []
  );

  const removeHolding = useCallback((ticker: string) => {
    const symbol = ticker.trim().toUpperCase();
    write(getSnapshot().filter((holding) => holding.ticker !== symbol));
  }, []);

  const clearPortfolio = useCallback(() => write([]), []);

  return { holdings, addHolding, updateHolding, removeHolding, clearPortfolio };
}
