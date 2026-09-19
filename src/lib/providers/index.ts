/**
 * Provider factory — the single place that decides where market data comes from.
 *
 * Selection rules (see src/lib/config.ts):
 *   MARKET_DATA_PROVIDER=demo  → always the labelled sample provider
 *   MARKET_DATA_PROVIDER=nse   → licensed feed, error if unconfigured
 *   unset / auto               → licensed feed when configured, else demo
 *
 * The demo provider is never used as a silent fallback for a failing live feed:
 * that would present sample data as if it were market data. If a live provider
 * is selected but unhealthy, the API returns an error and the UI shows
 * "Data unavailable".
 */

import { resolveProviderId } from "@/lib/config";
import { DemoMarketDataProvider } from "./demo-provider";
import { NseMarketDataProvider } from "./nse-provider";
import { ProviderNotConfiguredError } from "./errors";
import type { MarketDataProvider } from "./types";

let instance: MarketDataProvider | null = null;

export function getMarketDataProvider(): MarketDataProvider {
  if (instance) return instance;

  const requested = resolveProviderId();
  if (requested === "nse") {
    instance = new NseMarketDataProvider();
    return instance;
  }

  // `auto`: prefer a licensed feed when fully configured.
  if (requested === "demo") {
    instance = new DemoMarketDataProvider();
    return instance;
  }

  try {
    instance = new NseMarketDataProvider();
  } catch (error) {
    if (error instanceof ProviderNotConfiguredError) {
      instance = new DemoMarketDataProvider();
      return instance;
    }
    throw error;
  }
  return instance;
}

/** Force re-resolution (used by tests and after config changes). */
export function resetMarketDataProvider() {
  instance = null;
}

export type { MarketDataProvider };
